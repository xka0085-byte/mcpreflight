// Registry census: one full paginated walk of the official MCP Registry, counting every
// population we ever quote in public copy. Read-only; no endpoint is contacted.
//
// Why this exists: the figures in our docs (9,991 / 34,190 / "registry-wide") were produced
// by a paginator capped at 300 pages that stopped silently. This script walks until
// nextCursor is empty and refuses to emit numbers otherwise, so every figure has a
// reproducible command behind it.
//
// A full walk is ~500 pages at ~2s/page, longer than one shell call, so progress is
// checkpointed. Re-run until it prints CENSUS COMPLETE.
//
// Usage: node scripts/registry-census.mjs [--json] [--max-pages=N] [--restart]
// Output: trust-data/registry-census.json (+ trust-data/registry-census.progress.json)
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const REG = 'https://registry.modelcontextprotocol.io/v0/servers';
const MAX_PAGES = Number(process.env.REGISTRY_MAX_PAGES ?? 5000);
const PAGE_SIZE = 100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const argMaxPages = (() => {
  const hit = process.argv.find((a) => a.startsWith('--max-pages='));
  return hit ? Number(hit.split('=')[1]) : Infinity;
})();
const restart = process.argv.includes('--restart');

const dataDir = path.join(root, 'trust-data');
fs.mkdirSync(dataDir, { recursive: true });
const progressPath = path.join(dataDir, 'registry-census.progress.json');
const outPath = path.join(dataDir, 'registry-census.json');

async function fetchPage(cursor) {
  const u = REG + `?limit=${PAGE_SIZE}` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
  for (let round = 0; round < 3; round++) {
    if (round > 0) await sleep(30000 * round);
    for (let a = 0; a < 6; a++) {
      try {
        const res = await fetch(u, { signal: AbortSignal.timeout(30000) });
        if (res.ok) return await res.json();
        if (res.status === 400 || res.status === 404) {
          throw new Error(`registry rejected cursor after ${pagesDone} pages: HTTP ${res.status}`);
        }
        if (res.status === 429 || res.status >= 500) { await sleep(4000 * (a + 1)); continue; }
      } catch (e) {
        if (String(e.message).startsWith('registry rejected')) throw e;
      }
      await sleep(3000 * (a + 1));
    }
  }
  return null;
}

let state = null;
if (!restart && fs.existsSync(progressPath)) {
  state = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  console.error(`resuming: pages=${state.pages} entries=${state.stats.entriesTotal} activeLatest=${state.stats.activeLatest}`);
}
if (!state) {
  state = {
    cursor: null,
    pages: 0,
    startedAt: new Date().toISOString(),
    stats: { entriesTotal: 0, activeLatest: 0, withRemote: 0, packagesOnly: 0 },
    names: [],
    remoteUrls: [],
    servers: [],
  };
}

const names = new Set(state.names);
const remoteUrls = new Set(state.remoteUrls);
const servers = new Map((state.servers ?? []).map((s) => [s.name, s]));
const stats = state.stats;
let cursor = state.cursor;
let pagesDone = state.pages;

const batchEnd = Math.min(pagesDone + (argMaxPages === Infinity ? Infinity : argMaxPages), MAX_PAGES);

function saveProgress() {
  fs.writeFileSync(progressPath, JSON.stringify({
    cursor, pages: pagesDone, startedAt: state.startedAt, stats,
    names: [...names], remoteUrls: [...remoteUrls], servers: [...servers.values()],
  }));
}

// loop increments pagesDone before the sanity check, so guard with an explicit while
while (pagesDone < batchEnd) {
  const body = await fetchPage(cursor);
  if (!body) {
    // Keep the checkpoint as-is; a later run retries this same page.
    throw new Error(`registry fetch failed at page ${pagesDone} — progress kept, no numbers emitted`);
  }
  const rows = body.servers ?? [];
  stats.entriesTotal += rows.length;
  for (const entry of rows) {
    const s = entry.server ?? {};
    const meta = entry._meta?.['io.modelcontextprotocol.registry/official'] ?? {};
    if (meta.status !== 'active' || meta.isLatest !== true) continue;
    stats.activeLatest++;
    names.add(s.name);
    const remote = (s.remotes ?? []).find((r) => typeof r.url === 'string' && /^https?:/i.test(r.url));
    if (remote) {
      stats.withRemote++;
      remoteUrls.add(remote.url);
      // Same shape trust-scan-all.mjs expects, so this walk doubles as a complete server list.
      if (!servers.has(s.name)) {
        servers.set(s.name, {
          name: s.name,
          title: s.title ?? s.name,
          description: s.description ?? '',
          url: remote.url,
          version: s.version ?? null,
        });
      }
    } else {
      stats.packagesOnly++;
    }
  }
  cursor = body.metadata?.nextCursor;
  pagesDone++;
  if (pagesDone % 50 === 0) saveProgress();
  if (pagesDone % 25 === 0 || !cursor) {
    console.error(`[page ${pagesDone}] entries=${stats.entriesTotal} activeLatest=${stats.activeLatest} remote=${stats.withRemote}`);
  }
  if (!cursor) break;
}

const done = !cursor;
saveProgress();

if (!done) {
  console.error(`BATCH DONE pages=${pagesDone} entries=${stats.entriesTotal} activeLatest=${stats.activeLatest} — cursor continues, re-run to resume`);
  process.exit(0);
}

const out = {
  ...stats,
  activeLatestUniqueNames: names.size,
  uniqueRemoteUrls: remoteUrls.size,
  pagesWalked: pagesDone,
  pageSize: PAGE_SIZE,
  complete: true,
  source: REG,
  method: 'scripts/registry-census.mjs',
  note: 'withRemote counts registry records declaring an http(s) remote; uniqueRemoteUrls dedupes by URL. Neither is a liveness measurement.',
  startedAt: state.startedAt,
  finishedAt: new Date().toISOString(),
};
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');

// Hand the complete list to the scanner so it does not have to walk the registry again.
const serverList = [...servers.values()];
fs.writeFileSync(path.join(dataDir, 'servers-full.json'), JSON.stringify(serverList));
fs.writeFileSync(path.join(dataDir, 'servers-full.meta.json'), JSON.stringify({
  total: serverList.length,
  pages: pagesDone,
  complete: true,
  source: REG,
  pageSize: PAGE_SIZE,
  generatedAt: new Date().toISOString(),
  producedBy: 'scripts/registry-census.mjs',
}, null, 2) + '\n');
fs.unlinkSync(progressPath);

if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 2));
else console.error(`CENSUS COMPLETE pages=${out.pagesWalked} entries=${out.entriesTotal} activeLatest=${out.activeLatest} withRemote=${out.withRemote} uniqueRemoteUrls=${out.uniqueRemoteUrls} packagesOnly=${out.packagesOnly}`);

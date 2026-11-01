// Full Trust Directory scanner: all remote servers in the official MCP Registry.
// Checkpointed (resumes from trust-data/scan-full.jsonl), path-agnostic, CI-safe.
// Read-only: sends only MCP initialize + tools/list. No tool calls, no payments.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'bin', 'mcpreflight.mjs');
const outDir = path.join(root, 'trust-data');
fs.mkdirSync(outDir, { recursive: true });

const REG = 'https://registry.modelcontextprotocol.io/v0/servers';
const CONCURRENCY = Number(process.env.SCAN_CONCURRENCY ?? 24);
const TASK_TIMEOUT = Number(process.env.SCAN_TASK_TIMEOUT_MS ?? 35000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Hard sanity bound only. Running into it is treated as a failure, never a silent stop.
const MAX_PAGES = Number(process.env.REGISTRY_MAX_PAGES ?? 5000);

// Walks the registry until nextCursor is empty. Returns coverage metadata alongside the list
// so callers can tell a complete sweep from a truncated one.
async function pullServers() {
  const seen = new Map();
  let cursor = null;
  let page = 0;
  let pagesWalked = 0;
  for (; page < MAX_PAGES; page++) {
    const u = REG + '?limit=100' + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    let body = null;
    // 3 rounds x 6 attempts with a 60s cooldown between rounds: survives upstream flakiness
    // (2026-10-12 run died at page 259 when the registry API returned empty responses for ~1 min)
    for (let round = 0; round < 3 && !body; round++) {
      if (round > 0) await sleep(60000);
      for (let a = 0; a < 6; a++) {
        try {
          const res = await fetch(u, { signal: AbortSignal.timeout(30000) });
          if (res.ok) { body = await res.json(); break; }
          if (res.status === 429 || res.status >= 500) { await sleep(4000 * (a + 1)); continue; }
        } catch {}
        await sleep(3000 * (a + 1));
      }
    }
    if (!body) throw new Error('registry fetch failed at page ' + page);
    for (const entry of body.servers ?? []) {
      const s = entry.server ?? {};
      const meta = entry._meta?.['io.modelcontextprotocol.registry/official'] ?? {};
      if (meta.status !== 'active' || meta.isLatest !== true) continue;
      const remote = (s.remotes ?? []).find((r) => typeof r.url === 'string' && r.url.startsWith('http'));
      if (!remote) continue;
      if (!seen.has(s.name)) seen.set(s.name, { name: s.name, title: s.title ?? s.name, description: s.description ?? '', url: remote.url, version: s.version ?? null });
    }
    cursor = body.metadata?.nextCursor;
    pagesWalked = page + 1;
    if (!cursor) break;
  }
  if (cursor) {
    throw new Error(
      `registry pagination did not terminate after ${MAX_PAGES} pages (cursor still present). ` +
      `Refusing to write a partial server list. Raise REGISTRY_MAX_PAGES if this is expected.`,
    );
  }
  return { servers: [...seen.values()], pages: pagesWalked, complete: true };
}

function runSchema(ep) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, 'schema', ep, '--format=json'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', (c) => { stdout += c; });
    const timer = setTimeout(() => { try { child.kill(); } catch {} }, TASK_TIMEOUT);
    child.on('close', () => {
      clearTimeout(timer);
      try { resolve(JSON.parse(stdout)); } catch { resolve(null); }
    });
  });
}

// Enrichment for UNKNOWN endpoints: distinguish "auth-gated" from "actually dead".
// One anonymous initialize POST; 401/403 + Bearer WWW-Authenticate → gated.
// Then probe RFC 9728 resource metadata + discovery files (server card, ai-catalog).
// Read-only: no tools invoked, no credentials, no payments.
async function probeAuth(ep) {
  const out = { auth: null, resourceMetadata: null, discovery: [] };
  try {
    const res = await fetch(ep, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'mcpreflight', version: '0.2.0' } } }),
      signal: AbortSignal.timeout(9000),
    });
    const www = res.headers.get('www-authenticate');
    if ((res.status === 401 || res.status === 403) && www && /bearer/i.test(www)) {
      out.auth = 'gated';
      const m = www.match(/resource_metadata="([^"]+)"/i);
      if (m) {
        out.resourceMetadata = m[1];
        try {
          const rm = await fetch(m[1], { signal: AbortSignal.timeout(6000) });
          if (rm.ok) {
            const j = await rm.json().catch(() => null);
            if (j && Array.isArray(j.authorization_servers) && j.authorization_servers.length > 0) out.auth = 'gated-verified';
          }
        } catch {}
      }
    }
  } catch {}
  if (out.auth) {
    let u;
    try { u = new URL(ep); } catch { return out; }
    const candidates = [
      [`${ep.replace(/\/$/, '')}/server-card`, 'server-card'],
      [`${u.origin}/.well-known/ai-catalog.json`, 'ai-catalog'],
    ];
    for (const [target, tag] of candidates) {
      try {
        const r = await fetch(target, { signal: AbortSignal.timeout(5000) });
        if (r.ok) out.discovery.push(tag);
      } catch {}
    }
  }
  return out;
}

const serversPath = path.join(outDir, 'servers-full.json');
const metaPath = path.join(outDir, 'servers-full.meta.json');
const refresh = process.argv.includes('--refresh');
let servers;

// The cache is only trusted when it carries a completed-sweep marker. A list written by the
// old 300-page loop has no meta file and must never be reused as if it were the whole registry.
let cachedMeta = null;
if (fs.existsSync(metaPath)) {
  try { cachedMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch { cachedMeta = null; }
}
const cacheUsable = !refresh && cachedMeta?.complete === true && fs.existsSync(serversPath);

if (cacheUsable) {
  servers = JSON.parse(fs.readFileSync(serversPath, 'utf8'));
  if (servers.length !== cachedMeta.total) {
    throw new Error(`cache/meta mismatch: servers-full.json has ${servers.length}, meta says ${cachedMeta.total}`);
  }
  console.error(`loaded cached server list: ${servers.length} (swept ${cachedMeta.pages} pages at ${cachedMeta.generatedAt})`);
} else {
  if (fs.existsSync(serversPath)) {
    console.error('ignoring existing servers-full.json: no completed-sweep marker (truncated cache from an earlier run)');
  }
  const pulled = await pullServers();
  servers = pulled.servers;
  const meta = {
    total: servers.length,
    pages: pulled.pages,
    complete: pulled.complete,
    source: REG,
    pageSize: 100,
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(serversPath, JSON.stringify(servers));
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
  console.error(`TOTAL remote servers: ${servers.length} (swept ${meta.pages} pages, complete=${meta.complete})`);
}

const ckptPath = path.join(outDir, 'scan-full.jsonl');
const done = new Map();
if (fs.existsSync(ckptPath)) {
  for (const line of fs.readFileSync(ckptPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); done.set(r.name, r); } catch {}
  }
}
console.error(`already done: ${done.size}`);

let index = 0, n = done.size;
const log = fs.createWriteStream(ckptPath, { flags: 'a' });
async function worker() {
  while (index < servers.length) {
    const s = servers[index++];
    if (done.has(s.name)) continue;
    const report = await runSchema(s.url);
    const rec = {
      name: s.name, title: s.title, description: s.description, version: s.version, url: s.url,
      finalStatus: report?.finalStatus ?? 'UNKNOWN',
      protocolVersion: report?.mcp?.protocolVersion ?? null,
      serverInfo: report?.mcp?.serverInfo ?? null,
      toolCount: report?.mcp?.toolCount ?? null,
      findings: report?.findings ?? [{ severity: 'UNKNOWN', code: 'NO_RESPONSE', message: 'Endpoint did not complete MCP initialize + tools/list within timeout' }],
      checkedAt: report?.checkedAt ?? new Date().toISOString(),
    };
    if (rec.finalStatus === 'UNKNOWN') {
      const auth = await probeAuth(s.url);
      if (auth.auth) {
        rec.finalStatus = 'AUTH_GATED';
        rec.auth = auth.auth; // 'gated' | 'gated-verified'
        rec.resourceMetadata = auth.resourceMetadata;
        rec.discovery = auth.discovery;
      }
    }
    done.set(s.name, rec);
    log.write(JSON.stringify(rec) + '\n');
    n++;
    if (n % 100 === 0) console.error(`[${n}/${servers.length}]`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
log.end();
console.error('SCAN COMPLETE', done.size);

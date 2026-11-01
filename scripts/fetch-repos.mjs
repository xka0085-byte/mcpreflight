// Pull name -> repository.url map from official registry (metadata only, fast).
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const REG = 'https://registry.modelcontextprotocol.io/v0/servers';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Sanity bound only; hitting it is an error, not a silent stop.
const MAX_PAGES = Number(process.env.REGISTRY_MAX_PAGES ?? 5000);

const map = new Map();
let cursor = null;
for (let page = 0; page < MAX_PAGES; page++) {
  const u = REG + '?limit=100' + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
  let body = null;
  for (let a = 0; a < 3; a++) {
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(30000) });
      if (res.ok) { body = await res.json(); break; }
    } catch {}
    await sleep(1500);
  }
  // A failed page means the map is incomplete. Write nothing rather than a partial map.
  if (!body) throw new Error('registry fetch failed at page ' + page + ' — repos.json left untouched');
  for (const entry of body.servers ?? []) {
    const s = entry.server ?? {};
    const meta = entry._meta?.['io.modelcontextprotocol.registry/official'] ?? {};
    if (meta.status !== 'active' || meta.isLatest !== true) continue;
    const ru = String(s.repository?.url ?? '');
    const m = ru.match(/^https?:\/\/github\.com\/([^/]+)\/([^/#\s.]+)/i);
    if (s.name && m) map.set(s.name, `${m[1]}/${m[2]}`);
  }
  cursor = body.metadata?.nextCursor;
  if (!cursor) break;
}
if (cursor) throw new Error(`pagination did not terminate after ${MAX_PAGES} pages — repos.json left untouched`);
const out = Object.fromEntries(map);
fs.writeFileSync(path.join(root, 'trust-data', 'repos.json'), JSON.stringify(out, null, 0));
console.log('repos mapped:', map.size);

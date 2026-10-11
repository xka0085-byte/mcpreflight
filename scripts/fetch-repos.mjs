// Pull name -> repository.url map from official registry (metadata only, fast).
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const REG = 'https://registry.modelcontextprotocol.io/v0/servers';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const map = new Map();
let cursor = null;
for (let page = 0; page < 300; page++) {
  const u = REG + '?limit=100' + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
  let body = null;
  for (let a = 0; a < 3; a++) {
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(30000) });
      if (res.ok) { body = await res.json(); break; }
    } catch {}
    await sleep(1500);
  }
  if (!body) { console.error('fetch failed at page ' + page); break; }
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
const out = Object.fromEntries(map);
fs.writeFileSync(path.join(root, 'trust-data', 'repos.json'), JSON.stringify(out, null, 0));
console.log('repos mapped:', map.size);

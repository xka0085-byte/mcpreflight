// Convert scan-full.jsonl checkpoint into scan.json for trust-gen.mjs.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'trust-data');
const lines = fs.readFileSync(path.join(dataDir, 'scan-full.jsonl'), 'utf8').split('\n').filter((l) => l.trim());
const byName = new Map();
for (const line of lines) {
  try { const r = JSON.parse(line); byName.set(r.name, r); } catch {}
}
const results = [...byName.values()];

// Persist slugs into scan.json (single source of truth for gen + sitemap).
function slugify(name) {
  const base = String(name ?? '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return base || 'server';
}
const used = new Map();
for (const r of results) {
  let s = slugify(r.name);
  if (used.has(s)) { let i = 2; while (used.has(`${s}-${i}`)) i++; s = `${s}-${i}`; }
  used.set(s, true); r.slug = s;
}

let latest = '';
for (const r of results) if (r.checkedAt && r.checkedAt > latest) latest = r.checkedAt;
fs.writeFileSync(path.join(dataDir, 'scan.json'), JSON.stringify({ scannedAt: latest || new Date().toISOString(), results }, null, 1));
console.log(`scan.json: ${results.length} results, scannedAt=${latest}`);

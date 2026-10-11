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
let latest = '';
for (const r of results) if (r.checkedAt && r.checkedAt > latest) latest = r.checkedAt;
fs.writeFileSync(path.join(dataDir, 'scan.json'), JSON.stringify({ scannedAt: latest || new Date().toISOString(), results }, null, 1));
console.log(`scan.json: ${results.length} results, scannedAt=${latest}`);

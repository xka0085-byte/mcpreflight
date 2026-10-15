// Pick CI-conversion targets: PASS endpoints with a GitHub repo, not yet contacted.
// Rank by stars + recent push, take top N. Writes trust-data/ci-offer-queue.json.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execFile } from 'node:child_process';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const g = (a) => new Promise((r) => execFile('gh', a, { timeout: 30000, maxBuffer: 4 << 20 }, (e, s) => r(e ? null : s)));

const scan = JSON.parse(fs.readFileSync(path.join(root, 'trust-data', 'scan.json'), 'utf8'));
const repos = JSON.parse(fs.readFileSync(path.join(root, 'trust-data', 'repos.json'), 'utf8'));
const done = JSON.parse(fs.readFileSync(path.join(root, 'trust-data', 'outreach-done.json'), 'utf8'));
const byName = new Map(scan.results.map((r) => [r.name, r]));

const seen = new Set();
const doneLower = new Set(Object.keys(done).map((k) => k.toLowerCase()));
const cands = [];
for (const [name, repo] of Object.entries(repos)) {
  if (repo.toLowerCase() === 'xka0085-byte/mcpreflight') continue;
  const key = repo.toLowerCase();
  if (seen.has(key)) continue;
  const r = byName.get(name);
  if (!r || r.finalStatus !== 'PASS') continue;
  if (doneLower.has(key)) continue;
  seen.add(key);
  cands.push({ name, repo, slug: r.slug, url: r.url, toolCount: r.toolCount ?? null, checkedAt: r.checkedAt });
}
console.log('pass candidates with repos, uncontacted:', cands.length);

const ranked = [];
// stride-sample the pool so we do not only see the alphabetically-first names
const stride = Math.max(1, Math.ceil(cands.length / 150));
for (let i = 0; i < cands.length; i += stride) {
  const c = cands[i];
  const j = JSON.parse(await g(['api', `repos/${c.repo}`]) ?? 'null');
  if (!j || j.archived) continue;
  ranked.push({ ...c, stars: j.stargazers_count ?? 0, pushed_at: j.pushed_at ?? null, hasIssues: !j.has_issues ?? true });
}
ranked.sort((a, b) => (b.stars - a.stars) || (new Date(b.pushed_at) - new Date(a.pushed_at)));
const out = path.join(root, 'trust-data', 'ci-offer-queue.json');
fs.writeFileSync(out, JSON.stringify(ranked.slice(0, 20), null, 1));
console.log(ranked.slice(0, 12).map((c) => `${c.repo} | stars ${c.stars} | pushed ${(c.pushed_at || '').slice(0, 10)} | ${c.name}`).join('\n'));

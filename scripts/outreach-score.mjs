// Score outreach targets per GPT rubric + assign A/B/C/D value-prop groups (25 each).
// Queries GitHub API per repo (pushed_at, stargazers, description, archived).
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execFile } from 'node:child_process';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const queue = JSON.parse(fs.readFileSync(path.join(root, 'trust-data', 'outreach-queue.json'), 'utf8'));
const done = JSON.parse(fs.readFileSync(path.join(root, 'trust-data', 'outreach-done.json'), 'utf8'));
const gh = (args) => new Promise((resolve) => {
  execFile('gh', args, { timeout: 30000, maxBuffer: 2 << 20 }, (err, stdout) => {
    try { resolve(err ? null : JSON.parse(stdout)); } catch { resolve(null); }
  });
});

const candidates = queue.filter((q) => !done[q.repo.toLowerCase()]);
console.error('candidates:', candidates.length);

const scored = [];
let i = 0;
for (const q of candidates) {
  if (i >= 400) break; // score top-of-queue only, keep API usage sane
  i++;
  const info = await gh(['api', 'repos/' + q.repo, '-q', '{d:.description,s:.stargazers_count,p:.pushed_at,a:.archived,i:.open_issues_count}'] );
  await sleep(700);
  if (!info || info.a) continue;
  const days = (Date.now() - new Date(info.p).getTime()) / 86400000;
  const active = days <= 30 ? 25 : days <= 90 ? 18 : days <= 365 ? 8 : 0;
  const mcpCore = /mcp/i.test(String(info.d ?? '') + ' ' + q.repo) ? 15 : 5;
  const stars = info.s >= 50 ? 12 : info.s >= 10 ? 8 : info.s >= 3 ? 4 : 0;
  const problem = q.status === 'FAIL' ? 30 : /INVALID|SCHEMA|TIMEOUT/i.test(q.code) ? 15 : 8;
  const solvable = q.status === 'FAIL' ? 10 : 5;
  scored.push({ ...q, group: '', score: active + mcpCore + stars + problem + solvable, pushedAt: info.p, stars: info.s });
}
scored.sort((a, b) => b.score - a.score);
const top = scored.slice(0, 100);
top.forEach((t, idx) => { t.group = 'ABCD'[Math.floor(idx / 25)]; });
fs.writeFileSync(path.join(root, 'trust-data', 'outreach-experiment.json'), JSON.stringify(top, null, 1));
console.log('SCORED', scored.length, 'TOP100 written. Groups:', JSON.stringify(top.reduce((m, t) => ((m[t.group] = (m[t.group] ?? 0) + 1), m), {})));
console.log('SAMPLE', JSON.stringify(top.slice(0, 3).map((t) => `${t.group}:${t.repo}:s${t.score}`)));

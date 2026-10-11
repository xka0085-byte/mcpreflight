// Weekly reply check: fetch state + comments for every outreach issue we filed,
// flag issues where someone other than us replied, persist a metrics snapshot.
// Usage: node scripts/outreach-replies.mjs
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execFile } from 'node:child_process';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const ME = 'xka0085-byte';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const metricsPath = path.join(root, 'trust-data', 'outreach-metrics.json');
const donePath = path.join(root, 'trust-data', 'outreach-done.json');
const metrics = fs.existsSync(metricsPath) ? JSON.parse(fs.readFileSync(metricsPath, 'utf8')) : {};
const blind = fs.existsSync(donePath) ? JSON.parse(fs.readFileSync(donePath, 'utf8')) : {};

const gh = (args) => new Promise((resolve) => {
  execFile('gh', args, { timeout: 45000, maxBuffer: 4 << 20 }, (err, stdout) => {
    resolve({ err, stdout: (stdout ?? '').trim() });
  });
});

// 1) recover issue URLs for blind-filed repos that lack them
let recovered = 0;
for (const [repo, status] of Object.entries(blind)) {
  if (status !== 'filed') continue;
  const key = repo.toLowerCase();
  if (!metrics[key]) metrics[key] = { group: 'BLIND', issueUrl: '', filedAt: '' };
  if (metrics[key].issueUrl) continue;
  const s = await gh(['api', 'search/issues', '-f', `q=repo:${repo} author:${ME} type:issue in:title "read-only MCP health check"`, '-f', 'per_page=1']);
  if (s.err) { console.log(`SEARCH-ERR ${repo} :: ${String(s.err.message).slice(0, 120)}`); continue; }
  try {
    const items = JSON.parse(s.stdout).items ?? [];
    if (items.length) {
      metrics[key].issueUrl = items[0].html_url;
      metrics[key].code = (items[0].title.match(/: (\w+)$/) ?? [])[1] ?? '';
      metrics[key].filedAt = (items[0].created_at ?? '').slice(0, 10);
      recovered++;
    } else {
      metrics[key].noIssue = true; // title search found nothing; stop retrying
    }
  } catch { /* ignore parse errors */ }
  await sleep(900);
}

// 2) fetch issue state + comments for every tracked URL
const snapshot = {};
let rateLimited = false;
for (const [repo, m] of Object.entries(metrics)) {
  const num = (m.issueUrl.match(/\/issues\/(\d+)$/) ?? [])[1];
  if (!num) { snapshot[repo] = { ...m, replied: false, state: m.noIssue ? 'not-found' : 'no-url' }; continue; }
  const i = await gh(['api', `repos/${repo}/issues/${num}`, '-q', '{state:.state,c:.comments,u:.updated_at}']);
  if (i.err) {
    rateLimited = /rate limit/i.test(String(i.err.message));
    snapshot[repo] = { ...m, replied: false, state: 'fetch-error' };
    if (rateLimited) break;
    await sleep(500);
    continue;
  }
  let info = {};
  try { info = JSON.parse(i.stdout); } catch { /* empty */ }
  let lastAuthor = '', lastAt = '';
  if ((info.c ?? 0) > 0) {
    const cs = await gh(['api', `repos/${repo}/issues/${num}/comments?per_page=100`, '-q', '[-1:.user.login, -1:.created_at] | join(":")']);
    if (!cs.err) {
      const parts = cs.stdout.replace(/["[\]]/g, '').split(',');
      lastAuthor = (parts[0] ?? '').trim();
      lastAt = (parts[1] ?? '').trim();
    }
  }
  snapshot[repo] = {
    ...m, state: info.state ?? '?', comments: info.c ?? 0,
    lastAuthor, lastAt, replied: lastAuthor !== '' && lastAuthor !== ME,
  };
  await sleep(700);
}

// 3) persist + digest
const outDir = path.join(root, 'trust-data', 'metrics');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'replies.json'), JSON.stringify({ generatedAt: new Date().toISOString(), snapshot }, null, 1));
fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 1));

const byGroup = {};
for (const v of Object.values(snapshot)) {
  const g = v.group ?? 'BLIND';
  const b = byGroup[g] ??= { filed: 0, replied: 0, closed: 0 };
  if (v.issueUrl || v.state === 'not-found') b.filed++;
  if (v.replied) b.replied++;
  if (v.state === 'closed') b.closed++;
}
console.log('URLs recovered:', recovered);
console.log('DIGEST', JSON.stringify(byGroup));
const needReply = Object.entries(snapshot).filter(([, v]) => v.replied && v.state !== 'closed');
for (const [repo, v] of needReply) console.log(`NEEDS-REPLY ${repo} (${v.group}) by ${v.lastAuthor} :: ${v.issueUrl}`);

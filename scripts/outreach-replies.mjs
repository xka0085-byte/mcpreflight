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
  const s = await gh(['api', `search/issues?q=repo:${repo}+author:${ME}+type:issue+handshake+in:title`]);
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

// 3) delta vs previous snapshot -> digest issue (emails the maintainer only on activity)
const outDir = path.join(root, 'trust-data', 'metrics');
fs.mkdirSync(outDir, { recursive: true });
const prevReplied = (p, repo) => !!(p[repo] && p[repo].replied);
const snapPath = path.join(outDir, 'replies.json');
let prev = {};
try { prev = (JSON.parse(fs.readFileSync(snapPath, 'utf8')).snapshot) ?? {}; } catch { /* first run */ }
const delta = [];
for (const [repo, v] of Object.entries(snapshot)) {
  if (!v.issueUrl) continue;
  const p = prev[repo] ?? {};
  if ((p.state ?? 'open') !== v.state || (v.replied && !p.replied) || (v.lastAt && v.lastAt !== p.lastAt)) {
    delta.push({ repo, ...v, prevState: p.state ?? 'new' });
  }
}

fs.writeFileSync(snapPath, JSON.stringify({ generatedAt: new Date().toISOString(), snapshot }, null, 1));
fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 1));

// 4) PR watch: template-integration PRs + x402 docs PR -> same digest
const PR_WATCH = [
  ['iceener/streamable-mcp-server-template', 4],
  ['do-community/do-remote-mcp-server-template', 3],
  ['achetronic/mcp-forge', 2],
  ['hostinger/selfhosted-mcp-server-template', 2],
  ['InteractionCo/mcp-server-template', 11],
  ['x402-foundation/x402', 3766],
];
const prStatePath = path.join(outDir, 'pr-states.json');
let prPrev = {};
try { prPrev = JSON.parse(fs.readFileSync(prStatePath, 'utf8')); } catch { /* first run */ }
const prNow = {}; const prLines = [];
for (const [repo, n] of PR_WATCH) {
  const p = await gh(['api', `repos/${repo}/issues/${n}`, '-q', '{s:.state,c:.comments,u:.updated_at}']);
  if (!p) continue;
  prNow[`${repo}#${n}`] = p;
  const prev = prPrev[`${repo}#${n}`] ?? {};
  if (!prev.u || prev.u !== p.u || prev.s !== p.s) {
    prLines.push(`- [${repo}#${n}](https://github.com/${repo}/pull/${n}) state=${p.s} comments=${p.c} updated=${p.u}`);
  }
}
fs.writeFileSync(prStatePath, JSON.stringify(prNow, null, 1));

if (delta.length || prLines.length) {
  const replied = delta.filter((d) => d.replied).length;
  const closed = delta.filter((d) => d.state === 'closed' && d.prevState !== 'closed').length;
  const lines = delta.map((d) => {
    const parts = [`- [${d.repo}](${d.issueUrl}) group=${d.group}`];
    if (d.prevState !== d.state) parts.push(`state: ${d.prevState} -> ${d.state}`);
    if (d.replied && !prevReplied(prev, d.repo)) parts.push(`NEW reply by ${d.lastAuthor} at ${d.lastAt}`);
    else if (d.lastAt && d.lastAt !== (prev[d.repo]?.lastAt ?? '')) parts.push(`activity at ${d.lastAt} (last by ${d.lastAuthor})`);
    return parts.join(' | ');
  });
  const title = `outreach digest ${new Date().toISOString().slice(0, 10)}: ${replied} new replies, ${closed} newly closed, ${prLines.length} PR updates`;
  const body = `${delta.length} tracked issue(s) changed since the last snapshot:\n\n${lines.join('\n')}\n\nPR watch:\n${prLines.join('\n') || '(no changes)'}\n\n_snapshot: trust-data/metrics/replies.json_`;
  const bp = path.join(root, 'trust-data', '.digest.md');
  fs.writeFileSync(bp, body);
  const r = await gh(['issue', 'create', '-R', 'xka0085-byte/mcp-doctor', '-t', title, '--body-file', bp]);
  console.log('DIGEST-ISSUE', r.stdout || String(r.err?.message ?? '').slice(0, 200));
}

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

// Badge pilot: offer a "passed our latest registry check" badge to top 20 PASS servers with repos.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execFile } from 'node:child_process';
import { endpointPhrase } from './lib/sweep-figures.mjs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const scan = JSON.parse(fs.readFileSync(path.join(root, 'trust-data', 'scan.json'), 'utf8')).results;
const repos = JSON.parse(fs.readFileSync(path.join(root, 'trust-data', 'repos.json'), 'utf8'));
const donePath = path.join(root, 'trust-data', 'outreach-done.json');
const done = JSON.parse(fs.readFileSync(donePath, 'utf8'));

const gh = (args) => new Promise((resolve) => {
  execFile('gh', args, { timeout: 30000, maxBuffer: 2 << 20 }, (err, stdout) => {
    try { resolve(err ? null : JSON.parse(stdout)); } catch { resolve(null); }
  });
});

const BADGE = (slug) => `https://xka0085-byte.github.io/mcpreflight/trust/badge/${slug}.svg`;
const REPORT = (slug) => `https://xka0085-byte.github.io/mcpreflight/trust/p/${slug}.html`;

const body = (q) => `Good news for once: your server is one of the ${q.passCount} MCP registry endpoints that completed a clean anonymous health check in our latest weekly scan.

We ran a read-only preflight (MCP initialize + tools/list, no tools called) against ${endpointPhrase(root)} in the official MCP Registry. Report for your server: ${REPORT(q.slug)}
Reproduce locally: \`npx @eidonze/mcpreflight schema ${q.url}\`

If you want to show it off, this badge embeds in your README and updates automatically as our weekly rescan runs, so it always reflects the live state of your endpoint:

<img src="${BADGE(q.slug)}" alt="mcp trust: pass" width="135" height="20">

If you would rather not be listed in the public directory or get badge updates, just say so here and we will exclude the server.`;

// candidates: PASS with a repo, not previously contacted (error/retry-later are retryable)
const cands = scan.filter((r) => {
  if (r.finalStatus !== 'PASS') return false;
  const repo = repos[r.name];
  if (!repo || repo.toLowerCase().startsWith('modelcontextprotocol/')) return false;
  const d = done[String(repo).toLowerCase()];
  return !d || d === 'error' || d === 'retry-later';
});
console.error('candidates:', cands.length);

// score by stars, keep API usage sane
const scored = [];
for (const c of cands.slice(0, 80)) {
  const repo = repos[c.name];
  const info = await gh(['api', 'repos/' + repo, '-q', '{s:.stargazers_count,a:.archived}']);
  await sleep(700);
  if (!info || info.a) continue;
  scored.push({ ...c, repo, stars: info.s ?? 0 });
}
scored.sort((a, b) => b.stars - a.stars);
const passCount = scan.filter((r) => r.finalStatus === 'PASS').length;
const targets = scored.slice(0, 20);
console.error('targets:', targets.length);

let filed = 0;
const bp = path.join(root, 'trust-data', '.badge-body.md');
for (const t of targets) {
  const key = t.repo.toLowerCase();
  fs.writeFileSync(bp, body(t));
  const r = await new Promise((resolve) => {
    execFile('gh', ['issue', 'create', '-R', t.repo, '-t', 'your MCP server passed our latest registry health check (badge inside)', '--body-file', bp], { timeout: 60000, maxBuffer: 2 << 20 }, (err, stdout, stderr) => {
      resolve({ err, out: (stdout ?? '').trim(), msg: String(err?.message ?? stderr ?? '').slice(0, 200) });
    });
  });
  if (r.err) {
    done[key] = r.msg.includes('404') ? 'skip-404' : (r.msg.includes('410') || /disabled/i.test(r.msg)) ? 'skip-disabled' : (r.msg.includes('403') || r.msg.includes('429')) ? 'retry-later' : 'error';
    console.log(`ERR ${t.repo} :: ${r.msg}`);
  } else {
    done[key] = 'badge-offered';
    filed++;
    console.log(`OFFERED ${t.repo} s${t.stars} ${r.out}`);
  }
  fs.writeFileSync(donePath, JSON.stringify(done, null, 0));
  await sleep(3000);
}
console.log(`DONE filed=${filed}`);

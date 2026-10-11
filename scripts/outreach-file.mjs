// File rescue issues for broken MCP servers (throttled, resumable).
// Usage: node scripts/outreach-file.mjs [cap]
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execFile } from 'node:child_process';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const cap = Number(process.argv[2] ?? 60);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const queue = JSON.parse(fs.readFileSync(path.join(root, 'trust-data', 'outreach-queue.json'), 'utf8'));
const donePath = path.join(root, 'trust-data', 'outreach-done.json');
const done = fs.existsSync(donePath) ? JSON.parse(fs.readFileSync(donePath, 'utf8')) : {};

const body = (q) => `Read-only health check of the endpoint registered for this project in the official MCP Registry did not complete a clean MCP handshake.

- Registry name: ${q.name}
- Endpoint: \`${q.url}\`
- Result: ${q.status} — \`${q.code}\`: ${q.message}

Full report (updated weekly): https://xka0085-byte.github.io/mcp-doctor/trust/p/${q.slug}.html
Reproduce locally: \`npx @eidonze/mcpdoctor schema ${q.url}\`

What this is: [mcpdoctor](https://github.com/xka0085-byte/mcp-doctor) — an open-source (MIT) MCP preflight checker. It sends only MCP \`initialize\` + \`tools/list\`; no tools are called and no data is read.

- If this endpoint is intentionally auth-gated, a failed anonymous handshake is expected — please ignore this issue (the public directory marks such servers as "no anonymous handshake").
- If it should be reachable anonymously, the report shows the exact step that failed.
- If you would rather not be listed in the public directory at all, reply here and we will exclude the server.`;

const gh = (args) => new Promise((resolve) => {
  execFile('gh', args, { timeout: 60000, maxBuffer: 4 << 20 }, (err, stdout, stderr) => {
    resolve({ err, stdout: (stdout ?? '').trim(), stderr: (stderr ?? '').trim() });
  });
});

const bodyPath = path.join(root, 'trust-data', '.issue-body.md');
let filed = 0, skipped = 0, notFound = 0;
for (const q of queue) {
  if (filed >= cap) break;
  const key = q.repo.toLowerCase();
  if (done[key]) continue;
  fs.writeFileSync(bodyPath, body(q));
  const r = await gh(['issue', 'create', '-R', q.repo, '-t',
    `[read-only MCP health check] handshake incomplete: ${q.code}`, '--body-file', bodyPath]);
  const msg = String(r.err?.message ?? '');
  done[key] = !r.err ? 'filed'
    : msg.includes('404') ? 'skip-404'
    : (msg.includes('410') || /disabled/i.test(msg)) ? 'skip-disabled'
    : (msg.includes('locked') || /archived/i.test(msg)) ? 'skip-archived'
    : (msg.includes('403') || msg.includes('429')) ? 'retry-later'
    : 'error';
  if (r.err) {
    console.log(`ERR ${q.repo} :: ${msg.slice(0, 300)}`);
  } else {
    filed++;
    console.log(`FILED ${q.repo} ${q.code}`);
  }
  fs.writeFileSync(donePath, JSON.stringify(done, null, 0));
  await sleep(3000);
}
console.log(`DONE filed=${filed} notFound=${notFound} skipped=${skipped} totalDone=${Object.keys(done).length}`);

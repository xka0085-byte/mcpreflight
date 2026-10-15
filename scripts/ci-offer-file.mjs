// File CI-conversion offers for PASS endpoints: new issue per repo with report link,
// one-block Action yaml, and badge. Records status 'ci-offered' in outreach-done.json.
// Usage: node scripts/ci-offer-file.mjs [cap]
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execFile } from 'node:child_process';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const cap = Number(process.argv[2] ?? 5);
const g = (a) => new Promise((r) => execFile('gh', a, { timeout: 45000, maxBuffer: 4 << 20 }, (e, s) => r({ e: Boolean(e), s })));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const queue = JSON.parse(fs.readFileSync(path.join(root, 'trust-data', 'ci-offer-queue.json'), 'utf8'));
const donePath = path.join(root, 'trust-data', 'outreach-done.json');
const done = JSON.parse(fs.readFileSync(donePath, 'utf8'));

const REPORT = (slug) => `https://xka0085-byte.github.io/mcpreflight/trust/p/${slug}.html`;
const BADGE = (slug) => `https://xka0085-byte.github.io/mcpreflight/trust/badge/${slug}.svg`;

const body = (q) => `the weekly read-only scan of all 9,991 remote MCP endpoints in the official registry checked your server (${q.name}) anonymously and it passed a clean initialize + tools/list handshake, so it is listed as PASS in the trust directory: ${REPORT(q.slug)}

the same check runs as one read-only CI block on every push, which is how you catch the deploy that silently breaks the handshake before clients find it:

\`\`\`yaml
- uses: xka0085-byte/mcpreflight@v1
  with:
    endpoint: ${q.url}
    mode: schema
\`\`\`

a live status badge for the readme if you want one: ![MCP trust](${BADGE(q.slug)}). no tool calls, no credentials, nothing beyond the handshake, and if this endpoint should not be in the public directory just reply here and we exclude it.

what this is: [mcpreflight](https://github.com/xka0085-byte/mcpreflight), an open-source (MIT) MCP preflight checker, rescan runs every Monday`;

let filed = 0;
for (const q of queue) {
  if (filed >= cap) break;
  if (done[q.repo]) continue;
  const bodyFile = path.join(root, 'trust-data', '.ci-offer-body.md');
  fs.writeFileSync(bodyFile, body(q));
  const title = `your MCP endpoint passes the registry-wide health check, keep it that way in CI`;
  const res = await g(['issue', 'create', '-R', q.repo, '-t', title, '--body-file', bodyFile]);
  if (res.e) {
    console.log(`ERROR ${q.repo}: ${(res.s || '').slice(0, 160)}`);
    done[q.repo] = 'error';
  } else {
    console.log(`FILED ${q.repo}: ${(res.s || '').trim()}`);
    done[q.repo] = 'ci-offered';
    filed++;
  }
  await sleep(8000);
}
fs.writeFileSync(donePath, JSON.stringify(done));
console.log(`filed ${filed}/${cap}`);

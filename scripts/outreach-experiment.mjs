// File the 100-target outreach experiment: one of four value propositions (A/B/C/D)
// per scored target, tracking issue URL + group + date in trust-data/outreach-metrics.json.
// Usage: node scripts/outreach-experiment.mjs [cap] [group]
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execFile } from 'node:child_process';
import { endpointPhrase } from './lib/sweep-figures.mjs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const cap = Number(process.argv[2] ?? 100);
const onlyGroup = process.argv[3] ?? '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = JSON.parse(fs.readFileSync(path.join(root, 'trust-data', 'outreach-experiment.json'), 'utf8'));
const donePath = path.join(root, 'trust-data', 'outreach-metrics.json');
const done = fs.existsSync(donePath) ? JSON.parse(fs.readFileSync(donePath, 'utf8')) : {};
// never re-file something already blind-filed in the long-tail phase
const blindDone = JSON.parse(fs.readFileSync(path.join(root, 'trust-data', 'outreach-done.json'), 'utf8'));

const REPORT = (slug) => `https://xka0085-byte.github.io/mcpreflight/trust/p/${slug}.html`;
const BADGE = (slug) => `https://xka0085-byte.github.io/mcpreflight/trust/badge/${slug}.svg`;
const SITE = 'https://xka0085-byte.github.io/mcpreflight/';

const FOOTER = `What this is: [mcpreflight](https://github.com/xka0085-byte/mcpreflight) — an open-source (MIT) MCP preflight checker. It sends only MCP \`initialize\` + \`tools/list\`; no tools are called and no data is read.

- If this endpoint is intentionally auth-gated, a failed anonymous handshake is expected — please ignore this issue (the public directory marks such servers as "no anonymous handshake").
- If it should be reachable anonymously, the report shows the exact step that failed.
- If you would rather not be listed in the public directory at all, reply here and we will exclude the server.`;

// A: rescue — the plain problem report (baseline, matches the long-tail template)
const bodyA = (q) => `Read-only health check of the endpoint registered for this project in the official MCP Registry did not complete a clean MCP handshake.

- Registry name: ${q.name}
- Endpoint: \`${q.url}\`
- Result: ${q.status} — \`${q.code}\`: ${q.message}

Full report (updated weekly): ${REPORT(q.slug)}
Reproduce locally: \`npx @eidonze/mcpreflight schema ${q.url}\`

${FOOTER}`;

// B: CI prevention — frame the failure as a regression risk the Action can gate
const bodyB = (q) => `A read-only check of the endpoint registered for this project in the official MCP Registry did not complete a clean MCP handshake (\`${q.code}\`: ${q.message}).

If this endpoint is meant to be reachable anonymously, this is the kind of failure that reappears silently after a deploy or dependency bump — the registry entry and the live server drift apart and nobody notices until clients break.

A one-block GitHub Action re-checks it on every push or release, read-only (MCP \`initialize\` + \`tools/list\`, no tool calls):

\`\`\`yaml
- uses: xka0085-byte/mcpreflight@v1
  with:
    endpoint: ${q.url}
    mode: schema
\`\`\`

Full report (updated weekly): ${REPORT(q.slug)}

${FOOTER}`;

// C: directory + badge — offer exposure instead of only a problem report
const bodyC = (q) => `Your MCP endpoint (${q.name}, \`${q.url}\`) is listed in the [MCP Trust Directory](${SITE}trust/), a free weekly-rescanned directory covering ${endpointPhrase(root)} in the official MCP Registry.

Current status: **${q.status}** (\`${q.code}\`).

Two things you can do in under a minute:

1. Check the full report: ${REPORT(q.slug)}
2. Embed the live status badge in your README:

\`\`\`markdown
![MCP trust](${BADGE(q.slug)})
\`\`\`

The badge re-renders on every weekly rescan, so users always see current health. If the status looks wrong, reply here and we will re-check or exclude the server.

${FOOTER}`;

// D: data / report — invite a one-line classification for the State of MCP dataset
const bodyD = (q) => `We are compiling the **State of MCP Server Reliability** report from ${endpointPhrase(root)} in the official MCP Registry. Yours (${q.name}, \`${q.url}\`) registered **${q.code}** on the latest scan: ${q.message}

That lands in the public dataset as "no anonymous handshake" unless you tell us otherwise. A one-line reply is enough:

- "auth-gated" — expected behavior, we classify it as intentional
- "moved" — with the new URL if you want it re-checked
- "exclude" — we drop it from the directory entirely

Full report: ${REPORT(q.slug)} · Report draft: ${SITE}state-of-mcp-2026-10.html

${FOOTER}`;

const bodies = { A: bodyA, B: bodyB, C: bodyC, D: bodyD };
const titles = {
  A: (q) => `[read-only MCP health check] handshake incomplete: ${q.code}`,
  B: (q) => `[MCP CI check] catch this handshake failure before release (${q.code})`,
  C: (q) => `Your MCP server is listed in the MCP Trust Directory (status: ${q.status})`,
  D: (q) => `[MCP reliability study] is the ${q.code} on your endpoint intentional?`,
};

const gh = (args) => new Promise((resolve) => {
  execFile('gh', args, { timeout: 60000, maxBuffer: 4 << 20 }, (err, stdout, stderr) => {
    resolve({ err, stdout: (stdout ?? '').trim(), stderr: (stderr ?? '').trim() });
  });
});

const bodyPath = path.join(root, 'trust-data', '.issue-body.md');
let filed = 0;
for (const q of targets) {
  if (filed >= cap) break;
  if (onlyGroup && q.group !== onlyGroup) continue;
  const key = q.repo.toLowerCase();
  if (done[key] || blindDone[key]) continue;
  fs.writeFileSync(bodyPath, bodies[q.group](q));
  const r = await gh(['issue', 'create', '-R', q.repo, '-t', titles[q.group](q), '--body-file', bodyPath]);
  const msg = String(r.err?.message ?? '');
  const issueUrl = (!r.err && /^https:\/\/github\.com\//.test(r.stdout)) ? r.stdout.split('\n')[0] : '';
  if (r.err) {
    done[key] = {
      group: q.group, issueUrl: '', filedAt: '', error: msg.slice(0, 200),
      code: q.code, status: q.status, stars: q.stars, score: q.score,
    };
    console.log(`ERR ${q.repo} :: ${msg.slice(0, 300)}`);
  } else {
    filed++;
    done[key] = {
      group: q.group, issueUrl, filedAt: new Date().toISOString().slice(0, 10),
      code: q.code, status: q.status, stars: q.stars, score: q.score,
    };
    console.log(`FILED ${q.repo} group=${q.group} ${issueUrl}`);
  }
  fs.writeFileSync(donePath, JSON.stringify(done, null, 1));
  await sleep(3000);
}
const groups = {};
for (const v of Object.values(done)) groups[v.group] = (groups[v.group] ?? 0) + 1;
console.log(`DONE filed=${filed} tracked=${Object.keys(done).length} byGroup=${JSON.stringify(groups)}`);

// Channel 4: cross-check punkpeye/awesome-mcp-servers entries against our scan data.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const repos = JSON.parse(fs.readFileSync(path.join(root, 'trust-data', 'repos.json'), 'utf8'));
const scan = JSON.parse(fs.readFileSync(path.join(root, 'trust-data', 'scan.json'), 'utf8'));
const byRepo = new Map();
for (const [name, repo] of Object.entries(repos)) {
  const r = scan.results.find((x) => x.name === name);
  if (r) byRepo.set(repo.toLowerCase(), { name, status: r.finalStatus, slug: r.slug, url: r.url, code: r.findings[0]?.code ?? '' });
}

const readme = await (await fetch('https://raw.githubusercontent.com/punkpeye/awesome-mcp-servers/main/README.md', { signal: AbortSignal.timeout(30000) })).text();
const slugs = new Set();
for (const m of readme.matchAll(/\]\(https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\)/g)) {
  slugs.add(m[1].toLowerCase().replace(/\.git$/, ''));
}
console.log('list repo links:', slugs.size);

const matched = [...slugs].filter((s) => byRepo.has(s));
const broken = matched.filter((s) => byRepo.get(s).status !== 'PASS');
console.log(`matched to registry scan: ${matched.length} / ${slugs.size}; non-PASS: ${broken.length}`);
console.log('BREAKDOWN', JSON.stringify({
  FAIL: broken.filter((s) => byRepo.get(s).status === 'FAIL').length,
  UNKNOWN: broken.filter((s) => byRepo.get(s).status === 'UNKNOWN').length,
}));
const rows = broken.slice(0, 25).map((s) => {
  const e = byRepo.get(s);
  return `| [${s}]() | ${e.name} | ${e.status} | \`${e.code}\` | [report](https://xka0085-byte.github.io/mcp-doctor/trust/p/${e.slug}.html) |`;
});
fs.writeFileSync(path.join(root, 'trust-data', 'awesome-report.md'),
  `Cross-checked ${matched.length} of the ${slugs.size} GitHub repos in this list against the official MCP Registry scan (read-only initialize + tools/list, 9991 servers, updated weekly).\n\n${broken.length} matched servers currently do not complete a clean anonymous handshake (of which auth-gated by design is possible — the reports show the exact failing step):\n\n| repo | registry name | status | finding | report |\n|---|---|---|---|---|\n${rows.join('\n')}\n\nReproduce any line: \`npx @eidonze/mcpdoctor schema <endpoint>\` · methodology + limitations: https://xka0085-byte.github.io/mcp-doctor/trust/\n`);
console.log('written trust-data/awesome-report.md');

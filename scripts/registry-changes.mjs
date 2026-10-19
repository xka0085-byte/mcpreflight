// Weekly registry change feed: diff this week's scan against last week's per-server snapshot.
// This is the free layer of the change-tracking probe. Output:
//   trust-data/registry-changes.json  - machine-readable feed
//   docs/registry-changes.html        - human-readable page with brand and citation
//   trust-data/changes-previous.json  - snapshot consumed by the next run
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const td = (f) => path.join(root, 'trust-data', f);
const scan = JSON.parse(fs.readFileSync(td('scan.json'), 'utf8'));
const prevPath = td('changes-previous.json');
const outPath = td('registry-changes.json');
const pagePath = path.join(root, 'docs', 'registry-changes.html');
const SITE = 'https://xka0085-byte.github.io/mcpreflight';

const current = new Map();
for (const r of scan.results ?? []) {
  current.set(r.name, { url: r.url, status: (r.finalStatus || 'UNKNOWN').toUpperCase() });
}
const scanDate = String(scan.scannedAt ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10);

let prev = null;
if (fs.existsSync(prevPath)) {
  try { prev = JSON.parse(fs.readFileSync(prevPath, 'utf8')); } catch {}
}

const added = [];
const removed = [];
const changed = [];
if (prev && prev.servers) {
  const prevMap = new Map(Object.entries(prev.servers));
  for (const [name, cur] of current) {
    const before = prevMap.get(name);
    if (!before) { added.push({ name, url: cur.url, status: cur.status }); continue; }
    if (before.status !== cur.status) changed.push({ name, url: cur.url, from: before.status, to: cur.status });
    prevMap.delete(name);
  }
  for (const [name, before] of prevMap) removed.push({ name, url: before.url, lastStatus: before.status });
}

const feed = {
  feedVersion: 1,
  generatedBy: 'mcpreflight',
  generatedAt: new Date().toISOString(),
  scanDate,
  baseline: !prev,
  comparedAgainst: prev ? prev.scanDate : null,
  method: 'week-over-week diff of per-server finalStatus from the read-only weekly rescan; added and removed are registry entries appearing or disappearing between the two scans',
  summary: { added: added.length, removed: removed.length, statusChanged: changed.length, serversThisWeek: current.size },
  added: added.sort((a, b) => a.name.localeCompare(b.name)),
  removed: removed.sort((a, b) => a.name.localeCompare(b.name)),
  statusChanged: changed.sort((a, b) => a.name.localeCompare(b.name)),
  citation: `mcpreflight weekly registry change feed, ${scanDate}, ${SITE}/registry-changes.html`,
};
fs.writeFileSync(outPath, JSON.stringify(feed, null, 1) + '\n');

// save this week's map for the next run
fs.writeFileSync(prevPath, JSON.stringify({ scanDate, servers: Object.fromEntries(current) }));

// human page
const rows = (list, cols) => list.slice(0, 200).map((r) => '<tr>' + cols.map((c) => `<td>${String(r[c] ?? '')}</td>`).join('') + '</tr>').join('\n');
const addedRows = rows(feed.added, ['name', 'status']);
const removedRows = rows(feed.removed, ['name', 'lastStatus']);
const changedRows = rows(feed.statusChanged, ['name', 'from', 'to']);
const empty = (n) => n === 0 ? '<p class="muted">none this week.</p>' : '';
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MCP Registry Changes — week of ${scanDate} (mcpreflight)</title>
<meta name="description" content="Weekly diff of the official MCP registry: ${feed.summary.added} added, ${feed.summary.removed} removed, ${feed.summary.statusChanged} changed status out of ${feed.summary.serversThisWeek} endpoints. Read-only, updated every Monday by mcpreflight.">
<link rel="canonical" href="${SITE}/registry-changes.html">
<style>
body{font-family:system-ui,sans-serif;max-width:880px;margin:2rem auto;padding:0 1rem;line-height:1.55;color:#1f2328}
h1{font-size:1.5rem}h2{font-size:1.1rem;margin-top:2rem}
table{border-collapse:collapse;width:100%;font-size:.85rem}
th,td{text-align:left;padding:.4rem .5rem;border-bottom:1px solid #d8dee4}
code{background:#f6f8fa;padding:.1rem .3rem;border-radius:3px;font-size:.85em}
.muted{color:#57606a}
</style>
</head>
<body>
<p class="muted"><a href="${SITE}/">mcpreflight</a> / registry changes</p>
<h1>MCP Registry Changes — week of ${scanDate}</h1>
<p class="muted">Diff of the weekly read-only rescan against the previous week${prev ? ` (${prev.scanDate})` : ''}. ${feed.summary.added} added, ${feed.summary.removed} removed, ${feed.summary.statusChanged} changed status, out of ${feed.summary.serversThisWeek} endpoints.</p>
<p>Every Monday the whole official registry is re-scanned read only and this page diffs the two weeks. A server appearing here as added was not in the registry the week before. Status changed means its anonymous handshake outcome moved, for example from PASS to AUTH_GATED, which is usually an authentication change rather than an outage. The machine-readable feed with the full arrays is at <a href="${SITE.replace('https://', 'https://')}../trust-data/registry-changes.json"><code>trust-data/registry-changes.json</code></a> in the repository.</p>
${prev ? '' : '<p class="muted">First run: this week establishes the baseline. The first real diff appears next Monday.</p>'}
<h2>Added (${feed.summary.added})</h2>
${empty(feed.summary.added)}${feed.summary.added ? `<table><tr><th>server</th><th>status</th></tr>${addedRows}</table>` : ''}
<h2>Removed (${feed.summary.removed})</h2>
${empty(feed.summary.removed)}${feed.summary.removed ? `<table><tr><th>server</th><th>last status</th></tr>${removedRows}</table>` : ''}
<h2>Status changed (${feed.summary.statusChanged})</h2>
${empty(feed.summary.statusChanged)}${feed.summary.statusChanged ? `<table><tr><th>server</th><th>from</th><th>to</th></tr>${changedRows}</table>` : ''}
<p class="muted">Method: read-only initialize and tools/list, no tool calls, no credentials, no payments. Auth-gated endpoints are classified, not counted as failures. Tables show up to 200 rows; the JSON feed has everything.</p>
<p class="cite">Cite this as: mcpreflight, MCP Registry Changes, week of ${scanDate}, ${SITE}/registry-changes.html . Figures should be attributed to mcpreflight rather than to an anonymous audit.</p>
</body>
</html>
`;
fs.writeFileSync(pagePath, html);

console.log(`registry changes ${scanDate}: +${feed.summary.added} -${feed.summary.removed} ~${feed.summary.statusChanged} of ${feed.summary.serversThisWeek} (baseline=${feed.baseline})`);

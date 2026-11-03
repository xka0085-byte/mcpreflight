// Weekly registry change feed: diff this week's scan against last week's per-server snapshot.
// This is the free layer of the change-tracking probe. Output:
//   trust-data/registry-changes.json  - machine-readable feed
//   docs/registry-changes.html        - human-readable page with brand and citation
//   trust-data/changes-previous.json  - snapshot consumed by the next run
//
// Baseline discipline: the whole point of a "week-over-week" feed is that both sides are a
// week apart. This script also runs on manual dispatch and on retries, so the same scan day
// can be diffed twice. If every run replaced changes-previous.json, the second run of the day
// would diff "today 10:13 vs today 08:57" and publish scan jitter (timeouts, rate-limit
// backoff, one-off 5xx) as a weekly change. So the baseline only advances on a cross-ISO-week
// diff; same-day and same-week reruns refresh the status snapshot and keep the old baseline.
// See scripts/lib/period.mjs for the rule.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { comparisonKind, advancesBaseline, daysBetween, isoWeekKey } from './lib/period.mjs';

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

// A previous baseline is only comparable when it was itself a complete registry walk. The
// pre-2026-10-31 cache came from a 300-page crawl, so every endpoint it never reached would
// otherwise be reported as "added". Those are counted separately and never rendered as added.
const prevComplete = prev?.meta?.complete === true;
const prevCoverage = prev?.meta?.total ?? (prev?.servers ? Object.keys(prev.servers).length : null);

// 本次 diff 与上一次快照的关系。同日/同周只刷新 status，不推进基线。
const prevScanDate = typeof prev?.scanDate === 'string' ? prev.scanDate : null;
const kind = comparisonKind(scanDate, prevScanDate);
const baselineAdvanced = advancesBaseline(kind);

function buildComparisonNote(kindValue, prevDate, prevCompleteFlag, prevCoverageValue) {
  const notes = [];
  if (kindValue === 'baseline') {
    notes.push('first run: this scan establishes the baseline, the first weekly diff appears on the next cross-week scan');
  }
  if (kindValue === 'same-day') {
    notes.push(`same-day rerun against ${prevDate}: the baseline was not advanced, so summary counts are scan-to-scan jitter inside one day and are not a weekly change`);
  }
  if (kindValue === 'same-week') {
    notes.push(`same ISO week as the baseline (${prevDate}): the baseline was not advanced, so this is an intra-week refresh of the status snapshot rather than a new weekly diff`);
  }
  if (kindValue === 'unknown') {
    notes.push('scan dates are missing or invalid: week-over-week comparability could not be established, so the baseline was not advanced');
  }
  if (kindValue === 'cross-week' && !prevCompleteFlag) {
    notes.push(`previous baseline covered ${prevCoverageValue} endpoints, so endpoints it never reached are counted in summary.addedUncomparable instead of being reported as added`);
  }
  return notes.length ? notes.join('; ') : null;
}

const added = [];
const removed = [];
const changed = [];
let uncomparable = 0;
if (prev && prev.servers) {
  const prevMap = new Map(Object.entries(prev.servers));
  for (const [name, cur] of current) {
    const before = prevMap.get(name);
    if (!before) {
      if (prevComplete) added.push({ name, url: cur.url, status: cur.status });
      else uncomparable++;
      continue;
    }
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
  comparedAgainstComplete: prevComplete,
  comparedAgainstCoverage: prevCoverage,
  comparisonKind: kind,
  baselineAdvanced,
  refreshOnly: !baselineAdvanced,
  weekOf: isoWeekKey(scanDate),
  comparedAgainstWeek: prev?.scanDate ? isoWeekKey(prev.scanDate) : null,
  daysSinceBaseline: prev?.scanDate ? daysBetween(prev.scanDate, scanDate) : null,
  comparisonNote: buildComparisonNote(kind, prevScanDate, prevComplete, prevCoverage),
  method: 'week-over-week diff of per-server finalStatus from the read-only weekly rescan; added and removed are registry entries appearing or disappearing between two complete scans, and are withheld when the earlier scan was truncated. The baseline only advances on a cross-week diff, so same-week reruns refresh status without creating a new weekly change',
  // weeklyComparable 是给只看 summary 的下游用的：false 表示这几个变化数不是周对比结果，
  // 而是同一周内两次扫描的差分（抖动）。serversThisWeek 不受影响，它始终是本次在册规模。
  summary: {
    added: added.length,
    addedUncomparable: uncomparable,
    removed: removed.length,
    statusChanged: changed.length,
    serversThisWeek: current.size,
    weeklyComparable: baselineAdvanced,
  },
  added: added.sort((a, b) => a.name.localeCompare(b.name)),
  removed: removed.sort((a, b) => a.name.localeCompare(b.name)),
  statusChanged: changed.sort((a, b) => a.name.localeCompare(b.name)),
  citation: `mcpreflight weekly registry change feed, ${scanDate}, ${SITE}/registry-changes.html`,
};
fs.writeFileSync(outPath, JSON.stringify(feed, null, 1) + '\n');

// 只有跨周（或首次建立基线）才换基线快照。同日/同周重跑保留旧快照，因此下一次
// diff 仍然相对上周，而不是相对今天早上那次扫描。
if (baselineAdvanced) {
  fs.writeFileSync(prevPath, JSON.stringify({
    scanDate,
    meta: { complete: true, total: current.size },
    servers: Object.fromEntries(current),
  }));
} else {
  console.warn(`baseline not advanced: ${kind} (scanDate ${scanDate} vs ${prevScanDate}); changes-previous.json left untouched`);
}

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
<p class="muted">Diff of the weekly read-only rescan against the previous week${prev ? ` (${prev.scanDate})` : ''}. ${feed.summary.added} added, ${feed.summary.removed} removed, ${feed.summary.statusChanged} changed status, out of ${feed.summary.serversThisWeek} endpoints.${prevComplete ? '' : ' Added and removed are withheld this week because the previous baseline was a truncated crawl.'}</p>
${feed.refreshOnly ? `<p class="note"><strong>Intra-week refresh, not a new weekly diff.</strong> The scan on ${scanDate} falls in the same ISO week as the baseline (${prevScanDate}), so the baseline was left in place. The numbers above are the status snapshot of the full registry on ${scanDate}; anything that moved between two runs inside the same week is scan jitter, not a week-over-week change. The baseline advances on the first scan of a later ISO week.</p>` : ''}
${prevComplete ? '' : `<p class="note"><strong>Added and removed are not comparable this week.</strong> The previous baseline covered only ${prevCoverage} endpoints, from a crawler that stopped after 300 pages. The ${feed.summary.addedUncomparable} endpoints absent from it are endpoints it never reached, not new registrations, so they are not listed. A complete baseline is stored from this run on; added and removed become exact next week.</p>`}
<p>Every Monday the whole official registry is re-scanned read only and this page diffs the two weeks. A server appearing here as added was not in the registry the week before. Status changed means its anonymous handshake outcome moved, for example from PASS to AUTH_GATED, which is usually an authentication change rather than an outage. The machine-readable feed with the full arrays is at <a href="${SITE.replace('https://', 'https://')}../trust-data/registry-changes.json"><code>trust-data/registry-changes.json</code></a> in the repository.</p>
${prev ? '' : '<p class="muted">First run: this week establishes the baseline. The first real diff appears next Monday.</p>'}
<h2>Added (${feed.summary.added})${feed.refreshOnly ? ' <span class="muted">— snapshot diff inside the baseline week, not a weekly change</span>' : ''}</h2>
${empty(feed.summary.added)}${feed.summary.added ? `<table><tr><th>server</th><th>status</th></tr>${addedRows}</table>` : ''}
<h2>Removed (${feed.summary.removed})${feed.refreshOnly ? ' <span class="muted">— snapshot diff inside the baseline week, not a weekly change</span>' : ''}</h2>
${empty(feed.summary.removed)}${feed.summary.removed ? `<table><tr><th>server</th><th>last status</th></tr>${removedRows}</table>` : ''}
<h2>Status changed (${feed.summary.statusChanged})${feed.refreshOnly ? ' <span class="muted">— snapshot diff inside the baseline week, not a weekly change</span>' : ''}</h2>
${empty(feed.summary.statusChanged)}${feed.summary.statusChanged ? `<table><tr><th>server</th><th>from</th><th>to</th></tr>${changedRows}</table>` : ''}
<p class="muted">Method: read-only initialize and tools/list, no tool calls, no credentials, no payments. Auth-gated endpoints are classified, not counted as failures. Tables show up to 200 rows; the JSON feed has everything.</p>
<p class="muted">Baseline rule: a diff only advances the stored baseline when the two scan dates fall in different ISO weeks (comparisonKind <code>cross-week</code>). Manual dispatches and retries inside the same week refresh the status snapshot and leave the baseline untouched, so a same-day rerun can never be published as a weekly change.</p>
<p class="cite">Cite this as: mcpreflight, MCP Registry Changes, week of ${scanDate}, ${SITE}/registry-changes.html . Figures should be attributed to mcpreflight rather than to an anonymous audit.</p>
</body>
</html>
`;
fs.writeFileSync(pagePath, html);

console.log(`registry changes ${scanDate}: +${feed.summary.added} -${feed.summary.removed} ~${feed.summary.statusChanged} of ${feed.summary.serversThisWeek} (kind=${kind}, baselineAdvanced=${baselineAdvanced}, comparedAgainst=${prevScanDate ?? 'none'})`);

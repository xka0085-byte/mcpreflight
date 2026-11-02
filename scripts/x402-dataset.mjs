// Render the public x402 census dataset from the existing read-only sweep.
// Sources of truth (no new probing, no new network calls):
//   - trust-data/scan.json            per-endpoint status of the current sweep
//   - trust-data/x402-history.json    weekly cohort series (written by x402-cohort.mjs)
//   - trust-data/x402-drift-history.json  payment-challenge drift series (written by x402-drift.mjs)
// Outputs:
//   - docs/data/x402-cohort-latest.csv    one row per x402 endpoint
//   - docs/data/x402-history.csv          weekly series
//   - docs/data/x402-summary.json         definitions + counts + distributions + citation
//   - docs/x402-mcp-payments-data.html    markers between <!-- x402-data:start/end -->
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));

const scan = read('trust-data/scan.json');
const history = read('trust-data/x402-history.json');
const drift = fs.existsSync(path.join(root, 'trust-data/x402-drift-history.json'))
  ? read('trust-data/x402-drift-history.json')
  : [];

const X402 = /x402|http[- ]402/i;
const text = (entry) => `${entry.title || ''} ${entry.description || ''} ${entry.url || ''}`;
const status = (entry) => (entry.finalStatus || 'UNKNOWN').toUpperCase();
const pct = (part, whole) => (whole ? Number(((100 * part) / whole).toFixed(1)) : 0);

const cohort = scan.results.filter((entry) => X402.test(text(entry)));
const total = scan.results.length;
const checkedAt = cohort.map((entry) => entry.checkedAt || '').sort().pop() || new Date().toISOString();
const sweepDate = checkedAt.slice(0, 10);

const tally = (entries) => {
  const out = { PASS: 0, AUTH_GATED: 0, UNKNOWN: 0, FAIL: 0 };
  for (const entry of entries) out[status(entry)] = (out[status(entry)] || 0) + 1;
  return out;
};
const cohortStatus = tally(cohort);
const registryStatus = tally(scan.results);

const counts = (entries) => {
  const out = new Map();
  for (const entry of entries) for (const finding of entry.findings || []) out.set(finding.code, (out.get(finding.code) || 0) + 1);
  return [...out.entries()].sort((a, b) => b[1] - a[1]);
};
const cohortCodes = counts(cohort);
const toolCount = cohort.reduce((sum, entry) => sum + (Number.isInteger(entry.toolCount) ? entry.toolCount : 0), 0);
const toolsKnown = cohort.filter((entry) => Number.isInteger(entry.toolCount)).length;

const headline = {
  cohort: cohort.length,
  registryEndpoints: total,
  cohortSharePct: pct(cohort.length, total),
  passRatePct: pct(cohortStatus.PASS, cohort.length),
  registryPassRatePct: pct(registryStatus.PASS, total),
  authGatedPct: pct(cohortStatus.AUTH_GATED, cohort.length),
  registryAuthGatedPct: pct(registryStatus.AUTH_GATED, total),
  toolsPublished: toolCount,
  endpointsPublishingTools: toolsKnown,
  sweepDate,
  checkedAt,
};

// ---- CSV: per-endpoint cohort ----
const csvCell = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const cohortRows = [...cohort]
  .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  .map((entry) => [
    entry.name,
    entry.url,
    status(entry),
    entry.protocolVersion || '',
    Number.isInteger(entry.toolCount) ? entry.toolCount : '',
    (entry.findings || []).map((finding) => finding.code).join(';'),
    (entry.checkedAt || '').slice(0, 10),
  ]);
const cohortCsv = [
  'name,url,status,protocol_version,tool_count,finding_codes,checked_at',
  ...cohortRows.map((row) => row.map(csvCell).join(',')),
].join('\n');

const historyCsv = [
  'date,cohort,pass,pass_rate_pct,auth_gated,unknown,fail',
  ...history.map((row) => [row.date, row.cohort, row.pass, row.passRate, row.authGated, row.unknown, row.fail].join(',')),
].join('\n');

// ---- summaries ----
const summary = {
  dataset: 'mcpreflight x402 census',
  version: 1,
  page: 'https://xka0085-byte.github.io/mcpreflight/x402-mcp-payments-data.html',
  generatedAt: new Date().toISOString(),
  sweepDate,
  definition: {
    cohortRule: 'registry entry whose title, description or URL matches /x402|http-402/i (case-insensitive); rule fixed 2026-10-15',
    method: 'read-only anonymous initialize + tools/list, plus inspection of the HTTP 402 payment document shape',
    never: ['signs', 'pays', 'settles', 'retries payment', 'uses a private key'],
    statusMeaning: {
      PASS: 'clean anonymous handshake',
      AUTH_GATED: 'confirmed intentional authentication gate (401 + WWW-Authenticate, or live RFC 9728 metadata)',
      UNKNOWN: 'no anonymous response',
      FAIL: 'response received but handshake broke',
    },
  },
  headline,
  statusDistribution: {
    cohort: cohortStatus,
    registry: registryStatus,
  },
  findingCodes: Object.fromEntries(cohortCodes),
  weeklySeries: history,
  driftSeries: drift,
  comparability: {
    cohortBreak: history.find((row) => row.cohort !== history[0].cohort)?.date || null,
    note: 'Rows with different cohort sizes are not strictly comparable: the cohort was 293 endpoints until 2026-10-30 and 1,583 from 2026-11-01 (full-registry filter).',
    otherCounts: 'External x402 ecosystem percentages usually measure listing/discovery success on a different sample; a listing rate and an anonymous-handshake rate are different quantities.',
  },
  files: {
    cohort: 'data/x402-cohort-latest.csv',
    history: 'data/x402-history.csv',
  },
  citation: `mcpreflight, "x402 payments in the MCP Registry: a ${cohort.length.toLocaleString('en-US')}-endpoint census", ${sweepDate}, https://xka0085-byte.github.io/mcpreflight/x402-mcp-payments-data.html`,
  license: 'MIT',
};

// ---- rendered block for the dataset page ----
const n = (value) => value.toLocaleString('en-US');
const table = (head, rows) => `<table><tr>${head.map((cell) => `<th>${cell}</th>`).join('')}</tr>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</table>`;
const gap = (a, b) => Math.abs(a - b).toFixed(1);

const breakDate = summary.comparability.cohortBreak;
const seriesRows = history.map((row) => [
  row.date + (row.date === breakDate ? ' <em>(cohort widened)</em>' : ''),
  n(row.cohort), n(row.pass), `${row.passRate}%`, n(row.authGated), n(row.unknown), n(row.fail),
]);
const driftRows = drift.map((row) => [row.date, n(row.cohort), n(row.discoverable), n(row.resources), n(row.real402), n(row.drifted)]);

const block = `<!-- x402-data:start -->
<h2>Key numbers, ${sweepDate} sweep</h2>
${table(['measure', 'x402 cohort', 'whole registry (same sweep)'], [
  ['endpoints', n(headline.cohort), n(headline.registryEndpoints)],
  ['share of registry', `${headline.cohortSharePct}%`, '100%'],
  ['clean anonymous handshake (PASS)', `${headline.passRatePct.toFixed(1)}%`, `${headline.registryPassRatePct.toFixed(1)}%`],
  ['behind an auth gate (AUTH_GATED)', `${headline.authGatedPct.toFixed(1)}%`, `${headline.registryAuthGatedPct.toFixed(1)}%`],
])}
<p>Endpoints that advertise payments complete an anonymous handshake <strong>${gap(headline.passRatePct, headline.registryPassRatePct)} pp</strong> more often than the registry as a whole, and sit behind an auth gate <strong>${gap(headline.authGatedPct, headline.registryAuthGatedPct)} pp</strong> less often. Both follow from the same mechanical reason: an endpoint that wants an agent to pay it has to stay callable by an agent that has not been given a key yet.</p>
<p>${n(headline.endpointsPublishingTools)} of ${n(headline.cohort)} endpoints answer with a tool list, publishing ${n(headline.toolsPublished)} tools in total.</p>
<p>The other side of that gap is visibility, not quality: <strong>${pct(cohortStatus.UNKNOWN, cohort.length).toFixed(1)}%</strong> of the cohort gave no anonymous response at all, against <strong>${pct(registryStatus.UNKNOWN, total).toFixed(1)}%</strong> registry-wide. Addresses that were published recently, or that answer only on a paid path, have not been smoke-tested by anyone yet — which is exactly the population a preflight run is for.</p>

<h2>Weekly series</h2>
${table(['date', 'cohort', 'pass', 'pass rate', 'auth-gated', 'unknown', 'fail'], seriesRows)}
<p><strong>Cohort break:</strong> rows above the ${breakDate || 'widening'} line were a 293-endpoint subset, rows below are the full-registry filter at 1,583. Compare like with like.</p>

<h2>Status distribution</h2>
${table(['status', 'x402 cohort', 'share', 'whole registry', 'share'], [
  ['PASS', n(cohortStatus.PASS), `${pct(cohortStatus.PASS, cohort.length).toFixed(1)}%`, n(registryStatus.PASS), `${pct(registryStatus.PASS, total).toFixed(1)}%`],
  ['AUTH_GATED', n(cohortStatus.AUTH_GATED), `${pct(cohortStatus.AUTH_GATED, cohort.length).toFixed(1)}%`, n(registryStatus.AUTH_GATED), `${pct(registryStatus.AUTH_GATED, total).toFixed(1)}%`],
  ['UNKNOWN', n(cohortStatus.UNKNOWN), `${pct(cohortStatus.UNKNOWN, cohort.length).toFixed(1)}%`, n(registryStatus.UNKNOWN), `${pct(registryStatus.UNKNOWN, total).toFixed(1)}%`],
  ['FAIL', n(cohortStatus.FAIL), `${pct(cohortStatus.FAIL, cohort.length).toFixed(1)}%`, n(registryStatus.FAIL), `${pct(registryStatus.FAIL, total).toFixed(1)}%`],
])}

<h2>Failure and finding codes in the cohort</h2>
${table(['code', 'occurrences'], cohortCodes.slice(0, 12).map(([code, count]) => [`<code>${code}</code>`, n(count)]))}
<p>Counts are finding occurrences, not endpoints: a schema code such as <code>PROPERTY_DESCRIPTION_MISSING</code> fires once per undocumented tool property, so its total legitimately exceeds the cohort size, while <code>NO_RESPONSE</code> matches the UNKNOWN endpoint count one for one. Codes are the raw findings from the same read-only probe, uncollapsed, so a reader can re-derive them from <a href="data/x402-summary.json">x402-summary.json</a> (<code>findingCodes</code>) instead of trusting this table; the per-endpoint code list is in the cohort CSV.</p>

<h2>Payment-challenge drift</h2>
<p>Paid resources are re-probed weekly and the 402 challenge shape is fingerprinted per resource. Discovery is partial by design: <code>/.well-known/x402</code> is not universal, so <strong>discoverable</strong> counts only endpoints that publish their paid resources.</p>
${table(['date', 'cohort', 'discoverable', 'paid resources', 'real 402', 'drifted'], driftRows)}

<hr>
<p><small>Generated ${summary.generatedAt} from the read-only sweep of ${sweepDate}. Fields, definitions and raw counts: <a href="data/x402-summary.json">x402-summary.json</a>.</small></p>
<!-- x402-data:end -->`;

// ---- write ----
fs.mkdirSync(path.join(root, 'docs', 'data'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs', 'data', 'x402-cohort-latest.csv'), `${cohortCsv}\n`);
fs.writeFileSync(path.join(root, 'docs', 'data', 'x402-history.csv'), `${historyCsv}\n`);
fs.writeFileSync(path.join(root, 'docs', 'data', 'x402-summary.json'), `${JSON.stringify(summary, null, 1)}\n`);

const pagePath = path.join(root, 'docs', 'x402-mcp-payments-data.html');
const page = fs.readFileSync(pagePath, 'utf8');
const S = page.indexOf('<!-- x402-data:start -->');
const E = page.indexOf('<!-- x402-data:end -->');
if (S < 0 || E < S) throw new Error('x402-data markers missing from docs/x402-mcp-payments-data.html');
fs.writeFileSync(pagePath, page.slice(0, S) + block + page.slice(E + '<!-- x402-data:end -->'.length));

console.log(`x402 dataset ${sweepDate}: cohort ${cohort.length}/${total} (${headline.cohortSharePct}%), pass ${headline.passRatePct}% vs registry ${headline.registryPassRatePct}%, auth-gated ${headline.authGatedPct}% vs ${headline.registryAuthGatedPct}%, tools ${toolCount}`);

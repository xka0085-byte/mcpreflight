// Publish the whole-registry census as a machine-readable dataset.
// Source of truth: trust-data/scan.json (the same sweep the pages quote). No new probing.
// Outputs:
//   - docs/data/mcp-state-summary.json   definitions + counts + distributions + citation
//   - docs/data/mcp-state-codes.csv      one row per finding code (endpoints *and* occurrences)
// Runs in the weekly rescan workflow right after scan-stats.mjs.
//
// Why both counters: the x402 dataset publishes finding occurrences only, and a code such as
// PROPERTY_DESCRIPTION_MISSING fires once per undocumented property, so its total (219,101)
// reads as if it were an endpoint count. Publishing endpoints and occurrences side by side
// removes that misreading without changing the underlying data.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const scan = JSON.parse(fs.readFileSync(path.join(root, 'trust-data', 'scan.json'), 'utf8'));

const results = scan.results;
const total = results.length;
const status = (entry) => String(entry.finalStatus || 'UNKNOWN').toUpperCase();
const pct = (part, whole) => (whole ? Number(((100 * part) / whole).toFixed(1)) : 0);
const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(1));
};
const quantile = (values, q) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
};

const counts = { PASS: 0, AUTH_GATED: 0, UNKNOWN: 0, FAIL: 0 };
for (const entry of results) {
  const key = status(entry);
  counts[key] = (counts[key] || 0) + 1;
}

// Modal checkedAt day, matching scan-stats.mjs so both artefacts carry the same sweep date.
function modalCheckedAtDay(rows) {
  const byDay = new Map();
  for (const row of rows) {
    const day = String(row.checkedAt || '').slice(0, 10);
    if (day) byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  let day = null;
  let hits = 0;
  for (const [d, c] of byDay) if (c > hits || (c === hits && d > day)) { day = d; hits = c; }
  return day;
}
const sweepDate = String(scan.scannedAt || '').slice(0, 10) || modalCheckedAtDay(results);

// ---- status x protocol x tools ----
const protocol = new Map();
const toolCounts = [];
let toolsPublished = 0;
for (const entry of results) {
  const version = entry.protocolVersion || null;
  const key = version || 'no handshake';
  const row = protocol.get(key) || { version, endpoints: 0, pass: 0, authGated: 0, unknown: 0, fail: 0 };
  row.endpoints += 1;
  const s = status(entry);
  if (s === 'PASS') row.pass += 1;
  else if (s === 'AUTH_GATED') row.authGated += 1;
  else if (s === 'FAIL') row.fail += 1;
  else row.unknown += 1;
  protocol.set(key, row);

  if (Number.isInteger(entry.toolCount)) {
    toolCounts.push(entry.toolCount);
    toolsPublished += entry.toolCount;
  }
}

const negotiated = [...protocol.values()].filter((row) => row.version);
const negotiatedTotal = negotiated.reduce((sum, row) => sum + row.endpoints, 0);
const protocolDistribution = [...protocol.values()]
  .sort((a, b) => b.endpoints - a.endpoints)
  .map((row) => ({
    version: row.version,
    endpoints: row.endpoints,
    shareOfAllEndpointsPct: pct(row.endpoints, total),
    shareOfNegotiatedPct: row.version ? pct(row.endpoints, negotiatedTotal) : null,
    pass: row.pass,
    passRatePct: pct(row.pass, row.endpoints),
    authGated: row.authGated,
    unknown: row.unknown,
    fail: row.fail,
  }));

const bucketOf = (n) => (n === 0 ? '0' : n <= 10 ? '1-10' : n <= 50 ? '11-50' : n <= 100 ? '51-100' : n <= 500 ? '101-500' : '500+');
const toolBuckets = { 0: 0, '1-10': 0, '11-50': 0, '51-100': 0, '101-500': 0, '500+': 0 };
for (const n of toolCounts) toolBuckets[bucketOf(n)] += 1;

// ---- findings: endpoints and occurrences ----
const codeStats = new Map();
let endpointsWithWarn = 0;
let endpointsWithPropertyDescriptionMissing = 0;
let endpointsWithSchemaFail = 0;
for (const entry of results) {
  const findings = entry.findings || [];
  const codes = new Set();
  let hasWarn = false;
  let hasSchemaFail = false;
  for (const finding of findings) {
    const code = finding.code || 'UNKNOWN_CODE';
    const row = codeStats.get(code) || { endpoints: 0, occurrences: 0, severities: new Set() };
    row.occurrences += 1;
    row.severities.add(String(finding.severity || 'UNKNOWN').toUpperCase());
    codeStats.set(code, row);
    codes.add(code);
    if (String(finding.severity || '').toUpperCase() === 'WARN') hasWarn = true;
    if (String(finding.severity || '').toUpperCase() === 'FAIL') hasSchemaFail = true;
  }
  for (const code of codes) codeStats.get(code).endpoints += 1;
  if (hasWarn) endpointsWithWarn += 1;
  if (hasSchemaFail) endpointsWithSchemaFail += 1;
  if (codes.has('PROPERTY_DESCRIPTION_MISSING')) endpointsWithPropertyDescriptionMissing += 1;
}

const ordered = [...codeStats.entries()].sort((a, b) => b[1].occurrences - a[1].occurrences);
const findingCodes = Object.fromEntries(
  ordered.map(([code, row]) => [code, { endpoints: row.endpoints, occurrences: row.occurrences, severity: [...row.severities].sort().join(',') }]),
);
const propertyDescription = codeStats.get('PROPERTY_DESCRIPTION_MISSING') || { endpoints: 0, occurrences: 0 };

const summary = {
  dataset: 'mcpreflight MCP registry census',
  version: 1,
  page: 'https://xka0085-byte.github.io/mcpreflight/state-of-mcp-2026-10.html',
  generatedAt: new Date().toISOString(),
  sweepDate,
  scannedAt: scan.scannedAt || null,
  registry: {
    source: 'official MCP Registry',
    cohortRule: 'server listed in the official MCP Registry with a remote HTTP transport that still accepts requests at scan time',
    endpoints: total,
  },
  definition: {
    method: 'read-only anonymous JSON-RPC probe: initialize, then tools/list',
    requests: ['initialize', 'tools/list'],
    never: ['authenticates', 'calls a tool', 'pays', 'signs', 'reads data'],
    statusMeaning: {
      PASS: 'clean anonymous handshake and a tools/list that passes static schema checks',
      AUTH_GATED: 'intentional authentication gate confirmed (401 with WWW-Authenticate, or live RFC 9728 resource metadata)',
      UNKNOWN: 'no anonymous response within the timeout',
      FAIL: 'a response arrived but the handshake or the tool schema is invalid',
    },
    passIsNot: 'a security audit, a quality ranking, or a claim that a PASS endpoint is safe to connect an agent to',
  },
  headline: {
    endpointsInSweep: total,
    pass: counts.PASS,
    passPct: pct(counts.PASS, total),
    authGated: counts.AUTH_GATED,
    authGatedPct: pct(counts.AUTH_GATED, total),
    unknown: counts.UNKNOWN,
    unknownPct: pct(counts.UNKNOWN, total),
    fail: counts.FAIL,
    failPct: pct(counts.FAIL, total),
    noCleanAnonymousHandshake: counts.AUTH_GATED + counts.UNKNOWN + counts.FAIL,
    noCleanAnonymousHandshakePct: pct(counts.AUTH_GATED + counts.UNKNOWN + counts.FAIL, total),
    toolsPublished,
    endpointsPublishingTools: toolCounts.length,
    medianToolsPerEndpoint: median(toolCounts),
    p90ToolsPerEndpoint: quantile(toolCounts, 0.9),
    endpointsWithOver100Tools: toolCounts.filter((n) => n > 100).length,
    maxToolsOnOneEndpoint: toolCounts.length ? Math.max(...toolCounts) : null,
  },
  statusDistribution: counts,
  protocolDistribution,
  toolCountDistribution: toolBuckets,
  schemaHygiene: {
    endpointsWithAnyWarn: endpointsWithWarn,
    endpointsWithAnyWarnPct: pct(endpointsWithWarn, total),
    endpointsWithSchemaFail: endpointsWithSchemaFail,
    endpointsMissingPropertyDescriptions: endpointsWithPropertyDescriptionMissing,
    endpointsMissingPropertyDescriptionsPct: pct(endpointsWithPropertyDescriptionMissing, total),
    propertyDescriptionFindings: propertyDescription.occurrences,
  },
  findingCodes,
  comparability: {
    occurrencesVsEndpoints:
      'findingCodes publishes both counters. Use endpoints for "how many servers are affected", occurrences for "how many individual defects". PROPERTY_DESCRIPTION_MISSING is property-level, so its occurrences exceed the number of endpoints by two orders of magnitude.',
    authGateSplit:
      'Until 0.3.0 an authentication gate was recorded as UNKNOWN, so the combined "no anonymous handshake" share (40.4% on 2026-11-01) is not comparable per-status with sweeps from 2026-11-02 on, where AUTH_GATED is counted separately. The combined share is the stable series.',
    otherCounts:
      'Third-party counts of "remote MCP servers" range from about 10,700 to 44,464 because each uses a different cohort rule. Compare shares within one dataset, never across datasets.',
  },
  files: { codes: 'data/mcp-state-codes.csv' },
  citation: `mcpreflight, "State of MCP Servers: a ${total.toLocaleString('en-US')}-endpoint read-only census of the MCP Registry", ${sweepDate}, https://xka0085-byte.github.io/mcpreflight/state-of-mcp-2026-10.html`,
  license: 'MIT',
};

// ---- CSV: one row per finding code ----
const csvCell = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const codesCsv = [
  'code,severity,endpoints,occurrences,endpoint_share_pct',
  ...ordered.map(([code, row]) => [code, [...row.severities].sort().join(';'), row.endpoints, row.occurrences, pct(row.endpoints, total)].map(csvCell).join(',')),
].join('\n');

fs.mkdirSync(path.join(root, 'docs', 'data'), { recursive: true });

// Read the previous sweep date before overwriting, so the pages can be re-dated without
// hardcoding last week's literal (which would make a future run non-idempotent).
const prevSweepDate = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'docs', 'data', 'mcp-state-summary.json'), 'utf8')).sweepDate ?? null; }
  catch { return null; }
})();

fs.writeFileSync(path.join(root, 'docs', 'data', 'mcp-state-summary.json'), `${JSON.stringify(summary, null, 1)}\n`);
fs.writeFileSync(path.join(root, 'docs', 'data', 'mcp-state-codes.csv'), `${codesCsv}\n`);

// ---- sub-cohorts quoted on the page ----
const X402 = /x402|http[- ]402/i;
const entryText = (entry) => `${entry.title || ''} ${entry.description || ''} ${entry.url || ''}`;
const subTally = (rows) => {
  const out = { PASS: 0, AUTH_GATED: 0, UNKNOWN: 0, FAIL: 0 };
  for (const row of rows) out[status(row)] += 1;
  return out;
};
const x402Rows = results.filter((entry) => X402.test(entryText(entry)));
const x402Status = subTally(x402Rows);
const smitheryRows = results.filter((entry) => (entry.url || '').includes('server.smithery.ai'));
const smitheryStatus = subTally(smitheryRows);
const restStatus = subTally(results.filter((entry) => !(entry.url || '').includes('server.smithery.ai')));

// Community-list cross-check numbers are written by scripts/awesome-crosscheck.mjs; when that
// has not run, the card falls back to wording without a figure instead of a stale literal.
const awesomeNumbers = (() => {
  try {
    const report = fs.readFileSync(path.join(root, 'trust-data', 'awesome-report.md'), 'utf8');
    const matched = report.match(/Cross-checked ([\d,]+) of the ([\d,]+)/);
    const broken = report.match(/([\d,]+) matched servers currently do not complete/);
    if (!matched || !broken) return null;
    return { matched: Number(matched[1].replace(/,/g, '')), links: Number(matched[2].replace(/,/g, '')), broken: Number(broken[1].replace(/,/g, '')) };
  } catch { return null; }
})();

// ---- rendered Findings block for the census page ----
const n = (value) => Number(value).toLocaleString('en-US');
const negotiatedRow = (version) => protocolDistribution.find((row) => row.version === version);
const bar = (share, colour) => `<div class="bar"><i style="width:${Math.max(1, Math.round(share))}%;background:${colour}"></i></div>`;
const protocolRowsHtml = protocolDistribution
  .map((row) => `<tr><td>${row.version || 'no handshake'}</td><td>${n(row.endpoints)}</td><td>${row.shareOfNegotiatedPct === null ? '' : `${bar(row.shareOfNegotiatedPct, row.passRatePct > 95 ? '#0969da' : '#9a6700')}`}</td></tr>`)
  .join('\n');

const coverage = summary.headline.noCleanAnonymousHandshakePct;
const authGatedVerified = findingCodes.AUTH_GATE_VERIFIED?.endpoints ?? 0;
const authGatedDetected = findingCodes.AUTH_GATE_DETECTED?.endpoints ?? 0;
const latest = negotiatedRow('2026-07-28');
const oldest = negotiatedRow('2024-11-05');
const dominant = negotiatedRow('2025-06-18');

const findingsBlock = `<!-- findings:start -->
<div class="card">
<b>1. Four in ten endpoints our sweep returned cannot be used anonymously — and after 0.3.0 we can say why.</b> ${n(summary.headline.noCleanAnonymousHandshake)} of ${n(total)} remote endpoints (${coverage}%) did not complete a clean <code>initialize</code> + <code>tools/list</code> handshake. The bucket is no longer one blob: ${summary.headline.authGatedPct}% are a <em>confirmed</em> authentication gate (${n(summary.headline.authGated)} endpoints; ${n(authGatedVerified)} verified against live RFC 9728 metadata or a 401 challenge, ${n(authGatedDetected)} detected), ${summary.headline.unknownPct}% gave no anonymous response at all (${n(summary.headline.unknown)}), and only ${summary.headline.failPct}% (${n(summary.headline.fail)}) answered with something that is actually broken. <strong>The registry's real blind spot is not broken servers, it is unlabelled auth walls</strong>: the split is now reproducible from the outside, but the registry itself still publishes no field that an agent could read instead of probing.
</div>

<div class="card">
<b>2. Protocol adoption is fragmented — and running an older revision does not make a server sicker.</b> Of the ${n(negotiatedTotal)} servers that negotiated a protocol version, ${dominant ? dominant.shareOfNegotiatedPct : 0}% run <code>2025-06-18</code> and ${negotiatedRow('2025-03-26') ? negotiatedRow('2025-03-26').shareOfNegotiatedPct : 0}% are still on <code>2025-03-26</code>. Only ${latest ? n(latest.endpoints) : 0} (${latest ? latest.shareOfNegotiatedPct : 0}%) speak the newest revision (<code>2026-07-28</code>). But the pass rate barely moves with age: <code>2025-06-18</code> passes at ${dominant ? dominant.passRatePct : 0}%, <code>2024-11-05</code> — a year behind — still passes at ${oldest ? oldest.passRatePct : 0}% across ${oldest ? n(oldest.endpoints) : 0} endpoints. Version lag is a feature-adoption question, not a health question, and counting "outdated servers" as a quality metric would be wrong.
<table><tr><th>Protocol revision</th><th>Servers</th><th></th></tr>
${protocolRowsHtml}
</table>
</div>

<div class="card">
<b>3. Schema hygiene is the quiet tax — and the defects are far more concentrated than the totals suggest.</b> The dominant schema finding is a missing <code>description</code> on an input property: ${n(summary.schemaHygiene.propertyDescriptionFindings)} property-level findings across ${n(summary.schemaHygiene.endpointsMissingPropertyDescriptions)} servers (${summary.schemaHygiene.endpointsMissingPropertyDescriptionsPct}% of the registry). Tool descriptions are what an LLM reads to decide when and how to call a tool. The outright breakage is tiny and clustered: ${n(findingCodes.TOOLS_LIST_INVALID?.endpoints ?? 0)} servers return a <code>tools/list</code> that is not a tool list at all, ${n(findingCodes.INITIALIZE_RESPONSE_INVALID?.endpoints ?? 0)} return an invalid <code>initialize</code>, and ${n(findingCodes.INPUT_SCHEMA_NOT_OBJECT?.occurrences ?? 0)} malformed <code>inputSchema</code> objects come from just ${n(findingCodes.INPUT_SCHEMA_NOT_OBJECT?.endpoints ?? 0)} servers. Fixing the ecosystem's worst schemas is a few dozen pull requests, not a campaign.
</div>

<div class="card">
<b>4. The community index and the official registry disagree.</b> ${awesomeNumbers
  ? `We cross-checked the largest community awesome-list (${n(awesomeNumbers.links)} GitHub repo links) against registry data: only ${n(awesomeNumbers.matched)} of its links correspond to servers we have registry scan coverage for, and ${n(awesomeNumbers.broken)} of those do not pass a clean anonymous handshake.`
  : 'We cross-checked the largest community awesome-list against registry data: only a small minority of its links correspond to servers we have registry scan coverage for, and some of those do not pass a clean anonymous handshake.'} Discovery is fragmented across at least two inconsistent indexes, and a listing on the popular list carries no information about whether an endpoint works.
</div>

<div class="card">
<b>5. A third-party proxy sits inside the official registry.</b> ${n(smitheryRows.length)} registry entries (${pct(smitheryRows.length, total)}%) do not point at a maintainer's own server but at <code>server.smithery.ai</code> proxy URLs. All ${n(smitheryRows.length)} refused a clean anonymous handshake — 0% completed <code>initialize</code> + <code>tools/list</code> (${n(smitheryStatus.AUTH_GATED)} AUTH_GATED, ${n(smitheryStatus.UNKNOWN)} UNKNOWN), against ${pct(restStatus.PASS, results.length - smitheryRows.length)}% that pass across the other ${n(results.length - smitheryRows.length)} endpoints. Most of that gap is by design: the proxy expects a per-server config and key. The consequence is the same either way: <strong>an agent, or any independent auditor, following the official registry cannot verify these ${n(smitheryRows.length)} servers at all without first signing up with a third party</strong> — and cannot tell auth-by-design from dead-on-arrival. We started this comparison after a maintainer flagged auto-registered placeholder entries (<a href="https://github.com/kirbah/mcp-youtube/issues/290">kirbah/mcp-youtube#290</a>); our data cannot confirm or refute what sits behind the proxy, only that it is unverifiable from the outside.
</div>

<div class="card">
<b>6. The x402 economy is already inside the registry — and healthier than average.</b> ${n(x402Rows.length)} endpoints reference x402 / HTTP-402 payments in their registry metadata. They pass a clean anonymous handshake at <strong>${pct(x402Status.PASS, x402Rows.length)}% (${n(x402Status.PASS)} of ${n(x402Rows.length)})</strong>, against the ${summary.headline.passPct}% baseline of the same sweep; ${n(x402Status.AUTH_GATED + x402Status.UNKNOWN)} remain unverifiable anonymously (${n(x402Status.AUTH_GATED)} AUTH_GATED, ${n(x402Status.UNKNOWN)} UNKNOWN) and ${n(x402Status.FAIL)} fail outright. The gap has a mechanical explanation: a payment server whose challenge flow is malformed fails its first agent transaction, so this cohort ships cleaner handshakes. As agent-payment volume grows (Coinbase has reported x402 transaction counts in the hundreds of millions), this is the cohort where challenge-shape drift and misconfiguration will concentrate — ${pct(x402Status.PASS, x402Rows.length)}% is today's baseline, and we now track challenge-shape drift on these endpoints as a dedicated check.
</div>
<!-- findings:end -->`;

// ---- inject the Findings block ----
const pagePath = path.join(root, 'docs', 'state-of-mcp-2026-10.html');
const page = fs.readFileSync(pagePath, 'utf8');
const S = page.indexOf('<!-- findings:start -->');
const E = page.indexOf('<!-- findings:end -->');
if (S < 0 || E < S) {
  console.log('SKIP findings block (markers missing from docs/state-of-mcp-2026-10.html)');
} else {
  fs.writeFileSync(pagePath, page.slice(0, S) + findingsBlock + page.slice(E + '<!-- findings:end -->'.length));
  console.log('OK findings block');
}

// ---- re-date the pages that print the sweep date in prose ----
// Runs before every other page rule so those rules can assume the date is already current.
function syncSweepDates() {
  const from = prevSweepDate && prevSweepDate !== sweepDate ? prevSweepDate : '2026-11-01';
  if (from === sweepDate) return;
  const touched = [];
  for (const file of ['state-of-mcp-2026-10.html', 'index.html', 'how-many-mcp-servers-are-dead.html']) {
    const p = path.join(root, 'docs', file);
    if (!fs.existsSync(p)) continue;
    const html = fs.readFileSync(p, 'utf8');
    const next = html.split(from).join(sweepDate);
    if (next !== html) { fs.writeFileSync(p, next); touched.push(`${file}:${html.split(from).length - 1}`); }
  }
  console.log(`sweep dates: ${from} -> ${sweepDate} (${touched.join(', ') || 'nothing to change'})`);
}
syncSweepDates();

// ---- keep every quotable figure on the page in sync with this sweep ----
// The Findings cards are generated wholesale above. The remaining numbers sit in hand-written
// sentences (meta description, JSON-LD, summary paragraph, KPI tiles, limitations, canonical
// block); they used to be edited by hand and drifted between sweeps. Each rule below states the
// anchor it expects, and reports the anchor as missing instead of silently skipping it.
function syncStatePage() {
  const p = path.join(root, 'docs', 'state-of-mcp-2026-10.html');
  let html = fs.readFileSync(p, 'utf8');
  const applied = [];
  const warn = [];

  const replace = (label, pattern, replacement) => {
    if (!pattern.test(html)) { warn.push(label); return; }
    const before = html;
    html = html.replace(pattern, replacement);
    if (html !== before) applied.push(label);
  };

  const pass = summary.headline.passPct;
  const gated = summary.headline.authGatedPct;
  const unk = summary.headline.unknownPct;
  const failPct = summary.headline.failPct;
  const none = summary.headline.noCleanAnonymousHandshakePct;
  const x402Pct = pct(x402Status.PASS, x402Rows.length);

  replace('meta description', /<meta name="description" content="[^"]*">/,
    `<meta name="description" content="We ran a read-only MCP handshake check against the ${n(total)} remote endpoints our complete ${sweepDate} registry sweep returned: ${pass}% pass, ${none}% do not complete a clean handshake (${gated}% confirmed auth-gated, ${unk}% unobservable, ${failPct}% broken). Full methodology, per-server data files, and reproducible commands.">`);

  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How many MCP servers are alive?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Of ${n(total)} MCP Registry endpoints scanned read-only on ${sweepDate}, ${n(counts.PASS)} (${pass}%) completed a clean anonymous MCP handshake, ${n(counts.FAIL)} failed, and ${n(summary.headline.noCleanAnonymousHandshake)} (${none}%) did not complete a clean handshake — of which ${n(counts.AUTH_GATED)} (${gated}%) were a confirmed authentication gate rather than a broken server. Full data and method are on this page.`,
        },
      },
      {
        '@type': 'Question',
        name: 'What percentage of MCP registry endpoints respond?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `${pass}% of the endpoints our ${sweepDate} scan reached completed initialize plus tools/list anonymously. Smithery-proxied endpoints were the weakest cohort: all ${n(smitheryRows.length)} measured gave no clean anonymous handshake.`,
        },
      },
      {
        '@type': 'Question',
        name: 'How many x402 servers are in the MCP registry?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `${n(x402Rows.length)} registry endpoints reference x402 or HTTP-402 payments in the ${sweepDate} scan. They pass a clean anonymous handshake at ${x402Pct}% (${n(x402Status.PASS)} of ${n(x402Rows.length)}), above the ${pass}% baseline from the same sweep, because payment-server authors must keep the challenge flow spec-clean for the first agent transaction to succeed.`,
        },
      },
    ],
  };
  replace('FAQPage JSON-LD', /<script type="application\/ld\+json">\{"@context":"https:\/\/schema\.org","@type":"FAQPage"[\s\S]*?<\/script>/,
    `<script type="application/ld+json">${JSON.stringify(faq)}</script>`);

  const dataset = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'State of MCP Servers (mcpreflight registry census)',
    alternateName: 'mcpreflight MCP Registry Census',
    description: `Read-only anonymous handshake census of the ${n(total)} remote endpoints our complete ${sweepDate} sweep returned from the official MCP Registry. ${n(counts.PASS)} pass a clean initialize + tools/list handshake (${pass}%), ${n(counts.FAIL)} fail outright, ${n(counts.AUTH_GATED)} are a confirmed authentication gate (${gated}%) and ${n(counts.UNKNOWN)} gave no anonymous response (${unk}%). Includes the x402 payment cohort (${n(x402Rows.length)} endpoints, ${x402Pct}% pass) and the smithery cohort (${n(smitheryRows.length)} endpoints, 0% pass).`,
    url: 'https://xka0085-byte.github.io/mcpreflight/state-of-mcp-2026-10.html',
    sameAs: 'https://github.com/xka0085-byte/mcpreflight',
    creator: { '@type': 'Organization', name: 'mcpreflight', url: 'https://xka0085-byte.github.io/mcpreflight/', sameAs: ['https://github.com/xka0085-byte/mcpreflight', 'https://www.npmjs.com/package/@eidonze/mcpreflight'] },
    publisher: { '@type': 'Organization', name: 'mcpreflight', url: 'https://xka0085-byte.github.io/mcpreflight/' },
    datePublished: '2026-10-11',
    dateModified: sweepDate,
    license: 'https://opensource.org/licenses/MIT',
    isAccessibleForFree: true,
    measurementTechnique: 'Read-only JSON-RPC initialize + tools/list over HTTP with JSON Schema validation. No tool calls, no authentication attempted, no data read beyond the handshake.',
    variableMeasured: [
      { '@type': 'PropertyValue', name: 'remote endpoints scanned', value: total },
      { '@type': 'PropertyValue', name: 'clean handshake pass rate', value: `${pass}%` },
      { '@type': 'PropertyValue', name: 'confirmed auth-gated share', value: `${gated}%` },
      { '@type': 'PropertyValue', name: 'x402 cohort pass rate', value: `${x402Pct}%` },
      { '@type': 'PropertyValue', name: 'smithery proxy cohort pass rate', value: '0%' },
    ],
    citation: `mcpreflight, State of MCP Servers, https://xka0085-byte.github.io/mcpreflight/state-of-mcp-2026-10.html`,
    distribution: [{ '@type': 'DataDownload', contentUrl: 'https://xka0085-byte.github.io/mcpreflight/data/mcp-state-summary.json', encodingFormat: 'application/json' }],
  };
  replace('Dataset JSON-LD', /<script type="application\/ld\+json">\{"@context":"https:\/\/schema\.org","@type":"Dataset"[\s\S]*?<\/script>/,
    `<script type="application/ld+json">${JSON.stringify(dataset)}</script>`);

  replace('summary paragraph', /<p>How healthy was the ecosystem at the [^?]*snapshot\?[\s\S]*?<\/p>/,
    `<p>How healthy was the ecosystem at the ${sweepDate} snapshot? We ran a read-only <code>initialize</code> + <code>tools/list</code> check against the ${n(total)} remote endpoints that sweep returned from the official MCP Registry: ${n(counts.PASS)} (${pass}%) completed a clean handshake, ${n(counts.AUTH_GATED)} (${gated}%) answered with a confirmed authentication gate, ${n(counts.UNKNOWN)} (${unk}%) gave no anonymous response, and ${n(counts.FAIL)} (${failPct}%) failed outright. Among responders we logged ${n(summary.schemaHygiene.propertyDescriptionFindings)} property-level schema findings, and ${negotiatedRow('2025-06-18')?.shareOfNegotiatedPct ?? 0}% negotiate the <code>2025-06-18</code> protocol revision. Every number is reproducible with one open-source command, and the raw counts sit in <a href="data/mcp-state-summary.json">mcp-state-summary.json</a>.</p>`);

  replace('KPI pass', /(<b style="color:#1a7f37">)[\d.]+%(<\/b>pass clean handshake)/, `$1${pass}%$2`);
  replace('KPI no-handshake', /(<b style="color:#9a6700">)[\d.]+%(<\/b>no anonymous handshake)/, `$1${none}%$2`);

  replace('limitations bullet', /<li>Anonymous handshake only\.[\s\S]*?<\/li>/,
    `<li>Anonymous handshake only. Servers behind OAuth are <em>not</em> broken — but the registry does not label them, so the ${none}% figure is an upper bound on breakage, not an exact count. Of that share, ${gated} percentage points are a confirmed auth gate that is working as designed: an anonymous probe cannot use those servers, but they are not broken. The only outright breakage in this sweep is the ${failPct}% that returned an invalid handshake.</li>`);

  replace('canonical block', /<p>Canonical figures, use these exact numbers[\s\S]*?<\/p>/,
    `<p>Canonical figures, use these exact numbers and this exact wording so the industry shares one baseline: <strong>${n(total)} remote endpoints in our complete ${sweepDate} sweep, ${n(counts.PASS)} (${pass}%) pass a clean anonymous handshake</strong>. Sub-figures: ${n(counts.FAIL)} fail outright, ${n(counts.AUTH_GATED)} (${gated}%) sit behind a confirmed authentication gate, ${n(counts.UNKNOWN)} (${unk}%) gave no anonymous response at all, ${n(x402Rows.length)} x402 endpoints pass at ${x402Pct}%, ${n(smitheryRows.length)} smithery-proxied endpoints pass at 0%. Our definition of "remote endpoint" is a server in the official MCP Registry with an HTTP transport that currently accepts requests, which is why our count differs from the 10,700 to 44,464 figures reported elsewhere. Machine-readable counts, definitions and the comparability notes: <a href="data/mcp-state-summary.json">mcp-state-summary.json</a>.</p>`);

  if (html !== fs.readFileSync(p, 'utf8')) fs.writeFileSync(p, html);
  console.log(`page sync: ${applied.length} blocks updated${warn.length ? `, anchors not found: ${warn.join(', ')}` : ''}`);
}
syncStatePage();

// ---- the two other pages that quote headline figures ----
// Same numbers, same wording rules as the census page. Every rule is anchored on markup that
// does not depend on the figure itself, so a re-run is idempotent.
function syncOtherPages() {
  const pass = summary.headline.passPct;
  const gated = summary.headline.authGatedPct;
  const unk = summary.headline.unknownPct;
  const failPct = summary.headline.failPct;
  const none = summary.headline.noCleanAnonymousHandshakePct;
  const verified = findingCodes.AUTH_GATE_VERIFIED?.endpoints ?? 0;
  const applied = [];
  const warn = [];

  const run = (file, rules) => {
    const p = path.join(root, 'docs', file);
    if (!fs.existsSync(p)) { warn.push(`${file} missing`); return; }
    const original = fs.readFileSync(p, 'utf8');
    let html = original;
    for (const [label, pattern, replacement] of rules) {
      if (!pattern.test(html)) { warn.push(`${file}:${label}`); continue; }
      html = html.replace(pattern, replacement);
      applied.push(`${file}:${label}`);
    }
    if (html !== original) fs.writeFileSync(p, html);
  };

  run('index.html', [
    ['bar pass', /(\.bar \.b-pass \{ width: )[\d.]+%/, `$1${pass}%`],
    ['bar unknown', /(\.bar \.b-unk \{ width: )[\d.]+%/, `$1${none}%`],
    ['kpi pass', /(<b class="grad" data-count=")[\d.]+(" data-fmt="pct">)[\d.]+%(<\/b><span>pass a clean anonymous handshake<\/span>)/, `$1${pass}$2${pass}%$3`],
    ['kpi no-handshake', /(<b class="grad" data-count=")\d+(" data-fmt="int">)[\d,]+(<\/b><span>gave no anonymous response<\/span>)/, `$1${summary.headline.noCleanAnonymousHandshake}$2${n(summary.headline.noCleanAnonymousHandshake)}$3`],
    ['schema findings', /([\d,]+)( property-level findings logged across )([\d,]+)( remote endpoints)/, `${n(summary.schemaHygiene.propertyDescriptionFindings)}$2${n(total)}$4`],
    ['legend pass', /(<i style="background:#3fd68f"><\/i><b>)[\d.]+%(<\/b> passed)/, `$1${pass}%$2`],
    ['legend unknown', /(<i style="background:rgba\(148,163,184,\.35\)"><\/i><b>)[\d.]+%(<\/b> no anonymous response)/, `$1${none}%$2`],
    ['stat pass', /(<div class="stat"><b class="s-g">)[\d,]+(<\/b><span>passed a clean handshake<\/span>)/, `$1${n(counts.PASS)}$2`],
    ['stat no-handshake', /(<div class="stat"><b>)[\d,]+(<\/b><span>gave no anonymous response<\/span>)/, `$1${n(summary.headline.noCleanAnonymousHandshake)}$2`],
    ['faq census answer', /"text":"In the [^"]*complete read-only sweep of the official MCP Registry[^"]*"/,
      `"text":"In the ${sweepDate} complete read-only sweep of the official MCP Registry, ${n(total)} remote endpoints were checked: ${n(counts.PASS)} passed a clean anonymous handshake (${pass}%), ${n(counts.AUTH_GATED)} were a confirmed authentication gate (${gated}%), ${n(counts.UNKNOWN)} gave no anonymous response (${unk}%), and ${n(counts.FAIL)} failed outright (${failPct}%). Full data on the State of MCP report page and in mcp-state-summary.json."`],
    ['hero note', /(<p class="note">Of the <b>)[\d,]+(<\/b> remote endpoints our complete )[\d-]+( registry sweep returned\.[\s\S]*?<b>)[\d,]+(<\/b> Smithery-registered entries refused anonymous handshakes\.)/,
      `$1${n(total)}$2${sweepDate}$3${n(smitheryRows.length)}$4`],
  ]);

  run('how-many-mcp-servers-are-dead.html', [
    ['meta description', /<meta name="description" content="[^"]*">/,
      `<meta name="description" content="Direct answer from a read-only scan of ${n(total)} MCP Registry endpoints: ${pass}% complete a clean handshake, ${gated}% sit behind a confirmed auth gate, ${unk}% give no anonymous response, ${failPct}% fail outright. Method, limits and downloadable data.">`],
    ['short answer', /<p><strong>Short answer:[\s\S]*?<\/p>/,
      `<p><strong>Short answer: ${n(counts.FAIL)} endpoints failed outright (${failPct}%), and ${n(summary.headline.noCleanAnonymousHandshake)} (${none}%) did not complete a clean anonymous handshake — but that share is an upper bound on breakage, not a death count.</strong> Of that share, ${n(counts.AUTH_GATED)} (${gated}%) answered with a confirmed authentication gate (${n(verified)} of them verified against live RFC 9728 resource metadata), ${n(counts.UNKNOWN)} (${unk}%) never answered at all, and ${n(counts.FAIL)} answered with a handshake that is actually invalid. ${n(counts.PASS)} (${pass}%) completed a clean anonymous handshake. The remaining gray bucket still mixes dead servers with endpoints whose gate we cannot verify, and the registry publishes no field that labels the difference. An agent consuming the registry today still cannot read "requires OAuth" from the metadata — it has to probe and fail.</p>`],
    ['status table', /<tr><td>PASS<\/td>[\s\S]*<tr><td>FAIL<\/td>[\s\S]*?<\/tr>/,
      `<tr><td>PASS</td><td>${n(counts.PASS)}</td><td>${pass}%</td><td>clean anonymous <code>initialize</code> + <code>tools/list</code></td></tr>
<tr><td>AUTH_GATED</td><td>${n(counts.AUTH_GATED)}</td><td>${gated}%</td><td>401 with <code>WWW-Authenticate</code>, or live RFC 9728 resource metadata (${n(verified)} verified this way)</td></tr>
<tr><td>UNKNOWN</td><td>${n(counts.UNKNOWN)}</td><td>${unk}%</td><td>no anonymous response: dead, offline, or a gate we cannot see past</td></tr>
<tr><td>FAIL</td><td>${n(counts.FAIL)}</td><td>${failPct}%</td><td>responded, but <code>initialize</code> or <code>tools/list</code> is invalid</td></tr>`],
    ['churn paragraph', /<p>A weekly rescan adds the churn dimension[\s\S]*?<\/p>/,
      `<p>A weekly rescan adds the churn dimension, so "dead" is a moving target as well: week-over-week movement between PASS, AUTH_GATED, UNKNOWN and FAIL is published in the <a href="https://xka0085-byte.github.io/mcpreflight/registry-changes.html">registry change log</a> rather than restated here, because a single week's churn figure goes stale the moment it is written. Since 0.3.0 an endpoint that answers 401 with a <code>WWW-Authenticate</code> header and exposes live RFC 9728 resource metadata is classified <strong>AUTH_GATED (verified)</strong> instead of unknown, which shrinks the gray bucket with every scan — ${n(verified)} endpoints are already in that verified class. Among servers that did respond, the dominant quality finding was ${n(summary.schemaHygiene.propertyDescriptionFindings)} missing property descriptions across ${n(summary.schemaHygiene.endpointsMissingPropertyDescriptions)} servers — schema hygiene is a separate tax from uptime, and <a href="data/mcp-state-summary.json">mcp-state-summary.json</a> keeps the two apart.</p>`],
    ['dataset json-ld', /<script type="application\/ld\+json">\{"@context":"https:\/\/schema\.org","@type":"Dataset","name":"How many MCP servers are dead[\s\S]*?<\/script>/,
      `<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Dataset',
        name: 'How many MCP servers are dead (mcpreflight registry census)',
        alternateName: 'mcpreflight dead-server count',
        description: `Of the ${n(total)} remote endpoints returned by our complete ${sweepDate} registry sweep, ${n(counts.FAIL)} fail outright and ${n(summary.headline.noCleanAnonymousHandshake)} (${none}%) do not complete a clean anonymous handshake. That ${none}% is an upper bound on breakage: ${n(counts.AUTH_GATED)} (${gated}%) of it is a confirmed authentication gate and ${n(counts.UNKNOWN)} (${unk}%) gave no response at all.`,
        url: 'https://xka0085-byte.github.io/mcpreflight/how-many-mcp-servers-are-dead.html',
        creator: { '@type': 'Organization', name: 'mcpreflight', url: 'https://xka0085-byte.github.io/mcpreflight/' },
        dateModified: sweepDate,
        isAccessibleForFree: true,
        distribution: [{ '@type': 'DataDownload', contentUrl: 'https://xka0085-byte.github.io/mcpreflight/data/mcp-state-summary.json', encodingFormat: 'application/json' }],
      })}</script>`],
    ['faq json-ld', /<script type="application\/ld\+json">\{"@context":"https:\/\/schema\.org","@type":"FAQPage"[\s\S]*?<\/script>/,
      `<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'How many MCP servers are dead?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `In our ${sweepDate} read-only scan of ${n(total)} remote MCP Registry endpoints, ${n(counts.FAIL)} failed outright (${failPct}%) and ${n(summary.headline.noCleanAnonymousHandshake)} (${none}%) did not complete a clean anonymous handshake. That ${none}% is an upper bound on breakage, not a death count: ${n(counts.AUTH_GATED)} of those (${gated}%) are a confirmed authentication gate and ${n(counts.UNKNOWN)} (${unk}%) gave no response at all. ${n(counts.PASS)} (${pass}%) completed a clean anonymous handshake.`,
            },
          },
          {
            '@type': 'Question',
            name: 'What percentage of MCP servers require authentication?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `${gated}% of the ${n(total)} endpoints in the ${sweepDate} scan answered a read-only probe with a confirmed authentication gate — 401 with WWW-Authenticate, or live RFC 9728 resource metadata (${n(verified)} verified the second way). A further ${unk}% never answered at all, so the registry alone cannot separate auth-by-design from dead. Both counts are published per endpoint in the Trust Directory and in mcp-state-summary.json.`,
            },
          },
        ],
      })}</script>`],
  ]);

  console.log(`other pages: ${applied.length} rules applied${warn.length ? `, anchors not found: ${warn.join(' | ')}` : ''}`);

  // ---- prose pages that quote the census in an answer paragraph ----
  // These are hand-written intros on keyword pages. They quote the same sweep, so they go stale
  // the same way; each rule rewrites the whole sentence so a re-run is a no-op.
  run('mcp-schema-checker.html', [
    ['intro findings', /In our complete [\d-]+ scan of the [\d,]+ remote endpoints the official MCP Registry returned, responding servers produced [\d,]+ property-level schema findings/,
      `In our complete ${sweepDate} scan of the ${n(total)} remote endpoints the official MCP Registry returned, responding servers produced ${n(summary.schemaHygiene.propertyDescriptionFindings)} property-level schema findings`],
  ]);

  run('mcp-oauth-diagnostics.html', [
    ['intro auth split', /In our complete [\d-]+ scan of the official registry, [\d,]+ of [\d,]+ remote endpoints \([\d.]+%\) gave no anonymous handshake\. Of those, [\d,]+ answered 401 on <code>initialize<\/code> and are classified AUTH_GATED; the remaining [\d,]+ never answered at all/,
      `In our complete ${sweepDate} scan of the official registry, ${n(summary.headline.noCleanAnonymousHandshake)} of ${n(total)} remote endpoints (${none}%) gave no anonymous handshake. Of those, ${n(counts.AUTH_GATED)} are classified AUTH_GATED (${n(verified)} verified against live RFC 9728 resource metadata or a 401 challenge, ${n(counts.AUTH_GATED - verified)} detected by header alone); the remaining ${n(counts.UNKNOWN)} never answered at all`],
  ]);

  run('test-remote-mcp-server.html', [
    ['intro pass rate', /In our complete [\d-]+ scan of the official registry, [\d.]+% of the [\d,]+ remote endpoints passed that bar anonymously/,
      `In our complete ${sweepDate} scan of the official registry, ${pass}% of the ${n(total)} remote endpoints passed that bar anonymously`],
  ]);

  run('x402-endpoint-inspector.html', [
    ['intro cohort', /in the complete [\d-]+ sweep\. [\d.]+% \([\d,]+ of [\d,]+\) complete a clean anonymous handshake, against the [\d.]+% baseline from the same sweep/,
      `in the complete ${sweepDate} sweep. ${pct(x402Status.PASS, x402Rows.length)}% (${n(x402Status.PASS)} of ${n(x402Rows.length)}) complete a clean anonymous handshake, against the ${pass}% baseline from the same sweep`],
  ]);

  run('case-longgame.html', [
    ['census sentence', /of the [\d,]+ remote endpoints returned by the complete [\d-]+ registry sweep, [\d,]+ \([\d.]+%\) completed a clean anonymous handshake, [\d,]+ \([\d.]+%\) gave no anonymous response, and [\d,]+ \([\d.]+%\) answered but broke the protocol/,
      `of the ${n(total)} remote endpoints returned by the complete ${sweepDate} registry sweep, ${n(counts.PASS)} (${pass}%) completed a clean anonymous handshake, ${n(summary.headline.noCleanAnonymousHandshake)} (${none}%) gave no anonymous response, and ${n(counts.FAIL)} (${failPct}%) answered but broke the protocol`],
    ['upper-bound caveat', /(that ambiguity is the reason )[\d.]+%( is published as an upper bound)/, `$1${none}%$2`],
  ]);

  // The trust directory omits the same two endpoints the maintainer asked us to drop, so its
  // listed count always trails the census by that fixed delta rather than by a fresh query.
  run('trust/index.html', [
    ['census caption', /so this directory lists [\d,]+ of the [\d,]+ remote endpoints in the [\d-]+ census/,
      `so this directory lists ${n(total - 2)} of the ${n(total)} remote endpoints in the ${sweepDate} census`],
  ]);
}
syncOtherPages();

console.log(
  `mcp state ${sweepDate}: ${total} endpoints, pass ${counts.PASS} (${summary.headline.passPct}%), auth-gated ${counts.AUTH_GATED}, unknown ${counts.UNKNOWN}, fail ${counts.FAIL}; tools ${toolsPublished} on ${toolCounts.length} endpoints; ${ordered.length} finding codes`,
);

// Generate static Trust Directory pages + JSON API + badges from trust-data/scan.json.
// Path-agnostic: run from anywhere (repo root resolved relative to this file).
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'trust-data');
const outDir = path.join(root, 'docs', 'trust');
const scan = JSON.parse(fs.readFileSync(path.join(dataDir, 'scan.json'), 'utf8'));
const results = scan.results;
// honor maintainer opt-outs (trust-data/exclusions.json): excluded from pages/api/badges/tally
const excluded = new Set((JSON.parse(fs.readFileSync(path.join(root, 'trust-data', 'exclusions.json'), 'utf8')).exclusions ?? []).map((x) => x.name));
for (let i = results.length - 1; i >= 0; i--) if (excluded.has(results[i].name)) results.splice(i, 1);

const BASE = '/mcpreflight/trust';
const SITE = 'https://xka0085-byte.github.io';
const PAGE_SIZE = 500;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// A snippet nobody can copy in one gesture is a snippet nobody uses: each block below is the
// exact string that goes into a README, a fetch call, or a shell, not a description of one.
const copyBlock = (label, text) => `<div class="copyrow"><span class="copylabel">${esc(label)}</span><button class="copybtn" type="button" data-copy="${esc(text)}">Copy</button></div>
<pre>${esc(text)}</pre>`;

function slugify(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return base || 'server';
}
// dedupe slugs — reuse slugs persisted in scan.json; compute only if missing
const used = new Map();
for (const r of results) {
  if (r.slug && !used.has(r.slug)) { used.set(r.slug, true); continue; }
  let s = slugify(r.name);
  if (used.has(s)) { let i = 2; while (used.has(`${s}-${i}`)) i++; s = `${s}-${i}`; }
  used.set(s, true); r.slug = s;
}

const CSS = `:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a2e;background:#fafafc}main{max-width:920px;margin:0 auto;padding:2rem 1.25rem 4rem}a{color:#0969da;text-decoration:none}a:hover{text-decoration:underline}h1{font-size:1.7rem;margin:.2rem 0 .4rem}h2{font-size:1.15rem;margin:2rem 0 .6rem}.muted{color:#57606a;font-size:.92rem}.pill{display:inline-block;padding:.1rem .55rem;border-radius:999px;font-size:.8rem;font-weight:600}.PASS{background:#dafbe1;color:#116329}.FAIL{background:#ffebe9;color:#c93c37}.UNKNOWN{background:#e2e5ea;color:#424a53}.AUTH_GATED{background:#ddf4ff;color:#0550ae}.INFO{background:#ddf4ff;color:#0969da}.WARN{background:#fff8c5;color:#7d4e00}table{border-collapse:collapse;width:100%;font-size:.9rem}th,td{text-align:left;padding:.45rem .6rem;border-bottom:1px solid #d8dee4;vertical-align:top}th{color:#57606a;font-weight:600}code,pre{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.85em}pre{background:#f6f8fa;border:1px solid #d8dee4;border-radius:6px;padding:.8rem;overflow-x:auto;white-space:pre-wrap;word-break:break-all}ul.findings{padding-left:1.2rem}li{margin:.25rem 0}.card{border:1px solid #d8dee4;border-radius:8px;padding:1rem 1.2rem;margin:1rem 0}.foot{margin-top:3rem;padding-top:1rem;border-top:1px solid #d8dee4;font-size:.85rem;color:#57606a}.pager{display:flex;gap:.75rem;flex-wrap:wrap;margin:1rem 0;font-size:.9rem}.facts{display:grid;grid-template-columns:max-content 1fr;gap:.35rem 1rem;margin:1rem 0}.facts dt{color:#57606a;font-size:.9rem}.facts dd{margin:0;font-size:.9rem;font-weight:600}.copyrow{display:flex;align-items:center;gap:.5rem;margin:1rem 0 -.6rem}.copylabel{font-size:.85rem;color:#57606a}.copybtn{margin-left:auto;font:inherit;font-size:.8rem;padding:.15rem .7rem;border:1px solid #d8dee4;border-radius:6px;background:#f6f8fa;color:#0969da;cursor:pointer}.copybtn:hover{background:#eef2f6}@media(prefers-color-scheme:dark){body{color:#e6edf3;background:#0d1117}th,td{border-color:#30363d}.muted,.foot,th,.facts dt,.copylabel{color:#8b949e}pre,.card{background:#161b22;border-color:#30363d}.copybtn{background:#21262d;border-color:#30363d}code{background:transparent}}`;

// The report page used to print the embed snippet and the JSON URL as inert <code> text, so a
// maintainer had to retype them and an agent had to be told the URL by a human. A copy button is
// the smallest change that turns the report into something that actually gets pasted or fetched.
// Kept to one inline script on report pages only (not on the 71 index pages) to bound page weight.
const COPY_JS = `<script>document.addEventListener('click',function(e){var b=e.target.closest('.copybtn');if(!b)return;var t=b.dataset.copy;var done=function(){var o=b.textContent;b.textContent='Copied';setTimeout(function(){b.textContent=o},1200)};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(done,function(){fallback()})}else{fallback()}function fallback(){var r=document.createRange();r.selectNodeContents(b.nextElementSibling);var s=getSelection();s.removeAllRanges();s.addRange(r);done()}});</script>`;

// page(): per-page canonical (fixes duplicate-content SEO bug)
const page = (title, desc, body, canonicalPath = `${BASE}/`, opts = {}) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${canonicalPath}">
<style>${CSS}</style>
</head>
<body>
<main>
${body}
<div class="foot">Generated by <a href="${SITE}/mcpreflight/">mcpreflight</a> — read-only MCP initialize + tools/list. No tools were called, no payments attempted. Static schema checks do not predict model tool selection or prove behavior across all clients. Scanned: ${esc(scan.scannedAt.slice(0, 10))}.</div>
</main>
${opts.copy ? COPY_JS : ''}
</body>
</html>`;

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'p'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'api'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'badge'), { recursive: true });

const tally = results.reduce((m, r) => ((m[r.finalStatus] = (m[r.finalStatus] ?? 0) + 1), m), {});
const total = results.length;

// ---- paginated index ----
const pager = (i, pages) => {
  const links = [];
  for (let k = 0; k < pages; k++) {
    const href = k === 0 ? 'index.html' : `index-${k + 1}.html`;
    links.push(k === i ? `<b>${k + 1}</b>` : `<a href="${href}">${k + 1}</a>`);
  }
  return `<nav class="pager">Pages: ${links.join(' · ')}</nav>`;
};
const chunks = [];
for (let i = 0; i < results.length; i += PAGE_SIZE) chunks.push(results.slice(i, i + PAGE_SIZE));

chunks.forEach((chunk, i) => {
  const rows = chunk.map((r) => `<tr><td><a href="${BASE}/p/${r.slug}.html">${esc(r.title)}</a><br><span class="muted" style="font-size:.8rem">${esc(r.name)}</span></td><td><span class="pill ${r.finalStatus}">${r.finalStatus}</span></td><td>${esc(r.protocolVersion ?? '—')}</td><td>${r.toolCount ?? '—'}</td></tr>`).join('\n');
  const nav = chunks.length > 1 ? pager(i, chunks.length) : '';
  const body = `<h1>Trust reports for official MCP Registry servers</h1>
<p class="muted">${total} remote servers scanned · read-only · reproducible with one CLI command · no tool calls, no payments</p>
<p class="muted">${excluded.size} registry names are omitted at the maintainer's request, so this directory lists ${total} of the ${total + excluded.size} remote endpoints in the 2026-11-01 census.</p>
<p><span class="pill PASS">PASS ${tally.PASS ?? 0}</span> <span class="pill FAIL">FAIL ${tally.FAIL ?? 0}</span> <span class="pill AUTH_GATED">AUTH-GATED ${tally.AUTH_GATED ?? 0}</span> <span class="pill UNKNOWN">UNKNOWN ${tally.UNKNOWN ?? 0}</span></p>
<p><b>${tally.AUTH_GATED ?? 0} endpoints answered 401, not downtime.</b> An auth-gated server works fine — it just will not talk to an anonymous client, and this directory reports that as <code>AUTH_GATED</code> instead of as a failure. ${(tally.UNKNOWN ?? 0).toLocaleString('en-US')} more gave no anonymous handshake at all, which is usually an unseen credential wall rather than a dead host.</p>
<p>Use it as data: <a href="${SITE}${BASE}/api.html">JSON API</a> — one URL per endpoint (status, protocol version, tool count, findings), plus batch indexes. No key, no signup. Or check your own endpoint in the browser: <a href="${SITE}/mcpreflight/check-your-mcp-endpoint.html">check-your-mcp-endpoint</a>.</p>
<p>Every report below was produced by <a href="${SITE}/mcpreflight/">mcpreflight</a> sending only MCP <code>initialize</code> and <code>tools/list</code> to the server's official registry endpoint, then checking protocol version and JSON Schema consistency deterministically. Reproduce any report yourself:</p>
<pre>npx @eidonze/mcpreflight schema &lt;endpoint-url&gt;</pre>
${i === 0 ? '<h2>Directory</h2>' : `<h2>Directory (page ${i + 1})</h2>`}
${nav}
<table>
<tr><th>Server</th><th>Status</th><th>Protocol</th><th>Tools</th></tr>
${rows}
</table>
${nav}`;
  const fname = i === 0 ? 'index.html' : `index-${i + 1}.html`;
  fs.writeFileSync(path.join(outDir, fname), page(
    'MCP Server Trust Directory — read-only schema reports for official registry servers',
    `Independent read-only trust reports for ${total} remote MCP servers listed in the official MCP Registry. Protocol version, tool schema validity, and deterministic checks. No tool calls, no payments.`,
    body,
    `${BASE}/${fname}`
  ));
});

// ---- report pages + api + badges ----
for (const r of results) {
  const findings = r.findings.map((f) => `<li><span class="pill ${esc(f.severity)}">${esc(f.severity)}</span> <code>${esc(f.code)}</code> — ${esc(f.message)}</li>`).join('\n');
  // The single question a client actually asks before wiring an endpoint is "will this connect,
  // and does it want credentials?" — 29% of the registry answers 401, and "401" reading as "dead"
  // is the most common misreading of this data, so it is stated in words at the top of the page.
  const anonHandshake = r.finalStatus === 'PASS'
    ? 'Answered initialize without credentials'
    : r.finalStatus === 'AUTH_GATED'
      ? 'Refused with 401 — an OAuth/credential gate, not a dead endpoint'
      : r.finalStatus === 'FAIL'
        ? 'Reached, but initialize or tools/list did not validate'
        : 'No response within the scanner timeout';
  const wantsCredentials = r.finalStatus === 'AUTH_GATED' ? 'Yes — by design' : r.finalStatus === 'UNKNOWN' ? 'Not advertised (no response)' : 'No';
  const api = {
    reportVersion: 1, generatedBy: 'mcpreflight', scannedAt: r.checkedAt,
    server: { registryName: r.name, title: r.title, description: r.description, registryVersion: r.version },
    endpoint: r.url,
    trust: { finalStatus: r.finalStatus, protocolVersion: r.protocolVersion, serverInfo: r.serverInfo, toolCount: r.toolCount, findings: r.findings },
    ...(r.finalStatus === 'AUTH_GATED' ? { authGate: { status: r.auth ?? 'gated', resourceMetadata: r.resourceMetadata ?? null, discovery: r.discovery ?? [] } } : {}),
    verify: `npx @eidonze/mcpreflight schema ${r.url}`,
  };
  fs.writeFileSync(path.join(outDir, 'api', `${r.slug}.json`), JSON.stringify(api, null, 2));

  const badge = (label, value, color) => `<svg xmlns="http://www.w3.org/2000/svg" width="${6.5 * label.length + 6.5 * value.length + 30}" height="20" role="img"><title>${label}: ${value}</title><linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient><clipPath id="r"><rect width="${6.5 * label.length + 6.5 * value.length + 30}" height="20" rx="3"/></clipPath><g clip-path="url(#r)"><rect width="${6.5 * label.length + 24}" height="20" fill="#555"/><rect x="${6.5 * label.length + 24}" width="${6.5 * value.length + 6}" height="20" fill="${color}"/><rect width="${6.5 * label.length + 6.5 * value.length + 30}" height="20" fill="url(#s)"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="${3.25 * label.length + 12}" y="14">${label}</text><text x="${6.5 * label.length + 27 + 3.25 * value.length}" y="14">${value}</text></g></svg>`;
  const color = r.finalStatus === 'PASS' ? '#2ea44f' : r.finalStatus === 'FAIL' ? '#cf222e' : r.finalStatus === 'AUTH_GATED' ? '#0969da' : '#6e7781';
  // the badge is the artifact most likely to be embedded on someone else's page, so it has to
  // carry the brand and the scan date. a generic "mcp trust" label loses the attribution and
  // makes the badge worthless as an external mention
  const scanDay = String(r.checkedAt ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(outDir, 'badge', `${r.slug}.svg`), badge('mcpreflight', `${r.finalStatus.toLowerCase()} ${scanDay}`, color));

  const html = page(
    `${r.title} — MCP trust report (${r.finalStatus})`,
    `Read-only MCP schema trust report for ${r.name} (${r.url}): ${r.finalStatus}, protocol ${r.protocolVersion ?? 'unknown'}, ${r.toolCount ?? 'unknown'} tools. Reproducible with mcpreflight.`,
    `<p><span class="muted"><a href="${SITE}${BASE}/">Trust Directory</a> / report</span></p>
<h1>${esc(r.title)} <span class="pill ${r.finalStatus}">${r.finalStatus === 'AUTH_GATED' ? 'AUTH-GATED' : r.finalStatus}</span></h1>
<dl class="facts">
<dt>Anonymous handshake</dt><dd>${anonHandshake}</dd>
<dt>Requires credentials</dt><dd>${wantsCredentials}</dd>
<dt>Protocol version</dt><dd>${esc(r.protocolVersion ?? 'not negotiated')}</dd>
<dt>Tools exposed</dt><dd>${r.toolCount ?? 'unknown'}</dd>
<dt>Checked at</dt><dd>${esc(r.checkedAt)}</dd>
</dl>
${r.finalStatus === 'AUTH_GATED' ? `<p class="muted">The endpoint answered an anonymous initialize with 401 and a <code>WWW-Authenticate: Bearer</code> header, so it requires authentication by design${r.auth === 'gated-verified' ? '; its RFC 9728 protected-resource metadata is live, confirming an OAuth authorization server' : ''}. This is an auth gate, not a failure — authenticated scans are out of scope.</p>` : r.finalStatus === 'UNKNOWN' ? '<p class="muted">No anonymous handshake observed — endpoints behind authentication are expected to show this result; it does not mean the server is broken.</p>' : ''}
<p class="muted">${esc(r.description || '')}</p>
<table>
<tr><th>Registry name</th><td><code>${esc(r.name)}</code> (v${esc(r.version ?? '?')})</td></tr>
<tr><th>Endpoint</th><td><code>${esc(r.url)}</code></td></tr>
<tr><th>Reported server</th><td>${esc(r.serverInfo ? `${r.serverInfo.name} ${r.serverInfo.version ?? ''}` : '—')}</td></tr>
<tr><th>Protocol version</th><td>${esc(r.protocolVersion ?? 'not negotiated')}</td></tr>
<tr><th>Tools exposed</th><td>${r.toolCount ?? 'unknown'}</td></tr>
${r.finalStatus === 'AUTH_GATED' ? `<tr><th>Auth gate</th><td>${esc(r.auth ?? 'gated')}${r.discovery?.length ? ` · discovery: ${esc(r.discovery.join(', '))}` : ''}</td></tr>` : ''}
<tr><th>Checked at</th><td>${esc(r.checkedAt)}</td></tr>
</table>
<h2>Findings</h2>
<ul class="findings">${findings}</ul>
<h2>Reproduce this report</h2>
${copyBlock('Shell (one command)', `npx @eidonze/mcpreflight schema ${r.url}`)}
${copyBlock('Report as JSON (fetch / CI / agent)', `${SITE}${BASE}/api/${r.slug}.json`)}
${copyBlock('Badge for a README (Markdown)', `[![mcpreflight](${SITE}${BASE}/badge/${r.slug}.svg)](${SITE}${BASE}/p/${r.slug}.html)`)}
${copyBlock('This report’s public URL', `${SITE}${BASE}/p/${r.slug}.html`)}
<p class="muted">The badge is a static SVG carrying the status and scan date of this run (${esc(scanDay)}); it does not update by itself. If the endpoint changes, the JSON is the current artifact and this page is regenerated on the next weekly scan.</p>
<p>Cite this report as: mcpreflight Trust Directory, <code>${esc(r.name)}</code>, scanned ${esc(scanDay)}. ${SITE}${BASE}/p/${r.slug}.html . Any figure quoted from this page should be attributed to mcpreflight rather than to an anonymous audit.</p>`,
    `${BASE}/p/${r.slug}.html`, { copy: true });
  fs.writeFileSync(path.join(outDir, 'p', `${r.slug}.html`), html);
}

// ---- public JSON API surface ----
// Per-endpoint JSON existed but nothing said so: no index, no batch access, no schema, no page
// describing it. An agent or a CI job could only use a URL a human had pasted to it. These files
// are the machine-facing half of the directory and are stable across runs.
// 5000 rows made each batch ~2 MB, which is a slow single fetch for an agent; 2500 keeps every
// file near 1 MB while leaving the batch count small enough to enumerate by hand.
const BATCH = 2500;
const batches = [];
for (let i = 0; i < results.length; i += BATCH) batches.push(results.slice(i, i + BATCH));
const apiBase = `${SITE}${BASE}/api`;
batches.forEach((chunk, i) => {
  const n = String(i + 1).padStart(4, '0');
  const payload = {
    reportVersion: 1, generatedBy: 'mcpreflight', scannedAt: scan.scannedAt,
    batch: i + 1, batches: batches.length, count: chunk.length,
    servers: chunk.map((r) => ({
      name: r.name, title: r.title, url: r.url, status: r.finalStatus,
      protocolVersion: r.protocolVersion, toolCount: r.toolCount, checkedAt: r.checkedAt,
      report: `${apiBase}/${r.slug}.json`, page: `${SITE}${BASE}/p/${r.slug}.html`,
    })),
  };
  fs.writeFileSync(path.join(outDir, 'api', `_endpoints-${n}.json`), JSON.stringify(payload));
});
const summary = {
  reportVersion: 1, generatedBy: 'mcpreflight', scannedAt: scan.scannedAt,
  total: results.length,
  status: { PASS: tally.PASS ?? 0, FAIL: tally.FAIL ?? 0, AUTH_GATED: tally.AUTH_GATED ?? 0, UNKNOWN: tally.UNKNOWN ?? 0 },
  authGatedShare: Number((((tally.AUTH_GATED ?? 0) / results.length) * 100).toFixed(1)),
  noAnonymousHandshake: (tally.AUTH_GATED ?? 0) + (tally.UNKNOWN ?? 0),
  excludedAtMaintainerRequest: excluded.size,
  method: 'Read-only MCP initialize + tools/list against each endpoint in the official MCP Registry, plus deterministic JSON Schema checks. No tool is ever called; authenticated endpoints are out of scope and appear as AUTH_GATED or UNKNOWN.',
  endpoints: `${apiBase}/_endpoints-0001.json`,
  batches: batches.length,
  schema: `${apiBase}/_schema.json`,
  docs: `${SITE}${BASE}/api.html`,
  verify: 'npx @eidonze/mcpreflight schema <endpoint-url>',
};
fs.writeFileSync(path.join(outDir, 'api', '_summary.json'), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(outDir, 'api', '_schema.json'), JSON.stringify({
  $schema: 'https://json-schema.org/draft-07/schema#',
  title: 'mcpreflight endpoint trust report',
  type: 'object',
  required: ['reportVersion', 'scannedAt', 'server', 'endpoint', 'trust'],
  properties: {
    reportVersion: { type: 'integer', const: 1 },
    generatedBy: { type: 'string' },
    scannedAt: { type: 'string', description: 'ISO 8601 UTC timestamp of the scan that produced this file' },
    server: {
      type: 'object',
      properties: { registryName: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, registryVersion: { type: 'string' } },
    },
    endpoint: { type: 'string', description: 'The remote MCP endpoint URL that was probed' },
    trust: {
      type: 'object',
      required: ['finalStatus', 'findings'],
      properties: {
        finalStatus: { type: 'string', enum: ['PASS', 'FAIL', 'AUTH_GATED', 'UNKNOWN'] },
        protocolVersion: { type: ['string', 'null'], description: 'MCP protocolVersion negotiated in initialize, null when no handshake' },
        serverInfo: { type: ['object', 'null'] },
        toolCount: { type: ['integer', 'null'] },
        findings: {
          type: 'array',
          items: {
            type: 'object',
            required: ['code', 'severity', 'message'],
            properties: { code: { type: 'string' }, severity: { type: 'string', enum: ['INFO', 'WARN', 'ERROR'] }, message: { type: 'string' } },
          },
        },
      },
    },
    authGate: { type: 'object', description: 'Present only when finalStatus is AUTH_GATED' },
    verify: { type: 'string', description: 'Command that reproduces this report locally' },
  },
}, null, 2));

fs.writeFileSync(path.join(outDir, 'api.html'), page(
  'MCP endpoint trust JSON API — query one endpoint or all 35k',
  'Free, key-less JSON for every remote MCP endpoint in the official Registry: status, protocol version, tool count, findings, and whether the endpoint requires credentials. One URL per endpoint plus batch indexes.',
  `<p><span class="muted"><a href="${SITE}${BASE}/">Trust Directory</a> / JSON API</span></p>
<h1>Endpoint trust JSON API</h1>
<p class="muted">Static JSON, no key, no signup, no rate limit. Generated from the weekly read-only scan of ${total} remote endpoints in the official MCP Registry (${esc(scan.scannedAt.slice(0, 10))}).</p>
<dl class="facts">
<dt>Per endpoint</dt><dd><code>${apiBase}/{slug}.json</code></dd>
<dt>All endpoints</dt><dd>${batches.length} batch files of ${BATCH} · <a href="${apiBase}/_endpoints-0001.json">_endpoints-0001.json</a></dd>
<dt>Totals this run</dt><dd><a href="${apiBase}/_summary.json">_summary.json</a></dd>
<dt>Field schema</dt><dd><a href="${apiBase}/_schema.json">_schema.json</a></dd>
<dt>Updated</dt><dd>Weekly, alongside the report pages</dd>
</dl>
<h2>What the status means</h2>
<table>
<tr><th>finalStatus</th><th>Meaning</th><th>Count this run</th></tr>
<tr><td><span class="pill PASS">PASS</span></td><td>Answered an anonymous <code>initialize</code> and <code>tools/list</code>; every tool input schema passed deterministic checks</td><td>${tally.PASS ?? 0}</td></tr>
<tr><td><span class="pill AUTH_GATED">AUTH_GATED</span></td><td>Refused anonymously with 401 — credentials required by design. <b>Not a dead endpoint</b></td><td>${tally.AUTH_GATED ?? 0}</td></tr>
<tr><td><span class="pill FAIL">FAIL</span></td><td>Reached, but the handshake or a tool schema did not validate</td><td>${tally.FAIL ?? 0}</td></tr>
<tr><td><span class="pill UNKNOWN">UNKNOWN</span></td><td>No anonymous handshake within the timeout. Frequently an auth wall we cannot see past, not downtime</td><td>${tally.UNKNOWN ?? 0}</td></tr>
</table>
<p class="muted">${((((tally.AUTH_GATED ?? 0) + (tally.UNKNOWN ?? 0)) / total) * 100).toFixed(0)}% of these endpoints never answered anonymously, so a count of "dead MCP servers" taken from this data would be wrong. Read AUTH_GATED and UNKNOWN as "cannot be checked without credentials", not as failure.</p>
<h2>Ask about one endpoint</h2>
${copyBlock('curl', `curl -s ${apiBase}/ac.tandem-docs-mcp.json | jq '.trust.finalStatus, .trust.authGate, .trust.toolCount'`)}
${copyBlock('jq one-liner over the whole batch', `curl -s ${apiBase}/_endpoints-0001.json | jq -r '.servers[] | select(.status=="AUTH_GATED") | .url'`)}
${copyBlock('Agent tool call (fetch then read)', `GET ${apiBase}/{slug}.json`)}

<h2>Fields you can rely on</h2>
<table>
<tr><th>Field</th><th>Type</th><th>Notes</th></tr>
<tr><td><code>trust.finalStatus</code></td><td>enum</td><td>PASS · FAIL · AUTH_GATED · UNKNOWN. Stable vocabulary, safe to branch on</td></tr>
<tr><td><code>trust.protocolVersion</code></td><td>string|null</td><td>As negotiated in <code>initialize</code>; null when no handshake happened</td></tr>
<tr><td><code>trust.toolCount</code></td><td>integer|null</td><td>Number of tools in <code>tools/list</code></td></tr>
<tr><td><code>trust.findings[]</code></td><td>array</td><td>Deterministic codes with severity and a plain-language message</td></tr>
<tr><td><code>authGate</code></td><td>object</td><td>Only on AUTH_GATED: gate status and any RFC 9728 resource metadata found</td></tr>
<tr><td><code>scannedAt</code></td><td>string</td><td>ISO timestamp. A report is a snapshot, not a live probe — re-run the CLI for the current state</td></tr>
</table>
<h2>Limits, stated plainly</h2>
<ul class="findings">
<li>Static schema checks say the tool contract is well-formed. They do not say a tool is useful, correct, or safe.</li>
<li>Authenticated endpoints are out of scope: no token is ever used, so a gated server is reported as gated, never as healthy or dead.</li>
<li>One snapshot per week. Uptime between scans is not measured — for that, run the CLI or the Action against your own endpoint.</li>
<li>${excluded.size} registry names are omitted at maintainer request and do not appear in any file here.</li>
</ul>
<p>Reproduce any number above with <code>npx @eidonze/mcpreflight schema &lt;endpoint-url&gt;</code>.</p>`,
  `${BASE}/api.html`));

// ---- summary ----
fs.writeFileSync(path.join(root, 'trust-data', 'tally.json'), JSON.stringify(tally));
console.log(`generated: ${chunks.length} index pages + ${results.length} reports, ${results.length} api, ${results.length} badges`);
console.log(JSON.stringify(tally));

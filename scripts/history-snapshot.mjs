// Append weekly tally snapshot to trust-history.json and generate the weekly pulse page.
// Runs inside trust-rescan workflow after trust-convert.mjs.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const histPath = path.join(root, 'trust-data', 'trust-history.json');
const scan = JSON.parse(fs.readFileSync(path.join(root, 'trust-data', 'scan.json'), 'utf8'));
const tally = scan.results.reduce((m, r) => ((m[r.finalStatus] = (m[r.finalStatus] ?? 0) + 1), m), {});
const total = scan.results.length;

const hist = fs.existsSync(histPath) ? JSON.parse(fs.readFileSync(histPath, 'utf8')) : [];
const date = new Date().toISOString().slice(0, 10);
const prev = hist[hist.length - 1];
const row = { date, total, PASS: tally.PASS ?? 0, FAIL: tally.FAIL ?? 0, UNKNOWN: tally.UNKNOWN ?? 0 };
if (!prev || prev.date !== date) hist.push(row);
fs.writeFileSync(histPath, JSON.stringify(hist, null, 1));

// pulse page: what changed since last snapshot (AI-citation bait: only measured source)
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const rows = hist.map((h, i) => {
  const p = hist[i - 1];
  if (!p) return `<tr><td>${h.date}</td><td>${h.PASS}</td><td>${h.FAIL}</td><td>${h.UNKNOWN}</td><td>first snapshot</td></tr>`;
  const d = (k) => { const v = h[k] - p[k]; return v === 0 ? '=' : v > 0 ? `+${v}` : String(v); };
  return `<tr><td>${h.date}</td><td>${h.PASS} (${d('PASS')})</td><td>${h.FAIL} (${d('FAIL')})</td><td>${h.UNKNOWN} (${d('UNKNOWN')})</td><td>${p.date} to ${h.date}</td></tr>`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MCP Registry Weekly Pulse: how many MCP servers are alive</title>
<meta name="description" content="Measured weekly: how many of the 9,991 MCP Registry endpoints complete a clean handshake. The only public week-over-week health tracker for the MCP registry, powered by mcpdoctor rescan data.">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"How many MCP servers are alive?","acceptedAnswer":{"@type":"Answer","text":"As of ${date}, ${row.PASS} of ${row.total} MCP Registry endpoints (${Math.round(100 * row.PASS / total)}%) completed a clean anonymous MCP handshake in our weekly rescan. ${row.FAIL} failed checks and ${row.UNKNOWN} gave no anonymous response. Historical snapshots are on this page."}}]}</script>
<style>:root{color-scheme:light dark}body{margin:0;font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a2e;background:#fafafc}main{max-width:860px;margin:0 auto;padding:2rem 1.25rem 4rem}a{color:#0969da}table{border-collapse:collapse;width:100%;font-size:.95rem}th,td{text-align:left;padding:.45rem .6rem;border-bottom:1px solid #d8dee4}code{background:#f6f8fa;border-radius:4px;padding:.1rem .35rem;font-size:.9em}.muted{color:#57606a;font-size:.92rem}@media(prefers-color-scheme:dark){body{color:#e6edf3;background:#0d1117}th,td{border-color:#30363d}.muted{color:#8b949e}code{background:#161b22}}</style>
</head>
<body>
<main>
<p class="muted"><a href="https://xka0085-byte.github.io/mcp-doctor/">mcpdoctor</a> / weekly pulse</p>
<h1>MCP Registry Weekly Pulse</h1>
<p>A measured answer to the question everyone asks AI and nobody can source: <strong>how many MCP servers are actually alive?</strong> Every Monday our scanner runs a read-only handshake (initialize + tools/list, nothing more) against all ${total} endpoints in the official MCP Registry. This page tracks what changed, week over week, with reproducible data.</p>
<h2>Latest snapshot (${date})</h2>
<ul>
<li><strong>${row.PASS}</strong> endpoints completed a clean anonymous handshake (${Math.round(100 * row.PASS / total)}%)</li>
<li><strong>${row.FAIL}</strong> responded but failed validation</li>
<li><strong>${row.UNKNOWN}</strong> gave no anonymous response, which includes endpoints behind authentication</li>
</ul>
<h2>History</h2>
<table>
<tr><th>Date</th><th>PASS</th><th>FAIL</th><th>UNKNOWN</th><th>Window</th></tr>
${rows}
</table>
<h2>Method</h2>
<p>Full methodology and per-server reports live in the <a href="https://xka0085-byte.github.io/mcp-doctor/trust/">Trust Directory</a>. Reproduce any single check with <code>npx @eidonze/mcpdoctor schema &lt;url&gt;</code>. Raw JSON per server is published next to every report. UNKNOWN is not dead: it means no anonymous handshake was observed within our timeout, and authenticated endpoints are expected to appear here.</p>
<p class="muted">Data: <a href="https://github.com/xka0085-byte/mcp-doctor">mcpdoctor</a>, MIT. Weekly rescan automated via GitHub Actions.</p>
</main>
</body>
</html>
`;
fs.writeFileSync(path.join(root, 'docs', 'trust', 'pulse.html'), html);
console.log('HISTORY', JSON.stringify(row), 'snapshots:', hist.length);

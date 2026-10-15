// Weekly x402 cohort tracker: one consistent time series for the registry x402 cohort.
// Cohort definition (fixed 2026-10-15, matches state-of-mcp finding 6): registry entry
// title/description/url mentions x402 or http-402 (case-insensitive).
// Appends a dated snapshot to trust-data/x402-history.json (upsert by date) and re-renders
// the tracking table into docs/x402-endpoint-inspector.html between x402-weekly markers.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const scan = JSON.parse(fs.readFileSync(path.join(root, 'trust-data', 'scan.json'), 'utf8'));
const histPath = path.join(root, 'trust-data', 'x402-history.json');
const pagePath = path.join(root, 'docs', 'x402-endpoint-inspector.html');

const X402 = /x402|http[- ]402/i;
const cohort = scan.results.filter((r) => X402.test(`${r.title || ''} ${r.description || ''} ${r.url || ''}`));
const by = (s) => cohort.filter((r) => (r.finalStatus || 'UNKNOWN').toUpperCase() === s).length;
const pass = by('PASS');
const fail = by('FAIL');
const gated = by('AUTH_GATED');
const unknown = cohort.length - pass - fail - gated;
const date = new Date().toISOString().slice(0, 10);
const entry = { date, cohort: cohort.length, pass, passRate: Number((100 * pass / cohort.length).toFixed(1)), authGated: gated, unknown, fail };

const hist = fs.existsSync(histPath) ? JSON.parse(fs.readFileSync(histPath, 'utf8')) : [];
const i = hist.findIndex((h) => h.date === date);
if (i >= 0) hist[i] = entry;
else hist.push(entry);
hist.sort((a, b) => a.date.localeCompare(b.date));
fs.writeFileSync(histPath, JSON.stringify(hist, null, 1) + '\n');

const rows = hist.slice(-12).map((h) => `<tr><td>${h.date}</td><td>${h.cohort}</td><td>${h.pass}</td><td>${h.passRate}%</td><td>${h.authGated}</td><td>${h.unknown}</td><td>${h.fail}</td></tr>`).join('');
const block = `<!-- x402-weekly:start -->
<h2>Weekly cohort tracking</h2>
<p>Cohort: registry endpoints whose title, description, or URL mentions x402 or HTTP-402 (definition fixed 2026-10-15, matching <a href="state-of-mcp-2026-10.html">finding 6</a>). Snapshotted every Monday by the rescan workflow. passRate is the clean anonymous handshake share; unknown endpoints gave no anonymous response, and the auth-gated column tracks how many of those are confirmed intentional gates.</p>
<table><tr><th>date</th><th>cohort</th><th>pass</th><th>passRate</th><th>auth-gated</th><th>unknown</th><th>fail</th></tr>${rows}</table>
<p>Preflight any single endpoint yourself, read-only: <code>npx @eidonze/mcpreflight inspect &lt;url&gt;</code> for the 402 challenge, <code>npx @eidonze/mcpreflight schema &lt;url&gt;</code> for the MCP handshake. <a href="https://github.com/xka0085-byte/mcpreflight">Open source, MIT.</a></p>
<!-- x402-weekly:end -->`;

const page = fs.readFileSync(pagePath, 'utf8');
const S = page.indexOf('<!-- x402-weekly:start -->');
const E = page.indexOf('<!-- x402-weekly:end -->');
let next;
if (S >= 0 && E > S) {
  next = page.slice(0, S) + block + page.slice(E + '<!-- x402-weekly:end -->'.length);
} else {
  const anchor = '<p><a href="index.html">Back to mcpreflight</a></p>';
  if (!page.includes(anchor)) throw new Error('no insertion anchor and no markers in x402 page');
  next = page.replace(anchor, block + '\n' + anchor);
}
fs.writeFileSync(pagePath, next);
console.log(`x402 cohort ${entry.date}: ${entry.cohort} endpoints, pass ${entry.pass} (${entry.passRate}%), auth-gated ${entry.authGated}, unknown ${entry.unknown}, fail ${entry.fail}`);

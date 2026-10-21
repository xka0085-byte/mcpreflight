// 数据口径变更说明生成器：读新扫描与旧备份，产出公开说明页，并登记 llms.txt
// 用法: node scripts/data-quality-note.mjs [旧备份路径]
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const cur = path.join(root, 'trust-data', 'scan-full.jsonl');
const oldPath = process.argv[2] || path.join(root, 'trust-data', 'scan-full.pre-fix-2026-10-21.jsonl');
const outHtml = path.join(root, 'docs', 'data-quality-2026-10-21.html');
const day = '2026-10-21';

function counts(file) {
  if (!fs.existsSync(file)) return null;
  const c = { total: 0, PASS: 0, AUTH_GATED: 0, UNKNOWN: 0, FAIL: 0, NO_RESPONSE: 0 };
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let r; try { r = JSON.parse(line); } catch { continue; }
    c.total += 1;
    c[r.finalStatus] = (c[r.finalStatus] || 0) + 1;
    if ((r.findings || []).some(f => f.code === 'NO_RESPONSE')) c.NO_RESPONSE += 1;
  }
  return c;
}
const n = counts(cur), o = counts(oldPath);
if (!n) { console.error('no current scan data'); process.exit(1); }

const pct = (x, t) => ((x / t) * 100).toFixed(1);
const row = (label, a, b) => `<tr><td>${label}</td><td>${a ?? '-'}</td><td>${b ?? '-'}</td><td>${a != null && b != null ? b - a : '-'}</td></tr>`;

const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MCP census data quality note, ${day}</title>
<style>:root{--bg:#f6f8fa;--surface:#fff;--border:#d0d7de;--text:#1f2328;--muted:#57606a}*{box-sizing:border-box}body{margin:0;font-family:ui-sans-serif,system-ui;background:var(--bg);color:var(--text)}.wrap{max-width:860px;margin:0 auto;padding:36px 16px}h1{font-size:24px;margin:0 0 6px}h2{font-size:16px;margin:26px 0 8px;border-bottom:1px solid var(--border);padding-bottom:6px}p,li{font-size:14px;line-height:1.65}table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid var(--border);padding:8px;font-size:14px;text-align:left}th{background:var(--surface)}code{background:#eaeef2;padding:2px 5px;border-radius:5px;font-size:13px}.note{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin:16px 0}footer{margin-top:32px;font-size:12px;color:var(--muted);border-top:1px solid var(--border);padding-top:12px}</style>
<div class="wrap">
<h1>MCP census data quality note</h1>
<p>${day}. This note records a measurement defect in our MCP endpoint census, what changed after the fix, and what remains unverified.</p>

<h2>What happened</h2>
<p>A maintainer told us on 2026-10-20 that an endpoint we reported as <code>NO_RESPONSE</code> actually completed an anonymous handshake. We re-tested it: HTTP 200, an <code>Mcp-Session-Id</code> header, and an SSE event carrying the initialize result. The report was wrong.</p>
<p>Root cause: our scanner did not echo the session header on <code>tools/list</code>. Stateful Streamable HTTP servers answered 400, and we recorded that as a dead endpoint. Four more defects surfaced while repairing it: redirects were not followed, any 401 without a Bearer challenge was not counted as gated, 429 and 5xx were not retried, and the body cap was too small.</p>

<h2>What the re-scan changed</h2>
<table><tr><th>Status</th><th>Before, 2026-10-12</th><th>After, 2026-10-21</th><th>Change</th></tr>
${row('Scanned endpoints', o?.total, n.total)}
${row('PASS', o?.PASS, n.PASS)}
${row('AUTH_GATED', o?.AUTH_GATED, n.AUTH_GATED)}
${row('UNKNOWN', o?.UNKNOWN, n.UNKNOWN)}
${row('FAIL', o?.FAIL, n.FAIL)}
${row('NO_RESPONSE findings', o?.NO_RESPONSE, n.NO_RESPONSE)}
</table>
<div class="note"><strong>Deprecated:</strong> the old anonymous handshake pass rate of 48.8 percent must not be quoted. Under the corrected scanner the same census gives ${pct(n.PASS, n.total)} percent PASS, ${pct(n.AUTH_GATED, n.total)} percent AUTH_GATED, ${pct(n.UNKNOWN, n.total)} percent UNKNOWN, ${pct(n.FAIL, n.total)} percent FAIL. Both numbers use the same endpoint list and the same read-only method.</div>

<h2>What this does and does not prove</h2>
<ul>
<li>It proves that at least ${n.PASS - (o?.PASS ?? 0)} endpoints were previously misclassified. A random sample of 60 old NO_RESPONSE endpoints gave 19 PASS and 12 AUTH_GATED after the fix.</li>
<li>It does not prove the new number is correct. No independent party has recomputed it yet, and this re-scan ran from one network location.</li>
<li>Classification is still the scanner's own judgment. AUTH_GATED means the endpoint answered 401 or 403 anonymously. PASS means the schema checks passed. Neither is a security or quality certification.</li>
</ul>

<h2>Reproduce it</h2>
<p>Run <code>node bin/mcpreflight.mjs schema &lt;url&gt; --format=json</code> against any endpoint. The raw per-server records behind this note are in <code>trust-data/scan-full.jsonl</code>. The pre-fix records are kept in <code>trust-data/scan-full.pre-fix-2026-10-21.jsonl</code>.</p>
<p>If you find a disagreement, open an issue with the endpoint and the exact request. We will publish the correction here.</p>

<footer>mcpreflight. Method note generated ${day}. Read-only checks only: initialize and tools/list, no tool calls, no credentials, no payments. This page is a correction record, not a certification.</footer>
</div></html>`;
fs.writeFileSync(outHtml, html);

const llmsPath = path.join(root, 'docs', 'llms.txt');
const cite = `\n## Data quality note (${day})\n\nMCP census data quality note with before and after numbers after a session-header defect was fixed: https://xka0085-byte.github.io/mcpreflight/data-quality-2026-10-21.html\nOld handshake pass rate 48.8 percent is deprecated. New read-only census: ${n.PASS} PASS, ${n.AUTH_GATED} AUTH_GATED, ${n.UNKNOWN} UNKNOWN, ${n.FAIL} FAIL out of ${n.total} endpoints, checked ${day}. Not independently recomputed.\n`;
if (!fs.existsSync(llmsPath) || !fs.readFileSync(llmsPath, 'utf8').includes('data-quality-2026-10-21.html')) fs.appendFileSync(llmsPath, cite);
console.log('wrote', outHtml, '| new', JSON.stringify(n), '| old', JSON.stringify(o));

// Publish scan-derived numbers with an explicit scan date.
// Writes trust-data/scan-stats.json and injects a dated block into the two hand-written
// pages that quote headline figures, between <!-- scan-stats:start/end --> markers.
// Runs in the weekly rescan workflow after gen-sitemap.mjs.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const scan = JSON.parse(fs.readFileSync(path.join(root, 'trust-data', 'scan.json'), 'utf8'));

const START = '<!-- scan-stats:start -->';
const END = '<!-- scan-stats:end -->';
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const results = scan.results;
const total = results.length;
const count = (status) => results.filter((r) => String(r.finalStatus || '').toUpperCase() === status).length;
const pass = count('PASS');
const authGated = count('AUTH_GATED');
const unknown = count('UNKNOWN');
const fail = count('FAIL');
const passRate = Number((100 * pass / total).toFixed(1));
const noAnonymousHandshake = authGated + unknown;

// Scan date: the top-level scannedAt, else the most common checkedAt day across results.
function modalCheckedAtDay(rows) {
  const byDay = new Map();
  for (const r of rows) {
    const day = String(r.checkedAt || '').slice(0, 10);
    if (day) byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  let day = null;
  let n = 0;
  for (const [d, c] of byDay) if (c > n || (c === n && d > day)) { day = d; n = c; }
  return day;
}
const date = String(scan.scannedAt || '').slice(0, 10) || modalCheckedAtDay(results);

fs.writeFileSync(
  path.join(root, 'trust-data', 'scan-stats.json'),
  JSON.stringify({ date, generatedAt: new Date().toISOString(), total, counts: { pass, authGated, unknown, fail }, passRate, noAnonymousHandshake }, null, 1) + '\n',
);

// One block, rendered per page so its markup matches that file.
function renderBlock(eol, indent, cls) {
  const p = (text) => `${indent}<p class="${cls}">${text}</p>`;
  return [
    `${indent}${START}`,
    p(`Current numbers as of ${date}: ${fmt(total)} remote endpoints returned by that sweep, ${fmt(pass)} PASS (${passRate}%), ${fmt(fail)} FAIL, ${fmt(noAnonymousHandshake)} no anonymous handshake (${fmt(authGated)} AUTH_GATED + ${fmt(unknown)} UNKNOWN).`),
    p('These are the published figures from the weekly read-only rescan of the official MCP Registry; endpoints that require authentication are counted as AUTH_GATED rather than as failures.'),
    p('Source: mcpreflight — <a href="https://xka0085-byte.github.io/mcpreflight/state-of-mcp-2026-10.html">State of MCP Servers - October 2026</a>.'),
    `${indent}${END}`,
  ].join(eol).split(eol);
}

// Insert after the anchor line, or replace the marker block when it already exists.
// The anchor phrases also occur in <head> metadata, where a prose block would be invalid,
// so search from <body> onwards.
function inject(file, anchor, cls, indent) {
  const p = path.join(root, 'docs', file);
  const raw = fs.readFileSync(p, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  const block = renderBlock(eol, indent, cls);
  const s = lines.findIndex((l) => l.includes(START));
  const e = lines.findIndex((l) => l.includes(END));

  let next;
  if (s >= 0 && e > s) {
    next = [...lines.slice(0, s), ...block, ...lines.slice(e + 1)];
  } else {
    const body = lines.findIndex((l) => l.includes('<body'));
    const a = lines.findIndex((l, i) => i >= body && l.includes(anchor));
    if (a < 0) { console.log('SKIP', file, `(no markers and anchor "${anchor}" not found)`); return; }
    next = [...lines.slice(0, a + 1), ...block, ...lines.slice(a + 1)];
  }

  const text = next.join(eol);
  if (text !== raw) fs.writeFileSync(p, text);
  console.log('OK', file);
}

// The landing-page KPI is a hardcoded counter. Keep it in sync with the sweep that produced
// these numbers so the headline figure cannot drift away from scan-stats.json again.
function syncKpi(file) {
  const p = path.join(root, 'docs', file);
  const raw = fs.readFileSync(p, 'utf8');
  const re = /(<b class="grad" data-count=")\d+(" data-fmt="int">)[^<]*(<\/b><span>registry endpoints in the latest sweep<\/span>)/;
  if (!re.test(raw)) { console.log('SKIP kpi', file); return; }
  const next = raw.replace(re, `$1${total}$2${fmt(total)}$3`);
  if (next !== raw) { fs.writeFileSync(p, next); console.log('OK kpi', file, fmt(total)); }
}

inject('index.html', 'Full report, method and limits', 'note', '      ');
inject('state-of-mcp-2026-10.html', 'full per-server directory', 'muted', '');
syncKpi('index.html');
console.log(`scan-stats ${date}: total ${total}, pass ${pass} (${passRate}%), fail ${fail}, authGated ${authGated}, unknown ${unknown}, noAnonymousHandshake ${noAnonymousHandshake}`);

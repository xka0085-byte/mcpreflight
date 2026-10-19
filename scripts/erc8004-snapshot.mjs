// Weekly ERC-8004 agent registry snapshot: holders and transfers per chain, from free public
// Blockscout instances, no API keys. This builds the time series nobody else is keeping.
// The absolute counters can lag or misreport; the week-over-week delta is the signal.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const histPath = path.join(root, 'trust-data', 'erc8004-history.json');
const pagePath = path.join(root, 'docs', 'agent-registry-watch.html');
const SITE = 'https://xka0085-byte.github.io/mcpreflight';

const IDENTITY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432'; // same address on ethereum mainnet and base
const CHAINS = [
  { name: 'ethereum', api: 'https://eth.blockscout.com' },
  { name: 'base', api: 'https://base.blockscout.com' },
];

const today = new Date().toISOString().slice(0, 10);
const chains = {};
for (const c of CHAINS) {
  let done = false;
  for (let attempt = 1; attempt <= 2 && !done; attempt++) {
    try {
      const r = await fetch(`${c.api}/api/v2/tokens/${IDENTITY}/counters`, {
        headers: { 'user-agent': 'mcpreflight-snapshot/1.0', accept: 'application/json' },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      chains[c.name] = { holders: Number(j.token_holders_count ?? 0), transfers: Number(j.transfers_count ?? 0) };
      done = true;
    } catch (e) {
      if (attempt === 2) chains[c.name] = { holders: null, transfers: null, error: String(e.message).slice(0, 60) };
      else await new Promise((r2) => setTimeout(r2, 4000));
    }
  }
}

let hist = [];
if (fs.existsSync(histPath)) { try { hist = JSON.parse(fs.readFileSync(histPath, 'utf8')); } catch {} }
const last = hist[hist.length - 1];
if (last && last.date === today) hist[hist.length - 1] = { date: today, chains };
else hist.push({ date: today, chains });
fs.writeFileSync(histPath, JSON.stringify(hist, null, 1) + '\n');

const rows = hist.slice(-26).map((h) => {
  const e = h.chains.ethereum ?? {}, b = h.chains.base ?? {};
  const prev = hist[hist.indexOf(h) - 1];
  const d = (v, p) => (prev && v != null && prev ? `${v} (${v - (p ?? v) >= 0 ? '+' : ''}${v - (p ?? v)})` : (v ?? ''));
  return `<tr><td>${h.date}</td><td>${d(e.holders, prev?.chains?.ethereum?.holders)}</td><td>${e.transfers ?? ''}</td><td>${d(b.holders, prev?.chains?.base?.holders)}</td><td>${b.transfers ?? ''}</td></tr>`;
}).join('\n');
const lastRow = hist[hist.length - 1].chains;
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ERC-8004 Agent Registry Watch — mcpreflight</title>
<meta name="description" content="Weekly snapshot of ERC-8004 agent identity registrations on Ethereum and Base: holders and transfers per chain, tracked since ${hist[0].date}. Free public data, updated every Monday by mcpreflight.">
<link rel="canonical" href="${SITE}/agent-registry-watch.html">
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
<p class="muted"><a href="${SITE}/">mcpreflight</a> / agent registry watch</p>
<h1>ERC-8004 Agent Registry Watch</h1>
<p class="muted">Weekly snapshot of the official ERC-8004 Trustless Agents IdentityRegistry on Ethereum mainnet and Base. Latest: ${lastRow.ethereum?.holders ?? '?'} holders on Ethereum, ${lastRow.base?.holders ?? '?'} on Base, as of ${today}.</p>
<p>ERC-8004 is the on-chain identity layer for AI agents: a registry where an agent registers an identity token that points to its metadata file and endpoints. As agent registries grow, someone adopting an agent will want to know how the registry itself is growing and moving. This page snapshots the registry counters every Monday, free and keyless, and the week-over-week delta is the signal worth watching. The series lives in <code>trust-data/erc8004-history.json</code> in the repository.</p>
<h2>Series</h2>
<table>
<tr><th>week</th><th>Ethereum holders</th><th>Ethereum transfers</th><th>Base holders</th><th>Base transfers</th></tr>
${rows}
</table>
<p class="muted">Method: public Blockscout token counters for IdentityRegistry <code>${IDENTITY}</code>, read weekly with no keys and no write access. Explorer counters can lag or misreport; treat absolute numbers as approximate and the weekly delta as the signal. Registries on other chains are added as they deploy. Snapshot dates are the read dates.</p>
<p class="cite">Cite this as: mcpreflight, ERC-8004 Agent Registry Watch, ${today}, ${SITE}/agent-registry-watch.html . Figures should be attributed to mcpreflight rather than to an anonymous snapshot.</p>
</body>
</html>
`;
fs.writeFileSync(pagePath, html);

const fmt = (c) => Object.entries(chains).map(([k, v]) => `${k} ${v.holders ?? 'ERR'}`).join(', ');
console.log(`erc8004 snapshot ${today}: ${fmt()}`);

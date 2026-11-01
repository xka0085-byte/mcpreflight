// Agent Evidence weekly refresh: resample ERC-8004 agents, re-probe endpoints, regenerate report.
// Runs after the Monday Trust Directory rescan (separate workflow, cron later same day).
// Pipeline: 8004scan list -> details -> unique endpoints -> mcpreflight schema probes -> registration
// file re-fetch -> five-level verdicts -> docs/agent-evidence-sample.html + trust-data/agent-evidence/.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { spawn } from 'node:child_process';
import { endpointPhrase } from './lib/sweep-figures.mjs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'bin', 'mcpreflight.mjs');
const dataDir = path.join(root, 'trust-data', 'agent-evidence');
fs.mkdirSync(dataDir, { recursive: true });

const API = 'https://api.8004scan.io/api/v1';
const SITE = 'https://xka0085-byte.github.io/mcpreflight';
const TARGET_ENDPOINTS = 40;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(u) {
  const r = await fetch(u, { headers: { accept: 'application/json' } });
  if (r.status === 429) throw Object.assign(new Error('429'), { rate: true });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

// ---- 1) candidate lists ----
async function pullCandidates() {
  const seen = new Set();
  const out = [];
  const queries = [
    'has_mcp=true&is_testnet=false&limit=50&offset=0',
    'has_mcp=true&is_testnet=false&limit=50&offset=50',
    'has_mcp=true&is_testnet=false&limit=50&offset=100',
    'has_mcp=true&is_testnet=false&limit=50&offset=150',
    'is_testnet=false&is_active=true&min_feedbacks=1&limit=50',
    'is_testnet=false&is_active=true&sort_by=total_score&sort_order=desc&limit=50',
  ];
  for (const qs of queries) {
    try {
      const d = await getJSON(`${API}/agents?${qs}`);
      for (const a of d.items || []) {
        const id = a.chain_id + ':' + a.token_id;
        if (!seen.has(id)) { seen.add(id); out.push({ chain: a.chain_id, tid: a.token_id }); }
      }
      console.error(`list ${qs.slice(0, 40)} -> ${d.items?.length || 0}`);
    } catch (e) { console.error('list err', e.message); }
    await sleep(1500);
  }
  return out;
}

// ---- 2) details (rate-limited: 40 requests then 30s cooldown) ----
async function pullDetails(cands) {
  const agents = [];
  const endpoints = new Set();
  let burst = 0;
  for (const c of cands) {
    if (endpoints.size >= TARGET_ENDPOINTS) break;
    try {
      const d = await getJSON(`${API}/agents/${c.chain}/${c.tid}`);
      burst++;
      const ep = d.mcp_server || d.services?.mcp?.endpoint || null;
      if (ep) {
        const key = ep.replace(/\/+$/, '').toLowerCase();
        if (!endpoints.has(key)) {
          endpoints.add(key);
          agents.push({
            chain: d.chain_id, tid: d.token_id, name: d.name,
            mcpEndpoint: ep,
            regUri: d.raw_metadata?.offchain_uri || null,
            reg: d.raw_metadata?.offchain_content || null,
            detailUrl: `https://8004scan.io/agents/${d.chain_id}/${d.token_id}`,
          });
          console.error(`+ ${d.name} ${ep.slice(0, 55)}`);
        }
      }
      if (burst >= 40) { console.error('cooldown 30s'); await sleep(30000); burst = 0; }
    } catch (e) {
      if (e.rate) { console.error('429, cooldown 30s'); await sleep(30000); burst = 0; }
    }
    await sleep(1500);
  }
  return agents;
}

// ---- 3) probe endpoints with mcpreflight schema (concurrency 2) ----
function probeOne(ep) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, 'schema', ep, '--format=json'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    const timer = setTimeout(() => { try { child.kill(); } catch {} }, 100000);
    child.on('close', () => {
      clearTimeout(timer);
      const start = stdout.indexOf('{');
      let report = null;
      if (start >= 0) { try { report = JSON.parse(stdout.slice(start)); } catch {} }
      resolve({ endpoint: ep, probedAt: new Date().toISOString(), probe: report || { noOutput: true, stderr: stderr.slice(0, 300) } });
    });
  });
}

async function probeAll(endpoints) {
  const probes = [];
  let i = 0;
  async function worker() {
    while (i < endpoints.length) {
      const ep = endpoints[i++];
      const r = await probeOne(ep);
      probes.push(r);
      const st = r.probe.finalStatus || (r.probe.stderr || '').match(/HTTP (\d+)/)?.[1] || 'no-response';
      console.error(`probe [${probes.length}/${endpoints.length}] ${st} ${ep.slice(0, 50)}`);
      await sleep(2000);
    }
  }
  await Promise.all([worker(), worker()]);
  return probes;
}

// ---- 4) re-fetch registration files ----
async function checkRegs(agents) {
  const out = [];
  const seen = new Set();
  for (const a of agents) {
    const key = a.mcpEndpoint.replace(/\/+$/, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const rec = { endpoint: a.mcpEndpoint, regUri: a.regUri, cachedReg: a.reg };
    let target = a.regUri;
    if (target && target.startsWith('ipfs://')) target = 'https://' + target.slice(7) + '.ipfs.dweb.link/';
    if (target) {
      try {
        const r = await fetch(target, { signal: AbortSignal.timeout(25000), headers: { accept: 'application/json' } });
        if (r.ok) {
          const live = JSON.parse(await r.text());
          rec.regAccessible = true;
          rec.note = a.regUri?.startsWith('ipfs://') ? 'via dweb.link gateway' : null;
          const cm = (a.reg?.services || []).find((s) => (s.name || '').toLowerCase() === 'mcp');
          const lm = (live.services || []).find((s) => (s.name || '').toLowerCase() === 'mcp');
          rec.mcpEndpointUnchanged = !!(cm && lm && cm.endpoint === lm.endpoint);
        } else { rec.regAccessible = false; rec.note = 'HTTP ' + r.status; }
      } catch (e) { rec.regAccessible = false; rec.note = (e.cause && e.cause.code) || e.message.slice(0, 80); }
    } else { rec.regAccessible = false; rec.note = 'no registration uri'; }
    out.push(rec);
    await sleep(400);
  }
  return out;
}

// ---- 5) verdicts (English, five levels) ----
function parseStderr(stderr) {
  const m = (stderr || '').match(/(initialize|tools\/list) returned HTTP (\d+)/);
  return m ? { step: m[1], httpStatus: Number(m[2]) } : null;
}
const norm = (u) => { try { const x = new URL(u); return (x.origin + x.pathname).replace(/\/+$/, '').toLowerCase(); } catch { return u.replace(/\/+$/, '').toLowerCase(); } };

function buildVerdicts(agents, probes, regs, scan) {
  const probeByEp = new Map(probes.map((p) => [p.endpoint.replace(/\/+$/, '').toLowerCase(), p]));
  const regByEp = new Map(regs.map((r) => [r.endpoint.replace(/\/+$/, '').toLowerCase(), r]));
  const scanUrls = new Set(scan.results.map((r) => r.url.replace(/\/+$/, '').toLowerCase()));
  const scanHosts = new Set(scan.results.map((r) => { try { return new URL(r.url).host.toLowerCase(); } catch { return null; } }).filter(Boolean));
  const groups = new Map();
  for (const a of agents) {
    if (!a.mcpEndpoint) continue;
    const k = norm(a.mcpEndpoint);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(a);
  }
  const verdicts = [];
  for (const [key, list] of groups) {
    const a = list[0];
    const probe = probeByEp.get(key);
    const reg = regByEp.get(key);
    const p = probe && probe.probe ? probe.probe : null;
    const cachedMcp = ((a.reg && a.reg.services) || []).find((s) => (s.name || '').toLowerCase() === 'mcp');
    const declaredEp = cachedMcp ? cachedMcp.endpoint : null;

    let probeSummary = null;
    if (p && p.finalStatus) {
      probeSummary = {
        finalStatus: p.finalStatus,
        httpStatus: p.http ? p.http.status : null,
        protocolVersion: p.mcp ? p.mcp.protocolVersion : null,
        toolCount: p.mcp ? p.mcp.toolCount : null,
        findings: (p.findings || []).map((f) => f.code),
        stderr: p.stderr || null,
      };
    } else if (p) {
      const se = parseStderr(p.stderr);
      probeSummary = { finalStatus: 'NO_HANDSHAKE', httpStatus: se ? se.httpStatus : null, failedStep: se ? se.step : null, stderr: p.stderr || null, findings: [] };
    }

    let verdict, reason;
    const regOk = reg ? reg.regAccessible : false;
    if (!declaredEp) { verdict = 'missing data'; reason = 'registration file declares no MCP service entry'; }
    else if (probeSummary && probeSummary.finalStatus === 'PASS') {
      if (reg && reg.mcpEndpointUnchanged === false) { verdict = 'conflict'; reason = 'registration file now declares a different MCP endpoint than the on-chain index cache'; }
      else if (!regOk) { verdict = 'partially consistent'; reason = 'clean MCP handshake observed, but the registration file could not be re-fetched for independent confirmation'; }
      else { verdict = 'fully consistent'; reason = 'registration declares this MCP endpoint; anonymous initialize and tools/list both succeeded' + (probeSummary.toolCount != null ? ` (${probeSummary.toolCount} tools listed)` : ''); }
    } else if (probeSummary && probeSummary.finalStatus === 'FAIL') {
      const se = parseStderr(probeSummary.stderr || '');
      if (!se || se.step === 'tools/list') { verdict = 'partially consistent'; reason = 'MCP initialize succeeded but the check did not complete cleanly: ' + ((probeSummary.findings || []).join(', ') || (se ? `${se.step} returned HTTP ${se.httpStatus}` : 'unknown')); }
      else { verdict = 'unverifiable'; reason = `endpoint did not complete MCP initialize (HTTP ${se.httpStatus})`; }
    } else if (probeSummary && probeSummary.finalStatus === 'NO_HANDSHAKE') {
      verdict = 'unverifiable';
      reason = probeSummary.failedStep
        ? (probeSummary.failedStep === 'initialize'
          ? `endpoint reachable but requires conditions we do not meet anonymously (initialize returned HTTP ${probeSummary.httpStatus})`
          : `MCP initialize succeeded but ${probeSummary.failedStep} returned HTTP ${probeSummary.httpStatus}`)
        : 'endpoint did not complete an MCP handshake within the timeout';
    } else { verdict = 'unverifiable'; reason = probeSummary ? 'endpoint did not complete an MCP handshake within the timeout' : 'no observation recorded'; }

    verdicts.push({
      name: a.name, chainId: a.chain, tokenId: a.tid, detailUrl: a.detailUrl,
      indexedEndpoint: a.mcpEndpoint, declaredMcpEndpoint: declaredEp,
      sameEndpointTokenCount: list.length,
      regUri: a.regUri, regAccessible: reg ? reg.regAccessible : null, regNote: reg ? reg.note || null : 'no record',
      probe: probeSummary, probedAt: probe ? probe.probedAt : null,
      inMcpRegistry: scanUrls.has(key),
      hostInMcpRegistry: scanHosts.has((() => { try { return new URL(a.mcpEndpoint).host.toLowerCase(); } catch { return null; } })()),
      verdict, reason,
    });
  }
  return verdicts;
}

// ---- 6) report HTML ----
const BADGE = { 'fully consistent': '#1a7f37', 'partially consistent': '#9a6700', 'conflict': '#cf222e', 'unverifiable': '#57606a', 'missing data': '#8250df' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const CHAINS = { 1: 'Ethereum', 56: 'BNB Chain', 196: 'OKX Chain', 8453: 'Base', 42161: 'Arbitrum', 42220: 'Celo', 4663: 'IOTA EVM', 45056: 'X Layer', 2741: 'Abstract', 5042: 'Marcus' };

function renderReport({ verdicts, week, prevTally, runDate }) {
  const tally = verdicts.reduce((m, v) => ((m[v.verdict] = (m[v.verdict] || 0) + 1), m), {});
  const passCount = verdicts.filter((v) => v.probe && v.probe.finalStatus === 'PASS').length;
  const vercelPass = verdicts.filter((v) => v.verdict === 'fully consistent' && /vercel\.app/.test(v.indexedEndpoint)).length;
  const regOk = verdicts.filter((v) => v.regAccessible).length;
  const regUnchanged = verdicts.filter((v) => v.regAccessible && v.regAccessible && v.probe && v.verdict === 'fully consistent').length;
  const multi = verdicts.filter((v) => v.sameEndpointTokenCount > 1).sort((a, b) => b.sameEndpointTokenCount - a.sameEndpointTokenCount);
  const topBatch = multi[0];
  const batchTokens = multi.reduce((s, v) => s + v.sameEndpointTokenCount, 0);
  const cross = { urlExact: verdicts.filter((v) => v.inMcpRegistry).length, host: verdicts.filter((v) => v.hostInMcpRegistry).length };
  const probedMin = verdicts.map((v) => v.probedAt).filter(Boolean).sort()[0] || runDate;
  const probedMax = verdicts.map((v) => v.probedAt).filter(Boolean).sort().pop() || runDate;
  const totalTokens = verdicts.reduce((s, v) => s + v.sameEndpointTokenCount, 0);
  const prevLine = prevTally
    ? `<p class="muted">Previous run ${esc(prevTally.date)}: ${prevTally.summary.uniqueEndpoints} endpoints — ${prevTally.summary.tally['fully consistent'] ?? 0} fully consistent, ${prevTally.summary.tally['partially consistent'] ?? 0} partially, ${prevTally.summary.tally['unverifiable'] ?? 0} unverifiable. Samples are re-drawn each week, so week-over-week movement is directional, not paired.</p>`
    : '';

  const rows = verdicts.map((v) => {
    const p = v.probe;
    let probeTxt = 'not probed';
    if (p) {
      if (p.finalStatus === 'PASS') probeTxt = `pass · ${p.toolCount ?? '?'} tools · proto ${esc(p.protocolVersion || '?')}`;
      else if (p.finalStatus === 'FAIL' || p.finalStatus === 'NO_HANDSHAKE') {
        const m = (p.stderr || '').match(/(initialize|tools\/list) returned HTTP (\d+)/);
        probeTxt = m ? `no clean handshake · ${m[1]} → HTTP ${m[2]}` : 'no clean handshake · timeout';
      } else probeTxt = 'no handshake';
    }
    return `<tr>
<td><b>${esc(v.name).slice(0, 44)}</b><br><span class="muted" style="font-size:.8rem">${CHAINS[v.chainId] || 'chain ' + v.chainId} · <a href="${esc(v.detailUrl)}">#${v.tokenId}</a>${v.sameEndpointTokenCount > 1 ? ` · ${v.sameEndpointTokenCount} tokens share this endpoint` : ''}</span></td>
<td style="max-width:230px;overflow-wrap:anywhere"><code>${esc(v.indexedEndpoint)}</code></td>
<td>${probeTxt}</td>
<td><span style="color:#fff;background:${BADGE[v.verdict]};border-radius:6px;padding:.1rem .5rem;font-size:.78rem;white-space:nowrap">${esc(v.verdict)}</span><br><span class="muted" style="font-size:.8rem">${esc(v.reason).slice(0, 130)}</span></td>
</tr>`;
  }).join('\n');

  const tallyRows = Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, n]) =>
    `<tr><td>${k}</td><td>${n}</td><td><div class="bar"><i style="width:${Math.round(n / verdicts.length * 100)}%;background:${BADGE[k]}"></i></div></td></tr>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent Evidence sample report — week of ${esc(week)}</title>
<meta name="description" content="Weekly re-verification of ERC-8004 registered agents against their declared off-chain MCP endpoints: ${verdicts.length} unique endpoints (${totalTokens} tokens sampled), ${tally['fully consistent'] ?? 0} fully consistent. Method, limitations, and timestamps included.">
<link rel="canonical" href="${SITE}/agent-evidence-sample.html">
<style>
:root{color-scheme:light dark}
*{box-sizing:border-box}
body{margin:0;font:17px/1.65 -apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a2e;background:#fafafc}
main{max-width:960px;margin:0 auto;padding:2.5rem 1.25rem 4rem}
h1{font-size:1.9rem;line-height:1.25;margin:.2rem 0 .5rem}
h2{font-size:1.25rem;margin:2.2rem 0 .6rem}
.muted{color:#57606a;font-size:.95rem}
a{color:#0969da;text-decoration:none}
a:hover{text-decoration:underline}
.kpi{display:flex;gap:1rem;flex-wrap:wrap;margin:1.4rem 0}
.kpi div{flex:1;min-width:150px;border:1px solid #d8dee4;border-radius:10px;padding:1rem 1.2rem}
.kpi b{display:block;font-size:1.9rem;line-height:1.2}
.bar{height:10px;border-radius:5px;background:#e2e5ea;overflow:hidden;margin:.35rem 0 1rem}
.bar i{display:block;height:100%}
code,pre{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.85em}
pre{background:#f6f8fa;border:1px solid #d8dee4;border-radius:8px;padding:.9rem;overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:.92rem;margin:1rem 0}
th,td{text-align:left;padding:.5rem .6rem;border-bottom:1px solid #d8dee4;vertical-align:top}
.card{border:1px solid #d8dee4;border-radius:10px;padding:1rem 1.3rem;margin:1.2rem 0}
.foot{margin-top:3rem;padding-top:1rem;border-top:1px solid #d8dee4;font-size:.85rem;color:#57606a}
@media(prefers-color-scheme:dark){body{color:#e6edf3;background:#0d1117}.muted,.foot,th{color:#8b949e}th,td{border-color:#30363d}pre,.card,.kpi div{background:#161b22;border-color:#30363d}.bar{background:#21262d}}
</style>
</head>
<body>
<main>
<h1>Agent Evidence — sample report, week of ${esc(week)}</h1>
<p class="muted">On-chain ERC-8004 registrations cross-checked against off-chain MCP endpoints, read-only. An <a href="https://github.com/xka0085-byte/mcpreflight">Agent Trust Infrastructure</a> project. Re-run weekly after the Trust Directory rescan. This run: ${esc(runDate.slice(0, 10))}.</p>
${prevLine}
<p>This report answers one question: does an on-chain ERC-8004 agent registration resolve to the MCP endpoint it claims, right now? This week we cross-checked ${totalTokens} tokens (${verdicts.length} unique endpoints) read-only: ${tally['fully consistent'] ?? 0} fully consistent, ${tally['partially consistent'] ?? 0} partially consistent, ${tally['unverifiable'] ?? 0} unverifiable. Anonymous handshake only, no tools invoked, every verdict carries a reason and a timestamp, and one open-source command re-runs any single check. This is evidence with limits, not a trust score.</p>

<div class="kpi">
<div><b>${totalTokens}</b>tokens sampled</div>
<div><b>${verdicts.length}</b>unique endpoints</div>
<div><b style="color:#1a7f37">${tally['fully consistent'] ?? 0}</b>fully consistent</div>
<div><b style="color:#9a6700">${tally['partially consistent'] ?? 0}</b>partially consistent</div>
<div><b style="color:#57606a">${tally['unverifiable'] ?? 0}</b>unverifiable</div>
</div>

<h2>Why this report exists</h2>
<p>The ERC-8004 registry lists hundreds of thousands of on-chain agents and leaves reputation aggregation to third parties. What is missing is the boring part: does a registered identity resolve to a working endpoint, does the registration file still say what the chain says, and can an integrator check that <em>before</em> wiring an agent in. Each week we redraw a small sample and publish exactly what we could and could not verify, with reasons. This is not a trust score.</p>
<p>Five verdicts, strongest to weakest: <b>fully consistent</b> (registration declares the endpoint, clean anonymous MCP handshake succeeds), <b>partially consistent</b> (handshake started but did not complete cleanly, or declaration not independently confirmable), <b>conflict</b> (declared and observed facts disagree), <b>unverifiable</b> (endpoint exists but verification failed, reason stated), <b>missing data</b> (nothing declared to check). A record not being found is never treated as fraud.</p>

<h2>Findings this week</h2>

<div class="card">
<b>1. Batch minting inflates the on-chain agent count.</b> ${totalTokens} sampled tokens resolve to ${verdicts.length} unique MCP endpoints.${topBatch ? ` The worst case this week: <code>${esc(topBatch.indexedEndpoint)}</code> claimed by ${topBatch.sameEndpointTokenCount} separate tokens.` : ''} ${multi.length ? `${multi.length} endpoints are claimed by more than one token, covering ${batchTokens} of the ${totalTokens} tokens.` : ''}
</div>

<div class="card">
<b>2. The 8004 ecosystem and the official MCP Registry do not overlap in our sample.</b> ${cross.urlExact} exact-URL matches and ${cross.host} host-level matches against the <a href="${SITE}/trust/">Trust Directory</a> (${endpointPhrase(root)}). A buyer checking one index gets no information about the other.
</div>

<div class="card">
<b>3. A passing handshake is a low bar, and mostly a free-tier bar.</b> ${passCount} of ${verdicts.length} endpoints completed a clean anonymous MCP handshake.${passCount ? ` ${vercelPass} of those ${passCount} run on <code>*.vercel.app</code> free-tier subdomains.` : ''} On-chain identity plus a working endpoint says nothing about who operates the deployment or whether behavior matches claims over time.
</div>

<div class="card">
<b>4. Registration files are mostly live — when you can reach them.</b> ${regOk} of ${verdicts.length} registration files were independently re-fetched. IPFS-hosted files behind rate-limited public gateways are marked unverifiable and rest on the index cache.
</div>

<h2>Results, all ${verdicts.length} unique endpoints</h2>
<table>
<tr><th>Agent (chain, token)</th><th>Declared MCP endpoint</th><th>Live check (mcpreflight schema, read-only)</th><th>Verdict</th></tr>
${rows}
</table>
<p class="muted">Verdict distribution:</p>
<table>
<tr><th>Verdict</th><th>Endpoints</th><th></th></tr>
${tallyRows}
</table>

<h2>Method</h2>
<ul>
<li><b>Sampling.</b> Tokens pulled from the 8004scan explorer API, biased toward agents declaring MCP support plus active and top-scored cohorts, deduplicated to ${verdicts.length} unique MCP endpoints. Convenience sample, not random. Samples are re-drawn weekly.</li>
<li><b>Declaration side.</b> On-chain registration metadata, the registration file URI, and the declared MCP service entry. Registration files independently re-fetched and compared to the index cache.</li>
<li><b>Observation side.</b> Exactly two JSON-RPC requests per endpoint: <code>initialize</code> and <code>tools/list</code> via <code>mcpreflight schema</code> (MIT, zero dependencies). No tool invoked, no authentication attempted, no payment signed.</li>
<li><b>Cross-match.</b> All endpoints matched against the official MCP Registry scan by exact URL and host.</li>
<li><b>Reproduce any row:</b></li>
</ul>
<pre>npx @eidonze/mcpreflight schema &lt;endpoint-url&gt;</pre>

<h2>Limitations (read this before quoting us)</h2>
<ul>
<li><b>Anonymous checks only.</b> 401 or 402 endpoints are unverifiable, not broken. HTTP 402 means x402 is working as designed.</li>
<li><b>One point in time.</b> Probes ran ${esc(probedMin.replace('T', ' ').slice(0, 16))} to ${esc(probedMax.replace('T', ' ').slice(0, 16))} UTC on ${esc(runDate.slice(0, 10))}.</li>
<li><b>No behavior beyond the handshake.</b> No tool was invoked. Consistency means the declared endpoint speaks MCP and lists tools, nothing stronger.</li>
<li><b>Index cache dependency.</b> Registration content for unreachable files rests on 8004scan's cache and is marked accordingly.</li>
<li><b>Ownership not resolved.</b> We do not verify that the owner address controls the endpoint domain, so "fully consistent" does not mean "operator verified".</li>
<li><b>Small, biased sample.</b> ${totalTokens} tokens is a sliver of the registry. Batch-minting numbers are arithmetic on this sample, not registry-wide estimates.</li>
<li><b>0 conflicts or 0 missing-data rows</b> would be a property of the sample, not evidence that they do not exist.</li>
</ul>

<h2>What we would build next</h2>
<p>This page is the v0 of a weekly loop: sample, verify, publish, diff an agent's declared self against its observed behavior over time. If you maintain an agent directory, a marketplace, or a workflow that consumes 8004 agents and pre-integration evidence would change a decision you make, we would like to hear from you — <a href="https://github.com/xka0085-byte/mcpreflight/issues">open an issue</a>.</p>

<div class="foot">
Produced by <a href="https://github.com/xka0085-byte/mcpreflight">mcpreflight</a> (Agent Trust Infrastructure) — read-only checks for MCP and x402 endpoints. MIT licensed, zero dependencies. Data sources: 8004scan explorer API, official MCP Registry via the Trust Directory. Collected ${esc(probedMin.slice(0, 10))}. Verdicts describe verification outcomes, not agent trustworthiness. Corrections welcome via issues.
</div>
</main>
</body>
</html>`;
}

// ---- main ----
(async () => {
  const runDate = new Date().toISOString();
  const week = runDate.slice(0, 10);
  console.error(`agent-evidence refresh ${runDate}`);

  const cands = await pullCandidates();
  console.error('candidates:', cands.length);
  const agents = await pullDetails(cands);
  console.error('agents with unique endpoints:', agents.length);
  if (agents.length < 15) { console.error('sample too small, aborting without touching the report'); process.exit(1); }

  const endpoints = [...new Set(agents.map((a) => a.mcpEndpoint.replace(/\/+$/, '').toLowerCase()))];
  const probes = await probeAll(endpoints);
  const regs = await checkRegs(agents);

  const scan = JSON.parse(fs.readFileSync(path.join(root, 'trust-data', 'scan.json'), 'utf8'));
  const verdicts = buildVerdicts(agents, probes, regs, scan);
  const tally = verdicts.reduce((m, v) => ((m[v.verdict] = (m[v.verdict] || 0) + 1), m), {});
  const summary = {
    date: week,
    generatedAt: runDate,
    sampleTokens: verdicts.reduce((s, v) => s + v.sameEndpointTokenCount, 0),
    uniqueEndpoints: verdicts.length,
    tally,
    tool: 'mcpreflight schema, read-only initialize + tools/list',
  };

  // history: keep weekly snapshots, use the most recent previous one for the report
  const historyFiles = fs.readdirSync(dataDir).filter((f) => /^verdicts-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  let prevTally = null;
  if (historyFiles.length) {
    try { prevTally = JSON.parse(fs.readFileSync(path.join(dataDir, historyFiles[historyFiles.length - 1]), 'utf8')); } catch {}
  }

  const report = renderReport({ verdicts, week, prevTally, runDate });
  fs.writeFileSync(path.join(root, 'docs', 'agent-evidence-sample.html'), report);
  fs.writeFileSync(path.join(dataDir, `verdicts-${week}.json`), JSON.stringify({ summary, verdicts }, null, 1));
  fs.writeFileSync(path.join(dataDir, 'verdicts-latest.json'), JSON.stringify({ summary, verdicts }, null, 1));
  console.log(JSON.stringify(summary, null, 1));
})();

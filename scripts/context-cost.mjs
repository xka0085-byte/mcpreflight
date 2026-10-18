// Context cost ranking: how many bytes and estimated tokens a client receives on tools/list.
// This measures the thing consumers complain about most, the context a server eats.
// Read-only: initialize plus tools/list, no tool calls, no auth, no payment.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const scanPath = path.join(root, 'trust-data', 'scan.json');
const outPath = path.join(root, 'trust-data', 'context-cost.json');

const TIMEOUT = 12000;
const CONCURRENCY = Number(process.env.CC_CONCURRENCY || 12);
const LIMIT = Number(process.env.CC_LIMIT || 0);

const scan = JSON.parse(fs.readFileSync(scanPath, 'utf8'));
let targets = scan.results.filter((r) => (r.finalStatus || '').toUpperCase() === 'PASS');
if (LIMIT > 0) targets = targets.slice(0, LIMIT);

async function probe(target) {
  try {
    const init = await fetch(target, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT),
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-03-26' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'mcpreflight', version: '0.4.0' } } }),
    });
    const initText = await init.text().catch(() => '');
    if (!init.ok) return { ok: false, reason: `initialize ${init.status}` };
    let protocolVersion = null;
    try { protocolVersion = JSON.parse(initText)?.result?.protocolVersion ?? null; } catch {}
    const list = await fetch(target, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT),
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': protocolVersion ?? '2025-03-26' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    });
    const text = await list.text().catch(() => '');
    if (!list.ok) return { ok: false, reason: `tools/list ${list.status}` };
    let tools = null;
    try { tools = JSON.parse(text)?.result?.tools ?? null; } catch {}
    if (!Array.isArray(tools)) return { ok: false, reason: 'tools/list not parseable' };
    const bytes = Buffer.byteLength(text, 'utf8');
    const largest = tools.length ? tools.reduce((a, b) => (JSON.stringify(a ?? {}).length >= JSON.stringify(b ?? {}).length ? a : b)) : null;
    return {
      ok: true, toolCount: tools.length, toolsBytes: bytes, tokens: Math.round(bytes / 4),
      largestToolBytes: largest ? Buffer.byteLength(JSON.stringify(largest), 'utf8') : 0,
      largestToolName: largest?.name ?? null,
      bytesPerTool: tools.length ? Math.round(bytes / tools.length) : 0,
    };
  } catch (e) { return { ok: false, reason: String(e?.message || e).slice(0, 60) }; }
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

const probed = await pool(targets, CONCURRENCY, (t) => probe(t.url));

const rows = [];
targets.forEach((t, i) => {
  const r = probed[i];
  if (!r?.ok) return;
  rows.push({ name: t.name, url: t.url, slug: t.slug, toolCount: r.toolCount, toolsBytes: r.toolsBytes, tokens: r.tokens, bytesPerTool: r.bytesPerTool, largestToolName: r.largestToolName, largestToolBytes: r.largestToolBytes });
});
rows.sort((a, b) => b.tokens - a.tokens);

const failed = probed.filter((p) => !p?.ok).length;
const tokens = rows.map((r) => r.tokens).sort((a, b) => a - b);
const median = tokens.length ? tokens[Math.floor(tokens.length / 2)] : 0;
const over10k = rows.filter((r) => r.tokens > 10000).length;
const over20k = rows.filter((r) => r.tokens > 20000).length;

const payload = {
  generatedAt: new Date().toISOString(),
  method: 'read-only initialize + tools/list; tokens estimated as payload bytes / 4, not a model tokenizer run',
  measured: rows.length, failed,
  summary: { medianTokens: median, minTokens: tokens[0] ?? null, maxTokens: tokens[tokens.length - 1] ?? null, over10k, over20k },
  rows,
};
fs.writeFileSync(outPath, JSON.stringify(payload, null, 1) + '\n');

console.log(`context cost measured on ${rows.length} endpoints (${failed} unreachable this run)`);
console.log(`median ${median} tokens | range ${tokens[0]} to ${tokens[tokens.length - 1]} | over 10k: ${over10k} | over 20k: ${over20k}`);
console.log('\nheaviest 12:');
for (const r of rows.slice(0, 12)) console.log(`  ${String(r.tokens).padStart(7)} tok  ${String(r.toolCount).padStart(4)} tools  ${String(r.bytesPerTool).padStart(6)} B/tool  ${r.name}`);
console.log('\nlightest 6:');
for (const r of rows.slice(-6)) console.log(`  ${String(r.tokens).padStart(7)} tok  ${String(r.toolCount).padStart(4)} tools  ${String(r.bytesPerTool).padStart(6)} B/tool  ${r.name}`);

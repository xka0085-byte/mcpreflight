// Trust Directory scanner: pull remote servers from official MCP Registry,
// run mcpdoctor schema (read-only) against each, save reports.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = 'C:\\Users\\eqzyz\\agenttoll-master\\mcpdoctor';
const cli = path.join(root, 'bin', 'mcpdoctor.mjs');
const outDir = path.join(root, 'trust-data');
fs.mkdirSync(outDir, { recursive: true });

const REG = 'https://registry.modelcontextprotocol.io/v0/servers';
const WANT = 220;
const CONCURRENCY = 12;

// ---- 1) pull registry ----
async function pullServers() {
  const seen = new Map();
  let cursor = null;
  for (let page = 0; page < 60; page++) {
    const url = REG + '?limit=100' + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`registry HTTP ${res.status}`);
    const body = await res.json();
    for (const entry of body.servers ?? []) {
      const s = entry.server ?? {};
      const meta = entry._meta?.['io.modelcontextprotocol.registry/official'] ?? {};
      if (meta.status !== 'active') continue;
      if (meta.isLatest !== true) continue;
      const remote = (s.remotes ?? []).find((r) => typeof r.url === 'string' && r.url.startsWith('http'));
      if (!remote) continue; // stdio-only: not scannable
      if (!seen.has(s.name)) seen.set(s.name, { name: s.name, title: s.title ?? s.name, description: s.description ?? '', url: remote.url, version: s.version ?? null });
      if (seen.size >= WANT) break;
    }
    cursor = body.metadata?.nextCursor;
    if (!cursor || seen.size >= WANT) break;
  }
  return [...seen.values()];
}

// ---- 2) scan with concurrency ----
function runSchema(url) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, 'schema', url, '--format=json'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    const timer = setTimeout(() => { try { child.kill(); } catch {} }, 90000);
    child.on('close', () => {
      clearTimeout(timer);
      try { resolve({ report: JSON.parse(stdout), stderr }); }
      catch { resolve({ report: null, stderr }); }
    });
  });
}

const servers = await pullServers();
console.error(`registry servers pulled: ${servers.length}`);
fs.writeFileSync(path.join(outDir, 'servers.json'), JSON.stringify(servers, null, 2));

const results = [];
let index = 0;
async function worker() {
  while (index < servers.length) {
    const s = servers[index++];
    const { report, stderr } = await runSchema(s.url);
    const rec = {
      name: s.name, title: s.title, description: s.description, version: s.version, url: s.url,
      finalStatus: report?.finalStatus ?? 'UNKNOWN',
      protocolVersion: report?.mcp?.protocolVersion ?? null,
      serverInfo: report?.mcp?.serverInfo ?? null,
      toolCount: report?.mcp?.toolCount ?? null,
      findings: report?.findings ?? [{ severity: 'UNKNOWN', code: 'NO_RESPONSE', message: 'Endpoint did not complete MCP initialize + tools/list within timeout' }],
      checkedAt: report?.checkedAt ?? new Date().toISOString(),
    };
    results.push(rec);
    console.error(`[${results.length}/${servers.length}] ${rec.finalStatus} ${s.name} ${s.url}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
results.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(path.join(outDir, 'scan.json'), JSON.stringify({ scannedAt: new Date().toISOString(), tool: 'mcpdoctor', results }, null, 2));
const tally = results.reduce((m, r) => ((m[r.finalStatus] = (m[r.finalStatus] ?? 0) + 1), m), {});
console.error('done', JSON.stringify(tally));

// Full Trust Directory scanner: all remote servers in the official MCP Registry.
// Checkpointed (resumes from trust-data/scan-full.jsonl), path-agnostic, CI-safe.
// Read-only: sends only MCP initialize + tools/list. No tool calls, no payments.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'bin', 'mcpdoctor.mjs');
const outDir = path.join(root, 'trust-data');
fs.mkdirSync(outDir, { recursive: true });

const REG = 'https://registry.modelcontextprotocol.io/v0/servers';
const CONCURRENCY = Number(process.env.SCAN_CONCURRENCY ?? 24);
const TASK_TIMEOUT = Number(process.env.SCAN_TASK_TIMEOUT_MS ?? 35000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pullServers() {
  const seen = new Map();
  let cursor = null;
  for (let page = 0; page < 300; page++) {
    const u = REG + '?limit=100' + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    let body = null;
    for (let a = 0; a < 6; a++) {
      try {
        const res = await fetch(u, { signal: AbortSignal.timeout(30000) });
        if (res.ok) { body = await res.json(); break; }
        if (res.status === 429 || res.status >= 500) { await sleep(4000 * (a + 1)); continue; }
      } catch {}
      await sleep(3000 * (a + 1));
    }
    if (!body) throw new Error('registry fetch failed at page ' + page);
    for (const entry of body.servers ?? []) {
      const s = entry.server ?? {};
      const meta = entry._meta?.['io.modelcontextprotocol.registry/official'] ?? {};
      if (meta.status !== 'active' || meta.isLatest !== true) continue;
      const remote = (s.remotes ?? []).find((r) => typeof r.url === 'string' && r.url.startsWith('http'));
      if (!remote) continue;
      if (!seen.has(s.name)) seen.set(s.name, { name: s.name, title: s.title ?? s.name, description: s.description ?? '', url: remote.url, version: s.version ?? null });
    }
    cursor = body.metadata?.nextCursor;
    if (!cursor) break;
  }
  return [...seen.values()];
}

function runSchema(ep) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, 'schema', ep, '--format=json'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', (c) => { stdout += c; });
    const timer = setTimeout(() => { try { child.kill(); } catch {} }, TASK_TIMEOUT);
    child.on('close', () => {
      clearTimeout(timer);
      try { resolve(JSON.parse(stdout)); } catch { resolve(null); }
    });
  });
}

const serversPath = path.join(outDir, 'servers-full.json');
let servers;
if (fs.existsSync(serversPath)) {
  servers = JSON.parse(fs.readFileSync(serversPath, 'utf8'));
  console.error(`loaded cached server list: ${servers.length}`);
} else {
  servers = await pullServers();
  fs.writeFileSync(serversPath, JSON.stringify(servers));
  console.error(`TOTAL remote servers: ${servers.length}`);
}

const ckptPath = path.join(outDir, 'scan-full.jsonl');
const done = new Map();
if (fs.existsSync(ckptPath)) {
  for (const line of fs.readFileSync(ckptPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); done.set(r.name, r); } catch {}
  }
}
console.error(`already done: ${done.size}`);

let index = 0, n = done.size;
const log = fs.createWriteStream(ckptPath, { flags: 'a' });
async function worker() {
  while (index < servers.length) {
    const s = servers[index++];
    if (done.has(s.name)) continue;
    const report = await runSchema(s.url);
    const rec = {
      name: s.name, title: s.title, description: s.description, version: s.version, url: s.url,
      finalStatus: report?.finalStatus ?? 'UNKNOWN',
      protocolVersion: report?.mcp?.protocolVersion ?? null,
      serverInfo: report?.mcp?.serverInfo ?? null,
      toolCount: report?.mcp?.toolCount ?? null,
      findings: report?.findings ?? [{ severity: 'UNKNOWN', code: 'NO_RESPONSE', message: 'Endpoint did not complete MCP initialize + tools/list within timeout' }],
      checkedAt: report?.checkedAt ?? new Date().toISOString(),
    };
    done.set(s.name, rec);
    log.write(JSON.stringify(rec) + '\n');
    n++;
    if (n % 100 === 0) console.error(`[${n}/${servers.length}]`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
log.end();
console.error('SCAN COMPLETE', done.size);

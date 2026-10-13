// mcpdoctor-mcp: run mcpdoctor as an MCP server (stdio, zero dependencies).
// Exposes two tools so AI clients can check endpoints without leaving chat:
//   schema_check(url)  - read-only MCP handshake + tools/list validation
//   x402_inspect(url)  - read-only 402 challenge validation, never pays
// Protocol: newline-delimited JSON-RPC 2.0 per the MCP stdio transport spec.
import { spawn } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';
import readline from 'node:readline';

const cliPath = path.join(path.dirname(url.fileURLToPath(import.meta.url)), 'mcpdoctor.mjs');

const TOOLS = [
  {
    name: 'schema_check',
    description: 'Run a read-only MCP preflight check against a server URL: initialize handshake, tools/list, and tool JSON schema validation. Never calls tools or reads data. Returns PASS/FAIL/UNKNOWN with detailed findings.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'MCP server endpoint URL, e.g. https://example.com/mcp' },
      },
      required: ['url'],
    },
  },
  {
    name: 'x402_inspect',
    description: 'Inspect an x402 payment endpoint without paying: reads the HTTP 402 challenge, validates the payment document shape, accepts[] entries and discovery manifests. Never signs or settles.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'x402 resource URL, e.g. https://api.example/paid' },
        method: { type: 'string', enum: ['GET', 'POST'], description: 'HTTP method to probe with, default GET' },
      },
      required: ['url'],
    },
  },
];

function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args, '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    const t = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, 45000);
    child.on('close', (code) => {
      clearTimeout(t);
      resolve({ code, out: out.trim(), err: err.trim() });
    });
  });
}

async function callTool(name, args) {
  if (name === 'schema_check') {
    const r = await runCli(['schema', String(args.url)]);
    const text = r.out || r.err || `exit ${r.code}`;
    return { content: [{ type: 'text', text }], isError: r.code === 1 ? false : r.code >= 2 };
  }
  if (name === 'x402_inspect') {
    const m = ['GET', 'POST'].includes(String(args.method ?? '').toUpperCase()) ? `--method=${String(args.method).toUpperCase()}` : '';
    const r = await runCli(['inspect', String(args.url), m].filter(Boolean));
    const text = r.out || r.err || `exit ${r.code}`;
    return { content: [{ type: 'text', text }], isError: r.code === 1 ? false : r.code >= 2 };
  }
  throw new Error(`unknown tool: ${name}`);
}

const serverInfo = { name: 'mcpdoctor', version: '0.1.8' };
const write = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;
  const respond = (result) => id !== undefined && write({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => id !== undefined && write({ jsonrpc: '2.0', id, error: { code, message } });

  switch (method) {
    case 'initialize':
      respond({ protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo });
      break;
    case 'notifications/initialized':
    case 'notifications/cancelled':
      break;
    case 'ping':
      respond({});
      break;
    case 'tools/list':
      respond({ tools: TOOLS });
      break;
    case 'tools/call': {
      try {
        const result = await callTool(String(params?.name), params?.arguments ?? {});
        respond(result);
      } catch (e) {
        fail(-32000, String(e.message ?? e));
      }
      break;
    }
    default:
      fail(-32601, `method not found: ${method}`);
  }
});

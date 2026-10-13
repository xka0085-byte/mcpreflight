#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin', 'mcpreflight.mjs');
const server = createServer(async (request, response) => {
  if (request.url === '/good') {
    response.writeHead(402, { 'content-type': 'application/json', 'payment-required': JSON.stringify({ x402Version: 2, accepts: [{ scheme: 'exact', network: 'eip155:8453', asset: 'USDC', amount: '10000', payTo: '0x1234567890123456789012345678901234567890' }] }) });
    response.end(JSON.stringify({ x402Version: 2, accepts: [{ scheme: 'exact', network: 'eip155:8453', asset: 'USDC', amount: '10000', payTo: '0x1234567890123456789012345678901234567890' }] }));
    return;
  }
  // regression (found against production ReceiptRail): a hint header WITHOUT accepts[]
  // must not shadow the real payment document in the body
  if (request.url === '/header-hint') {
    response.writeHead(402, { 'content-type': 'application/json', 'x-payment-required': JSON.stringify({ vendor: 'VendorHintNoAccepts', amount: '1000', decimals: 6 }) });
    response.end(JSON.stringify({ x402Version: 2, resource: { url: 'x', description: 'd', mimeType: 'application/json' }, accepts: [{ scheme: 'exact', network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1', amount: '1000', asset: 'MINT', payTo: 'PayToAddr' }] }));
    return;
  }
  if (request.url === '/mcp') {
    let incoming = ''; for await (const chunk of request) incoming += chunk;
    const rpc = JSON.parse(incoming || '{}');
    if (rpc.method === 'initialize') {
      response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: { protocolVersion: '2025-06-18', serverInfo: { name: 'fixture', version: '1' }, capabilities: {} } })); return;
    }
    response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: { tools: [{ name: 'hello', description: 'Returns a greeting.', inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Name.' } }, required: ['name'] } }] } })); return;
  }
  // regression (found against production DeepWiki): servers may answer POST with
  // an SSE stream (text/event-stream) even for plain JSON-RPC calls
  if (request.url === '/mcp-sse') {
    let incoming = ''; for await (const chunk of request) incoming += chunk;
    const rpc = JSON.parse(incoming || '{}');
    const payload = rpc.method === 'initialize'
      ? { jsonrpc: '2.0', id: rpc.id, result: { protocolVersion: '2025-06-18', serverInfo: { name: 'sse-fixture', version: '1' }, capabilities: {} } }
      : { jsonrpc: '2.0', id: rpc.id, result: { tools: [{ name: 'hello', description: 'Returns a greeting.', inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Name.' } }, required: ['name'] } }] } };
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.end(`event: message\ndata: ${JSON.stringify(payload)}\n\n`);
    return;
  }
  // regression (our original production bug): body validation must not shadow the 402
  if (request.url === '/bad-400') {
    response.writeHead(400, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'missing body param' }));
    return;
  }
  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'not found' }));
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const port = server.address().port;

function run(url, ...args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, 'inspect', url, '--format=json', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}
function runSchema(url) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, 'schema', url, '--format=json'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

try {
  const good = await run(`http://127.0.0.1:${port}/good`);
  assert.equal(good.code, 0, good.stderr);
  assert.equal(JSON.parse(good.stdout).finalStatus, 'PASS');
  const bad = await run(`http://127.0.0.1:${port}/missing`);
  assert.equal(bad.code, 1, bad.stderr);
  assert.equal(JSON.parse(bad.stdout).finalStatus, 'FAIL');
  const hint = await run(`http://127.0.0.1:${port}/header-hint`, '--method=POST');
  assert.equal(hint.code, 0, hint.stderr);
  const hintReport = JSON.parse(hint.stdout);
  assert.equal(hintReport.finalStatus, 'PASS', JSON.stringify(hintReport.findings));
  assert.equal(hintReport.x402.accepts.length, 1, 'body accepts[] must win over accept-less header hints');
  const bad400 = await run(`http://127.0.0.1:${port}/bad-400`, '--method=POST');
  assert.equal(bad400.code, 1, bad400.stderr);
  const bad400Report = JSON.parse(bad400.stdout);
  assert.equal(bad400Report.finalStatus, 'FAIL');
  assert.ok(bad400Report.findings.some((f) => f.code === 'NO_402'), 'must flag 400-instead-of-402');
  const schema = await runSchema(`http://127.0.0.1:${port}/mcp`);
  assert.equal(schema.code, 0, schema.stderr);
  const schemaReport = JSON.parse(schema.stdout);
  assert.equal(schemaReport.finalStatus, 'PASS', JSON.stringify(schemaReport.findings));
  assert.equal(schemaReport.mcp.toolCount, 1);
  const sse = await runSchema(`http://127.0.0.1:${port}/mcp-sse`);
  assert.equal(sse.code, 0, sse.stderr);
  const sseReport = JSON.parse(sse.stdout);
  assert.equal(sseReport.finalStatus, 'PASS', JSON.stringify(sseReport.findings));
  assert.equal(sseReport.mcp.toolCount, 1, 'SSE-wrapped JSON-RPC must be parsed');
  const help = await new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, '--help'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; child.stdout.on('data', (chunk) => { stdout += chunk; }); child.on('close', (code) => resolve({ code, stdout }));
  });
  assert.equal(help.code, 0);
  assert.match(help.stdout, /mcpreflight/);
  console.log('mcpreflight smoke tests passed');
} finally {
  server.close();
}

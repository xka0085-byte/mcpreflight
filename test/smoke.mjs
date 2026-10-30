#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'bin', 'mcpreflight.mjs');
let throttleCount = 0;
const okTools = (id) => ({ jsonrpc: '2.0', id, result: { tools: [{ name: 'hello', description: 'Returns a greeting.', inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Name.' } }, required: ['name'] } }] } });
const okInit = (id, name) => ({ jsonrpc: '2.0', id, result: { protocolVersion: '2025-06-18', serverInfo: { name, version: '1' }, capabilities: {} } });
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
  // conformance: stateful streamable HTTP. initialize returns Mcp-Session-Id and
  // every later request must echo it, otherwise a healthy server looks dead.
  if (request.url === '/mcp-session') {
    let incoming = ''; for await (const chunk of request) incoming += chunk;
    const rpc = JSON.parse(incoming || '{}');
    if (rpc.method === 'initialize') {
      response.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 'sess-fixture-1' });
      response.end(JSON.stringify(okInit(rpc.id, 'session-fixture')));
      return;
    }
    if (request.headers['mcp-session-id'] !== 'sess-fixture-1') {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, error: { code: -32000, message: 'Mcp-Session-Id required' } }));
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(okTools(rpc.id)));
    return;
  }
  // conformance: an unauthenticated 401 is a gate, not a failure
  if (request.url === '/mcp-auth') {
    response.writeHead(401, { 'content-type': 'application/json', 'www-authenticate': 'Bearer realm="fixture"' });
    response.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }
  // conformance: 308 on the initialize POST must be followed, not reported as dead
  if (request.url === '/mcp-redirect') {
    response.writeHead(308, { location: '/mcp' });
    response.end();
    return;
  }
  // conformance: one retry on 429, so throttling is not reported as NO_RESPONSE
  if (request.url === '/mcp-429') {
    if (throttleCount++ < 1) {
      response.writeHead(429, { 'content-type': 'application/json', 'retry-after': '1' });
      response.end(JSON.stringify({ error: 'throttled' }));
      return;
    }
    let incoming = ''; for await (const chunk of request) incoming += chunk;
    const rpc = JSON.parse(incoming || '{}');
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(rpc.method === 'initialize' ? okInit(rpc.id, 'throttle-fixture') : okTools(rpc.id)));
    return;
  }
  // conformance: malformed tool schema must be a deterministic FAIL, not a silent pass
  if (request.url === '/mcp-bad-schema') {
    let incoming = ''; for await (const chunk of request) incoming += chunk;
    const rpc = JSON.parse(incoming || '{}');
    const payload = rpc.method === 'initialize'
      ? okInit(rpc.id, 'bad-schema-fixture')
      : { jsonrpc: '2.0', id: rpc.id, result: { tools: [{ name: 'broken', description: 'Declares a required field it never defines.', inputSchema: { type: 'object', properties: { a: { type: 'string', description: 'A.' } }, required: ['a', 'b'] } }] } };
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(payload));
    return;
  }
  // conformance: a tools/list body over the old 1 MB cap is a healthy server, not a failure
  if (request.url === '/mcp-big') {
    let incoming = ''; for await (const chunk of request) incoming += chunk;
    const rpc = JSON.parse(incoming || '{}');
    const payload = rpc.method === 'initialize'
      ? okInit(rpc.id, 'big-payload-fixture')
      : { jsonrpc: '2.0', id: rpc.id, result: { tools: [{ name: 'big', description: 'x'.repeat(1_500_000), inputSchema: { type: 'object', properties: {} } }] } };
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(payload));
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
  // conformance: the five cases that regressions in 0.5.0 broke
  const session = await runSchema(`http://127.0.0.1:${port}/mcp-session`);
  assert.equal(session.code, 0, session.stderr);
  assert.equal(JSON.parse(session.stdout).finalStatus, 'PASS', 'Mcp-Session-Id must be echoed on tools/list');
  const auth = await runSchema(`http://127.0.0.1:${port}/mcp-auth`);
  assert.equal(auth.code, 0, `AUTH_GATED must exit 0: ${auth.stderr}`);
  assert.equal(JSON.parse(auth.stdout).finalStatus, 'AUTH_GATED', '401 is a gate, not a failure');
  const redirect = await runSchema(`http://127.0.0.1:${port}/mcp-redirect`);
  assert.equal(redirect.code, 0, redirect.stderr);
  assert.equal(JSON.parse(redirect.stdout).finalStatus, 'PASS', '308 on initialize POST must be followed');
  const throttled = await runSchema(`http://127.0.0.1:${port}/mcp-429`);
  assert.equal(throttled.code, 0, throttled.stderr);
  assert.equal(JSON.parse(throttled.stdout).finalStatus, 'PASS', '429 must be retried once, not reported as NO_RESPONSE');
  const badSchema = await runSchema(`http://127.0.0.1:${port}/mcp-bad-schema`);
  assert.equal(badSchema.code, 1, badSchema.stderr);
  const badSchemaReport = JSON.parse(badSchema.stdout);
  assert.equal(badSchemaReport.finalStatus, 'FAIL');
  assert.ok(badSchemaReport.findings.some((f) => f.code === 'REQUIRED_PROPERTY_UNDEFINED'), 'must flag a required-but-undeclared property');
  const big = await runSchema(`http://127.0.0.1:${port}/mcp-big`);
  assert.equal(big.code, 0, big.stderr);
  const bigReport = JSON.parse(big.stdout);
  assert.equal(bigReport.finalStatus, 'PASS', 'a 1.5 MB tools/list body must not be truncated at 1 MB');
  assert.equal(bigReport.mcp.toolCount, 1);
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

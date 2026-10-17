#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const MAX_BODY = 1024 * 1024;
const TIMEOUT = 10_000;
const VERSION = '0.4.0';
const DEFAULT_BASELINE = 'mcpreflight-baseline.json';

const help = `mcpreflight ${VERSION}

Read-only MCP/x402 endpoint diagnostics.

Usage:
  mcpreflight inspect <url> [--method=GET|POST] [--format=json|markdown]
  mcpreflight schema <url> [--format=json|markdown]
  mcpreflight baseline <url> [--method=GET|POST] [--baseline=FILE] [--json]
  mcpreflight drift <url> [--method=GET|POST] [--baseline=FILE] [--json]
  mcpreflight --help

baseline records the x402 challenge shape your endpoint serves right now. drift re-checks
the same endpoint and exits 1 when that shape has changed, so CI catches a broken payment
challenge before your buyers do.

This MVP never signs, pays, retries payment, or accepts a private key.`;

function die(message, code = 3) {
  console.error(`Error: ${message}\n\n${help}`);
  process.exitCode = code;
}

function redact(value) {
  return typeof value === 'string'
    ? value.replace(/(authorization|signature|token|api[_-]?key)\s*[:=]\s*[^,\s}]+/gi, '$1: [REDACTED]').replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
    : value;
}

async function readBody(response) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) { await reader.cancel(); throw new Error(`response body exceeds ${MAX_BODY} bytes`); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function headersOf(headers) {
  return Object.fromEntries([...headers].map(([key, value]) => [key.toLowerCase(), redact(value)]));
}

function json(text) { try { return JSON.parse(text); } catch { return null; } }
function jsonrpc(text) {
  const direct = json(text);
  if (direct && (direct.result !== undefined || direct.error !== undefined)) return direct;
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const obj = json(line.slice(5).trim());
    if (obj && (obj.result !== undefined || obj.error !== undefined)) return obj;
  }
  return direct;
}

function findPaymentDocument(headers, body) {
  const candidates = [headers['payment-required'], headers['x-payment-required'], headers['www-authenticate'], body].filter(Boolean);
  const parsed = [];
  for (const candidate of candidates) {
    const direct = json(candidate);
    if (direct && typeof direct === 'object') { parsed.push(direct); continue; }
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const nested = json(candidate.slice(start, end + 1));
      if (nested) parsed.push(nested);
    }
  }
  if (!parsed.length) return null;
  // headers like x-payment-required may carry vendor hints without accepts[] —
  // prefer the candidate that actually contains payment requirements
  return parsed.find((d) => requirements(d).length > 0) ?? parsed[0];
}

function requirements(document) {
  if (!document || typeof document !== 'object') return [];
  // x402 v2 canonical shape: { x402: { version: 2, accepts: [...] } }
  if (document.x402 && Array.isArray(document.x402.accepts)) return document.x402.accepts;
  if (Array.isArray(document.accepts)) return document.accepts;
  if (Array.isArray(document.paymentRequirements?.accepts)) return document.paymentRequirements.accepts;
  if (document.paymentRequirements && typeof document.paymentRequirements === 'object') return [document.paymentRequirements];
  if (document.challenge && typeof document.challenge === 'object') return [document.challenge];
  return [];
}

function normalize(item) {
  return {
    scheme: item.scheme ?? null,
    network: item.network ?? item.chain ?? null,
    asset: item.asset ?? item.mint ?? null,
    amount: item.amount ?? item.maxAmountRequired ?? null,
    payTo: item.payTo ?? item.vendor ?? item.recipient ?? null,
    maxTimeoutSeconds: item.maxTimeoutSeconds ?? null,
  };
}

async function probe(url, method = 'GET') {
  const started = Date.now();
  const init = { method, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT), headers: { accept: 'application/json, application/problem+json, text/plain' } };
  if (method === 'POST') { init.headers['content-type'] = 'application/json'; init.body = '{}'; }
  const response = await fetch(url, init);
  const body = await readBody(response);
  const headers = headersOf(response.headers);
  return { response, body, headers, elapsedMs: Date.now() - started };
}

async function metadata(base, path) {
  try {
    const result = await probe(new URL(path, base).toString(), 'GET');
    return { path, status: result.response.status, reachable: result.response.ok, bodySha256: createHash('sha256').update(result.body).digest('hex'), bodyBytes: Buffer.byteLength(result.body) };
  } catch (error) { return { path, status: null, reachable: false, error: redact(error.message) }; }
}

function makeReport(url, method, result) {
  const { response, body, headers, elapsedMs } = result;
  const document = findPaymentDocument(headers, body);
  const accepts = requirements(document).map(normalize);
  const findings = [];
  if (response.status !== 402) findings.push({ status: 'FAIL', code: 'NO_402', message: `Expected HTTP 402, received ${response.status}` });
  if (!document) findings.push({ status: 'FAIL', code: 'NO_PAYMENT_DOCUMENT', message: 'No parseable payment document in known headers or body' });
  if (document && !accepts.length) findings.push({ status: 'FAIL', code: 'NO_ACCEPTS', message: 'No recognizable payment requirement found' });
  for (const [index, item] of accepts.entries()) for (const field of ['scheme', 'network', 'asset', 'amount', 'payTo']) if (!item[field]) findings.push({ status: 'FAIL', code: `MISSING_${field.toUpperCase()}`, message: `accepts[${index}] is missing ${field}` });
  const digest = createHash('sha256').update(body).digest('hex');
  return { reportVersion: 1, inspectorVersion: VERSION, mode: 'read-only', checkedAt: new Date().toISOString(), endpoint: url, method, finalStatus: response.status === 402 && document && accepts.length && !findings.length ? 'PASS' : 'FAIL', http: { status: response.status, elapsedMs, contentType: headers['content-type'] ?? null, bodyBytes: Buffer.byteLength(body), bodySha256: digest }, headers: { paymentRequired: Boolean(headers['payment-required'] || headers['x-payment-required']), wwwAuthenticate: Boolean(headers['www-authenticate']) }, x402: { version: document?.x402Version ?? null, resource: document?.resource ?? null, accepts }, findings, limitations: ['Read-only preflight only; no wallet, signing, settlement, or post-payment delivery was attempted.', 'PASS means the observed 402 document had recognizable fields; it is not a security, payment-success, or content-quality certification.'] };
}

function markdown(report) {
  const lines = [`# mcpreflight report`, '', `- Status: **${report.finalStatus}**`, `- Endpoint: ${report.endpoint}`, `- HTTP: ${report.http.status}`, `- Response: ${report.http.elapsedMs} ms / ${report.http.bodyBytes} bytes`, `- Body SHA-256: \`${report.http.bodySha256}\``, '', '## Payment requirements', ''];
  if (!report.x402.accepts.length) lines.push('- None parsed', '');
  report.x402.accepts.forEach((item, i) => lines.push(`### accepts[${i}]`, '', ...Object.entries(item).map(([key, value]) => `- ${key}: ${value ?? 'missing'}`), ''));
  lines.push('## Findings', '', ...(report.findings.length ? report.findings.map((item) => `- **${item.status}** \`${item.code}\`: ${item.message}`) : ['- None']), '', '## Limitations', '', ...report.limitations.map((item) => `- ${item}`));
  if (report.finalStatus === 'PASS') lines.push('', '## Next steps', '', 'Gate CI on this exact check (paste into .github/workflows/x402.yml):', '', '```yaml', '- uses: xka0085-byte/mcpreflight@v1', '  with:', `    endpoint: ${report.endpoint}`, '    mode: inspect', '```', '', 'Weekly re-scan and docs: https://xka0085-byte.github.io/mcpreflight/x402-endpoint-inspector.html');
  return lines.join('\n');
}

async function schemaCommand(url, format) {
  const findings = [];
  const add = (code, severity, message) => findings.push({ code, severity, message });
  const response = await fetch(url, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT), headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-03-26' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'mcpreflight', version: VERSION } } }) });
  const initText = await readBody(response);
  if (!response.ok) {
    const www = response.headers.get('www-authenticate');
    if ((response.status === 401 || response.status === 403) && www && /bearer/i.test(www)) {
      let rm = null, verified = false;
      const m = www.match(/resource_metadata="([^"]+)"/i);
      if (m) {
        rm = m[1];
        try { const r = await fetch(rm, { signal: AbortSignal.timeout(8000) }); if (r.ok) { const j = await r.json().catch(() => null); verified = Boolean(j && Array.isArray(j.authorization_servers) && j.authorization_servers.length > 0); } } catch {}
      }
      const report = { reportVersion: 1, inspectorVersion: VERSION, mode: 'read-only MCP initialize + tools/list', checkedAt: new Date().toISOString(), endpoint: url.toString(), finalStatus: 'AUTH_GATED', mcp: { protocolVersion: null, serverInfo: null, toolCount: null }, authGate: { status: verified ? 'gated-verified' : 'gated', httpStatus: response.status, resourceMetadata: rm }, findings: [{ code: verified ? 'AUTH_GATE_VERIFIED' : 'AUTH_GATE_DETECTED', severity: 'INFO', message: verified ? 'Endpoint requires authentication (401 with WWW-Authenticate Bearer); RFC 9728 resource metadata is live, confirming an OAuth authorization server' : 'Endpoint requires authentication (401/403 with WWW-Authenticate Bearer) on anonymous initialize' }], limitations: ['The endpoint requires authentication, so the anonymous handshake and tools/list checks are out of scope.', 'AUTH_GATED is not a failure and not a security certification; it does not prove behavior with valid credentials.'] };
      if (format === 'json') console.log(JSON.stringify(report, null, 2));
      else console.log(`# MCP Tool Schema Report\n\n- Status: **AUTH_GATED**\n- Endpoint: ${url.toString()}\n- Auth gate: ${report.authGate.status}${rm ? `\n- Resource metadata: ${rm}` : ''}\n\n${report.findings.map(x => `- **${x.severity}** \`${x.code}\`: ${x.message}`).join('\n')}\n\n${report.limitations.map(x => `- ${x}`).join('\n')}\n\nWeekly re-scan and per-server reports: https://xka0085-byte.github.io/mcpreflight/trust/\n`);
      process.exitCode = 0;
      return;
    }
    throw new Error(`MCP initialize returned HTTP ${response.status}`);
  }
  const init = jsonrpc(initText);
  if (!init?.result?.protocolVersion) add('INITIALIZE_RESPONSE_INVALID', 'FAIL', 'Initialize response did not include result.protocolVersion');
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': init?.result?.protocolVersion ?? '2025-03-26' };
  const list = await fetch(url, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT), headers, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) });
  const listText = await readBody(list);
  if (!list.ok) throw new Error(`tools/list returned HTTP ${list.status}`);
  const parsed = jsonrpc(listText);
  const tools = parsed?.result?.tools;
  if (!Array.isArray(tools)) add('TOOLS_LIST_INVALID', 'FAIL', 'tools/list response did not contain result.tools[]');
  else if (!tools.length) add('NO_TOOLS', 'WARN', 'Server exposes an empty tool list');
  else for (const [i, tool] of tools.entries()) {
    const at = `tools[${i}]`;
    if (typeof tool.name !== 'string' || !tool.name.trim()) add('TOOL_NAME_MISSING', 'FAIL', `${at} has no name`);
    if (typeof tool.description !== 'string' || !tool.description.trim()) add('TOOL_DESCRIPTION_MISSING', 'WARN', `${at} has no description`);
    const schema = tool.inputSchema;
    if (!schema || schema.type !== 'object') add('INPUT_SCHEMA_NOT_OBJECT', 'FAIL', `${at}.inputSchema must declare type: object`);
    const props = schema?.properties;
    if (props !== undefined && (!props || typeof props !== 'object' || Array.isArray(props))) add('PROPERTIES_INVALID', 'FAIL', `${at}.inputSchema.properties must be an object`);
    for (const req of schema?.required ?? []) if (!props?.[req]) add('REQUIRED_PROPERTY_UNDEFINED', 'FAIL', `${at} requires undeclared property ${req}`);
    for (const [key, property] of Object.entries(props ?? {})) if (typeof property?.description !== 'string' || !property.description.trim()) add('PROPERTY_DESCRIPTION_MISSING', 'WARN', `${at}.${key} has no description`);
  }
  if (!findings.length) add('STATIC_SCHEMA_CHECKS_PASSED', 'INFO', `${tools.length} tools passed deterministic schema checks`);
  const report = { reportVersion: 1, inspectorVersion: VERSION, mode: 'read-only MCP initialize + tools/list', checkedAt: new Date().toISOString(), endpoint: url.toString(), finalStatus: findings.some(x => x.severity === 'FAIL') ? 'FAIL' : 'PASS', mcp: { protocolVersion: init?.result?.protocolVersion ?? null, serverInfo: init?.result?.serverInfo ?? null, toolCount: Array.isArray(tools) ? tools.length : null }, findings, limitations: ['Static schema checks do not predict model tool selection or prove behavior across all clients.', 'No tool was called; side effects, authorization, data quality and security were not tested.'] };
  if (format === 'json') { console.log(JSON.stringify(report, null, 2)); }
  else {
    let text = `# MCP Tool Schema Report\n\n- Status: **${report.finalStatus}**\n- Endpoint: ${report.endpoint}\n- Protocol: ${report.mcp.protocolVersion ?? 'unknown'}\n- Tools: ${report.mcp.toolCount ?? 'unknown'}\n\n${findings.map(x => `- **${x.severity}** \`${x.code}\`: ${x.message}`).join('\n')}\n\n${report.limitations.map(x => `- ${x}`).join('\n')}`;
    if (report.finalStatus === 'PASS') text += `\n\nNext steps\n- Gate CI on this exact check (paste into .github/workflows/mcp.yml):\n\n    - uses: xka0085-byte/mcpreflight@v1\n      with:\n        endpoint: ${report.endpoint}\n        mode: schema\n\n- Weekly re-scan and a README status badge: https://xka0085-byte.github.io/mcpreflight/trust/\n`;
    console.log(text);
  }
  process.exitCode = report.finalStatus === 'PASS' ? 0 : 1;
}

// x402 challenge shape: the fields a paying agent depends on. Fingerprinted semantically,
// so whitespace, key order or a rotating signature in the raw response is not drift.
function shapeOf(report) {
  const accepts = (report.x402?.accepts ?? []).map((item) => JSON.stringify(item)).sort().map((text) => JSON.parse(text));
  return { httpStatus: report.http?.status ?? null, version: report.x402?.version ?? null, accepts };
}

function shapeFingerprint(shape) {
  return createHash('sha256').update(JSON.stringify(shape)).digest('hex');
}

function shapeDiff(before, after) {
  const changes = [];
  if (before.httpStatus !== after.httpStatus) changes.push(`http status ${before.httpStatus} -> ${after.httpStatus}`);
  if ((before.version ?? null) !== (after.version ?? null)) changes.push(`x402 version ${before.version ?? 'none'} -> ${after.version ?? 'none'}`);
  const keyOf = (item) => [item.scheme, item.network, item.asset, item.amount, item.payTo].join('|');
  const beforeKeys = new Map(before.accepts.map((item) => [keyOf(item), item]));
  const afterKeys = new Map(after.accepts.map((item) => [keyOf(item), item]));
  for (const key of beforeKeys.keys()) if (!afterKeys.has(key)) changes.push(`accepts entry removed: ${key}`);
  for (const key of afterKeys.keys()) if (!beforeKeys.has(key)) changes.push(`accepts entry added: ${key}`);
  return changes;
}

async function baselineCommand(url, method, format, file) {
  const report = makeReport(url.toString(), method, await probe(url, method));
  const shape = shapeOf(report);
  const baseline = { baselineVersion: 1, inspectorVersion: VERSION, createdAt: new Date().toISOString(), endpoint: url.toString(), method, fingerprint: shapeFingerprint(shape), shape };
  fs.writeFileSync(file, `${JSON.stringify(baseline, null, 2)}\n`);
  if (format === 'json') console.log(JSON.stringify(baseline, null, 2));
  else console.log(`# x402 challenge baseline

- Endpoint: ${baseline.endpoint}
- Method: ${method}
- HTTP: ${shape.httpStatus}
- Accepts entries: ${shape.accepts.length}
- Fingerprint: \`${baseline.fingerprint}\`
- Written to: ${file}

Commit this file, then gate CI on drift so a changed challenge fails the build:

    - uses: xka0085-byte/mcpreflight@v1
      with:
        endpoint: ${baseline.endpoint}
        mode: drift
        baseline: ${file}
`);
  process.exitCode = shape.httpStatus === 402 && shape.accepts.length ? 0 : 1;
}

async function driftCommand(url, method, format, file) {
  let baseline;
  try { baseline = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { throw new Error(`no readable baseline at ${file}. Create one first: mcpreflight baseline ${url.toString()} --method=${method}`); }
  const report = makeReport(url.toString(), method, await probe(url, method));
  const shape = shapeOf(report);
  const fingerprint = shapeFingerprint(shape);
  const drifted = fingerprint !== baseline.fingerprint;
  const changes = drifted ? shapeDiff(baseline.shape, shape) : [];
  const out = { reportVersion: 1, inspectorVersion: VERSION, mode: 'read-only x402 challenge drift', checkedAt: new Date().toISOString(), endpoint: url.toString(), method, finalStatus: drifted ? 'DRIFTED' : 'UNCHANGED', baseline: { file, createdAt: baseline.createdAt, fingerprint: baseline.fingerprint }, currentFingerprint: fingerprint, changes, current: shape, limitations: ['Read-only preflight only; no wallet, signing, settlement, or post-payment delivery was attempted.', 'An unchanged fingerprint means the observed challenge shape matches the baseline; it does not prove payment succeeds or that pricing is fair.'] };
  if (format === 'json') console.log(JSON.stringify(out, null, 2));
  else console.log(`# x402 challenge drift report

- Status: **${out.finalStatus}**
- Endpoint: ${out.endpoint}
- Baseline: ${baseline.createdAt} (\`${baseline.fingerprint}\`)
- Current: \`${fingerprint}\`

${changes.length ? `## Changes\n\n${changes.map((item) => `- ${item}`).join('\n')}` : '## Changes\n\n- None, the challenge shape still matches the baseline'}

## Limitations

${out.limitations.map((item) => `- ${item}`).join('\n')}
`);
  process.exitCode = drifted ? 1 : 0;
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.length === 0) { console.log(help); process.exitCode = args.length ? 0 : 3; }
else if (args[0] === 'schema') {
  let url; try { url = new URL(args[1]); if (!['http:', 'https:'].includes(url.protocol)) throw new Error('only http(s) URLs are supported'); } catch (error) { die(error.message); }
  const format = args.includes('--json') || args.includes('--format=json') ? 'json' : 'markdown';
  if (url) schemaCommand(url, format).catch((error) => { console.error(`UNKNOWN: ${redact(error.message)}`); process.exitCode = 2; });
}
else if (args[0] === 'baseline' || args[0] === 'drift') {
  const command = args[0];
  const rawUrl = args[1];
  const method = (args.find((arg) => arg.startsWith('--method='))?.split('=')[1] ?? 'GET').toUpperCase();
  const format = args.find((arg) => arg.startsWith('--format='))?.split('=')[1] ?? (args.includes('--json') ? 'json' : 'markdown');
  const file = args.find((arg) => arg.startsWith('--baseline='))?.split('=')[1] ?? DEFAULT_BASELINE;
  if (!rawUrl) die('URL is required');
  else if (!['GET', 'POST'].includes(method)) die('--method must be GET or POST');
  else if (!['json', 'markdown'].includes(format)) die('--format must be json or markdown');
  else {
    let url;
    try { url = new URL(rawUrl); if (!['http:', 'https:'].includes(url.protocol)) throw new Error('only http(s) URLs are supported'); }
    catch (error) { die(error.message); }
    if (url) try {
      if (command === 'baseline') await baselineCommand(url, method, format, file);
      else await driftCommand(url, method, format, file);
    } catch (error) {
      console.error(`UNKNOWN: ${redact(error.message)}`);
      process.exitCode = 2;
    }
  }
}
else if (args[0] !== 'inspect') die('only inspect, schema, baseline and drift commands are available in this MVP');
else {
  const rawUrl = args[1];
  const method = (args.find((arg) => arg.startsWith('--method='))?.split('=')[1] ?? 'GET').toUpperCase();
  const format = args.find((arg) => arg.startsWith('--format='))?.split('=')[1] ?? (args.includes('--json') ? 'json' : 'markdown');
  if (!rawUrl) die('URL is required');
  else if (!['GET', 'POST'].includes(method)) die('--method must be GET or POST');
  else if (!['json', 'markdown'].includes(format)) die('--format must be json or markdown');
  else {
    let url;
    try { url = new URL(rawUrl); if (!['http:', 'https:'].includes(url.protocol)) throw new Error('only http(s) URLs are supported'); }
    catch (error) { die(error.message); }
    if (url) try {
      const result = await probe(url, method);
      const report = makeReport(url.toString(), method, result);
      report.metadata = await Promise.all(['/.well-known/mcp/server.json', '/.well-known/x402'].map((path) => metadata(url, path)));
      process.stdout.write(format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : markdown(report));
      process.exitCode = report.finalStatus === 'PASS' ? 0 : 1;
    } catch (error) {
      const report = { reportVersion: 1, inspectorVersion: VERSION, mode: 'read-only', checkedAt: new Date().toISOString(), endpoint: url.toString(), finalStatus: 'UNKNOWN', findings: [{ status: 'UNKNOWN', code: 'REQUEST_FAILED', message: redact(error.message) }], limitations: ['The endpoint could not be observed within the timeout/body limit. No payment was attempted.'] };
      process.stdout.write(format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : markdown(report));
      process.exitCode = 2;
    }
  }
}

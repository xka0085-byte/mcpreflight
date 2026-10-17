// Weekly x402 challenge drift tracker.
// For every registry endpoint whose title/description/url mentions x402 (same cohort as
// x402-cohort.mjs), this resolves the paid resource URLs, probes each one read-only, and
// fingerprints the 402 challenge shape (dialect + normalized accepts[]). Snapshots land in
// trust-data/x402-drift.json; a later run reports which endpoints changed shape since the
// previous snapshot. No wallet, no signing, no payment is ever attempted.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const scan = JSON.parse(fs.readFileSync(path.join(root, 'trust-data', 'scan.json'), 'utf8'));
const driftPath = path.join(root, 'trust-data', 'x402-drift.json');

const X402 = /x402|http[- ]402/i;
const TIMEOUT = 12000;
const CONCURRENCY = Number(process.env.DRIFT_CONCURRENCY || 8);
const LIMIT = Number(process.env.DRIFT_LIMIT || 0);

const cohort = scan.results.filter((r) => X402.test(`${r.title || ''} ${r.description || ''} ${r.url || ''}`));
const work = LIMIT > 0 ? cohort.slice(0, LIMIT) : cohort;

const json = (text) => { try { return JSON.parse(text); } catch { return null; } };

function requirements(document) {
  if (!document || typeof document !== 'object') return [];
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
  };
}

function findPaymentDocument(headers, body) {
  const candidates = [headers['payment-required'], headers['x-payment-required'], body].filter(Boolean);
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
  return parsed.find((d) => requirements(d).length > 0) ?? parsed[0];
}

function resourcesOf(document) {
  if (!document || typeof document !== 'object') return [];
  const r = document.resources;
  if (Array.isArray(r)) return r.map((x) => (typeof x === 'string' ? x : x?.resource || x?.url)).filter(Boolean);
  return [];
}

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

async function probe(target, method = 'GET') {
  const started = Date.now();
  try {
    const init = { method, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT), headers: { accept: 'application/json, text/plain' } };
    if (method === 'POST') { init.headers['content-type'] = 'application/json'; init.body = '{}'; }
    const response = await fetch(target, init);
    const body = await response.text().catch(() => '');
    const paymentRequired = response.headers.get('payment-required') || response.headers.get('x-payment-required') || null;
    const headers = { 'payment-required': paymentRequired, 'x-payment-required': response.headers.get('x-payment-required') || '' };
    const document = findPaymentDocument(headers, body);
    const accepts = requirements(document).map(normalize);
    const dialect = document?.x402 ? 'x402-v2-body' : paymentRequired ? 'payment-required-header' : accepts.length ? 'accepts-inline' : null;
    return {
      status: response.status,
      ms: Date.now() - started,
      dialect,
      accepts,
      fingerprint: sha(JSON.stringify({ status: response.status, dialect, accepts })),
      bodySha: sha(body),
      raw: body.slice(0, 4000),
    };
  } catch (error) {
    return { status: null, ms: Date.now() - started, error: String(error?.message || error).slice(0, 80) };
  }
}

async function snap(entry) {
  const mcpUrl = entry.url;
  let origin;
  try { origin = new URL(mcpUrl).origin; } catch { origin = null; }
  const result = { name: entry.name, mcpUrl, observedAt: new Date().toISOString(), discovery: null, challenges: [] };
  if (!origin) return result;

  const wellKnown = await probe(origin + '/.well-known/x402');
  const doc = wellKnown.status === 200 ? json(wellKnown.raw ?? '') : null;
  const resources = resourcesOf(doc).slice().sort();
  // fingerprint the parsed discovery shape, not the raw bytes, so volatile ordering or
  // whitespace in the document does not register as drift
  const discoveryShape = { status: wellKnown.status ?? null, version: doc?.version ?? null, resources };
  result.discovery = { ...discoveryShape, fingerprint: sha(JSON.stringify(discoveryShape)) };

  for (const resource of resources.slice(0, 4)) {
    let challenge = await probe(resource, 'GET');
    if (challenge.status !== 402) {
      const post = await probe(resource, 'POST');
      if (post.status === 402 || (post.dialect && !challenge.dialect)) challenge = post;
    }
    result.challenges.push({ url: resource, status: challenge.status, dialect: challenge.dialect ?? null, accepts: challenge.accepts ?? [], fingerprint: challenge.fingerprint ?? null, error: challenge.error ?? null });
  }
  return result;
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

const entries = await pool(work, CONCURRENCY, snap);

const prev = fs.existsSync(driftPath) ? JSON.parse(fs.readFileSync(driftPath, 'utf8')) : null;
const prevByName = new Map((prev?.entries ?? []).map((e) => [e.name, e]));

const drifted = [];
for (const e of entries) {
  const before = prevByName.get(e.name);
  if (!before) continue;
  const changes = [];
  if ((before.discovery?.fingerprint ?? null) !== (e.discovery?.fingerprint ?? null)) changes.push('discovery-doc');
  const beforeCh = new Map((before.challenges ?? []).map((c) => [c.url, c]));
  for (const c of e.challenges ?? []) {
    const b = beforeCh.get(c.url);
    if (b && b.fingerprint !== c.fingerprint) changes.push(`challenge ${c.url}`);
  }
  if (changes.length) drifted.push({ name: e.name, changes });
}

fs.writeFileSync(driftPath, JSON.stringify({ generatedAt: new Date().toISOString(), cohort: entries.length, entries }, null, 1) + '\n');

const withResource = entries.filter((e) => (e.discovery?.resources ?? []).length > 0).length;
const with402 = entries.filter((e) => (e.challenges ?? []).some((c) => c.status === 402)).length;
const totalResources = entries.reduce((n, e) => n + (e.discovery?.resources?.length ?? 0), 0);

console.log(`x402 drift snapshot: ${entries.length} endpoints, ${withResource} expose /.well-known/x402, ${totalResources} paid resources listed, ${with402} return a real 402`);
if (prev) console.log(`drift vs previous snapshot (${prev.generatedAt}): ${drifted.length} endpoints changed`);
else console.log('first snapshot, no baseline to diff yet');
for (const d of drifted.slice(0, 20)) console.log(`  CHANGED ${d.name}: ${d.changes.join('; ')}`);

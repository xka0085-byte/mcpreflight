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

// A 402 status alone is not a usable challenge. A buyer can only act on a challenge that
// states the scheme, the network, the amount and where to pay. This is the layer the raw
// handshake numbers hide, and it is the reason a status count and a challenge count differ.
function challengeValidity(item) {
  const missing = [];
  if (!item || typeof item !== 'object') return { valid: false, missing: ['document'] };
  if (!item.scheme) missing.push('scheme');
  if (!(item.network ?? item.chain)) missing.push('network');
  if (!(item.payTo ?? item.recipient ?? item.vendor)) missing.push('payTo');
  if (!(item.amount ?? item.maxAmountRequired)) missing.push('amount');
  return { valid: missing.length === 0, missing };
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
    const required = requirements(document);
    const accepts = required.map(normalize);
    const validity = required.map(challengeValidity);
    const valid = response.status === 402 && validity.some((v) => v.valid);
    const missing = response.status === 402 && !valid ? [...new Set(validity.flatMap((v) => v.missing))] : [];
    const dialect = document?.x402 ? 'x402-v2-body' : paymentRequired ? 'payment-required-header' : accepts.length ? 'accepts-inline' : null;
    return {
      status: response.status,
      ms: Date.now() - started,
      dialect,
      accepts,
      valid,
      missing,
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
    const usable = (c) => c.status === 402 && c.valid;
    let challenge = await probe(resource, 'GET');
    // a 402 that carries no usable challenge does not settle the question, so POST gets a
    // turn too. verifi.cloud style endpoints already need this, because GET answers 404.
    if (!usable(challenge)) {
      const post = await probe(resource, 'POST');
      if (usable(post) || post.status === 402 || (post.dialect && !challenge.dialect)) challenge = post;
    }
    result.challenges.push({ url: resource, status: challenge.status, dialect: challenge.dialect ?? null, accepts: challenge.accepts ?? [], valid: challenge.valid ?? false, missing: challenge.missing ?? [], fingerprint: challenge.fingerprint ?? null, error: challenge.error ?? null });
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
const probed = entries.reduce((n, e) => n + (e.challenges ?? []).length, 0);
const validChallenges = entries.reduce((n, e) => n + (e.challenges ?? []).filter((c) => c.valid).length, 0);
const withValid = entries.filter((e) => (e.challenges ?? []).some((c) => c.valid)).length;

// weekly time series plus a visible block on the x402 page, so the drift number is
// citable and week over week, not a one-time snapshot
const historyPath = path.join(root, 'trust-data', 'x402-drift-history.json');
const pagePath = path.join(root, 'docs', 'x402-endpoint-inspector.html');
const date = new Date().toISOString().slice(0, 10);
const summary = { date, cohort: entries.length, discoverable: withResource, resources: totalResources, real402: with402, probed, validChallenges, withValid, drifted: drifted.length };
const hist = fs.existsSync(historyPath) ? JSON.parse(fs.readFileSync(historyPath, 'utf8')) : [];
const hi = hist.findIndex((h) => h.date === date);
if (hi >= 0) hist[hi] = summary;
else hist.push(summary);
hist.sort((a, b) => a.date.localeCompare(b.date));
fs.writeFileSync(historyPath, JSON.stringify(hist, null, 1) + '\n');

const rows = hist.slice(-12).map((h) => `<tr><td>${h.date}</td><td>${h.cohort}</td><td>${h.discoverable}</td><td>${h.resources}</td><td>${h.real402 ?? ''}</td><td>${h.probed ?? ''}</td><td>${h.validChallenges ?? ''}</td><td>${h.drifted}</td></tr>`).join('');
const block = `<!-- x402-drift:start -->
<h2>x402 challenge drift tracking</h2>
<p>The same cohort is re-probed read-only every Monday, and two different numbers are reported on purpose. <strong>real 402</strong> counts endpoints whose paid resource answered with a 402 status at all. <strong>probed</strong> is how many paid resources were actually asked. <strong>valid challenge</strong> counts the ones whose 402 also carried a usable challenge, meaning it named the scheme, the network, the amount and where to pay. A 402 status on its own is not a working challenge, and a single handshake pass rate hides that gap, so the number that matters to a buyer is the valid challenge count, not the 402 status count. The challenge shape is also fingerprinted per resource, and a drifted value above zero means at least one serving endpoint changed shape since the previous run, which is the failure mode buyers hit first. Discovery is partial by design, since <code>/.well-known/x402</code> is not universal, so <strong>discoverable</strong> counts only endpoints that publish their paid resources.</p>
<table><tr><th>date</th><th>cohort</th><th>discoverable</th><th>resources</th><th>real 402</th><th>probed</th><th>valid challenge</th><th>drifted</th></tr>${rows}</table>
<p>Check your own paid endpoint the same way, read-only: <code>npx @eidonze/mcpreflight baseline &lt;paid-url&gt;</code>, then <code>npx @eidonze/mcpreflight drift &lt;paid-url&gt;</code>. Both ship in mcpreflight 0.4.0 and up. No wallet, no signing, no payment, no retries.</p>
<!-- x402-drift:end -->`;

const page = fs.readFileSync(pagePath, 'utf8');
const S = page.indexOf('<!-- x402-drift:start -->');
const E = page.indexOf('<!-- x402-drift:end -->');
let next;
if (S >= 0 && E > S) next = page.slice(0, S) + block + page.slice(E + '<!-- x402-drift:end -->'.length);
else {
  const anchor = '<!-- x402-weekly:end -->';
  if (!page.includes(anchor)) throw new Error('no x402-drift markers and no x402-weekly end marker to insert after');
  next = page.replace(anchor, `${anchor}\n${block}`);
}
fs.writeFileSync(pagePath, next);

console.log(`x402 drift snapshot: ${entries.length} endpoints, ${withResource} expose /.well-known/x402, ${totalResources} paid resources listed, ${with402} endpoints returned a real 402`);
console.log(`real 402 challenge layer: ${probed} resources probed, ${validChallenges} returned a usable 402 challenge (${withValid} endpoints affected)`);
if (prev) console.log(`drift vs previous snapshot (${prev.generatedAt}): ${drifted.length} endpoints changed`);
else console.log('first snapshot, no baseline to diff yet');
for (const d of drifted.slice(0, 20)) console.log(`  CHANGED ${d.name}: ${d.changes.join('; ')}`);

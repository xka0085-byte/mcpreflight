// Inject FAQPage JSON-LD into existing SEO pages (idempotent).
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const docs = path.resolve(__dirname, '..', 'docs');
const S = 'https://xka0085-byte.github.io/mcpreflight/';

// Headline figures must come from the last published scan, never from a literal typed into
// this file. If the file is missing, the FAQ answers drop the numbers instead of guessing.
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
let _stats = null;
try { _stats = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'trust-data', 'scan-stats.json'), 'utf8')); } catch {}
const F = _stats && Number.isFinite(_stats.total)
  ? {
      total: fmt(_stats.total),
      pass: fmt(_stats.counts.pass),
      fail: fmt(_stats.counts.fail),
      noH: fmt((_stats.counts.authGated ?? 0) + (_stats.counts.unknown ?? 0)),
      rate: _stats.passRate,
      date: _stats.date,
    }
  : null;

const FAQ_ALIVE = F
  ? `Of the ${F.total} endpoints our latest sweep returned from the official MCP Registry (scan date ${F.date}), ${F.pass} (${F.rate}%) completed a clean anonymous MCP handshake, ${F.fail} failed, and ${F.noH} gave no anonymous response. Full data and method are on this page.`
  : 'The live split is published on the State of MCP Servers page, sourced from the latest complete sweep of the official MCP Registry. Endpoints behind authentication are counted as no anonymous handshake, not as failures.';

const FAQ_RESPOND = F
  ? `${F.rate}% of the endpoints in our latest sweep (${F.date}) completed initialize plus tools/list anonymously. Auth-gated endpoints are counted as no anonymous handshake rather than as failures.`
  : 'The pass rate is republished with every scan on the State of MCP Servers page. Auth-gated endpoints are counted as no anonymous handshake rather than as failures.';

const faqs = {
  'index.html': [
    ['What is mcpreflight?', 'mcpreflight is an open-source, read-only preflight checker for MCP servers and x402 payment endpoints. It runs an MCP initialize handshake and tools/list validation without calling any tools. Install-free usage: npx @eidonze/mcpreflight schema <url>.'],
    ['Is mcpreflight a security audit?', 'No. It validates protocol conformance and tool schema quality, not runtime behavior or code safety. A PASS means the observed responses matched the checks in that version.'],
  ],
  'mcp-schema-checker.html': [
    ['How do I test an MCP server before connecting?', 'Run npx @eidonze/mcpreflight schema <url>. It performs the MCP initialize handshake and tools/list request read-only, validates tool names, descriptions and JSON schemas, and exits 0 on pass, 1 on fail, 2 on network error, so it can gate CI.'],
    ['What MCP schema problems does mcpreflight detect?', 'Missing required properties in inputSchema, empty schemas after zod transforms, tools whose declared required fields are undefined, missing descriptions, and protocol version negotiation failures.'],
  ],
  'x402-endpoint-inspector.html': [
    ['How do I test an x402 endpoint without paying?', 'Run npx @eidonze/mcpreflight inspect <url>. It reads the HTTP 402 challenge, validates the x402 payment document shape, accepts[] entries and discovery manifests, and never signs or settles a payment.'],
    ['Why does my x402 API return 400 instead of 402?', 'Usually the body validation rejects the request before the payment middleware issues the 402 challenge, or the payment document is served in a nonstandard header or body shape. mcpreflight inspect prints which step diverged from the spec.'],
  ],
  'mcp-security-ci.html': [
    ['How do I add an MCP health check to CI?', 'Add the mcp-trust-check GitHub Action to your workflow and set the endpoint input. It runs mcpreflight in read-only mode on every pull request and fails the job when the server status is FAIL or UNKNOWN.'],
    ['Which GitHub Action validates MCP servers?', 'mcp-trust-check by xka0085-byte/mcpreflight, available in the GitHub Marketplace. It is read-only, needs no API keys, and exits non-zero on FAIL or UNKNOWN by default.'],
  ],
  'troubleshooting.html': [
    ['Why does my MCP server fail tools/list?', 'The most common causes are inputSchemas that are empty after zod transforms, required properties missing from the declared schema, and responses exceeding client size limits. npx @eidonze/mcpreflight schema <url> points at the exact tool index.'],
    ['Why does my MCP client report connection closed immediately?', 'The server process exited during startup or closed the stream after initialize. Check that the transport matches the client (stdio vs streamable HTTP) and run the read-only handshake check to see which MCP step failed.'],
  ],
  'mcp-oauth-diagnostics.html': [
    ['Why does my MCP server return 401 on initialize?', 'Endpoints behind authentication intentionally reject anonymous handshakes. mcpreflight marks such servers as no anonymous handshake in the public directory, which is expected and not a failure of the server itself.'],
    ['Does mcpreflight support OAuth flows?', 'Not yet. Checks are anonymous and read-only by design. Auth-gated endpoints are reported as UNKNOWN with a note rather than as broken.'],
  ],
  'state-of-mcp-2026-10.html': [
    ['How many MCP servers are alive?', FAQ_ALIVE],
    ['What percentage of MCP registry endpoints respond?', FAQ_RESPOND],
  ],
};

let n = 0;
for (const [file, pairs] of Object.entries(faqs)) {
  const p = path.join(docs, file);
  if (!fs.existsSync(p)) { console.log('SKIP', file); continue; }
  let html = fs.readFileSync(p, 'utf8');
  if (html.includes('application/ld+json')) { console.log('HAS', file); continue; }
  const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: pairs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
  const tag = `  <script type="application/ld+json">${JSON.stringify(ld)}</script>\n</head>`;
  html = html.replace('</head>', tag);
  fs.writeFileSync(p, html);
  n++;
  console.log('OK', file);
}
console.log('INJECTED', n);

// Regenerate docs/sitemap.xml: site pages + trust index pages + all trust report pages.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const scan = JSON.parse(fs.readFileSync(path.join(root, 'trust-data', 'scan.json'), 'utf8'));
const SITE = 'https://xka0085-byte.github.io/mcpreflight';

const urls = [
  `${SITE}/`,
  `${SITE}/state-of-mcp-2026-10.html`,
  `${SITE}/how-many-mcp-servers-are-dead.html`,
  `${SITE}/agent-evidence-sample.html`,
  `${SITE}/mcp-schema-checker.html`,
  `${SITE}/x402-endpoint-inspector.html`,
  `${SITE}/mcp-security-ci.html`,
  `${SITE}/troubleshooting.html`,
  `${SITE}/mcp-oauth-diagnostics.html`,
  `${SITE}/test-remote-mcp-server.html`,
  `${SITE}/trust/`,
];
const total = scan.results.length;
for (let i = 1; i * 500 < total; i++) urls.push(`${SITE}/trust/index-${i + 1}.html`);
for (const r of scan.results) urls.push(`${SITE}/trust/p/${r.slug}.html`);

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`;
fs.writeFileSync(path.join(root, 'docs', 'sitemap.xml'), xml);
console.log(`sitemap urls: ${urls.length}`);

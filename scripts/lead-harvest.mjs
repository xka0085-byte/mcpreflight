// Lead harvester: find recent questions/discussions on official-API channels only
// (HN via Algolia API, Stack Overflow via Stack Exchange API). No scraping, no login,
// zero ban risk. Output: trust-data/leads/leads-YYYY-MM-DD.json with drafted replies.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const day = 86400;
const since = Math.floor(Date.now() / 1000) - 14 * day;

const DRAFTS = {
  connect: `check if it's the server vs the client first — hit the endpoint with a plain mcp handshake and see what comes back. npx @eidonze/mcpdoctor schema <url> does this read-only. if that passes the problem's client side, if it fails it prints exactly which step died`,
  test: `laziest way: npx @eidonze/mcpdoctor schema <your-url> — does the handshake and validates tool schemas, exits 0/1 so you can throw it in CI too. not a security audit obviously, just catches the "works in my client but broken for everyone else" stuff`,
  schema: `usually tools/list returned something the client can't validate (missing required, empty inputSchema after zod transforms, etc). run npx @eidonze/mcpdoctor schema <url> and it points at the exact tool index`,
  x402: `npx @eidonze/mcpdoctor inspect <url> reads the 402 challenge and validates the payment doc shape without paying — catches the "my client says 400 instead of 402" class of bugs before your first real payment attempt`,
  watch: null, // informational, no pitch
};

const intentOf = (text) => {
  const t = String(text).toLowerCase();
  if (/x402|402|payment required/.test(t)) return 'x402';
  if (/schema|tools\/list|zod/.test(t)) return 'schema';
  if (/how (do|to) (i )?test|verify my/.test(t)) return 'test';
  if (/connect|closed|timeout|unreachable|fails? to start/.test(t)) return 'connect';
  return 'watch';
};

const j = async (u) => {
  try {
    const r = await fetch(u, { headers: { 'User-Agent': 'lead-harvest/0.1 (research)' } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
};

const leads = [];

// --- Hacker News (Algolia official API) ---
const hnQueries = ['model context protocol', 'mcp server', 'x402'];
for (const q of hnQueries) {
  const data = await j(`https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q)}&tags=story&numericFilters=created_at_i>${since}&hitsPerPage=12`);
  for (const h of data?.hits ?? []) {
    const title = h.title ?? '';
    if (!/mcp|model context protocol|x402/i.test(title + ' ' + (h.url ?? ''))) continue;
    leads.push({
      platform: 'hn', title,
      url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      created: new Date(h.created_at_i * 1000).toISOString().slice(0, 10),
      points: h.points, comments: h.num_comments,
      intent: intentOf(title), draft: DRAFTS[intentOf(title)],
    });
  }
}

// --- Stack Overflow (official API) ---
for (const q of ['model context protocol server', 'mcp tools/list']) {
  const data = await j(`https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=creation&q=${encodeURIComponent(q)}&site=stackoverflow&pagesize=15`);
  for (const it of data?.items ?? []) {
    if ((it.creation_date ?? 0) < since) continue;
    const title = it.title ?? '';
    leads.push({
      platform: 'so', title,
      url: it.link,
      created: new Date((it.creation_date ?? 0) * 1000).toISOString().slice(0, 10),
      points: it.score, comments: it.answer_count,
      intent: intentOf(title), draft: DRAFTS[intentOf(title)],
      unanswered: (it.answer_count ?? 0) === 0,
    });
  }
}

// dedupe + rank: unanswered/new with low comments first
const seen = new Set();
const out = leads.filter((l) => (seen.has(l.url) ? false : (seen.add(l.url), true)))
  .sort((a, b) => (b.unanswered ? 1 : 0) - (a.unanswered ? 1 : 0) || (a.comments ?? 0) - (b.comments ?? 0));

const outDir = path.join(root, 'trust-data', 'leads');
fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, `leads-${new Date().toISOString().slice(0, 10)}.json`);
fs.writeFileSync(file, JSON.stringify({ generatedAt: new Date().toISOString(), note: 'Reddit/X are intentionally NOT harvested (ban risk) - search manually in your own browser', leads: out }, null, 1));
console.log(`LEADS ${out.length} -> ${file}`);
for (const l of out.slice(0, 12)) console.log(`- [${l.platform}${l.unanswered ? '/unanswered' : ''}] ${l.created} ${l.comments ?? 0}c | ${l.title.slice(0, 90)} | ${l.url}`);

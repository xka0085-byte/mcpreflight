// Adoption funnel metrics from public APIs only. No telemetry required.
// Measures: npm downloads (real interest, version split separates bot pulls),
// real workflow integrations (code search for our action ref),
// badge embeds (code search), outreach ledger state.
// Usage: node scripts/funnel-metrics.mjs  (daily via outreach-replies workflow)
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execFile } from 'node:child_process';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'trust-data', 'metrics');
fs.mkdirSync(outDir, { recursive: true });

const fetchJson = async (u) => {
  try { const r = await fetch(u, { headers: { 'User-Agent': 'funnel-metrics/0.1' } }); return r.ok ? await r.json() : null; } catch { return null; }
};
const gh = (q) => new Promise((resolve) => {
  execFile('gh', ['api', `search/code?q=${encodeURIComponent(q)}`, '-q', '.total_count'], { timeout: 30000, maxBuffer: 1 << 20 }, (err, stdout) => {
    resolve(err ? null : Number(stdout.trim()));
  });
});

const day = new Date().toISOString().slice(0, 10);
const pkg = '@eidonze/mcpreflight';

const [dlWeek, dlMonth, dlVersions] = await Promise.all([
  fetchJson(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(pkg)}`),
  fetchJson(`https://api.npmjs.org/downloads/point/last-month/${encodeURIComponent(pkg)}`),
  fetchJson(`https://api.npmjs.org/downloads/versions/last-week/${encodeURIComponent(pkg)}`),
]);

const [actionRefs, repoMentions, badgeEmbeds] = await Promise.all([
  gh('"xka0085-byte/mcpreflight@v1"'),   // real CI integrations
  gh('"mcpreflight" in:file filename:.yml'), // broader workflow mentions
  gh('"mcpreflight/trust/badge"'),        // badge embeds anywhere on GitHub
]);

const done = JSON.parse(fs.readFileSync(path.join(root, 'trust-data', 'outreach-done.json'), 'utf8'));
const ledger = Object.values(done).reduce((m, v) => ((m[v] = (m[v] ?? 0) + 1), m), {});

const snap = {
  date: day,
  npm: {
    weekly: dlWeek?.downloads ?? null,
    monthly: dlMonth?.downloads ?? null,
    weeklyByVersion: dlVersions?.downloads ?? null, // new-version spikes = real installs, flat old versions = bot pulls
  },
  integrations: { actionRefs, repoMentions, badgeEmbeds },
  outreachLedger: ledger,
};

const histPath = path.join(outDir, 'funnel-history.json');
const hist = fs.existsSync(histPath) ? JSON.parse(fs.readFileSync(histPath, 'utf8')) : [];
const prev = hist[hist.length - 1];
if (!prev || prev.date !== day) hist.push(snap);
fs.writeFileSync(histPath, JSON.stringify(hist.slice(-120), null, 1));
fs.writeFileSync(path.join(outDir, 'funnel-latest.json'), JSON.stringify(snap, null, 1));
console.log('FUNNEL', day, JSON.stringify({ weekly: snap.npm.weekly, actionRefs, badgeEmbeds, ledger: ledger.filed }));

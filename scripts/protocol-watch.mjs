// Daily protocol event watch: check the latest release/tag of the repos that define the
// protocols we measure. When one changes, write a pending event file; the workflow turns it
// into a GitHub issue so the 48-hour measurement response can start.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const statePath = path.join(root, 'trust-data', 'protocol-watch-state.json');
const eventsPath = path.join(root, 'trust-data', 'protocol-events-pending.json');

const WATCH = [
  { repo: 'modelcontextprotocol/modelcontextprotocol', label: 'MCP spec' },
  { repo: 'x402-foundation/x402', label: 'x402' },
  { repo: 'erc-8004/erc-8004', label: 'ERC-8004' },
  { repo: 'a2aproject/A2A', label: 'A2A' },
];

const token = process.env.GH_TOKEN;
const gh = async (p) => {
  const r = await fetch(`https://api.github.com${p}`, {
    headers: { 'user-agent': 'mcpreflight-watch', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`${p} -> HTTP ${r.status}`);
  return r.json();
};

let state = {};
if (fs.existsSync(statePath)) { try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch {} }

const events = [];
for (const w of WATCH) {
  try {
    const rel = await gh(`/repos/${w.repo}/releases/latest`).catch(() => null);
    const info = rel && rel.tag_name
      ? { tag: rel.tag_name, date: String(rel.published_at ?? '').slice(0, 10), url: rel.html_url, name: rel.name ?? '' }
      : null;
    const repoMeta = await gh(`/repos/${w.repo}`);
    const cur = info ?? { tag: `pushed:${String(repoMeta.pushed_at ?? '').slice(0, 10)}`, date: String(repoMeta.pushed_at ?? '').slice(0, 10), url: repoMeta.html_url, name: 'no release, repo push detected' };
    const prev = state[w.repo];
    if (prev && prev.tag !== cur.tag) {
      events.push({ repo: w.repo, label: w.label, from: prev.tag, to: cur.tag, date: cur.date, url: cur.url, name: cur.name });
    }
    state[w.repo] = cur;
  } catch (e) { console.error(`watch ${w.repo} failed: ${e.message}`); }
}

fs.writeFileSync(statePath, JSON.stringify(state, null, 1) + '\n');
fs.writeFileSync(eventsPath, JSON.stringify({ checkedAt: new Date().toISOString(), events }, null, 1) + '\n');
console.log(`protocol watch: ${events.length} new event(s) across ${WATCH.length} repos`);
for (const e of events) console.log(`  EVENT ${e.label}: ${e.from} -> ${e.to} (${e.url})`);

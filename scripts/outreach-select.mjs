// Build outreach queue (broken servers with GitHub repos) + aggregate stats.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const servers = JSON.parse(fs.readFileSync(path.join(root, 'trust-data', 'servers-full.json'), 'utf8'));
const scan = JSON.parse(fs.readFileSync(path.join(root, 'trust-data', 'scan.json'), 'utf8'));
const byName = new Map(scan.results.map((r) => [r.name, r]));

// ---- stats ----
const stat = { scanned: scan.results.length, status: {}, findingCodes: {}, protocols: {}, withServerInfo: 0, toolCountSum: 0, toolCountN: 0 };
for (const r of scan.results) {
  stat.status[r.finalStatus] = (stat.status[r.finalStatus] ?? 0) + 1;
  stat.protocols[r.protocolVersion ?? 'none'] = (stat.protocols[r.protocolVersion ?? 'none'] ?? 0) + 1;
  if (r.serverInfo) stat.withServerInfo++;
  if (typeof r.toolCount === 'number') { stat.toolCountSum += r.toolCount; stat.toolCountN++; }
  for (const f of r.findings) stat.findingCodes[f.code] = (stat.findingCodes[f.code] ?? 0) + 1;
}
fs.writeFileSync(path.join(root, 'trust-data', 'stats.json'), JSON.stringify(stat, null, 1));
console.log('STATS', JSON.stringify(stat.status), 'protocols', JSON.stringify(stat.protocols));
console.log('TOP_CODES', Object.entries(stat.findingCodes).sort((a, b) => b[1] - a[1]).slice(0, 10));

// ---- outreach queue: actually-broken servers with a GitHub repo ----
// BROKEN = FAIL, or UNKNOWN whose findings indicate real breakage (no auth-gating codes)
const AUTH_CODES = new Set(['HTTP_401', 'HTTP_403', 'AUTH_REQUIRED', 'UNAUTHORIZED', 'PAYMENT_REQUIRED']);
const isBroken = (r) => {
  if (r.finalStatus === 'FAIL') return true;
  if (r.finalStatus !== 'UNKNOWN') return false;
  const codes = r.findings.map((f) => f.code);
  const onlyAuth = codes.length > 0 && codes.every((c) => AUTH_CODES.has(c));
  return !onlyAuth;
};
const repos = JSON.parse(fs.readFileSync(path.join(root, 'trust-data', 'repos.json'), 'utf8'));
const repoOf = (name) => repos[name] ?? null;
const seen = new Set();
const queue = [];
for (const s of servers) {
  const r = byName.get(s.name);
  if (!r || !isBroken(r)) continue;
  const repo = repoOf(s.name);
  if (!repo || repo.toLowerCase() === 'xka0085-byte/mcpreflight') continue;
  const key = repo.toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);
  const top = [...r.findings].sort((a, b) => (a.severity === 'FAIL' ? -1 : b.severity === 'FAIL' ? 1 : 0))[0] ?? { code: 'NO_RESPONSE', severity: 'UNKNOWN', message: 'No clean MCP handshake' };
  queue.push({ name: s.name, slug: r.slug, url: r.url, status: r.finalStatus, repo, code: top.code, severity: top.severity, message: top.message });
}
// FAIL first, then UNKNOWN
queue.sort((a, b) => (a.status === 'FAIL' ? -1 : b.status === 'FAIL' ? 1 : 0));

// ---- activity ranking: already-outreached dropped, archived repos dropped, active maintainers first ----
// Learned from the first 178-issue batch: replies come from repos with recent commits
// (joxo, kirbah, mjucius all replied; archived tessie-mcp could not). Archived repos are
// unfillable, so they are removed rather than ranked.
const filed = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'trust-data', 'outreach-done.json'), 'utf8'))));
const TOP = Number(process.env.OUTREACH_TOP ?? 60);
const pending = queue.filter((q) => !filed.has(q.repo));
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
async function repoMeta(full) {
  const headers = { 'user-agent': 'mcpreflight-outreach-select' };
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`https://api.github.com/repos/${full}`, { headers, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const j = await res.json();
    return { pushed_at: j.pushed_at ?? null, archived: Boolean(j.archived) };
  } catch { return null; }
}
for (const q of pending.slice(0, TOP)) {
  const meta = await repoMeta(q.repo);
  if (meta) Object.assign(q, meta);
}
const reachable = pending.filter((q) => !q.archived);
const active = reachable.filter((q) => q.pushed_at).sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at));
const rest = reachable.filter((q) => !q.pushed_at);
const ranked = [...active, ...rest];
fs.writeFileSync(path.join(root, 'trust-data', 'outreach-queue.json'), JSON.stringify(ranked, null, 1));
const failN = ranked.filter((q) => q.status === 'FAIL').length;
console.log(`QUEUE broken=${ranked.length} (FAIL ${failN}, UNKNOWN ${ranked.length - failN}) filed-filtered=${queue.length - pending.length} archived-dropped=${pending.length - reachable.length} activity-fetched=${Math.min(pending.length, TOP)}`);
console.log('FIRST3', JSON.stringify(ranked.slice(0, 3), null, 1).slice(0, 600));

#!/usr/bin/env node
// Weekly, low-maintenance metrics snapshot for mcpreflight.
// Writes docs/metrics/latest.json and docs/metrics/<week>.md using real API output only.
// Missing data is recorded as null / "unknown", never estimated.
//
// Usage: GITHUB_TOKEN=... node scripts/metrics-snapshot.mjs [--week=YYYY-MM-DD]

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const REPO = 'xka0085-byte/mcpreflight';
const SCOPED_PKG = '@eidonze/mcpreflight';
const BARE_PKG = 'mcpreflight';
const OUT_DIR = path.join(process.cwd(), 'docs', 'metrics');

const argWeek = process.argv.find((a) => a.startsWith('--week='));
const week = argWeek ? argWeek.split('=')[1] : new Date().toISOString().slice(0, 10);

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

async function getJson(url, { auth = false, headers = {} } = {}) {
  const res = await fetch(url, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'mcpreflight-metrics',
      ...(auth && token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`HTTP ${res.status} ${url} ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function safe(label, fn, fallback = null) {
  try {
    return await fn();
  } catch (err) {
    console.error(`warn: ${label}: ${err.message}`);
    return fallback;
  }
}

function isoDate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

const repo = await safe('repo', () => getJson(`https://api.github.com/repos/${REPO}`, { auth: true }), {});
const views = await safe('traffic/views', () => getJson(`https://api.github.com/repos/${REPO}/traffic/views`, { auth: true }));
const referrers = await safe('traffic/referrers', () =>
  getJson(`https://api.github.com/repos/${REPO}/traffic/popular/referrers`, { auth: true })
);

const npmBare = await safe('npm bare', () => getJson(`https://api.npmjs.org/downloads/point/last-week/${BARE_PKG}`));
const npmScoped = await safe('npm scoped', () => getJson(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(SCOPED_PKG)}`));

async function codeSearchRepos(query) {
  if (!token) return null;
  try {
    const data = await getJson(`https://api.github.com/search/code?per_page=30&q=${encodeURIComponent(query)}`, { auth: true });
    const repos = new Set();
    for (const item of data.items || []) {
      const full = item.repository && item.repository.full_name;
      if (full && full.toLowerCase() !== REPO.toLowerCase()) repos.add(full);
    }
    return { total: data.total_count, repos: [...repos].sort() };
  } catch (err) {
    console.error(`warn: code search "${query}": ${err.message}`);
    return null;
  }
}

const actionUse = await codeSearchRepos(`"${REPO}@v1"`);
const badgeEmbeds = await codeSearchRepos(`"${REPO.replace('/', '.github.io/')}/trust/badge"`);

const externalActionRepos = actionUse ? actionUse.repos : null;
const externalBadgeEmbeds = badgeEmbeds ? badgeEmbeds.repos : null;

const npmWeek = npmBare && typeof npmBare.downloads === 'number' ? npmBare.downloads : null;
const npmScopedWeek = npmScoped && typeof npmScoped.downloads === 'number' ? npmScoped.downloads : null;

// Directory presence: a status code is evidence, a timeout or bot block is not.
const DIRECTORY_URLS = {
  mcpservers: 'https://mcpservers.org/servers/xka0085-byte/mcpreflight',
  mcpso: 'https://mcp.so/server/mcpreflight',
  smithery: 'https://smithery.ai/server/mcpreflight',
  pulsemcp: 'https://www.pulsemcp.com/servers?q=mcpreflight',
};

async function directoryStatus(url) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; mcpreflight-metrics)' },
      signal: AbortSignal.timeout(20000),
    });
    return `http_${res.status}`;
  } catch (err) {
    console.error(`warn: directory ${url}: ${err.message}`);
    return 'unknown';
  }
}

const directory = { glama: 'unknown', awesome_pr: 'open' };
for (const [key, url] of Object.entries(DIRECTORY_URLS)) {
  directory[key] = await directoryStatus(url);
}

function verdict() {
  if (externalActionRepos && externalActionRepos.length > 0) {
    return `action adopted by ${externalActionRepos.length} external repo(s); sustained 30d check pending`;
  }
  if (externalBadgeEmbeds && externalBadgeEmbeds.length > 0) {
    return `external badge embed found (${externalBadgeEmbeds.join(', ')}); 30d check pending`;
  }
  if (npmWeek === null) {
    return '1 warm user, not 0->1 (npm bare package not published / no download data)';
  }
  if (npmWeek >= 50) {
    return `npm bare week ${npmWeek} >= 50; must exclude CI/bot pulses before claiming 0->1`;
  }
  return '1 warm user, not 0->1';
}

const snapshot = {
  week,
  github: {
    stars: typeof repo.stargazers_count === 'number' ? repo.stargazers_count : null,
    forks: typeof repo.forks_count === 'number' ? repo.forks_count : null,
    views_14d: views && typeof views.count === 'number' ? views.count : null,
    uniques_14d: views && typeof views.uniques === 'number' ? views.uniques : null,
    referrers: referrers ? referrers.map((r) => r.referrer) : [],
  },
  npm: {
    mcpreflight_week: npmWeek,
    eidonze_mcpreflight_week: npmScopedWeek,
  },
  directory,
  external_action_repos: externalActionRepos === null ? [] : externalActionRepos,
  external_badge_embeds: externalBadgeEmbeds === null ? [] : externalBadgeEmbeds,
  verdict: verdict(),
  sources: {
    github: 'api.github.com/repos + /traffic/views + /traffic/popular/referrers',
    npm: 'api.npmjs.org/downloads/point/last-week',
    code_search: token ? 'api.github.com/search/code' : 'skipped: no GITHUB_TOKEN',
    views_window: views ? `${isoDate(views.views?.[0]?.timestamp ?? week)}..${isoDate(views.views?.at(-1)?.timestamp ?? week)}` : 'unknown',
  },
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(path.join(OUT_DIR, 'latest.json'), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

const fmt = (v) => (v === null ? 'UNKNOWN' : String(v));
const md = `# mcpreflight weekly metrics — ${week}

Generated by \`scripts/metrics-snapshot.mjs\` from live API responses. \`UNKNOWN\` means the call failed or the value does not exist yet; nothing here is estimated.

| Field | Value |
| --- | --- |
| GitHub stars | ${fmt(snapshot.github.stars)} |
| GitHub forks | ${fmt(snapshot.github.forks)} |
| Views (14d) | ${fmt(snapshot.github.views_14d)} |
| Unique visitors (14d) | ${fmt(snapshot.github.uniques_14d)} |
| npm \`${BARE_PKG}\` (last week) | ${fmt(snapshot.npm.mcpreflight_week)} |
| npm \`${SCOPED_PKG}\` (last week) | ${fmt(snapshot.npm.eidonze_mcpreflight_week)} |
| External repos using the Action | ${externalActionRepos === null ? 'UNKNOWN' : `${snapshot.external_action_repos.length}`} |
| External badge embeds | ${externalBadgeEmbeds === null ? 'UNKNOWN' : `${snapshot.external_badge_embeds.length}`} |

## Verdict

\`${snapshot.verdict}\`

0→1 requires one of: an external repo running the Action for 30 days, a sustained external badge embed, 3 maintainers running the CLI across 4 weeks, or 4 consecutive weeks of ≥50 non-bot npm downloads. Reply count and impressions do not count.

## Directories

| Directory | Status |
| --- | --- |
${Object.entries(snapshot.directory)
  .map(([k, v]) => `| ${k} | ${v} |`)
  .join('\n')}

## Referrers (14d)

${snapshot.github.referrers.length ? snapshot.github.referrers.map((r) => `- ${r}`).join('\n') : '- none reported'}

## Data sources

${Object.entries(snapshot.sources)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n')}
`;

writeFileSync(path.join(OUT_DIR, `${week}.md`), md, 'utf8');
console.log(JSON.stringify({ week, out: [`docs/metrics/latest.json`, `docs/metrics/${week}.md`], verdict: snapshot.verdict }, null, 2));

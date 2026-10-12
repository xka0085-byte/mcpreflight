// Fetch last comments on our issues in repos that showed mail activity.
import { execFile } from 'node:child_process';
const g = (a) => new Promise((r) => execFile('gh', a, { timeout: 30000, maxBuffer: 4 << 20 }, (e, s) => r(e ? null : s)));
const repos = [
  ['keithah/tessie-mcp', 'MCP CI check'],
  ['saidsef/mcp-github-pr-issue-analyser', 'MCP CI check'],
  ['mjucius/cozi_mcp', 'MCP CI check'],
  ['222wcnm/BiliStalkerMCP', 'health check'],
  ['Cotal-AI/Cotal', 'registry-wide health check'],
  ['yuna0x0/anilist-mcp', 'health check'],
];
for (const [repo, kw] of repos) {
  const issues = JSON.parse(await g(['api', `repos/${repo}/issues?creator=xka0085-byte&state=all&per_page=10`]) ?? '[]');
  for (const it of issues.filter((i) => (i.title ?? '').toLowerCase().includes(kw.toLowerCase())).slice(0, 2)) {
    const cs = JSON.parse(await g(['api', `repos/${repo}/issues/${it.number}/comments`]) ?? '[]');
    const last = cs[cs.length - 1];
    console.log(`\n=== ${repo}#${it.number} [${it.state}] ${last ? last.user.login + ' @ ' + last.created_at : 'no comments'} ===`);
    if (last) console.log(last.body.slice(0, 500).replace(/\r/g, ''));
  }
}
// TengByte/mcpgrade: check PRs mentioning mcpdoctor
const prs = JSON.parse(await g(['api', 'repos/TengByte/mcpgrade/pulls?state=all&per_page=10']) ?? '[]');
for (const p of prs.filter((p) => /mcpdoctor/i.test(p.title ?? ''))) {
  console.log(`\n=== TengByte/mcpgrade PR#${p.number} [${p.state}${p.merged ? ' MERGED' : ''}] by ${p.user.login} ===`);
  console.log((p.title ?? '') + ' :: ' + (p.body ?? '').slice(0, 300).replace(/\r/g, ''));
}

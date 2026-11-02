#!/usr/bin/env node
// CLI 包装：把内容投递到"滚动单 issue"，不存在才创建，存在则追加评论。
// 用法：node scripts/rolling-issue.mjs --title "<固定标题>" --body-file <path>
//      node scripts/rolling-issue.mjs --title "<固定标题>" --body "<文本>"
// 需要 GITHUB_TOKEN + GITHUB_REPOSITORY（Actions 自动注入）。
import fs from 'node:fs';
import { append } from './lib/github-issue.mjs';

const argv = process.argv.slice(2);
const get = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};

const title = get('--title');
const bodyFile = get('--body-file');
const inline = get('--body');

if (!title) {
  console.error('missing --title');
  process.exit(2);
}

let body = '';
if (bodyFile && fs.existsSync(bodyFile)) body = fs.readFileSync(bodyFile, 'utf8').trim();
else if (inline) body = inline.trim();
if (!body) {
  console.error('missing --body / --body-file');
  process.exit(2);
}

const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
const r = await append(title, `### ${stamp}\n\n${body}`);
console.log(`ROLLING ${r.ok ? r.action : 'failed'} ${r.number ?? ''} ${r.reason ?? ''}`.trim());
if (!r.ok && r.reason !== 'no-token') process.exit(1);

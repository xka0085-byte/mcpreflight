// 版本一致性检查：package.json 的 version 必须与最新 v* tag 一致。
//
// 为什么需要它：npm latest 停在 0.5.0，git 上同日并存 v0.5.0 和 v1 两个 tag，
// 而 packages/mcpreflight 又是 0.5.1。三处对不上，用户看到的是"package.json
// 写着 X，npm 上是 Y，tag 是 Z"。基线只要有检查，漂移就不会再悄悄发生。
//
// 用法：node scripts/version-check.mjs
// 在 CI 里跑；没有 git 历史（浅克隆/无 tag）时明确跳过而不是误判失败。
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const current = pkg.version;
let tags = [];
try {
  tags = execFileSync('git', ['tag', '--list', 'v*'], { encoding: 'utf8' })
    .split('\n').map(t => t.trim()).filter(Boolean);
} catch {
  console.log('version-check: no git available, skipping');
  process.exit(0);
}
if (tags.length === 0) {
  console.log('version-check: no v* tags in this clone (shallow checkout?), skipping');
  process.exit(0);
}

const parse = (v) => v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
const cmp = (a, b) => {
  const x = parse(a), y = parse(b);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
};
const sorted = tags.slice().sort(cmp);
const latest = sorted[sorted.length - 1];

console.log(`package.json version: ${current}`);
console.log(`latest v* tag:        ${latest}`);
console.log(`all tags:             ${sorted.join(', ')}`);

// 宽松的 tag（如 v1）不算漂移，但会单独指出，避免它被误当成最新版本。
const loose = tags.filter(t => /^v\d+$/.test(t));
if (loose.length) console.log(`note: floating tags present (${loose.join(', ')}) — these track the major version, not a release`);

const strict = sorted.filter(t => !/^v\d+$/.test(t));
const strictLatest = strict[strict.length - 1];
if (strictLatest && cmp(current, strictLatest) !== 0) {
  console.error(`FAIL version drift: package.json says ${current}, latest release tag is ${strictLatest}`);
  process.exit(1);
}
console.log('version-check: PASS');

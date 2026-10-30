// heartbeat：回答一个仓库自己回答不了的问题——"该跑的那次，到底跑了没有"。
//
// 背景：2026-10-30 核查线上记录，9 个 workflow 里有 5 个已经静默多日
// （Agent Evidence refresh 与 Trust rescan 停在 10-19，CVE watch 停在 10-24），
// 而仓库里没有任何地方会发现这件事。GitHub 的 schedule 事件会被静默丢弃，
// 工作流文件还在、长得也对，只是没人叫它。
//
// 这个脚本做四件事：
//   1. 期望：从每个 workflow 自己的 cron 反推周期（每日 / 每周 / 每月），
//      不另外维护一张"我记得它应该多久跑一次"的表——那张表必然和 cron 漂移。
//   2. 事实：问 Actions API 要每个 workflow 最近一次 **成功** 的时间。
//      （不能用"最近一次运行"：一条每天都跑、每次都挂的线，用最后运行时间算
//      永远是今天刚跑过，这就是绿灯下的死亡。）
//   3. 自愈：超期的、且声明了 workflow_dispatch 的，当场补一次。
//   4. 大声：仍然超期的开 Issue，恢复了自动关。
//
// 用法：
//   node scripts/heartbeat.mjs              # 正常跑，含自愈
//   node scripts/heartbeat.mjs --no-heal    # 只体检不动手（本地调试）
//   node scripts/heartbeat.mjs --json       # 只打印结论
//
// 退出码恒为 0：心跳自己失败不应该把上游流水线染红，它的问题写在健康页和 Issue 里。

import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { raise, resolve } from './lib/github-issue.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WF_DIR = join(ROOT, '.github', 'workflows');
const HEALTH_DIR = join(ROOT, 'docs', 'health');
const HB_FILE = join(ROOT, 'data', 'heartbeat.json');

const args = new Set(process.argv.slice(2));
const NO_HEAL = args.has('--no-heal');
const JSON_ONLY = args.has('--json');

const API = 'https://api.github.com';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const REPO = process.env.GITHUB_REPOSITORY || '';
const REF = process.env.GITHUB_REF_NAME || 'main';

// 容忍倍数：一周一次的任务，晚 3.5 天不算事故（节假日、排队、本身有抖动）；
// 晚到 1.5 倍周期还没成功，说明它真的不打算跑了。
const TOLERANCE = 1.5;

function nowIso() {
  return new Date().toISOString();
}

// 只解析本项目实际用到的 cron 形态，遇到花活如实返回 null 而不是瞎猜。
function cycleDays(cron) {
  const p = String(cron).trim().split(/\s+/);
  if (p.length < 5) return null;
  const [, , dom, mon, dow] = p;
  if (dow !== '*' && dow !== '?') {
    // "1" / "1,4" / "MON-FRI" 都按"每周若干次"，取最保守的 7 天
    const n = dow.split(',').length;
    return n > 1 ? Math.max(1, Math.floor(7 / n)) : 7;
  }
  if (dom !== '*' && dom !== '?') return 30;
  if (mon !== '*' && mon !== '?') return 365;
  return 1;
}

function workflows() {
  return readdirSync(WF_DIR)
    .filter(f => /\.ya?ml$/.test(f))
    .map(file => {
      const raw = readFileSync(join(WF_DIR, file), 'utf8');
      const name = (raw.match(/^name:\s*(.+)$/m) || [, null])[1];
      const crons = [...raw.matchAll(/-\s*cron:\s*["']([^"']+)["']/g)].map(m => m[1]);
      return {
        file,
        name: name ? name.trim() : file.replace(/\.ya?ml$/, ''),
        cron: crons[0] || null,
        manual: /workflow_dispatch/.test(raw),
      };
    })
    .filter(w => w.cron) // 没有 cron 的是 push/PR 触发，不存在"该跑没跑"
    .filter(w => w.file !== 'heartbeat.yml'); // 心跳不监控自己
}

async function api(path, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'auto-health',
      ...(init.headers || {}),
    },
  });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} -> ${res.status} ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

async function lastSuccess(file) {
  const d = await api(`/repos/${REPO}/actions/workflows/${encodeURIComponent(file)}/runs?status=success&per_page=1`);
  const r = (d.workflow_runs || [])[0];
  return r ? { at: r.updated_at || r.created_at, url: r.html_url } : null;
}

async function dispatch(file) {
  await api(`/repos/${REPO}/actions/workflows/${encodeURIComponent(file)}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref: REF }),
  });
}

function prevStates() {
  try {
    const j = JSON.parse(readFileSync(HB_FILE, 'utf8'));
    return Array.isArray(j.workflows) ? j.workflows : [];
  } catch {
    return [];
  }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function renderHtml(payload) {
  const rows = payload.workflows
    .map(w => {
      const tone = w.state === 'ok' ? '#15803d' : w.state === 'stale' ? '#b45309' : '#b91c1c';
      const last = w.last_success ? w.last_success.slice(0, 16).replace('T', ' ') : '从未成功';
      return `<tr><td>${esc(w.name)}</td><td><code>${esc(w.cron)}</code></td><td>${w.expected_days} 天</td><td>${last}</td><td>${w.age_hours === null ? '-' : w.age_hours + ' 小时'}</td><td style="color:${tone};font-weight:600">${esc(w.state)}</td></tr>`;
    })
    .join('\n');
  const tone = payload.overall === 'ok' ? '#15803d' : payload.overall === 'degraded' ? '#b45309' : '#b91c1c';
  return `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><title>mcpreflight 自检</title>
<style>
body{font:16px/1.7 -apple-system,"Segoe UI",system-ui,sans-serif;max-width:860px;margin:48px auto;padding:0 20px;color:#1c1c1e}
h1{font-size:24px;margin-bottom:4px}.meta{color:#6b7280;font-size:13px;margin-bottom:28px}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{border-bottom:1px solid #e5e7eb;padding:8px;text-align:left}
th{background:#f9fafb;font-weight:600}code{background:#f3f4f6;padding:1px 5px;border-radius:4px;font-size:13px}
.badge{display:inline-block;padding:2px 10px;border-radius:999px;color:#fff;font-size:13px;background:${tone}}
</style>
<h1>自检 <span class="badge">${esc(payload.overall)}</span></h1>
<p class="meta">生成于 ${esc(payload.generated_at)} · 触发方式 ${esc(payload.trigger)} · 容忍倍数 ${TOLERANCE}× cron 周期</p>
<p>这张表回答的不是"workflow 有没有运行过"，而是"<b>最近一次成功</b>有多久了"。
差别是关键：一周一次的任务如果每次都挂，用最后运行时间算会永远显示今天刚跑过。</p>
<table>
<tr><th>workflow</th><th>cron</th><th>期望周期</th><th>最近成功</th><th>已过</th><th>判定</th></tr>
${rows}
</table>
<p class="meta">自愈：${payload.healed.length ? esc(payload.healed.join('、')) + ' 已当场补跑' : '本轮无需补跑'}
${payload.heal_failed.length ? ' · 补跑失败：' + esc(payload.heal_failed.join('、')) : ''}</p>
<p class="meta">这是项目自己的内部自检，<b>不是第三方验证</b>。全绿只说明已知检查项通过；
cron 被静默丢弃时这个页面自己也不会更新，外部见证仍然需要一个仓库外的定时器。</p>
</html>
`;
}

async function main() {
  const started = nowIso();
  const list = workflows();
  const prev = new Map(prevStates().map(w => [w.file, w]));

  const results = [];
  const healed = [];
  const healFailed = [];

  for (const w of list) {
    const expected = cycleDays(w.cron);
    let last = null;
    let err = null;
    if (TOKEN && REPO) {
      try {
        last = await lastSuccess(w.file);
      } catch (e) {
        err = e.message;
      }
    }
    const ageHours = last ? Math.round((Date.now() - new Date(last.at).getTime()) / 36e5) : null;
    const limitHours = expected ? Math.round(expected * TOLERANCE * 24) : null;

    let state = 'ok';
    if (!TOKEN || !REPO) state = 'unknown'; // 本地无凭据：不下结论
    else if (err) state = 'unknown';
    else if (!last) state = 'stale';
    else if (ageHours > limitHours) state = 'stale';

    if (state === 'stale' && !NO_HEAL && w.manual) {
      try {
        await dispatch(w.file);
        healed.push(w.name);
        state = 'healing';
      } catch (e) {
        healFailed.push(`${w.name}（${e.message}）`);
      }
    } else if (state === 'stale' && !w.manual) {
      healFailed.push(`${w.name}（未声明 workflow_dispatch，无法补跑）`);
    }

    const prevState = prev.get(w.file)?.state;
    results.push({
      file: w.file,
      name: w.name,
      cron: w.cron,
      expected_days: expected,
      manual: w.manual,
      last_success: last ? last.at : null,
      last_success_url: last ? last.url : null,
      age_hours: ageHours,
      limit_hours: limitHours,
      state,
      prev_state: prevState || null,
      // 上一轮已经判定过（不管是 stale 还是刚补跑过），这一轮还红：说明补跑也没救回来，
      // 不是抖动。把 healing 也算进去，否则补跑失败要拖到第三轮才会升级成 critical。
      consecutive_stale: state === 'stale' && (prevState === 'stale' || prevState === 'healing'),
      error: err,
    });
  }

  const stale = results.filter(r => r.state === 'stale');
  const repeating = stale.filter(r => r.consecutive_stale);
  const unknown = results.filter(r => r.state === 'unknown');
  const overall = repeating.length ? 'critical' : stale.length ? 'degraded' : unknown.length === results.length ? 'unknown' : 'ok';

  const payload = {
    generated_at: nowIso(),
    started_at: started,
    trigger: process.env.GITHUB_EVENT_NAME || 'local',
    overall,
    tolerance: TOLERANCE,
    healed,
    heal_failed: healFailed,
    stale: stale.map(r => r.name),
    workflows: results,
  };

  mkdirSync(HEALTH_DIR, { recursive: true });
  mkdirSync(join(ROOT, 'data'), { recursive: true });
  writeFileSync(join(HEALTH_DIR, 'latest.json'), JSON.stringify(payload, null, 2) + '\n');
  writeFileSync(join(ROOT, 'docs', 'health.html'), renderHtml(payload)); // 页面放站点根，数据留在 health/
  writeFileSync(HB_FILE, JSON.stringify({ at: payload.generated_at, overall, stale: payload.stale }, null, 2) + '\n');
  const hist = join(HEALTH_DIR, 'history.jsonl');
  appendFileSync(hist, JSON.stringify({ at: payload.generated_at, overall, stale: payload.stale.length, healed: healed.length }) + '\n');

  if (JSON_ONLY) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`heartbeat: overall=${overall}  stale=${stale.length}  healed=${healed.length}  unknown=${unknown.length}`);
  for (const r of results) {
    console.log(`  ${r.state.padEnd(8)} ${r.name.padEnd(36)} last=${r.last_success ? r.last_success.slice(0, 16) : '-'}  age=${r.age_hours ?? '-'}h / limit=${r.limit_hours ?? '-'}h`);
  }

  if (!TOKEN || !REPO) {
    console.log('  (本地运行：无 GITHUB_TOKEN/GITHUB_REPOSITORY，不做判定、不开 Issue)');
    return;
  }

  if (repeating.length) {
    const body = [
      `以下 workflow 已经**连续两轮**判定超期，说明不是偶然抖动：`,
      '',
      ...repeating.map(r => `- **${r.name}**（\`${r.cron}\`，期望 ${r.expected_days} 天）——最近成功 ${r.last_success ? r.last_success.slice(0, 16).replace('T', ' ') + ' UTC（' + r.age_hours + ' 小时前）' : '从未成功'}${r.manual ? '' : '，且未声明 workflow_dispatch，无法自动补跑'}`),
      '',
      `本轮已尝试补跑：${healed.length ? healed.join('、') : '无（无可补跑的 workflow）'}`,
      healFailed.length ? `补跑失败：${healFailed.join('；')}` : '',
      '',
      `健康页：https://xka0085-byte.github.io/mcpreflight/health/health.html`,
      '',
      '排查顺序：点开对应 workflow 的上次运行日志 → 若是 cron 没触发（日志里根本没有这次运行），',
      '说明 GitHub 丢了 schedule 事件，需要仓库外的定时器兜底；若是运行失败，看失败步骤。',
      '',
      `> 条件恢复后心跳会自动关闭此 Issue。`,
    ].filter(Boolean).join('\n');
    const r = await raise('mcpreflight-critical', body);
    console.log(`  issue -> ${JSON.stringify(r)}`);
  } else if (stale.length === 0) {
    const r = await resolve('mcpreflight-critical', `全部 workflow 的最近成功时间都在容忍范围内（${payload.generated_at}）。`);
    if (r.closed) console.log(`  issue closed: ${r.closed}`);
  }
}

await main().catch(e => {
  console.error('heartbeat failed (exit 0 on purpose):', e && e.stack ? e.stack : e);
});

// 扫描日的"周"口径：判断一次 diff 到底是跨周变化，还是同一天/同一周内的重复刷新。
//
// 为什么需要单独一个模块：registry-changes.mjs 每逢 CI 或手动 dispatch 都会跑一次，
// 而 registry-changes.json 只描述"这一个扫描日 相对 上一个扫描日"的差异。如果每次跑
// 都把 changes-previous.json 换成当天快照，那么同一天第二次跑出来的 diff 就是
// "今天 10:13 对今天 08:57"——statusChanged 里全是扫描本身的抖动（超时重试、
// 限流退避、对方偶发 5xx），不是注册表变化。这类数字一旦发布出去，就会被读成
// "一周内 171 个端点变了"，属于口径错误。
//
// 规则：只有跨自然周（ISO 周不同）的 diff 才有资格推进基线。同一天、同一周内的
// 重跑只刷新 status 快照，不换基线，也不产出周变化事件。

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseYmd(s) {
  if (typeof s !== 'string') return null;
  const m = YMD.exec(s);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  // 拒绝 2026-02-31 这类"格式合法但日期不存在"的输入
  if (d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null;
  return d;
}

/** ISO-8601 周键，例如 2026-11-02 -> 2026-W45。无法解析时返回 null。 */
export function isoWeekKey(s) {
  const d = parseYmd(s);
  if (!d) return null;
  const day = d.getUTCDay() || 7; // 周一=1 … 周日=7
  const thursday = new Date(d.getTime());
  thursday.setUTCDate(d.getUTCDate() + 4 - day);
  const isoYear = thursday.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);
  const week = Math.ceil(((thursday.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

export function daysBetween(fromYmd, toYmd) {
  const a = parseYmd(fromYmd);
  const b = parseYmd(toYmd);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/**
 * 两次扫描的关系。
 * baseline     — 没有上一份快照，本次即基线
 * same-day     — 同一天重跑（手动全量 rescan / 重试）
 * same-week    — 同一 ISO 周内重跑
 * cross-week   — 跨周，才是真正的周对比
 * unknown      — 日期缺失或非法，不能判断
 */
export function comparisonKind(scanDate, comparedAgainst) {
  if (!comparedAgainst) return 'baseline';
  const a = parseYmd(scanDate);
  const b = parseYmd(comparedAgainst);
  if (!a || !b) return 'unknown';
  if (scanDate === comparedAgainst) return 'same-day';
  return isoWeekKey(scanDate) === isoWeekKey(comparedAgainst) ? 'same-week' : 'cross-week';
}

/** 只有跨周对比可以推进基线；首次建立基线也允许写盘（此时没有可比较对象）。 */
export function advancesBaseline(kind) {
  return kind === 'baseline' || kind === 'cross-week';
}

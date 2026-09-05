/**
 * Runtime Context Prompt
 *
 * Builds the "## 当前环境" system prompt segment so the model knows the
 * current date/time and timezone. Without it, the model falls back to its
 * training-data cutoff when resolving relative dates like 「今天」/「最近」,
 * and has no way to infer the user's rough region.
 */

const WEEKDAY_NAMES_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'] as const;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** Build the runtime environment prompt segment. `now` is injectable for tests. */
export function buildRuntimeContextPrompt(now: Date = new Date()): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  const dateTime = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
  const weekday = WEEKDAY_NAMES_ZH[now.getDay()];
  return [
    '## 当前环境',
    `- 当前日期时间：${dateTime}（${weekday}）`,
    `- 时区：${timeZone}`,
    '- 涉及「今天 / 明天 / 最近 / 现在」等相对时间时，以上述当前时间为准；构造搜索查询时使用正确的日期与年份。',
    '- 用户未说明所在地区时，可依据时区推断大致地区（如 Asia/Shanghai 对应中国大陆）。'
  ].join('\n');
}

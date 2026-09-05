/**
 * Sprite speak 朗读语言启发式检测
 *
 * 轻量、无依赖的 zh/ja/en 判别，用于「显示文本与朗读文本分离」：
 * - 含平假名/片假名 → ja（日语必带假名，即使混有汉字）
 * - 仅含 CJK 汉字（无假名） → zh
 * - 含拉丁字母（无假名无汉字）→ en
 * - 其他（纯数字、标点等）→ undefined，调用方跳过翻译按原文合成
 */

// 平假名 U+3040–U+309F、片假名 U+30A0–U+30FF、半角片假名 U+FF66–U+FF9D
const KANA_PATTERN = /[぀-ヿｦ-ﾝ]/;
// CJK 统一表意文字（基本区 + 扩展 A）
const CJK_PATTERN = /[一-鿿㐀-䶿]/;
// ASCII 字母 + 拉丁字母扩展（拉丁-1 补充与扩展 A/B，排除 ×÷ 等符号）
const LATIN_PATTERN = /[A-Za-zÀ-ÖØ-öø-ɏ]/;

export type DetectedSpeechTextLanguage = 'zh' | 'ja' | 'en' | undefined;

export function detectSpeechTextLanguage(text: string): DetectedSpeechTextLanguage {
  const value = String(text || '');
  if (!value.trim()) return undefined;
  if (KANA_PATTERN.test(value)) return 'ja';
  if (CJK_PATTERN.test(value)) return 'zh';
  if (LATIN_PATTERN.test(value)) return 'en';
  return undefined;
}

/**
 * 角色定义 speechStyle.language 是自由文本，归一化为 zh/ja/en（大小写不敏感）：
 * - zh-CN / zh / 中文 / Chinese → zh
 * - ja / ja-JP / 日语 / 日文 / Japanese → ja
 * - en / en-US / English / 英语 / 英文 → en
 * - 无法识别 → undefined，调用方视为 auto（不翻译）
 */
export function normalizeCharacterSpeechLanguage(value: string | null | undefined): 'zh' | 'ja' | 'en' | undefined {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (!raw) return undefined;
  if (raw.startsWith('zh') || raw === '中文' || raw === 'chinese') return 'zh';
  if (raw.startsWith('ja') || raw === '日语' || raw === '日文' || raw === 'japanese') return 'ja';
  if (raw.startsWith('en') || raw === '英语' || raw === '英文') return 'en';
  return undefined;
}

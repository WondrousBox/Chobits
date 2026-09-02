/**
 * Sprite speak 朗读语言启发式检测
 *
 * 轻量、无依赖的 zh/ja 判别，用于「显示文本与朗读文本分离」：
 * - 含平假名/片假名 → ja（日语必带假名，即使混有汉字）
 * - 仅含 CJK 汉字（无假名） → zh
 * - 其他（纯英文、数字等）→ undefined，调用方跳过翻译按原文合成
 */

// 平假名 U+3040–U+309F、片假名 U+30A0–U+30FF、半角片假名 U+FF66–U+FF9D
const KANA_PATTERN = /[぀-ヿｦ-ﾝ]/;
// CJK 统一表意文字（基本区 + 扩展 A）
const CJK_PATTERN = /[一-鿿㐀-䶿]/;

export type DetectedSpeechTextLanguage = 'zh' | 'ja' | undefined;

export function detectSpeechTextLanguage(text: string): DetectedSpeechTextLanguage {
  const value = String(text || '');
  if (!value.trim()) return undefined;
  if (KANA_PATTERN.test(value)) return 'ja';
  if (CJK_PATTERN.test(value)) return 'zh';
  return undefined;
}

/**
 * 角色定义 speechStyle.language 是自由文本，归一化为 zh/ja（大小写不敏感）：
 * - zh-CN / zh / 中文 / Chinese → zh
 * - ja / ja-JP / 日语 / 日文 / Japanese → ja
 * - 无法识别 → undefined，调用方视为 auto（不翻译）
 */
export function normalizeCharacterSpeechLanguage(value: string | null | undefined): 'zh' | 'ja' | undefined {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (!raw) return undefined;
  if (raw.startsWith('zh') || raw === '中文' || raw === 'chinese') return 'zh';
  if (raw.startsWith('ja') || raw === '日语' || raw === '日文' || raw === 'japanese') return 'ja';
  return undefined;
}

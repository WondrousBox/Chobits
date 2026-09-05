import type { AppLanguage } from './types/preferences';

/**
 * 把系统 locale（如 app.getLocale() / navigator.language 的返回值）解析为应用支持的语言
 * zh* → zh-CN，ja* → ja，其余 → en
 */
export function resolveSystemLanguageFromLocale(locale: string): AppLanguage {
  const normalized = locale?.toLowerCase?.() ?? '';
  if (normalized.startsWith('zh')) return 'zh-CN';
  if (normalized.startsWith('ja')) return 'ja';
  return 'en';
}

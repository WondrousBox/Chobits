import type { AppLanguage, LanguagePreference } from '@packages/common/types/preferences';
import i18n, { type Resource, type ResourceKey } from 'i18next';
import { initReactI18next } from 'react-i18next';

export type { AppLanguage, LanguagePreference } from '@packages/common/types/preferences';

const SUPPORTED_LANGUAGES: AppLanguage[] = ['zh-CN', 'ja', 'en'];

// 通过 Vite glob 自动注册 locales/<语言>/<namespace>.json，新增 namespace 无需改动本文件
const localeModules = import.meta.glob('./locales/*/*.json', { eager: true });

function buildResources(): { resources: Resource; namespaces: string[] } {
  const resources: Resource = {};
  for (const [path, module] of Object.entries(localeModules)) {
    const match = /^\.\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
    if (!match) continue;
    const [, language, namespace] = match;
    (resources[language] ??= {})[namespace] = (module as { default: ResourceKey }).default;
  }
  return { resources, namespaces: Object.keys(resources['zh-CN'] ?? {}) };
}

const { resources, namespaces } = buildResources();

/**
 * 解析系统语言为应用支持的语言
 * zh* → zh-CN，ja* → ja，其余 → en，无法检测时回退默认语言 zh-CN
 */
export function resolveSystemLanguage(): AppLanguage {
  const systemLanguage = typeof navigator !== 'undefined' ? navigator.language?.toLowerCase?.() : undefined;
  if (!systemLanguage) return 'zh-CN';
  if (systemLanguage.startsWith('zh')) return 'zh-CN';
  if (systemLanguage.startsWith('ja')) return 'ja';
  return 'en';
}

void i18n.use(initReactI18next).init({
  resources,
  lng: resolveSystemLanguage(),
  fallbackLng: 'zh-CN',
  defaultNS: 'common',
  ns: namespaces,
  interpolation: {
    escapeValue: false
  }
});

/**
 * 获取当前应用语言（供 pickLocale 等非 hook 场景使用）
 */
export function getCurrentAppLanguage(): AppLanguage {
  const current = i18n.resolvedLanguage || i18n.language;
  return (SUPPORTED_LANGUAGES as string[]).includes(current) ? (current as AppLanguage) : 'zh-CN';
}

/**
 * 应用语言偏好：'system' 时跟随系统语言，否则直接使用指定语言
 */
export function applyLanguagePreference(preference: LanguagePreference): void {
  const language = preference === 'system' ? resolveSystemLanguage() : preference;
  void i18n.changeLanguage(language);
}

/**
 * 异步引导：读取用户已保存的语言偏好并应用（不阻塞渲染）
 */
export function initI18n(): void {
  void (async () => {
    try {
      const result = await window.chobits.preferences['preferences:get-config']();
      if (result.ok && result.config?.language) {
        applyLanguagePreference(result.config.language);
      }
    } catch (error) {
      console.warn('[i18n] 读取语言偏好失败:', error);
    }
  })();
}

export default i18n;

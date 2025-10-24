export type TermKey = 'workspace';

export type Locale = 'zh-CN' | 'en';

export type TermDef = {
  label: string;
  description: string;
};

const TERMS: Record<Locale, Record<TermKey, TermDef>> = {
  'zh-CN': {
    workspace: {
      label: '工作空间',
      description: '用于集中存放应用数据的本地目录，可包含会话、嵌入、下载等资源。'
    }
  },
  en: {
    workspace: {
      label: 'Workspace',
      description: 'A local directory to centralize app data, including conversations, embeddings, downloads, and other resources.'
    }
  }
};

function detectLocale(): Locale {
  try {
    const lang = typeof navigator !== 'undefined' ? navigator.language : 'zh-CN';
    return lang && lang.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
  } catch {
    return 'zh-CN';
  }
}

/**
 * Get a standardized term definition (label and description) by key.
 * Optionally specify locale, otherwise uses a simple navigator-based detection.
 */
export function getTerm(key: TermKey, locale?: Locale): TermDef {
  const l = locale ?? detectLocale();
  const set = TERMS[l] ?? TERMS['zh-CN'];
  return set[key];
}

/**
 * Export all terms for external tooling (e.g., docs generation) if needed.
 */
export const allTerms = TERMS;

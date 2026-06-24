import { getProviderDefinitionModel } from './providers/service';
import type { ChatMessage, ChatRequestExtras } from './types';

export const CHAT_MESSAGE_SPEECH_DISPLAY_FILTER_METADATA_KEY = 'speechDisplayTextFilter';

export type SpeechDisplayTextFilterRule =
  | {
      replacement?: string;
      type: 'literal';
      value: string;
    }
  | {
      flags?: string;
      pattern: string;
      replacement?: string;
      type: 'regex';
    };

export interface SpeechDisplayTextFilter {
  collapseWhitespace?: boolean;
  id?: string;
  rules: SpeechDisplayTextFilterRule[];
  trim?: boolean;
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function trimString(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
}

function normalizeRule(value: unknown): SpeechDisplayTextFilterRule | undefined {
  if (!isRecord(value)) return undefined;

  const type = trimString(value.type);
  const replacement = typeof value.replacement === 'string' ? value.replacement : undefined;

  if (type === 'literal') {
    const literal = typeof value.value === 'string' ? value.value : '';
    return literal ? { replacement, type: 'literal', value: literal } : undefined;
  }

  if (type === 'regex') {
    const pattern = typeof value.pattern === 'string' ? value.pattern : '';
    if (!pattern) return undefined;
    return {
      flags: trimString(value.flags),
      pattern,
      replacement,
      type: 'regex'
    };
  }

  return undefined;
}

export function normalizeSpeechDisplayTextFilter(value: unknown): SpeechDisplayTextFilter | undefined {
  if (!isRecord(value) || !Array.isArray(value.rules)) {
    return undefined;
  }

  const rules = value.rules.map(normalizeRule).filter(Boolean) as SpeechDisplayTextFilterRule[];
  if (!rules.length) {
    return undefined;
  }

  return {
    collapseWhitespace: typeof value.collapseWhitespace === 'boolean' ? value.collapseWhitespace : undefined,
    id: trimString(value.id),
    rules,
    trim: typeof value.trim === 'boolean' ? value.trim : undefined
  };
}

function normalizeRegexFlags(flags?: string): string {
  const allowed = new Set(['g', 'i', 'm', 's', 'u']);
  const result: string[] = ['g'];

  for (const flag of flags || '') {
    if (!allowed.has(flag) || result.includes(flag)) continue;
    result.push(flag);
  }

  return result.join('');
}

function applyRule(text: string, rule: SpeechDisplayTextFilterRule): string {
  const replacement = rule.replacement ?? '';

  if (rule.type === 'literal') {
    return rule.value ? text.split(rule.value).join(replacement) : text;
  }

  try {
    const regex = new RegExp(rule.pattern, normalizeRegexFlags(rule.flags));
    return text.replace(regex, () => replacement);
  } catch {
    return text;
  }
}

function cleanupFilteredText(text: string, filter: SpeechDisplayTextFilter): string {
  let result = text;

  if (filter.collapseWhitespace !== false) {
    result = result
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/[ \t]+([,.;:!?，。！？、；：])/g, '$1')
      .replace(/([([{（【])\s+/g, '$1')
      .replace(/\s+([)\]}）】])/g, '$1');
  }

  return filter.trim === false ? result : result.trim();
}

export function sanitizeSpeechTextForDisplay(text: string, filter?: SpeechDisplayTextFilter): string {
  if (!filter?.rules.length) {
    return text;
  }

  const filtered = filter.rules.reduce((current, rule) => applyRule(current, rule), text);
  return cleanupFilteredText(filtered, filter);
}

export function getSpeechDisplayTextFilter(providerId?: string, modelId?: string): SpeechDisplayTextFilter | undefined {
  const model = getProviderDefinitionModel(providerId, modelId);
  const speechSynthesis = isRecord(model?.speechSynthesis) ? model.speechSynthesis : undefined;
  return normalizeSpeechDisplayTextFilter(speechSynthesis?.realtimeSpeechDisplayTextFilter ?? speechSynthesis?.displayTextFilter ?? speechSynthesis?.speechDisplayTextFilter);
}

export function getRealtimeSpeechDisplayTextFilter(extras?: ChatRequestExtras): SpeechDisplayTextFilter | undefined {
  const realtimeSpeech = isRecord(extras?.spriteRealtimeSpeech) ? extras?.spriteRealtimeSpeech : undefined;
  if (!realtimeSpeech?.enabled) return undefined;

  return getSpeechDisplayTextFilter(trimString(realtimeSpeech.providerId), trimString(realtimeSpeech.model));
}

export function getSpeechDisplayTextFilterFromMetadata(metadata: unknown): SpeechDisplayTextFilter | undefined {
  if (!isRecord(metadata)) {
    return undefined;
  }

  return normalizeSpeechDisplayTextFilter(metadata[CHAT_MESSAGE_SPEECH_DISPLAY_FILTER_METADATA_KEY]);
}

export function attachSpeechDisplayTextFilterToMessage(message: ChatMessage, filter?: SpeechDisplayTextFilter): ChatMessage {
  if (!filter?.rules.length) {
    return message;
  }

  return {
    ...message,
    metadata: {
      ...(message.metadata || {}),
      [CHAT_MESSAGE_SPEECH_DISPLAY_FILTER_METADATA_KEY]: filter
    }
  };
}

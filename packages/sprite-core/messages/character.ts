import { type CharacterMessagesConfig, type CharacterMessageTemplateEntry, getCharacterDefinition, getCharacterPackSource } from '../character-service';
import type { MessageCategory } from '../types';
import { buildDefaultCharacterMessages } from './default-character';
import { getSpriteEventText as getLegacySpriteEventText, getSpriteMessageFallback, getSpriteMessagesLanguage, getSpriteMessagesProvider } from './index';

export type CharacterProgressSpeechStage = 'progress' | 'almost' | 'complete';

export interface CharacterProgressSpeechContext {
  kind: string;
  fallbackKindLabel?: string;
  progress?: number;
}

const warnedMissingKeys = new Set<string>();

function pickEntry(entry: CharacterMessageTemplateEntry | undefined): string {
  if (!entry) return '';
  if (Array.isArray(entry)) {
    if (entry.length === 0) return '';
    return entry[Math.floor(Math.random() * entry.length)] ?? '';
  }
  return entry;
}

function readPath(ctx: Record<string, unknown>, path: string): unknown {
  const parts = path
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);
  let current: unknown = ctx;
  for (const part of parts) {
    if (typeof current !== 'object' || current === null || !Object.prototype.hasOwnProperty.call(current, part)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function stringifyTemplateValue(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value))
    return value
      .map((item) => stringifyTemplateValue(item))
      .filter(Boolean)
      .join('、');
  return String(value);
}

export function renderCharacterMessageTemplate(template: string, ctx?: Record<string, unknown>): string {
  if (!ctx) return template;
  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}|\{\s*([A-Za-z0-9_.-]+)\s*\}/g, (_match, mustacheKey: string | undefined, braceKey: string | undefined) => {
    const key = (mustacheKey ?? braceKey ?? '').trim();
    if (!key) return '';
    return stringifyTemplateValue(readPath(ctx, key));
  });
}

function resolveCharacterEntry(entry: CharacterMessageTemplateEntry | undefined, ctx?: Record<string, unknown>): string {
  const template = pickEntry(entry);
  if (!template) return '';
  return renderCharacterMessageTemplate(template, ctx);
}

function shouldUseGenericFallback(): boolean {
  return getCharacterPackSource() === 'installed';
}

/**
 * 当前 UI 语言非 zh-CN 时返回角色包的按语言覆盖层（messagesLocales）。
 * zh-CN 或覆盖层缺失时返回 undefined，查找链保持原样。
 */
function getLocalizedCharacterMessages(): CharacterMessagesConfig | undefined {
  const language = getSpriteMessagesLanguage();
  if (language === 'zh-CN') return undefined;
  return getCharacterDefinition()?.messagesLocales?.[language];
}

function getGenericMessages() {
  const character = getCharacterDefinition();
  return buildDefaultCharacterMessages(character);
}

function warnInstalledPackMissingMessage(kind: string, key: string): void {
  if (!shouldUseGenericFallback()) return;
  const character = getCharacterDefinition();
  const warnKey = `${character?.id ?? 'unknown'}:${kind}:${key}`;
  if (warnedMissingKeys.has(warnKey)) return;
  warnedMissingKeys.add(warnKey);
  console.warn(`[CharacterMessages] Installed character "${character?.id ?? 'unknown'}" has no messages.${kind}.${key}; using neutral generated fallback.`);
}

export function getCharacterCategoryText(category: MessageCategory, ctx?: Record<string, unknown>): string {
  const character = getCharacterDefinition();
  const localizedText = resolveCharacterEntry(getLocalizedCharacterMessages()?.categories?.[category], ctx);
  if (localizedText) return localizedText;
  const characterText = resolveCharacterEntry(character?.messages?.categories?.[category], ctx);
  if (characterText) return characterText;
  if (shouldUseGenericFallback()) {
    const genericText = resolveCharacterEntry(getGenericMessages().categories?.[category], ctx);
    if (genericText) {
      warnInstalledPackMissingMessage('categories', category);
      return genericText;
    }
  }
  return getSpriteMessagesProvider().t(category, ctx);
}

export function getCharacterSpriteEventText(eventType: string, ctx?: Record<string, unknown>, fallback?: string): string {
  const messages = getCharacterDefinition()?.messages;
  const localizedMessages = getLocalizedCharacterMessages();
  const localizedEventText = resolveCharacterEntry(localizedMessages?.events?.[eventType], ctx);
  if (localizedEventText) return localizedEventText;

  const localizedCategoryText = resolveCharacterEntry(localizedMessages?.categories?.[eventType], ctx);
  if (localizedCategoryText) return localizedCategoryText;

  const eventText = resolveCharacterEntry(messages?.events?.[eventType], ctx);
  if (eventText) return eventText;

  const categoryText = resolveCharacterEntry(messages?.categories?.[eventType], ctx);
  if (categoryText) return categoryText;

  if (shouldUseGenericFallback()) {
    const genericMessages = getGenericMessages();
    const genericEventText = resolveCharacterEntry(genericMessages.events?.[eventType], ctx);
    if (genericEventText) {
      warnInstalledPackMissingMessage('events', eventType);
      return genericEventText;
    }

    const genericCategoryText = resolveCharacterEntry(genericMessages.categories?.[eventType], ctx);
    if (genericCategoryText) {
      warnInstalledPackMissingMessage('categories', eventType);
      return genericCategoryText;
    }
  }

  const legacyText = getLegacySpriteEventText(eventType, ctx);
  if (legacyText) return legacyText;

  return fallback ? renderCharacterMessageTemplate(fallback, ctx) : '';
}

export function getCharacterRoutineText(key: string, ctx?: Record<string, unknown>, fallback?: string): string {
  const localizedText = resolveCharacterEntry(getLocalizedCharacterMessages()?.routines?.[key], ctx);
  if (localizedText) return localizedText;
  const routineText = resolveCharacterEntry(getCharacterDefinition()?.messages?.routines?.[key], ctx);
  if (routineText) return routineText;
  if (shouldUseGenericFallback()) {
    const genericText = resolveCharacterEntry(getGenericMessages().routines?.[key], ctx);
    if (genericText) {
      warnInstalledPackMissingMessage('routines', key);
      return genericText;
    }
  }
  return fallback ? renderCharacterMessageTemplate(fallback, ctx) : '';
}

export function getCharacterProgressSpeechText(stage: CharacterProgressSpeechStage, ctx: CharacterProgressSpeechContext): string {
  const characterMessages = getCharacterDefinition()?.messages;
  const localizedProgress = getLocalizedCharacterMessages()?.progress;
  const baseProgress = characterMessages?.progress;
  // 覆盖层 progress 与基准逐字段合并（kindLabels 浅合并），未翻译字段回退基准文案
  const mergedProgress =
    localizedProgress || baseProgress
      ? {
          ...baseProgress,
          ...localizedProgress,
          kindLabels: { ...baseProgress?.kindLabels, ...localizedProgress?.kindLabels }
        }
      : undefined;
  if (shouldUseGenericFallback() && !mergedProgress) {
    warnInstalledPackMissingMessage('progress', stage);
  }
  const progressMessages = mergedProgress ?? (shouldUseGenericFallback() ? getGenericMessages().progress : undefined);
  const labelTemplate = progressMessages?.kindLabels?.[ctx.kind] ?? ctx.fallbackKindLabel ?? ctx.kind;
  const kind = renderCharacterMessageTemplate(labelTemplate, { ...ctx });
  const progress = ctx.progress !== undefined ? Math.round(ctx.progress) : '';
  const template = progressMessages?.[stage] ?? getSpriteMessageFallback(`progressTemplate.${stage}`);
  return renderCharacterMessageTemplate(template, {
    ...ctx,
    kind,
    kindLabel: kind,
    progress
  });
}

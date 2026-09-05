import { afterEach, describe, expect, it } from 'vitest';

import type { AppLanguage } from '../../packages/common/types/preferences';
import {
  CHARACTER_MESSAGE_NEUTRAL,
  CHARACTER_MESSAGE_SPECS,
  CHARACTER_PROGRESS_KIND_LABEL,
  CHARACTER_PROGRESS_KIND_LABEL_SPECS,
  CHARACTER_PROGRESS_MESSAGE,
  CHARACTER_PROGRESS_MESSAGE_SPECS
} from '../../packages/sprite-core/messages/default-character';
import { enData } from '../../packages/sprite-core/messages/en';
import { getSpriteMessageFallback, setSpriteMessagesLanguage } from '../../packages/sprite-core/messages/index';
import { jaData } from '../../packages/sprite-core/messages/ja';
import { zhCNData } from '../../packages/sprite-core/messages/zh-CN';
import type { SpriteMessagesData } from '../../packages/sprite-core/types';

const messagesDataByLanguage: Record<AppLanguage, SpriteMessagesData> = {
  'zh-CN': zhCNData,
  ja: jaData,
  en: enData
};

const APP_LANGUAGES: AppLanguage[] = ['zh-CN', 'ja', 'en'];

type EntryShape = { kind: 'array'; length: number } | { kind: 'text'; isEmpty: boolean } | { kind: 'function' };

function getEntryShape(entry: unknown): EntryShape {
  if (Array.isArray(entry)) return { kind: 'array', length: entry.length };
  if (typeof entry === 'function') return { kind: 'function' };
  return { kind: 'text', isEmpty: !entry };
}

function expectEntriesAligned(section: 'catalog' | 'spriteEventMessages'): void {
  const baseline = messagesDataByLanguage['zh-CN'][section];
  for (const language of APP_LANGUAGES) {
    const data = messagesDataByLanguage[language][section];
    expect(Object.keys(data).sort(), `${section} keys (${language})`).toEqual(Object.keys(baseline).sort());
    for (const key of Object.keys(baseline)) {
      expect(getEntryShape(data[key]), `${section}.${key} (${language})`).toEqual(getEntryShape(baseline[key]));
    }
  }
}

describe('sprite messages language alignment', () => {
  afterEach(() => {
    setSpriteMessagesLanguage('zh-CN');
  });

  it('keeps catalog keys, array lengths and empty-string positions aligned across languages', () => {
    expectEntriesAligned('catalog');
  });

  it('keeps spriteEventMessages keys, array lengths and empty-string positions aligned across languages', () => {
    expectEntriesAligned('spriteEventMessages');
  });

  it('keeps CHARACTER_MESSAGE_NEUTRAL fields aligned with CHARACTER_MESSAGE_SPECS in all languages', () => {
    const specFields = CHARACTER_MESSAGE_SPECS.map((spec) => spec.field).sort();
    expect(Object.keys(CHARACTER_MESSAGE_NEUTRAL).sort()).toEqual(specFields);
    for (const spec of CHARACTER_MESSAGE_SPECS) {
      expect(Object.keys(CHARACTER_MESSAGE_NEUTRAL[spec.field]).sort(), spec.field).toEqual([...APP_LANGUAGES].sort());
    }
  });

  it('keeps progress kind label and message tables aligned with their specs in all languages', () => {
    expect(Object.keys(CHARACTER_PROGRESS_KIND_LABEL).sort()).toEqual(CHARACTER_PROGRESS_KIND_LABEL_SPECS.map((spec) => spec.key).sort());
    expect(Object.keys(CHARACTER_PROGRESS_MESSAGE).sort()).toEqual(CHARACTER_PROGRESS_MESSAGE_SPECS.map((spec) => spec.key).sort());
    for (const spec of CHARACTER_PROGRESS_KIND_LABEL_SPECS) {
      expect(Object.keys(CHARACTER_PROGRESS_KIND_LABEL[spec.key]).sort(), spec.key).toEqual([...APP_LANGUAGES].sort());
    }
    for (const spec of CHARACTER_PROGRESS_MESSAGE_SPECS) {
      expect(Object.keys(CHARACTER_PROGRESS_MESSAGE[spec.key]).sort(), spec.key).toEqual([...APP_LANGUAGES].sort());
      for (const language of APP_LANGUAGES) {
        expect(CHARACTER_PROGRESS_MESSAGE[spec.key][language], `${spec.key} (${language})`).toContain('{kind}');
      }
    }
  });

  it('keeps progress speech fallback templates carrying {kind} / {progress} tokens in all languages', () => {
    for (const language of APP_LANGUAGES) {
      setSpriteMessagesLanguage(language);
      expect(getSpriteMessageFallback('progressTemplate.progress'), `progress (${language})`).toContain('{kind}');
      expect(getSpriteMessageFallback('progressTemplate.progress'), `progress (${language})`).toContain('{progress}');
      expect(getSpriteMessageFallback('progressTemplate.almost'), `almost (${language})`).toContain('{kind}');
      expect(getSpriteMessageFallback('progressTemplate.complete'), `complete (${language})`).toContain('{kind}');
    }
  });
});

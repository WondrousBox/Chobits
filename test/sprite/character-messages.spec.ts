import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { initCharacterService } from '../../packages/sprite-core/character-service';
import { getCharacterCategoryText, getCharacterProgressSpeechText, getCharacterRoutineText, getCharacterSpriteEventText } from '../../packages/sprite-core/messages/character';
import {
  buildDefaultCharacterMessageEditorFields,
  buildDefaultCharacterMessages,
  CHARACTER_MESSAGE_SPECS,
  CHARACTER_PROGRESS_KIND_LABEL_SPECS,
  CHARACTER_PROGRESS_MESSAGE_SPECS,
  getCharacterMessageTemplateLines
} from '../../packages/sprite-core/messages/default-character';

function expectMessagesCoverSpecs(messages: Record<string, any>): void {
  for (const spec of CHARACTER_MESSAGE_SPECS) {
    const entry = messages[spec.section]?.[spec.key];
    expect(getCharacterMessageTemplateLines(entry), `${spec.section}.${spec.key}`).not.toHaveLength(0);
  }

  for (const spec of CHARACTER_PROGRESS_KIND_LABEL_SPECS) {
    expect(messages.progress?.kindLabels?.[spec.key], `progress.kindLabels.${spec.key}`).toBeTruthy();
  }

  for (const spec of CHARACTER_PROGRESS_MESSAGE_SPECS) {
    expect(messages.progress?.[spec.key], `progress.${spec.key}`).toBeTruthy();
  }
}

function expectMessagesDoNotHaveSpecDrift(messages: Record<string, any>): void {
  for (const section of ['categories', 'events', 'routines'] as const) {
    const expectedKeys = CHARACTER_MESSAGE_SPECS.filter((spec) => spec.section === section)
      .map((spec) => spec.key)
      .sort();
    expect(Object.keys(messages[section] ?? {}).sort(), section).toEqual(expectedKeys);
  }
  expect(Object.keys(messages.progress?.kindLabels ?? {}).sort(), 'progress.kindLabels').toEqual(CHARACTER_PROGRESS_KIND_LABEL_SPECS.map((spec) => spec.key).sort());
  expect(
    Object.keys(messages.progress ?? {})
      .filter((key) => key !== 'kindLabels')
      .sort(),
    'progress'
  ).toEqual(CHARACTER_PROGRESS_MESSAGE_SPECS.map((spec) => spec.key).sort());
}

function writeCharacterFile(rootDir: string, payload: unknown): void {
  writeFileSync(path.join(rootDir, 'character.json'), JSON.stringify(payload, null, 2), 'utf-8');
}

function createCharacterPayload(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    version: 1,
    id: 'message-character',
    name: 'Message Character',
    nameAliases: [],
    identity: {
      tagline: 'tagline',
      background: 'background',
      coreTraits: [],
      boundaries: []
    },
    speechStyle: {
      tone: 'quiet',
      language: 'zh-CN',
      firstPerson: '我',
      addressUser: '你',
      examples: [],
      quirks: []
    },
    favorTiers: {},
    moodExpressions: {},
    dimensions: {
      schema: [],
      extensible: true
    },
    conversationRewards: {
      xpPerConversation: 0,
      favorPerConversation: 0,
      cooldownMs: 0,
      bonusConditions: []
    },
    meta: {
      author: 'test',
      version: '1.0.0',
      license: 'MIT',
      description: 'test',
      tags: [],
      createdAt: '2026-05-10',
      updatedAt: '2026-05-10'
    },
    ...overrides
  };
}

describe('character message overrides', () => {
  let tempDir: string | null = null;

  afterEach(() => {
    vi.restoreAllMocks();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it('keeps generated neutral copy and editor fields aligned with the shared message specs', () => {
    const profile = {
      name: 'Nova',
      firstPerson: '小诺',
      addressUser: '伙伴'
    };
    const messages = buildDefaultCharacterMessages(profile);
    const editorFields = buildDefaultCharacterMessageEditorFields(profile);

    expectMessagesCoverSpecs(messages);
    for (const spec of CHARACTER_MESSAGE_SPECS) {
      expect(editorFields[spec.field], spec.field).toEqual(getCharacterMessageTemplateLines(messages[spec.section]?.[spec.key]));
    }
    expect(messages.categories?.welcome).toEqual(['Nova上线了。', '伙伴回来啦，今天想先处理什么？', '小诺在这里。']);
  });

  it('keeps the builtin character pack copy aligned with the shared message specs', () => {
    const character = JSON.parse(readFileSync(path.join(process.cwd(), 'resources', 'characters', 'character.json'), 'utf-8'));

    expectMessagesCoverSpecs(character.messages);
    expectMessagesDoNotHaveSpecDrift(character.messages);
  });

  it('resolves character package copy before global defaults', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'character-messages-test-'));
    writeCharacterFile(
      tempDir,
      createCharacterPayload({
        messages: {
          categories: {
            welcome: ['角色欢迎']
          },
          events: {
            downloadComplete: ['{workflowName} 做好啦']
          },
          routines: {
            'daily.rest-reminder.speak': ['交给我吧，{workflowName}']
          },
          progress: {
            kindLabels: {
              workflow: '编排'
            },
            progress: '{kind}到了 {progress}%',
            almost: '{kind}快收尾了',
            complete: '{kind}结束'
          }
        }
      })
    );

    initCharacterService(tempDir);

    expect(getCharacterCategoryText('welcome')).toBe('角色欢迎');
    expect(getCharacterSpriteEventText('downloadComplete', { workflowName: '字幕整理' })).toBe('字幕整理 做好啦');
    expect(getCharacterRoutineText('daily.rest-reminder.speak', { workflowName: '字幕整理' })).toBe('交给我吧，字幕整理');
    expect(getCharacterProgressSpeechText('progress', { kind: 'workflow', progress: 37 })).toBe('编排到了 37%');
    expect(getCharacterProgressSpeechText('almost', { kind: 'workflow', progress: 92 })).toBe('编排快收尾了');
    expect(getCharacterProgressSpeechText('complete', { kind: 'workflow' })).toBe('编排结束');
  });

  it('uses neutral generated copy for installed packs that do not provide message overrides', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'character-messages-test-'));
    writeCharacterFile(
      tempDir,
      createCharacterPayload({
        id: 'custom-neutral',
        name: 'Nova',
        speechStyle: {
          tone: 'quiet',
          language: 'zh-CN',
          firstPerson: '小诺',
          addressUser: '伙伴',
          examples: [],
          quirks: []
        }
      })
    );

    initCharacterService(tempDir, { source: 'installed' });

    expect(getCharacterCategoryText('welcome')).toBe('Nova上线了。');
    expect(getCharacterSpriteEventText('aiThinking')).toBe('小诺想一下。');
    expect(getCharacterRoutineText('daily.rest-reminder.speak', { workflowName: '字幕整理' })).toBe('差不多该休息一下了。');
    expect(getCharacterProgressSpeechText('progress', { kind: 'workflow', progress: 37 })).toBe('处理进度 37%。');
  });
});

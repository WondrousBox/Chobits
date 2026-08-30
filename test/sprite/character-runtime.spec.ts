import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { reloadCharacterPersonaRuntime, syncCharacterPersonaRuntime } from '../../packages/sprite-core/character-runtime';
import { initCharacterService, setCharacterFilePath } from '../../packages/sprite-core/character-service';

function writeCharacterFile(rootDir: string, payload: unknown): void {
  writeFileSync(path.join(rootDir, 'character.json'), JSON.stringify(payload, null, 2), 'utf-8');
}

function createCharacterPayload(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    version: 1,
    id: 'character-a',
    name: 'Character A',
    nameAliases: ['A'],
    identity: {
      tagline: 'tagline',
      background: 'background',
      coreTraits: ['warm'],
      boundaries: ['kind']
    },
    speechStyle: {
      tone: 'gentle',
      language: 'zh-CN',
      firstPerson: '我',
      addressUser: '你',
      examples: [],
      quirks: []
    },
    favorPersona: {
      friend: {
        range: [40, 59],
        style: 'friendly',
        systemPromptOverlay: 'friendly'
      }
    },
    moodExpressions: {
      neutral: {
        animation: 'idle',
        messageStyle: 'neutral'
      }
    },
    dimensions: {
      schema: [],
      extensible: true
    },
    conversationRewards: {
      xpPerConversation: 10,
      favorPerConversation: 0.6,
      cooldownMs: 45_000,
      bonusConditions: []
    },
    meta: {
      author: 'test',
      version: '1.0.0',
      license: 'MIT',
      description: 'test character',
      tags: ['test'],
      createdAt: '2026-04-22',
      updatedAt: '2026-04-22'
    },
    ...overrides
  };
}

describe('character runtime persona bridge', () => {
  let tempDir: string | null = null;

  afterEach(() => {
    setCharacterFilePath(null);
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it('reports the active character id from the loaded definition', () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'character-runtime-test-'));
    writeCharacterFile(tempDir, createCharacterPayload());

    initCharacterService(tempDir);
    expect(syncCharacterPersonaRuntime()).toEqual({ characterId: 'character-a' });
  });

  it('reload picks up the updated character definition from disk', () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'character-runtime-test-'));
    writeCharacterFile(tempDir, createCharacterPayload());

    initCharacterService(tempDir);
    syncCharacterPersonaRuntime();

    writeCharacterFile(tempDir, createCharacterPayload({ id: 'character-b', name: 'Character B' }));

    expect(reloadCharacterPersonaRuntime()).toEqual({ characterId: 'character-b' });
  });
});

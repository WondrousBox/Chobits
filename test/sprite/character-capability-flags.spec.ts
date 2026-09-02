import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { getCharacterCapabilityContextFlags } from '../../packages/sprite-core/character-capability-flags';
import { initCharacterService, setCharacterFilePath, setCharacterPackFilePath } from '../../packages/sprite-core/character-service';

function writeCharacterFile(rootDir: string, payload: unknown): void {
  writeFileSync(path.join(rootDir, 'character.json'), JSON.stringify(payload, null, 2), 'utf-8');
}

function writeJsonFile(filePath: string, payload: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

describe('character capability context flags', () => {
  let tempDir: string | null = null;

  afterEach(() => {
    setCharacterFilePath(null);
    setCharacterPackFilePath(null);
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it('derives feature flags from the active character', () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'character-capability-flags-'));
    writeCharacterFile(tempDir, {
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
      favorTiers: {},
      moodExpressions: {},
      dimensions: {
        schema: [],
        extensible: true
      },
      conversationRewards: {
        xpPerConversation: 10,
        favorPerConversation: 0.5,
        cooldownMs: 60_000,
        bonusConditions: []
      },
      capabilityFlags: {
        featureFlags: ['pack:voice', 'pack:custom-appearance', '  ']
      },
      meta: {
        author: 'test',
        version: '1.0.0',
        license: 'MIT',
        description: 'test character',
        tags: ['test'],
        createdAt: '2026-04-22',
        updatedAt: '2026-04-22'
      }
    });

    initCharacterService(tempDir);

    const flags = getCharacterCapabilityContextFlags();

    expect(flags.characterId).toBe('character-a');
    expect(flags.featureFlags).toMatchObject({
      'character:loaded': true,
      'character:id:character-a': true,
      'pack:voice': true,
      'pack:custom-appearance': true
    });
  });

  it('exposes no feature flags when no character is loaded', () => {
    setCharacterFilePath(null);

    const flags = getCharacterCapabilityContextFlags(null, null);

    expect(flags.characterId).toBeNull();
    expect(flags.featureFlags).toEqual({});
  });

  it('merges pack manifest capabilities into feature flags', () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'character-capability-flags-'));
    writeCharacterFile(tempDir, {
      version: 1,
      id: 'character-pack-test',
      name: 'Character Pack Test',
      nameAliases: ['Pack'],
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
      favorTiers: {},
      moodExpressions: {},
      dimensions: {
        schema: [],
        extensible: true
      },
      conversationRewards: {
        xpPerConversation: 10,
        favorPerConversation: 0.5,
        cooldownMs: 60_000,
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
      }
    });
    writeJsonFile(path.join(tempDir, 'pack.json'), {
      formatVersion: 1,
      id: 'pack-default',
      name: 'Pack Default',
      version: '1.0.0',
      author: 'test',
      description: 'test pack',
      license: 'MIT',
      tags: ['test'],
      assets: {
        character: 'character.json'
      },
      capabilities: {
        hasVoice: true,
        hasCustomAnimations: true,
        supportedLanguages: ['zh-CN', 'en-US'],
        dimensionExtensions: ['creativity']
      }
    });

    initCharacterService(tempDir);

    const flags = getCharacterCapabilityContextFlags();

    expect(flags.featureFlags).toMatchObject({
      'pack:loaded': true,
      'pack:id:pack-default': true,
      'pack:has-voice': true,
      'pack:has-custom-animations': true,
      'pack:language:zh-CN': true,
      'pack:language:en-US': true,
      'pack:dimension-extension:creativity': true,
      'character:has-custom-appearance': true
    });
  });
});

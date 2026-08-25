import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { getCharacterDefinition, getCharacterPackAssetPath, getCharacterPackDefinition, initCharacterService, reloadCharacter, setCharacterFilePath, setCharacterPackFilePath } from '../../packages/sprite-core/character-service';

function writeJsonFile(filePath: string, payload: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

function createCharacterPayload(id: string, name: string): Record<string, unknown> {
  return {
    version: 1,
    id,
    name,
    nameAliases: [name],
    identity: {
      tagline: `${name} tagline`,
      background: `${name} background`,
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
    favorPersona: {},
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
      description: `${name} description`,
      tags: ['test'],
      createdAt: '2026-04-22',
      updatedAt: '2026-04-22'
    }
  };
}

describe('character pack service', () => {
  let tempDir: string | null = null;

  afterEach(() => {
    setCharacterFilePath(null);
    setCharacterPackFilePath(null);
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it('loads pack.json and resolves character asset path from pack assets', () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'character-pack-service-'));
    writeJsonFile(path.join(tempDir, 'pack.json'), {
      formatVersion: 1,
      id: 'pack-alpha',
      name: 'Pack Alpha',
      version: '1.0.0',
      author: 'test',
      description: 'pack alpha',
      license: 'MIT',
      tags: ['test'],
      assets: {
        character: 'characters/alpha.json',
        animations: 'animations/pack-index.json'
      },
      capabilities: {
        hasCustomAnimations: true
      }
    });
    writeJsonFile(path.join(tempDir, 'characters/alpha.json'), createCharacterPayload('character-alpha', 'Alpha'));

    initCharacterService(tempDir);

    expect(getCharacterPackDefinition()).toMatchObject({
      id: 'pack-alpha',
      name: 'Pack Alpha'
    });
    expect(getCharacterPackAssetPath('animations')).toBe(path.join(tempDir, 'animations/pack-index.json'));
    expect(getCharacterDefinition()).toMatchObject({
      id: 'character-alpha',
      name: 'Alpha'
    });
  });

  it('reloadCharacter re-resolves the active character file when pack assets change', () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'character-pack-service-'));
    const packFile = path.join(tempDir, 'pack.json');
    writeJsonFile(packFile, {
      formatVersion: 1,
      id: 'pack-alpha',
      name: 'Pack Alpha',
      version: '1.0.0',
      author: 'test',
      description: 'pack alpha',
      license: 'MIT',
      tags: ['test'],
      assets: {
        character: 'characters/alpha.json'
      }
    });
    writeJsonFile(path.join(tempDir, 'characters/alpha.json'), createCharacterPayload('character-alpha', 'Alpha'));
    writeJsonFile(path.join(tempDir, 'characters/beta.json'), createCharacterPayload('character-beta', 'Beta'));

    initCharacterService(tempDir);
    expect(getCharacterDefinition()?.id).toBe('character-alpha');

    writeJsonFile(packFile, {
      formatVersion: 1,
      id: 'pack-beta',
      name: 'Pack Beta',
      version: '1.0.0',
      author: 'test',
      description: 'pack beta',
      license: 'MIT',
      tags: ['test'],
      assets: {
        character: 'characters/beta.json'
      }
    });

    expect(reloadCharacter()).toMatchObject({
      id: 'character-beta',
      name: 'Beta'
    });
    expect(getCharacterPackDefinition()).toMatchObject({
      id: 'pack-beta',
      name: 'Pack Beta'
    });
  });

  it('keeps pack asset paths contained in the pack root', () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'character-pack-service-'));
    const packRoot = path.join(tempDir, 'pack');
    const outsideRoot = path.join(tempDir, 'outside');

    writeJsonFile(path.join(outsideRoot, 'evil-character.json'), createCharacterPayload('character-evil', 'Evil'));
    writeJsonFile(path.join(outsideRoot, 'pack-index.json'), { version: 1, items: [] });
    writeJsonFile(path.join(packRoot, 'pack.json'), {
      formatVersion: 1,
      id: 'pack-contained',
      name: 'Pack Contained',
      version: '1.0.0',
      author: 'test',
      description: 'pack contained',
      license: 'MIT',
      tags: ['test'],
      assets: {
        character: '../outside/evil-character.json',
        animations: path.join(outsideRoot, 'pack-index.json')
      }
    });
    writeJsonFile(path.join(packRoot, 'character.json'), createCharacterPayload('character-safe', 'Safe'));

    initCharacterService(packRoot);

    expect(getCharacterPackAssetPath('animations')).toBeNull();
    expect(getCharacterDefinition()).toMatchObject({
      id: 'character-safe',
      name: 'Safe'
    });
  });
});

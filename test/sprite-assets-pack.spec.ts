import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electronState = {
  userDataDir: '',
  handlers: new Map<string, unknown>()
};

const ipcMainHandle = vi.fn((channel: string, handler: unknown) => {
  electronState.handlers.set(channel, handler);
});

vi.mock('electron', () => ({
  app: {
    getPath: () => electronState.userDataDir
  },
  ipcMain: {
    handle: ipcMainHandle
  }
}));

function writeJsonFile(filePath: string, payload: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

function createCharacterPayload(id: string): Record<string, unknown> {
  return {
    version: 1,
    id,
    name: id,
    nameAliases: [id],
    identity: {
      tagline: `${id} tagline`,
      background: `${id} background`,
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
      description: `${id} description`,
      tags: ['test'],
      createdAt: '2026-04-22',
      updatedAt: '2026-04-22'
    }
  };
}

describe('sprite assets pack manifest integration', () => {
  let spritesRoot: string | null = null;
  let userDataDir: string | null = null;

  beforeEach(() => {
    vi.resetModules();
    ipcMainHandle.mockClear();
    electronState.handlers.clear();
    spritesRoot = mkdtempSync(path.join(os.tmpdir(), 'sprite-assets-pack-'));
    userDataDir = mkdtempSync(path.join(os.tmpdir(), 'sprite-assets-user-'));
    electronState.userDataDir = userDataDir;
  });

  afterEach(async () => {
    const spriteAssets = await import('../packages/sprite-core/handler/sprite-assets');
    spriteAssets.setSpriteAssetsChangeHandler(null);

    const characterService = await import('../packages/sprite-core/character-service');
    characterService.setCharacterFilePath(null);
    characterService.setCharacterPackFilePath(null);

    if (spritesRoot) {
      rmSync(spritesRoot, { recursive: true, force: true });
      spritesRoot = null;
    }

    if (userDataDir) {
      rmSync(userDataDir, { recursive: true, force: true });
      userDataDir = null;
    }
  });

  it('loads default animations from the active pack animations asset path', async () => {
    const rootDir = spritesRoot!;
    writeJsonFile(path.join(rootDir, 'pack.json'), {
      formatVersion: 1,
      id: 'pack-assets',
      name: 'Pack Assets',
      version: '1.0.0',
      author: 'test',
      description: 'pack assets',
      license: 'MIT',
      tags: ['test'],
      assets: {
        character: 'character.json',
        animations: 'animations/pack-index.json'
      }
    });
    writeJsonFile(path.join(rootDir, 'character.json'), createCharacterPayload('character-pack-assets'));
    writeJsonFile(path.join(rootDir, 'animations/pack-index.json'), {
      version: 1,
      items: [
        {
          meta: {
            id: 'pack-idle',
            title: 'Pack Idle',
            primaryTrigger: 'idle'
          },
          source: {
            localPath: 'idle/pack-idle.webm',
            type: 'video/webm'
          }
        }
      ]
    });

    const characterService = await import('../packages/sprite-core/character-service');
    characterService.initCharacterService(rootDir);

    const addAllowedResourceRoot = vi.fn();
    const spriteAssets = await import('../packages/sprite-core/handler/sprite-assets');
    spriteAssets.initSpriteHandlers({
      addAllowedResourceRoot,
      getResourcePath: () => rootDir
    });

    const sprites = await spriteAssets.listSprites();

    expect(sprites).toHaveLength(1);
    expect(sprites[0]).toMatchObject({
      meta: {
        id: 'pack-idle'
      },
      source: {
        localPath: path.join(rootDir, 'animations/idle/pack-idle.webm')
      }
    });
    expect(addAllowedResourceRoot).toHaveBeenCalledWith(rootDir);
  });

  it('drops pack animation localPath entries that escape the pack root', async () => {
    const rootDir = spritesRoot!;
    const outsideRoot = path.join(userDataDir!, 'outside-assets');
    const indexDir = path.join(rootDir, 'animations');
    const outsideFile = path.join(outsideRoot, 'escape.webm');
    mkdirSync(outsideRoot, { recursive: true });
    writeFileSync(outsideFile, 'outside-webm', 'utf-8');

    writeJsonFile(path.join(rootDir, 'pack.json'), {
      formatVersion: 1,
      id: 'pack-contained-assets',
      name: 'Pack Contained Assets',
      version: '1.0.0',
      author: 'test',
      description: 'pack contained assets',
      license: 'MIT',
      tags: ['test'],
      assets: {
        character: 'character.json',
        animations: 'animations/pack-index.json'
      }
    });
    writeJsonFile(path.join(rootDir, 'character.json'), createCharacterPayload('character-pack-contained-assets'));
    writeJsonFile(path.join(rootDir, 'animations/pack-index.json'), {
      version: 1,
      items: [
        {
          meta: {
            id: 'pack-safe',
            title: 'Pack Safe',
            primaryTrigger: 'idle'
          },
          source: {
            localPath: 'idle/safe.webm',
            type: 'video/webm'
          }
        },
        {
          meta: {
            id: 'pack-sibling',
            title: 'Pack Sibling',
            primaryTrigger: 'idle'
          },
          source: {
            localPath: '../shared/sibling.webm',
            type: 'video/webm'
          }
        },
        {
          meta: {
            id: 'pack-relative-escape',
            title: 'Pack Relative Escape',
            primaryTrigger: 'idle'
          },
          source: {
            localPath: path.relative(indexDir, outsideFile),
            type: 'video/webm'
          }
        },
        {
          meta: {
            id: 'pack-absolute-escape',
            title: 'Pack Absolute Escape',
            primaryTrigger: 'idle'
          },
          source: {
            localPath: outsideFile,
            type: 'video/webm'
          }
        },
        {
          meta: {
            id: 'pack-file-url-escape',
            title: 'Pack File URL Escape',
            primaryTrigger: 'idle'
          },
          source: {
            localPath: pathToFileURL(outsideFile).href,
            type: 'video/webm'
          }
        }
      ]
    });

    const characterService = await import('../packages/sprite-core/character-service');
    characterService.initCharacterService(rootDir);

    const spriteAssets = await import('../packages/sprite-core/handler/sprite-assets');
    spriteAssets.initSpriteHandlers({
      addAllowedResourceRoot: vi.fn(),
      getResourcePath: () => rootDir
    });

    const sprites = await spriteAssets.listSprites();

    expect(sprites.map((sprite) => sprite.meta.id)).toEqual(['pack-safe', 'pack-sibling']);
    expect(sprites[0].source.localPath).toBe(path.join(rootDir, 'animations/idle/safe.webm'));
    expect(sprites[1].source.localPath).toBe(path.join(rootDir, 'shared/sibling.webm'));
  });

  it('writes sprite authoring into the active installed pack animation index', async () => {
    const builtinRoot = path.join(spritesRoot!, 'builtin-pack');
    const installedRoot = path.join(userDataDir!, 'data', 'character-packs', 'pack-custom');

    writeJsonFile(path.join(builtinRoot, 'pack.json'), {
      formatVersion: 1,
      id: 'pack-builtin',
      name: 'Builtin Pack',
      version: '1.0.0',
      author: 'test',
      description: 'builtin pack',
      license: 'MIT',
      tags: ['test'],
      assets: {
        character: 'character.json',
        animations: 'animations/index.json'
      }
    });
    writeJsonFile(path.join(builtinRoot, 'character.json'), createCharacterPayload('character-builtin'));
    writeJsonFile(path.join(builtinRoot, 'animations/index.json'), {
      version: 1,
      items: [
        {
          meta: {
            id: 'builtin-idle',
            title: 'Builtin Idle',
            primaryTrigger: 'idle'
          },
          source: {
            localPath: 'idle.webm',
            type: 'video/webm'
          }
        }
      ]
    });
    writeFileSync(path.join(builtinRoot, 'animations/idle.webm'), 'builtin-idle', 'utf-8');

    writeJsonFile(path.join(installedRoot, 'pack.json'), {
      formatVersion: 1,
      id: 'pack-custom',
      name: 'Custom Pack',
      version: '1.0.0',
      author: 'test',
      description: 'custom pack',
      license: 'MIT',
      tags: ['test'],
      assets: {
        character: 'character.json',
        animations: 'animations/index.json'
      }
    });
    writeJsonFile(path.join(installedRoot, 'character.json'), createCharacterPayload('character-custom'));
    writeJsonFile(path.join(installedRoot, 'animations/index.json'), {
      version: 1,
      items: []
    });

    const characterService = await import('../packages/sprite-core/character-service');
    characterService.initCharacterService(installedRoot, { source: 'installed' });

    const spriteAssets = await import('../packages/sprite-core/handler/sprite-assets');
    spriteAssets.initSpriteHandlers({
      addAllowedResourceRoot: vi.fn(),
      getResourcePath: () => builtinRoot
    });

    const fallbackSprites = await spriteAssets.listSprites();
    expect(fallbackSprites.map((sprite) => sprite.meta.id)).toEqual(['builtin-idle']);
    expect(fallbackSprites[0]).toMatchObject({
      meta: {
        deletable: false,
        primaryTrigger: 'idle'
      },
      source: {
        localPath: path.join(builtinRoot, 'animations/idle.webm')
      }
    });

    const registerFromData = electronState.handlers.get('sprite:registerFromData') as ((_: unknown, payload: { data: Buffer; meta: Record<string, unknown> }) => Promise<any>) | undefined;
    const removeSprite = electronState.handlers.get('sprite:remove') as ((_: unknown, payload: { id: string; deleteFile?: boolean }) => Promise<any>) | undefined;

    expect(registerFromData).toBeDefined();
    expect(removeSprite).toBeDefined();

    const item = await registerFromData!(undefined, {
      data: Buffer.from('custom-webm'),
      meta: {
        id: 'custom-wave',
        title: 'Custom Wave',
        primaryTrigger: 'wave'
      }
    });

    expect(item.source.localPath).toBe(path.join(installedRoot, 'animations/custom-wave.webm'));
    expect(item.meta.deletable).toBe(true);

    const storedIndex = JSON.parse(readFileSync(path.join(installedRoot, 'animations/index.json'), 'utf-8'));
    expect(storedIndex.items).toHaveLength(1);
    expect(storedIndex.items[0].source.localPath).toBe('custom-wave.webm');
    expect(existsSync(path.join(userDataDir!, 'data', 'sprites', 'index.json'))).toBe(false);

    const sprites = await spriteAssets.listSprites();
    expect(sprites.map((sprite) => sprite.meta.id)).toEqual(['custom-wave', 'builtin-idle']);
    expect(sprites[0].meta.deletable).toBe(true);
    expect(sprites[1].meta.deletable).toBe(false);

    const removed = await removeSprite!(undefined, {
      id: 'custom-wave',
      deleteFile: true
    });
    expect(removed).toEqual({ ok: true });
    expect(JSON.parse(readFileSync(path.join(installedRoot, 'animations/index.json'), 'utf-8')).items).toEqual([]);
    expect(existsSync(path.join(installedRoot, 'animations/custom-wave.webm'))).toBe(false);
    expect((await spriteAssets.listSprites()).map((sprite) => sprite.meta.id)).toEqual(['builtin-idle']);

    await registerFromData!(undefined, {
      data: Buffer.from('custom-idle-webm'),
      meta: {
        id: 'custom-idle',
        title: 'Custom Idle',
        primaryTrigger: 'idle'
      }
    });
    expect((await spriteAssets.listSprites()).map((sprite) => sprite.meta.id)).toEqual(['custom-idle']);
  });

  it('normalizes primaryTrigger-only metadata on sprite:register', async () => {
    const rootDir = spritesRoot!;
    const sourcePath = path.join(rootDir, 'primary-trigger-only.webm');
    writeFileSync(sourcePath, 'fake-webm', 'utf-8');

    const spriteAssets = await import('../packages/sprite-core/handler/sprite-assets');
    spriteAssets.initSpriteHandlers({
      addAllowedResourceRoot: vi.fn(),
      getResourcePath: () => rootDir
    });
    const onAssetsChanged = vi.fn();
    spriteAssets.setSpriteAssetsChangeHandler(onAssetsChanged);

    const registerSprite = electronState.handlers.get('sprite:register') as ((_: unknown, payload: { filePath: string; meta: Record<string, unknown> }) => Promise<any>) | undefined;

    expect(registerSprite).toBeDefined();

    const item = await registerSprite!(undefined, {
      filePath: sourcePath,
      meta: {
        id: 'primary-trigger-only',
        title: 'Primary Trigger Only',
        primaryTrigger: 'celebrate',
        triggerAliases: ['workflow:complete'],
        priority: 6
      }
    });

    expect(item.meta).toMatchObject({
      id: 'primary-trigger-only',
      title: 'Primary Trigger Only',
      primaryTrigger: 'celebrate',
      triggerAliases: ['workflow:complete'],
      priority: 6,
      deletable: true
    });
    expect(item.meta).not.toHaveProperty('eventType');
    expect(onAssetsChanged).toHaveBeenCalledWith({ reason: 'register', id: 'primary-trigger-only' });
  });

  it('keeps legacy eventType-only input compatible on sprite:registerFromData without persisting a mirror field', async () => {
    const rootDir = spritesRoot!;

    const spriteAssets = await import('../packages/sprite-core/handler/sprite-assets');
    spriteAssets.initSpriteHandlers({
      addAllowedResourceRoot: vi.fn(),
      getResourcePath: () => rootDir
    });

    const registerFromData = electronState.handlers.get('sprite:registerFromData') as
      | ((_: unknown, payload: { data: Buffer; meta: Record<string, unknown>; loop?: boolean }) => Promise<any>)
      | undefined;

    expect(registerFromData).toBeDefined();

    const item = await registerFromData!(undefined, {
      data: Buffer.from('fake-webm'),
      loop: true,
      meta: {
        id: 'legacy-event-type-only',
        title: 'Legacy Event Type Only',
        eventType: 'idle'
      }
    });

    expect(item.meta).toMatchObject({
      id: 'legacy-event-type-only',
      title: 'Legacy Event Type Only',
      primaryTrigger: 'idle',
      deletable: true
    });
    expect(item.meta).not.toHaveProperty('eventType');
    expect(item.loop).toBe(true);
  });

  it('requires spriteManage capability for sprite asset authoring writes', async () => {
    const rootDir = spritesRoot!;
    const sourcePath = path.join(rootDir, 'locked-authoring.webm');
    writeFileSync(sourcePath, 'fake-webm', 'utf-8');
    const assertCapabilityUnlocked = vi.fn((capabilityId: string) => {
      throw new Error(`locked:${capabilityId}`);
    });

    const spriteAssets = await import('../packages/sprite-core/handler/sprite-assets');
    spriteAssets.initSpriteHandlers({
      addAllowedResourceRoot: vi.fn(),
      getResourcePath: () => rootDir,
      assertCapabilityUnlocked
    });

    const registerSprite = electronState.handlers.get('sprite:register') as ((_: unknown, payload: { filePath: string; meta: Record<string, unknown> }) => Promise<any>) | undefined;
    const registerFromData = electronState.handlers.get('sprite:registerFromData') as ((_: unknown, payload: { data: Buffer; meta: Record<string, unknown> }) => Promise<any>) | undefined;
    const updateMeta = electronState.handlers.get('sprite:updateMeta') as ((_: unknown, payload: { id: string; meta: Record<string, unknown> }) => Promise<any>) | undefined;
    const removeSprite = electronState.handlers.get('sprite:remove') as ((_: unknown, payload: { id: string }) => Promise<any>) | undefined;

    await expect(registerSprite!(undefined, { filePath: sourcePath, meta: { id: 'locked-authoring' } })).rejects.toThrow('locked:spriteManage');
    await expect(registerFromData!(undefined, { data: Buffer.from('fake-webm'), meta: { id: 'locked-from-data' } })).rejects.toThrow('locked:spriteManage');
    await expect(updateMeta!(undefined, { id: 'locked-authoring', meta: { title: 'Locked' } })).rejects.toThrow('locked:spriteManage');
    await expect(removeSprite!(undefined, { id: 'locked-authoring' })).rejects.toThrow('locked:spriteManage');
    expect(assertCapabilityUnlocked).toHaveBeenCalledTimes(4);
    expect(assertCapabilityUnlocked).toHaveBeenCalledWith('spriteManage');
  });
});

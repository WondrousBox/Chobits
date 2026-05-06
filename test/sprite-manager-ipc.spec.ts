import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SpriteEventBus } from '../packages/sprite-core/event-bus';
import { PersonaStateManager } from '../packages/sprite-core/persona-state';

const electronState = {
  userDataDir: '',
  handlers: new Map<string, unknown>(),
  windows: [] as Array<any>
};

const ipcMainHandle = vi.fn((channel: string, handler: unknown) => {
  electronState.handlers.set(channel, handler);
});
const ipcMainRemoveHandler = vi.fn((channel: string) => {
  electronState.handlers.delete(channel);
});

vi.mock('electron', () => ({
  app: {
    getPath: () => electronState.userDataDir,
    getVersion: () => '1.0.0'
  },
  BrowserWindow: {
    getAllWindows: () => electronState.windows
  },
  ipcMain: {
    handle: ipcMainHandle,
    removeHandler: ipcMainRemoveHandler
  },
  screen: {
    getPrimaryDisplay: () => ({
      workAreaSize: { width: 1440, height: 900 }
    }),
    getCursorScreenPoint: () => ({ x: 0, y: 0 })
  }
}));

const listSpritesMock = vi.fn();
const getDefaultSpritesDirMock = vi.fn(async () => '/tmp/test-sprites');
const setSpriteAssetsChangeHandlerMock = vi.fn();
vi.mock('../packages/sprite-core/handler/sprite-assets', () => ({
  listSprites: listSpritesMock,
  getDefaultSpritesDir: getDefaultSpritesDirMock,
  setSpriteAssetsChangeHandler: setSpriteAssetsChangeHandlerMock
}));

const initSpriteEventListenerMock = vi.fn(() => () => undefined);
vi.mock('../packages/sprite-core/handler/sprite-event-listener', () => ({
  initSpriteEventListener: initSpriteEventListenerMock
}));

const characterServiceState: {
  currentCharacter: Record<string, any> | null;
} = {
  currentCharacter: null
};

const characterPackManagerState: {
  packs: Array<any>;
  activePack: any | null;
} = {
  packs: [],
  activePack: null
};

vi.mock('../packages/sprite-core/character-service', () => ({
  initCharacterService: vi.fn(),
  getCharacterPackDefinition: vi.fn(() => null),
  getCharacterDefinition: vi.fn(() => characterServiceState.currentCharacter),
  reloadCharacterPack: vi.fn(() => null),
  reloadCharacter: vi.fn(() => characterServiceState.currentCharacter),
  buildCharacterPersonaPrompt: vi.fn(() => ''),
  getCharacterToolLabels: vi.fn(() => null),
  getConversationRewards: vi.fn(() => ({
    cooldownMs: 60_000,
    xpPerConversation: 15,
    favorPerConversation: 1.5,
    bonusConditions: []
  })),
  getActivityRewards: vi.fn(() => ({
    'workflow-complete': { xp: 12, favor: 0.4, dimensionGrowth: undefined },
    'resource-import-complete': { xp: 8, favor: 0.2, dimensionGrowth: undefined },
    'download-complete': { xp: 8, favor: 0.2, dimensionGrowth: undefined },
    'plugin-install': { xp: 10, favor: 0.3, dimensionGrowth: undefined },
    'plugin-update': { xp: 6, favor: 0.2, dimensionGrowth: undefined },
    'plugin-remove': { xp: 4, favor: 0, dimensionGrowth: undefined },
    'media-process-complete': { xp: 9, favor: 0.2, dimensionGrowth: undefined },
    'memory-extraction-completed': { xp: 3, favor: 0.1, dimensionGrowth: undefined },
    'user-persona-update-completed': { xp: 5, favor: 0.3, dimensionGrowth: undefined },
    'trash-restore': { xp: 4, favor: 0.1, dimensionGrowth: undefined }
  })),
  getDimensionSchema: vi.fn(() => []),
  getCharacterInfo: vi.fn(() =>
    characterServiceState.currentCharacter
      ? {
          id: characterServiceState.currentCharacter.id,
          name: characterServiceState.currentCharacter.name,
          nameAliases: characterServiceState.currentCharacter.nameAliases ?? [],
          tagline: characterServiceState.currentCharacter.identity?.tagline ?? 'Test'
        }
      : { id: 'test', name: 'Test', nameAliases: ['Test'], tagline: 'Test' }
  )
}));

vi.mock('../packages/sprite-core/character-pack-manager', () => ({
  initCharacterPackManager: vi.fn(() => undefined),
  resetCharacterPackManager: vi.fn(() => undefined),
  getCharacterPackImportPreviewCacheRootDir: vi.fn(() => '/tmp/character-pack-import-previews'),
  listCharacterPacks: vi.fn(async () =>
    characterPackManagerState.packs.map((pack) => ({
      ...pack,
      isActive: !!characterPackManagerState.activePack && pack.id === characterPackManagerState.activePack.id && pack.source === characterPackManagerState.activePack.source
    }))
  ),
  getActiveCharacterPack: vi.fn(async () => characterPackManagerState.activePack),
  activateCharacterPack: vi.fn(async (packId: string, options?: { source?: 'builtin' | 'installed' }) => {
    const target =
      characterPackManagerState.packs.find((pack) => pack.id === packId && (!options?.source || pack.source === options.source)) ?? characterPackManagerState.packs.find((pack) => pack.id === packId);
    if (!target) {
      return null;
    }

    const changed = !characterPackManagerState.activePack || characterPackManagerState.activePack.id !== target.id || characterPackManagerState.activePack.source !== target.source;
    characterPackManagerState.activePack = {
      ...target,
      isActive: true
    };

    return {
      changed,
      pack: characterPackManagerState.activePack
    };
  }),
  inspectCharacterPackFromArchive: vi.fn(async (archivePath: string) => {
    const normalizedId = path.basename(archivePath).replace(/\.(cbpk|zip)$/i, '');
    const existingPack = characterPackManagerState.packs.find((pack) => pack.id === normalizedId && pack.source === 'installed') ?? null;

    return {
      sourceType: 'archive',
      sourcePath: archivePath,
      pack: {
        formatVersion: 1,
        id: normalizedId,
        name: normalizedId,
        version: '1.0.0',
        author: 'test',
        description: `${normalizedId} description`,
        license: 'MIT',
        tags: ['test'],
        previewAvatarPath: path.join('/tmp/character-pack-import-previews', `${normalizedId}-avatar.png`),
        previewGifPath: path.join('/tmp/character-pack-import-previews', `${normalizedId}-preview.gif`),
        previewVideoPath: path.join('/tmp/character-pack-import-previews', `${normalizedId}-preview.webm`)
      },
      existingPack,
      activePack: characterPackManagerState.activePack,
      requiresReplace: !!existingPack,
      willReplaceActive: !!existingPack?.isActive,
      installable: true,
      blockingErrors: [],
      warnings: [],
      compatibility: {
        currentPlatform: process.platform,
        currentAppVersion: '1.0.0',
        minAppVersion: '1.0.0',
        appVersionSatisfied: true,
        supportedFormatVersion: 1,
        formatVersionSupported: true
      }
    };
  }),
  installCharacterPackFromArchive: vi.fn(async (archivePath: string, options?: { activate?: boolean; replaceExisting?: boolean }) => {
    const normalizedId = path.basename(archivePath).replace(/\.(cbpk|zip)$/i, '');
    const rootDir = `/tmp/${normalizedId}`;
    const isAlreadyActive = !!characterPackManagerState.activePack && characterPackManagerState.activePack.id === normalizedId && characterPackManagerState.activePack.source === 'installed';
    const pack = {
      id: normalizedId,
      name: normalizedId,
      version: '1.0.0',
      author: 'test',
      description: `${normalizedId} description`,
      license: 'MIT',
      tags: ['test'],
      source: 'installed',
      rootDir,
      packFile: path.join(rootDir, 'pack.json'),
      isActive: false,
      resolvedAssets: {}
    };

    characterPackManagerState.packs = [...characterPackManagerState.packs.filter((entry) => !(entry.id === pack.id && entry.source === 'installed')), pack];

    if (options?.activate) {
      characterPackManagerState.activePack = {
        ...pack,
        isActive: true
      };
    }

    return {
      replaced: options?.replaceExisting ?? false,
      activated: options?.activate ?? false,
      pack: {
        ...pack,
        isActive: (options?.activate ?? false) || isAlreadyActive
      }
    };
  }),
  exportCharacterPack: vi.fn(async (packId: string, outputPath: string, options?: { source?: 'builtin' | 'installed' }) => {
    const target =
      characterPackManagerState.packs.find((pack) => pack.id === packId && (!options?.source || pack.source === options.source)) ?? characterPackManagerState.packs.find((pack) => pack.id === packId);
    if (!target) {
      return null;
    }

    return {
      pack: target,
      outputPath,
      bytes: 42
    };
  }),
  removeCharacterPack: vi.fn(async (packId: string, options?: { source?: 'builtin' | 'installed' }) => {
    const target =
      characterPackManagerState.packs.find((pack) => pack.id === packId && (!options?.source || pack.source === options.source)) ?? characterPackManagerState.packs.find((pack) => pack.id === packId);
    if (!target) {
      return null;
    }

    characterPackManagerState.packs = characterPackManagerState.packs.filter((pack) => !(pack.id === target.id && pack.source === target.source));
    const activeStillExists =
      characterPackManagerState.activePack &&
      characterPackManagerState.packs.some((pack) => pack.id === characterPackManagerState.activePack.id && pack.source === characterPackManagerState.activePack.source);
    if (!activeStillExists) {
      characterPackManagerState.activePack = characterPackManagerState.packs.find((pack) => pack.source === 'builtin') ?? characterPackManagerState.packs[0] ?? null;
    }

    return {
      removedPack: target,
      activePack: characterPackManagerState.activePack,
      switchedActivePack: false
    };
  })
}));

vi.mock('../packages/ai/system-prompt-enricher', () => ({
  registerSystemPromptEnricher: vi.fn()
}));

vi.mock('../packages/ai/runtime/pi/tool-labels', () => ({
  setCharacterToolLabels: vi.fn()
}));

const getDailyCareServiceMock = vi.fn(() => null);
vi.mock('../electron/main/daily', () => ({
  getDailyCareService: getDailyCareServiceMock
}));

const loadShortcutEnabledConfigMock = vi.fn(() => ({ screenshot: false }));
const saveShortcutEnabledConfigMock = vi.fn((partial: { screenshot?: boolean }) => ({ screenshot: partial.screenshot ?? false }));
vi.mock('../electron/main/shortcut-store', () => ({
  loadShortcutEnabledConfig: loadShortcutEnabledConfigMock,
  saveShortcutEnabledConfig: saveShortcutEnabledConfigMock
}));

const getRecorderStatusSnapshotMock = vi.fn(() => ({ running: false }));
vi.mock('../packages/recorder/ipc-main', () => ({
  getRecorderStatusSnapshot: getRecorderStatusSnapshotMock
}));

const getASRStatusSnapshotMock = vi.fn(() => ({ running: false }));
const getASRConfigSnapshotMock = vi.fn(() => ({
  enabled: false,
  backend: 'local',
  local: { scene: 'meeting', model: '', language: 'zh', punctuationModel: '' },
  cloud: { providerId: '', providerPresetId: '', modelId: '' }
}));
const disableASRRuntimeMock = vi.fn();
vi.mock('../packages/sherpa/ipc-main', () => ({
  disableASRRuntime: disableASRRuntimeMock,
  getASRConfigSnapshot: getASRConfigSnapshotMock,
  getASRStatusSnapshot: getASRStatusSnapshotMock
}));

function createWindowStub(): {
  sent: Array<{ channel: string; payload: unknown }>;
  win: {
    webContents: {
      send(channel: string, payload: unknown): void;
    };
    getBounds(): { x: number; y: number; width: number; height: number };
    setPosition: ReturnType<typeof vi.fn>;
    setSize: ReturnType<typeof vi.fn>;
    isDestroyed(): boolean;
  };
} {
  const sent: Array<{ channel: string; payload: unknown }> = [];
  return {
    sent,
    win: {
      webContents: {
        send: (channel: string, payload: unknown) => {
          sent.push({ channel, payload });
        }
      },
      getBounds: () => ({ x: 0, y: 0, width: 200, height: 200 }),
      setPosition: vi.fn(),
      setSize: vi.fn(),
      isDestroyed: () => false
    }
  };
}

function createCharacterPayload(id: string, name: string, description = name.toLowerCase()): Record<string, any> {
  return {
    version: 1,
    id,
    name,
    nameAliases: [name.toLowerCase()],
    identity: {
      tagline: `${name} tagline`,
      background: 'background',
      coreTraits: [],
      boundaries: []
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
      xpPerConversation: 15,
      favorPerConversation: 1.5,
      cooldownMs: 60_000,
      bonusConditions: []
    },
    meta: {
      author: 'test',
      version: '1.0.0',
      license: 'MIT',
      description,
      tags: [],
      createdAt: '2026-04-22',
      updatedAt: '2026-04-22'
    }
  };
}

let windowStub = createWindowStub();
let dataDir = '';

async function destroySpriteManager(): Promise<void> {
  const { SpriteManager } = await import('../packages/sprite-core/manager');
  if (SpriteManager.hasInstance()) {
    try {
      await SpriteManager.getInstance().destroy();
    } catch {
      (SpriteManager as any).instance = null;
    }
  }
}

describe('sprite manager IPC integration', () => {
  beforeEach(async () => {
    vi.resetModules();
    ipcMainHandle.mockClear();
    ipcMainRemoveHandler.mockClear();
    listSpritesMock.mockReset();
    setSpriteAssetsChangeHandlerMock.mockReset();
    initSpriteEventListenerMock.mockClear();
    electronState.handlers.clear();
    getDailyCareServiceMock.mockReset();
    getDailyCareServiceMock.mockReturnValue(null);
    loadShortcutEnabledConfigMock.mockReset();
    loadShortcutEnabledConfigMock.mockReturnValue({ screenshot: false });
    saveShortcutEnabledConfigMock.mockReset();
    saveShortcutEnabledConfigMock.mockImplementation((partial: { screenshot?: boolean }) => ({ screenshot: partial.screenshot ?? false }));
    getRecorderStatusSnapshotMock.mockReset();
    getRecorderStatusSnapshotMock.mockReturnValue({ running: false });
    getASRStatusSnapshotMock.mockReset();
    getASRStatusSnapshotMock.mockReturnValue({ running: false });
    getASRConfigSnapshotMock.mockReset();
    getASRConfigSnapshotMock.mockReturnValue({
      enabled: false,
      backend: 'local',
      local: { scene: 'meeting', model: '', language: 'zh', punctuationModel: '' },
      cloud: { providerId: '', providerPresetId: '', modelId: '' }
    });
    disableASRRuntimeMock.mockReset();
    characterServiceState.currentCharacter = null;
    characterPackManagerState.packs = [
      {
        id: 'builtin-pack',
        name: 'Builtin Pack',
        version: '1.0.0',
        author: 'test',
        description: 'builtin pack',
        license: 'MIT',
        tags: ['builtin'],
        source: 'builtin',
        rootDir: '/tmp/test-sprites',
        packFile: '/tmp/test-sprites/pack.json',
        isActive: true,
        resolvedAssets: {}
      }
    ];
    characterPackManagerState.activePack = characterPackManagerState.packs[0];
    const characterService = await import('../packages/sprite-core/character-service');
    vi.mocked(characterService.getCharacterDefinition).mockImplementation(() => characterServiceState.currentCharacter as any);
    vi.mocked(characterService.reloadCharacter).mockImplementation(() => characterServiceState.currentCharacter as any);
    vi.mocked(characterService.getCharacterInfo).mockImplementation(() =>
      characterServiceState.currentCharacter
        ? {
            id: characterServiceState.currentCharacter.id,
            name: characterServiceState.currentCharacter.name,
            nameAliases: characterServiceState.currentCharacter.nameAliases ?? [],
            tagline: characterServiceState.currentCharacter.identity?.tagline ?? 'Test'
          }
        : { id: 'test', name: 'Test', nameAliases: ['Test'], tagline: 'Test' }
    );
    windowStub = createWindowStub();
    electronState.windows = [windowStub.win];
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'sprite-ipc-test-'));
    electronState.userDataDir = dataDir;
  });

  afterEach(async () => {
    await destroySpriteManager();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('loads animations before start so auto-walk schedule comes from walk movement metadata', async () => {
    listSpritesMock.mockResolvedValue([
      {
        meta: { id: 'walk-default', title: 'Walk', primaryTrigger: 'walk' },
        source: { localPath: './walk.webm', type: 'video/webm' },
        loopStartMs: 500,
        loopEndMs: 2500,
        movement: {
          enabled: true,
          trigger: 'behavior',
          mode: 'walkTo',
          speed: 60,
          behaviorSchedule: {
            type: 'random',
            minMs: 1111,
            maxMs: 2222,
            probability: 0.25,
            minIdleMs: 3333
          }
        }
      }
    ]);

    const { initSpriteManagerIPC } = await import('../packages/sprite-core/handler/sprite-manager-ipc');
    await initSpriteManagerIPC(windowStub.win as any, { addAllowedResourceRoot: vi.fn() });

    const { SpriteManager } = await import('../packages/sprite-core/manager');
    const mgr = SpriteManager.getInstance();
    const autoWalkRuntime = (mgr as any).behaviorEngine.behaviors.get('auto-walk');

    expect(autoWalkRuntime.definition.schedule).toEqual({
      type: 'random',
      intervalMs: undefined,
      minMs: 1111,
      maxMs: 2222
    });
    expect(autoWalkRuntime.definition.probability).toBe(0.25);
    expect(autoWalkRuntime.definition.conditions).toHaveLength(2);
  });

  it('forwards daily login and achievement persona events to the window', async () => {
    listSpritesMock.mockResolvedValue([]);

    const { initSpriteManagerIPC } = await import('../packages/sprite-core/handler/sprite-manager-ipc');
    await initSpriteManagerIPC(windowStub.win as any, { addAllowedResourceRoot: vi.fn() });

    const { SpriteManager } = await import('../packages/sprite-core/manager');
    const mgr = SpriteManager.getInstance();

    mgr.emit('persona:daily-login', { streak: 2, xpBonus: 50 });
    mgr.emit('persona:achievement-unlocked', { achievementId: 'first-chat' });

    expect(windowStub.sent).toContainEqual({
      channel: 'persona:daily-login',
      payload: { streak: 2, xpBonus: 50 }
    });
    expect(windowStub.sent).toContainEqual({
      channel: 'persona:achievement-unlocked',
      payload: { achievementId: 'first-chat' }
    });
  });

  it('keeps sprite auto-walk IPC in sync with the shared config snapshot', async () => {
    listSpritesMock.mockResolvedValue([]);

    const auxWindow = createWindowStub();
    electronState.windows = [windowStub.win, auxWindow.win];

    const { initSpriteManagerIPC } = await import('../packages/sprite-core/handler/sprite-manager-ipc');
    await initSpriteManagerIPC(windowStub.win as any, { addAllowedResourceRoot: vi.fn() });

    const getAutoWalk = electronState.handlers.get('sprite:config:getAutoWalk') as (() => boolean) | undefined;
    const setAutoWalk = electronState.handlers.get('sprite:config:setAutoWalk') as ((_: unknown, payload: { enabled: boolean }) => boolean) | undefined;

    expect(getAutoWalk).toBeTypeOf('function');
    expect(setAutoWalk).toBeTypeOf('function');
    expect(electronState.handlers.has('getAutoWalkEnabled')).toBe(false);
    expect(electronState.handlers.has('setAutoWalkEnabled')).toBe(false);
    expect(getAutoWalk?.()).toBe(true);

    expect(setAutoWalk?.({} as never, { enabled: false })).toBe(false);
    expect(getAutoWalk?.()).toBe(false);

    expect(windowStub.sent).toContainEqual({
      channel: 'sprite:config',
      payload: {
        width: 200,
        height: 200,
        padding: 100,
        animationPlaylistMode: 'list-loop',
        autoWalkEnabled: false,
        showDebugOverlay: false
      }
    });
    expect(auxWindow.sent).toContainEqual({
      channel: 'sprite:config',
      payload: {
        width: 200,
        height: 200,
        padding: 100,
        animationPlaylistMode: 'list-loop',
        autoWalkEnabled: false,
        showDebugOverlay: false
      }
    });
    expect(auxWindow.sent).toContainEqual({
      channel: 'sprite:capabilities:changed',
      payload: { source: 'movement.autoWalk' }
    });

    expect(setAutoWalk?.({} as never, { enabled: true })).toBe(true);
    expect(getAutoWalk?.()).toBe(true);

    expect(windowStub.sent).toContainEqual({
      channel: 'sprite:config',
      payload: {
        width: 200,
        height: 200,
        padding: 100,
        animationPlaylistMode: 'list-loop',
        autoWalkEnabled: true,
        showDebugOverlay: false
      }
    });
    expect(auxWindow.sent).toContainEqual({
      channel: 'sprite:config',
      payload: {
        width: 200,
        height: 200,
        padding: 100,
        animationPlaylistMode: 'list-loop',
        autoWalkEnabled: true,
        showDebugOverlay: false
      }
    });
    expect(auxWindow.sent).toContainEqual({
      channel: 'sprite:capabilities:changed',
      payload: { source: 'movement.autoWalk' }
    });
  });

  it('exposes animation playlist mode IPC handlers and broadcasts the shared config snapshot', async () => {
    listSpritesMock.mockResolvedValue([]);

    const { initSpriteManagerIPC } = await import('../packages/sprite-core/handler/sprite-manager-ipc');
    await initSpriteManagerIPC(windowStub.win as any, { addAllowedResourceRoot: vi.fn() });

    const getMode = electronState.handlers.get('sprite:config:getAnimationPlaylistMode') as ((_: unknown, payload?: { trigger?: string }) => string) | undefined;
    const setMode = electronState.handlers.get('sprite:config:setAnimationPlaylistMode') as ((_: unknown, payload: { mode: string; trigger?: string }) => string) | undefined;

    expect(getMode).toBeTypeOf('function');
    expect(setMode).toBeTypeOf('function');
    expect(getMode?.({} as never)).toBe('list-loop');
    expect(setMode?.({} as never, { mode: 'single-loop' })).toBe('single-loop');
    expect(getMode?.({} as never)).toBe('single-loop');
    expect(windowStub.sent).toContainEqual({
      channel: 'sprite:config',
      payload: {
        width: 200,
        height: 200,
        padding: 100,
        animationPlaylistMode: 'single-loop',
        autoWalkEnabled: true,
        showDebugOverlay: false
      }
    });
    expect(setMode?.({} as never, { mode: 'list-once', trigger: 'idle' })).toBe('list-once');
    expect(getMode?.({} as never, { trigger: 'idle' })).toBe('list-once');
    expect(getMode?.({} as never, { trigger: 'success' })).toBe('single-loop');
    expect(windowStub.sent).toContainEqual({
      channel: 'sprite:config',
      payload: {
        width: 200,
        height: 200,
        padding: 100,
        animationPlaylistMode: 'single-loop',
        animationPlaylistModes: {
          idle: 'list-once'
        },
        autoWalkEnabled: true,
        showDebugOverlay: false
      }
    });
  });

  it('updates sprite movement avoid regions through IPC and reclamps the sprite window', async () => {
    listSpritesMock.mockResolvedValue([]);

    const { initSpriteManagerIPC } = await import('../packages/sprite-core/handler/sprite-manager-ipc');
    await initSpriteManagerIPC(windowStub.win as any, { addAllowedResourceRoot: vi.fn() });

    const setAvoidRegions = electronState.handlers.get('sprite:movement:setAvoidRegions') as
      | ((_: unknown, payload: { regions: Array<{ x: number; y: number; width: number; height: number }> }) => unknown)
      | undefined;

    expect(setAvoidRegions).toBeTypeOf('function');
    expect(setAvoidRegions?.({} as never, { regions: [{ x: 0, y: 0, width: 400, height: 900 }] })).toEqual({ ok: true });
    expect(windowStub.win.setPosition).toHaveBeenCalledWith(300, 0);
  });

  it('allows movement preview through the shared movement capability at level 1', async () => {
    listSpritesMock.mockResolvedValue([]);

    const { initSpriteManagerIPC } = await import('../packages/sprite-core/handler/sprite-manager-ipc');
    await initSpriteManagerIPC(windowStub.win as any, { addAllowedResourceRoot: vi.fn() });

    const previewMovement = electronState.handlers.get('sprite:previewMovement') as
      | ((_: unknown, payload: { width: number; height: number; padding: number; movement?: { enabled?: boolean; mode?: string; direction?: string; speed?: number } }) => void)
      | undefined;

    expect(previewMovement).toBeTypeOf('function');
    expect(() =>
      previewMovement?.({} as never, {
        width: 320,
        height: 260,
        padding: 24,
        movement: {
          enabled: true,
          mode: 'direction',
          direction: 'right',
          speed: 72
        }
      })
    ).not.toThrow();
  });

  it('accepts trigger-named sprite:trigger payloads and rejects legacy eventType-only payloads', async () => {
    listSpritesMock.mockResolvedValue([]);

    const { initSpriteManagerIPC } = await import('../packages/sprite-core/handler/sprite-manager-ipc');
    await initSpriteManagerIPC(windowStub.win as any, { addAllowedResourceRoot: vi.fn() });

    const handleTrigger = electronState.handlers.get('sprite:trigger') as
      | ((_: unknown, payload: { trigger?: string; eventType?: string; message?: string; durationMs?: number; silent?: boolean }) => void)
      | undefined;
    const { SpriteManager } = await import('../packages/sprite-core/manager');
    const mgr = SpriteManager.getInstance();
    const triggerSpy = vi.spyOn(mgr, 'trigger').mockImplementation(() => undefined);

    expect(handleTrigger).toBeTypeOf('function');

    handleTrigger?.({} as never, { trigger: 'celebrate', durationMs: 1200, silent: true });
    expect(() => handleTrigger?.({} as never, { eventType: 'thinking', message: 'legacy fallback' })).toThrow('[sprite:trigger] Missing trigger');

    expect(triggerSpy).toHaveBeenCalledTimes(1);
    expect(triggerSpy).toHaveBeenNthCalledWith(1, 'celebrate', {
      message: undefined,
      duration: undefined,
      durationMs: 1200,
      ctx: undefined,
      silent: true
    });
  });

  it('forwards animation completion playId to SpriteManager', async () => {
    listSpritesMock.mockResolvedValue([]);

    const { initSpriteManagerIPC } = await import('../packages/sprite-core/handler/sprite-manager-ipc');
    await initSpriteManagerIPC(windowStub.win as any, { addAllowedResourceRoot: vi.fn() });

    const handleAnimComplete = electronState.handlers.get('sprite:anim-complete') as ((_: unknown, payload: { animId: string; phase: 'full'; playId?: string }) => void) | undefined;
    const { SpriteManager } = await import('../packages/sprite-core/manager');
    const mgr = SpriteManager.getInstance();
    const completeSpy = vi.spyOn(mgr, 'handleAnimationComplete').mockImplementation(() => undefined);

    expect(handleAnimComplete).toBeTypeOf('function');

    handleAnimComplete?.({} as never, { animId: 'thinking-purpose', phase: 'full', playId: 'purpose-1:play-1' });

    expect(completeSpy).toHaveBeenCalledWith('thinking-purpose', 'full', 'purpose-1:play-1');
  });

  it('registers purpose event and history IPC handlers', async () => {
    listSpritesMock.mockResolvedValue([]);

    const { initSpriteManagerIPC } = await import('../packages/sprite-core/handler/sprite-manager-ipc');
    await initSpriteManagerIPC(windowStub.win as any, { addAllowedResourceRoot: vi.fn() });

    const { SpriteManager } = await import('../packages/sprite-core/manager');
    const mgr = SpriteManager.getInstance();
    const eventSpy = vi.spyOn(mgr, 'emitPurposeEvent').mockReturnValue({ matched: 1 });
    const historySpy = vi.spyOn(mgr, 'listPurposeHistory').mockResolvedValue([]);
    const retrospectiveSpy = vi.spyOn(mgr, 'getPurposeDailyRetrospective').mockResolvedValue({
      date: '2026-05-03',
      generatedAt: 1,
      totalPurposeCount: 0,
      terminalPurposeCount: 0,
      completedCount: 0,
      cancelledCount: 0,
      failedCount: 0,
      kindCounts: {},
      memoryCandidateCount: 0,
      recallCues: [],
      items: []
    });

    const handleEvent = electronState.handlers.get('sprite:purpose:event') as ((_: unknown, payload: { event: string; correlationId?: string }) => unknown) | undefined;
    const handleHistory = electronState.handlers.get('sprite:purpose:listHistory') as ((_: unknown, payload: { kind?: string; limit?: number }) => unknown) | undefined;
    const handleRetrospective = electronState.handlers.get('sprite:purpose:getDailyRetrospective') as ((_: unknown, payload: { date?: string; limit?: number }) => unknown) | undefined;

    expect(handleEvent).toBeTypeOf('function');
    expect(handleHistory).toBeTypeOf('function');
    expect(handleRetrospective).toBeTypeOf('function');

    expect(handleEvent?.({} as never, { event: 'fileAction:selected', correlationId: 'drop-1' })).toEqual({ matched: 1 });
    await handleHistory?.({} as never, { kind: 'file.drop.intake', limit: 10 });
    await handleRetrospective?.({} as never, { date: '2026-05-03', limit: 5 });

    expect(eventSpy).toHaveBeenCalledWith({ event: 'fileAction:selected', correlationId: 'drop-1' });
    expect(historySpy).toHaveBeenCalledWith({ kind: 'file.drop.intake', limit: 10 });
    expect(retrospectiveSpy).toHaveBeenCalledWith({ date: '2026-05-03', limit: 5 });
  });

  it('bridges daily-care routine dispatches into sprite purposes', async () => {
    listSpritesMock.mockResolvedValue([]);
    let dispatchDailyCare: ((event: any) => void) | undefined;
    const onRoutineDispatched = vi.fn((listener: (event: any) => void) => {
      dispatchDailyCare = listener;
      return vi.fn();
    });
    getDailyCareServiceMock.mockReturnValue({
      getSnapshot: () => ({ enabled: true }),
      onRoutineDispatched
    });

    const { initSpriteManagerIPC } = await import('../packages/sprite-core/handler/sprite-manager-ipc');
    await initSpriteManagerIPC(windowStub.win as any, { addAllowedResourceRoot: vi.fn() });

    const { SpriteManager } = await import('../packages/sprite-core/manager');
    const mgr = SpriteManager.getInstance();
    const startPurposeSpy = vi.spyOn(mgr, 'startPurpose').mockResolvedValue({
      accepted: true,
      status: 'started',
      purpose: {
        id: 'purpose-daily-care',
        kind: 'daily.care.reminder',
        title: 'Daily care',
        reason: 'Drink water',
        source: 'system-event',
        status: 'active',
        priority: 55,
        interruptPolicy: 'interruptible'
      }
    });

    expect(onRoutineDispatched).toHaveBeenCalledTimes(1);
    dispatchDailyCare?.({
      routine: {
        id: 'care:hydration-hourly',
        title: 'Hydration',
        kind: 'hydration',
        severity: 'gentle',
        enabled: true,
        scheduleLabel: 'hourly',
        lastTriggeredAt: null,
        lastTriggeredLabel: null,
        source: 'default'
      },
      message: 'Drink water',
      manual: false,
      triggeredAt: 1000
    });
    dispatchDailyCare?.({
      routine: {
        id: 'care:midnight-guardian',
        title: 'Night guard',
        kind: 'nightGuard',
        severity: 'urgent',
        enabled: true,
        scheduleLabel: '00:30',
        lastTriggeredAt: null,
        lastTriggeredLabel: null,
        source: 'default'
      },
      message: 'Go rest',
      manual: true,
      triggeredAt: 2000
    });

    expect(startPurposeSpy.mock.calls).toEqual([
      [
        expect.objectContaining({
          kind: 'daily.care.reminder',
          presetId: 'daily.care.reminder',
          reason: 'Drink water',
          priority: 55,
          coalesceKey: 'daily-care:care:hydration-hourly',
          context: expect.objectContaining({
            routineId: 'care:hydration-hourly',
            routineKind: 'hydration',
            message: 'Drink water',
            manual: false
          })
        })
      ],
      [
        expect.objectContaining({
          kind: 'daily.rest-reminder',
          presetId: 'daily.rest-reminder',
          reason: 'Go rest',
          priority: 90,
          coalesceKey: 'daily-care:care:midnight-guardian',
          context: expect.objectContaining({
            routineId: 'care:midnight-guardian',
            routineKind: 'nightGuard',
            severity: 'urgent',
            manual: true
          })
        })
      ]
    ]);
  });

  it('builds capability snapshots from runtime authority instead of renderer-local state assembly', async () => {
    listSpritesMock.mockResolvedValue([]);
    getDailyCareServiceMock.mockReturnValue({
      getSnapshot: () => ({
        enabled: true
      })
    });
    loadShortcutEnabledConfigMock.mockReturnValue({ screenshot: true });
    getRecorderStatusSnapshotMock.mockReturnValue({ running: true });
    getASRStatusSnapshotMock.mockReturnValue({ running: true });

    const { initSpriteManagerIPC } = await import('../packages/sprite-core/handler/sprite-manager-ipc');
    await initSpriteManagerIPC(windowStub.win as any, { addAllowedResourceRoot: vi.fn() });

    const { SpriteManager } = await import('../packages/sprite-core/manager');
    const mgr = SpriteManager.getInstance();
    (mgr as any).personaState.loadState({
      level: 10,
      achievements: ['first-chat']
    });
    mgr.setAutoWalkEnabled(true);

    const getCapabilitySnapshot = electronState.handlers.get('sprite:capabilities:getSnapshot') as (() => unknown) | undefined;
    expect(getCapabilitySnapshot).toBeTypeOf('function');

    const snapshot = getCapabilitySnapshot?.() as {
      personaLevel: number;
      capabilities: Record<string, { status: string; active: boolean }>;
    };

    expect(snapshot.personaLevel).toBe(10);
    expect(snapshot.capabilities.movement.status).toBe('active');
    expect(snapshot.capabilities.dailyCare.status).toBe('active');
    expect(snapshot.capabilities.microphone.status).toBe('active');
    expect(snapshot.capabilities.systemAudio.status).toBe('active');
    expect(snapshot.capabilities.screenshot.status).toBe('active');
    expect(snapshot.capabilities.speechRecognition.status).toBe('active');
    expect(snapshot.capabilities.customAppearance.status).toBe('locked');
    expect(snapshot.capabilities.docUnderstanding.status).toBe('unlocked');
  });

  it('feeds character feature flags and persona flags into the default capability snapshot', async () => {
    listSpritesMock.mockResolvedValue([]);

    characterServiceState.currentCharacter = {
      version: 1,
      id: 'character-default',
      name: 'Default Character',
      nameAliases: ['default'],
      identity: {
        tagline: 'tagline',
        background: 'background',
        coreTraits: [],
        boundaries: []
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
        xpPerConversation: 15,
        favorPerConversation: 1.5,
        cooldownMs: 60_000,
        bonusConditions: []
      },
      capabilityFlags: {
        featureFlags: ['character:has-custom-appearance', 'pack:has-custom-animations'],
        personaFlags: [
          {
            id: 'persona:bonded',
            when: {
              type: 'compare',
              field: 'favor',
              operator: 'gte',
              value: 60
            }
          }
        ]
      },
      meta: {
        author: 'test',
        version: '1.0.0',
        license: 'MIT',
        description: 'default',
        tags: [],
        createdAt: '2026-04-22',
        updatedAt: '2026-04-22'
      }
    } as any;

    const { initSpriteManagerIPC } = await import('../packages/sprite-core/handler/sprite-manager-ipc');
    await initSpriteManagerIPC(windowStub.win as any, { addAllowedResourceRoot: vi.fn() });

    const { SpriteManager } = await import('../packages/sprite-core/manager');
    const mgr = SpriteManager.getInstance();
    (mgr as any).personaState.loadState({
      level: 15,
      favor: 72
    });
    mgr.setAutoWalkEnabled(true);

    const getCapabilitySnapshot = electronState.handlers.get('sprite:capabilities:getSnapshot') as (() => unknown) | undefined;
    const snapshot = getCapabilitySnapshot?.() as {
      capabilities: Record<string, { status: string; missingFeatureFlags?: string[]; missingPersonaFlags?: string[] }>;
    };

    expect(snapshot.capabilities.spriteManage.status).toBe('unlocked');
    expect(snapshot.capabilities.customAppearance.status).toBe('unlocked');
    expect(snapshot.capabilities.customAppearance.missingFeatureFlags).toEqual([]);
    expect(snapshot.capabilities.actionChoreography.status).toBe('unlocked');
    expect(snapshot.capabilities.emotionExpression.status).toBe('unlocked');
    expect(snapshot.capabilities.emotionExpression.missingPersonaFlags).toEqual([]);
    expect(snapshot.capabilities.smartAssistant.status).toBe('unlocked');
  });

  it('keeps auto-walk on when persona reset returns to the level 1 movement unlock', async () => {
    listSpritesMock.mockResolvedValue([]);

    const auxWindow = createWindowStub();
    electronState.windows = [windowStub.win, auxWindow.win];

    const { initSpriteManagerIPC } = await import('../packages/sprite-core/handler/sprite-manager-ipc');
    await initSpriteManagerIPC(windowStub.win as any, { addAllowedResourceRoot: vi.fn() });

    const setAutoWalk = electronState.handlers.get('sprite:config:setAutoWalk') as ((_: unknown, payload: { enabled: boolean }) => boolean) | undefined;
    const getAutoWalk = electronState.handlers.get('sprite:config:getAutoWalk') as (() => boolean) | undefined;
    const resetPersona = electronState.handlers.get('sprite:persona:reset') as (() => { ok: boolean; state: { level: number } }) | undefined;
    const { SpriteManager } = await import('../packages/sprite-core/manager');
    const mgr = SpriteManager.getInstance();

    (mgr as any).personaState.loadState({ level: 10 });
    expect(setAutoWalk?.({} as never, { enabled: true })).toBe(true);
    expect(getAutoWalk?.()).toBe(true);

    expect(resetPersona?.()).toMatchObject({
      ok: true,
      state: {
        level: 1
      }
    });
    expect(getAutoWalk?.()).toBe(true);
    expect(auxWindow.sent).not.toContainEqual({
      channel: 'sprite:config',
      payload: {
        width: 200,
        height: 200,
        padding: 100,
        animationPlaylistMode: 'list-loop',
        autoWalkEnabled: false,
        showDebugOverlay: false
      }
    });
  });

  it('disables ASR runtime at startup when speechRecognition is locked by recorder capability', async () => {
    listSpritesMock.mockResolvedValue([]);
    getASRStatusSnapshotMock.mockReturnValue({ running: true });
    getASRConfigSnapshotMock.mockReturnValue({
      enabled: true,
      backend: 'local',
      local: { scene: 'meeting', model: 'test-model', language: 'zh', punctuationModel: '' },
      cloud: { providerId: '', providerPresetId: '', modelId: '' }
    });

    const { initSpriteManagerIPC } = await import('../packages/sprite-core/handler/sprite-manager-ipc');
    await initSpriteManagerIPC(windowStub.win as any, { addAllowedResourceRoot: vi.fn() });

    expect(disableASRRuntimeMock).toHaveBeenCalledWith({ disableConfig: true });
  });

  it('reads dimension schema through the persona rules provider boundary', async () => {
    listSpritesMock.mockResolvedValue([]);

    const { setPersonaRulesProvider, resetPersonaRulesRuntime } = await import('../packages/sprite-core/persona-rules');
    setPersonaRulesProvider({
      getSnapshot: () => ({
        conversationRewards: {
          xpPerConversation: 15,
          favorPerConversation: 1.5,
          cooldownMs: 60_000,
          bonusConditions: []
        },
        activityRewards: {
          'workflow-complete': { xp: 1, favor: 0, dimensionGrowth: undefined }
        },
        dimensionSchema: [
          {
            id: 'custom-dimension',
            name: 'Custom Dimension',
            icon: 'sparkles',
            description: 'custom',
            maxValue: 42,
            initialValue: 6,
            growthSources: ['conversation']
          }
        ]
      })
    });

    try {
      const { initSpriteManagerIPC } = await import('../packages/sprite-core/handler/sprite-manager-ipc');
      await initSpriteManagerIPC(windowStub.win as any, { addAllowedResourceRoot: vi.fn() });

      const getDimensions = electronState.handlers.get('sprite:dimensions:get') as (() => unknown[]) | undefined;
      expect(getDimensions).toBeTypeOf('function');
      expect(getDimensions?.()).toEqual([
        {
          id: 'custom-dimension',
          name: 'Custom Dimension',
          icon: 'sparkles',
          description: 'custom',
          maxValue: 42,
          value: 6
        }
      ]);
    } finally {
      resetPersonaRulesRuntime();
    }
  });

  it('lists and activates character packs through IPC and reloads the runtime chain', async () => {
    listSpritesMock
      .mockResolvedValueOnce([
        {
          meta: { id: 'idle-builtin', title: 'Idle Builtin', primaryTrigger: 'idle' },
          source: { localPath: './idle-builtin.webm', type: 'video/webm' }
        }
      ])
      .mockResolvedValueOnce([
        {
          meta: { id: 'idle-installed', title: 'Idle Installed', primaryTrigger: 'idle' },
          source: { localPath: './idle-installed.webm', type: 'video/webm' }
        }
      ]);

    characterPackManagerState.packs = [
      {
        ...characterPackManagerState.packs[0],
        id: 'pack-alpha',
        name: 'Pack Alpha'
      },
      {
        id: 'pack-beta',
        name: 'Pack Beta',
        version: '1.0.0',
        author: 'test',
        description: 'pack beta',
        license: 'MIT',
        tags: ['test'],
        source: 'installed',
        rootDir: '/tmp/pack-beta',
        packFile: '/tmp/pack-beta/pack.json',
        isActive: false,
        resolvedAssets: {}
      }
    ];
    characterPackManagerState.activePack = characterPackManagerState.packs[0];

    const characterService = await import('../packages/sprite-core/character-service');
    const builtinCharacter = createCharacterPayload('character-alpha', 'Alpha', 'alpha');
    const installedCharacter = createCharacterPayload('character-beta', 'Beta', 'beta');
    characterServiceState.currentCharacter = builtinCharacter;
    vi.mocked(characterService.reloadCharacter).mockImplementation(() => {
      characterServiceState.currentCharacter = installedCharacter;
      return installedCharacter as any;
    });

    const { initSpriteManagerIPC } = await import('../packages/sprite-core/handler/sprite-manager-ipc');
    await initSpriteManagerIPC(windowStub.win as any, { addAllowedResourceRoot: vi.fn() });

    const listPacks = electronState.handlers.get('sprite:character:listPacks') as (() => Promise<any[]>) | undefined;
    const getActivePack = electronState.handlers.get('sprite:character:getActivePack') as (() => Promise<any>) | undefined;
    const activatePack = electronState.handlers.get('sprite:character:activatePack') as ((_: unknown, payload: { packId: string; source?: 'builtin' | 'installed' }) => Promise<any>) | undefined;

    expect(await listPacks?.()).toEqual([
      expect.objectContaining({ id: 'pack-alpha', source: 'builtin', isActive: true }),
      expect.objectContaining({ id: 'pack-beta', source: 'installed', isActive: false })
    ]);
    await expect(getActivePack?.()).resolves.toMatchObject({
      id: 'pack-alpha',
      source: 'builtin',
      isActive: true
    });

    await expect(activatePack?.({} as never, { packId: 'pack-beta', source: 'installed' })).resolves.toMatchObject({
      ok: true,
      changed: true,
      pack: {
        id: 'pack-beta',
        source: 'installed',
        isActive: true
      },
      character: {
        id: 'character-beta',
        name: 'Beta'
      },
      personaSlot: {
        slotId: 'character:character-beta',
        switched: true
      }
    });

    expect(vi.mocked(characterService.initCharacterService)).toHaveBeenLastCalledWith('/tmp/pack-beta');
    await expect(getActivePack?.()).resolves.toMatchObject({
      id: 'pack-beta',
      source: 'installed',
      isActive: true
    });
    expect(windowStub.sent).toContainEqual({
      channel: 'persona:character-switched',
      payload: expect.objectContaining({
        previousPack: expect.objectContaining({ id: 'pack-alpha', source: 'builtin' }),
        nextPack: expect.objectContaining({ id: 'pack-beta', source: 'installed' }),
        nextCharacter: expect.objectContaining({ id: 'character-beta', name: 'Beta' }),
        personaSlotId: 'character:character-beta'
      })
    });
  });

  it('inspects character pack archive imports through IPC before installation', async () => {
    listSpritesMock.mockResolvedValueOnce([]);

    characterPackManagerState.packs = [
      {
        ...characterPackManagerState.packs[0],
        id: 'pack-alpha',
        name: 'Pack Alpha'
      },
      {
        id: 'pack-delta',
        name: 'Pack Delta',
        version: '1.0.0',
        author: 'test',
        description: 'installed delta',
        license: 'MIT',
        tags: ['installed'],
        source: 'installed',
        rootDir: '/tmp/pack-delta',
        packFile: '/tmp/pack-delta/pack.json',
        isActive: true,
        resolvedAssets: {}
      }
    ];
    characterPackManagerState.activePack = characterPackManagerState.packs[1];

    const { initSpriteManagerIPC } = await import('../packages/sprite-core/handler/sprite-manager-ipc');
    await initSpriteManagerIPC(windowStub.win as any, { addAllowedResourceRoot: vi.fn() });

    const inspectArchive = electronState.handlers.get('sprite:character:inspectPackFromArchive') as ((_: unknown, payload: { archivePath: string }) => Promise<any>) | undefined;

    await expect(inspectArchive?.({} as never, { archivePath: '/tmp/pack-delta.cbpk' })).resolves.toMatchObject({
      sourceType: 'archive',
      sourcePath: '/tmp/pack-delta.cbpk',
      pack: {
        id: 'pack-delta',
        name: 'pack-delta'
      },
      existingPack: {
        id: 'pack-delta',
        source: 'installed'
      },
      activePack: {
        id: 'pack-delta',
        source: 'installed'
      },
      requiresReplace: true,
      willReplaceActive: true,
      installable: true,
      blockingErrors: []
    });
  });

  it('installs and activates a character pack archive through IPC', async () => {
    listSpritesMock.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        meta: { id: 'idle-pack-delta', title: 'Idle Delta', primaryTrigger: 'idle' },
        source: { localPath: './idle-pack-delta.webm', type: 'video/webm' }
      }
    ]);

    const characterService = await import('../packages/sprite-core/character-service');
    const builtinCharacter = createCharacterPayload('character-alpha', 'Alpha', 'alpha');
    const deltaCharacter = createCharacterPayload('character-delta', 'Delta', 'delta');
    characterServiceState.currentCharacter = builtinCharacter;
    vi.mocked(characterService.reloadCharacter).mockImplementation(() => {
      characterServiceState.currentCharacter = deltaCharacter;
      return deltaCharacter as any;
    });

    const { initSpriteManagerIPC } = await import('../packages/sprite-core/handler/sprite-manager-ipc');
    await initSpriteManagerIPC(windowStub.win as any, { addAllowedResourceRoot: vi.fn() });

    const installPackArchive = electronState.handlers.get('sprite:character:installPackFromArchive') as
      | ((_: unknown, payload: { archivePath: string; activate?: boolean; replaceExisting?: boolean }) => Promise<any>)
      | undefined;
    expect(installPackArchive).toBeTypeOf('function');

    await expect(installPackArchive?.({} as never, { archivePath: '/tmp/pack-delta.cbpk', activate: true })).resolves.toMatchObject({
      ok: true,
      activated: true,
      pack: {
        id: 'pack-delta',
        source: 'installed',
        isActive: true
      },
      character: {
        id: 'character-delta',
        name: 'Delta'
      },
      personaSlot: {
        slotId: 'character:character-delta'
      }
    });

    expect(vi.mocked(characterService.initCharacterService)).toHaveBeenLastCalledWith('/tmp/pack-delta');
    expect(windowStub.sent).toContainEqual({
      channel: 'sprite:play',
      payload: expect.objectContaining({
        animationId: 'idle-pack-delta'
      })
    });
  });

  it('removes the active installed pack through IPC by switching back to the fallback pack first', async () => {
    listSpritesMock
      .mockResolvedValueOnce([
        {
          meta: { id: 'idle-active-pack', title: 'Idle Active', primaryTrigger: 'idle' },
          source: { localPath: './idle-active-pack.webm', type: 'video/webm' }
        }
      ])
      .mockResolvedValueOnce([
        {
          meta: { id: 'idle-fallback-pack', title: 'Idle Fallback', primaryTrigger: 'idle' },
          source: { localPath: './idle-fallback-pack.webm', type: 'video/webm' }
        }
      ]);

    characterPackManagerState.packs = [
      {
        id: 'pack-alpha',
        name: 'Pack Alpha',
        version: '1.0.0',
        author: 'test',
        description: 'builtin',
        license: 'MIT',
        tags: ['builtin'],
        source: 'builtin',
        rootDir: '/tmp/pack-alpha',
        packFile: '/tmp/pack-alpha/pack.json',
        isActive: false,
        resolvedAssets: {}
      },
      {
        id: 'pack-beta',
        name: 'Pack Beta',
        version: '1.0.0',
        author: 'test',
        description: 'installed',
        license: 'MIT',
        tags: ['installed'],
        source: 'installed',
        rootDir: '/tmp/pack-beta',
        packFile: '/tmp/pack-beta/pack.json',
        isActive: true,
        resolvedAssets: {}
      }
    ];
    characterPackManagerState.activePack = characterPackManagerState.packs[1];

    const characterService = await import('../packages/sprite-core/character-service');
    const activeCharacter = createCharacterPayload('character-beta', 'Beta', 'beta');
    const fallbackCharacter = createCharacterPayload('character-alpha', 'Alpha', 'alpha');
    characterServiceState.currentCharacter = activeCharacter;
    vi.mocked(characterService.reloadCharacter).mockImplementation(() => {
      characterServiceState.currentCharacter = fallbackCharacter;
      return fallbackCharacter as any;
    });

    const { initSpriteManagerIPC } = await import('../packages/sprite-core/handler/sprite-manager-ipc');
    await initSpriteManagerIPC(windowStub.win as any, { addAllowedResourceRoot: vi.fn() });

    const removePack = electronState.handlers.get('sprite:character:removePack') as ((_: unknown, payload: { packId: string; source?: 'builtin' | 'installed' }) => Promise<any>) | undefined;
    expect(removePack).toBeTypeOf('function');

    await expect(removePack?.({} as never, { packId: 'pack-beta', source: 'installed' })).resolves.toMatchObject({
      ok: true,
      removedPack: {
        id: 'pack-beta',
        source: 'installed'
      },
      activePack: {
        id: 'pack-alpha',
        source: 'builtin'
      },
      switchedActivePack: true,
      character: {
        id: 'character-alpha',
        name: 'Alpha'
      },
      personaSlot: {
        slotId: 'character:character-alpha',
        switched: true
      }
    });

    expect(vi.mocked(characterService.initCharacterService)).toHaveBeenLastCalledWith('/tmp/pack-alpha');
    expect(windowStub.sent).toContainEqual({
      channel: 'persona:character-switched',
      payload: expect.objectContaining({
        previousPack: expect.objectContaining({ id: 'pack-beta', source: 'installed' }),
        nextPack: expect.objectContaining({ id: 'pack-alpha', source: 'builtin' }),
        nextCharacter: expect.objectContaining({ id: 'character-alpha', name: 'Alpha' })
      })
    });
  });

  it('reloads the active character runtime through IPC', async () => {
    listSpritesMock
      .mockResolvedValueOnce([
        {
          meta: { id: 'idle-pack-a', title: 'Idle A', primaryTrigger: 'idle' },
          source: { localPath: './idle-a.webm', type: 'video/webm' }
        }
      ])
      .mockResolvedValueOnce([
        {
          meta: { id: 'idle-pack-b', title: 'Idle B', primaryTrigger: 'idle' },
          source: { localPath: './idle-b.webm', type: 'video/webm' }
        }
      ]);

    const characterService = await import('../packages/sprite-core/character-service');
    characterServiceState.currentCharacter = {
      version: 1,
      id: 'character-initial',
      name: 'Initial',
      nameAliases: ['initial'],
      identity: {
        tagline: 'initial tagline',
        background: 'background',
        coreTraits: [],
        boundaries: []
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
        xpPerConversation: 15,
        favorPerConversation: 1.5,
        cooldownMs: 60_000,
        bonusConditions: []
      },
      meta: {
        author: 'test',
        version: '1.0.0',
        license: 'MIT',
        description: 'initial',
        tags: [],
        createdAt: '2026-04-22',
        updatedAt: '2026-04-22'
      }
    };
    vi.mocked(characterService.reloadCharacter).mockImplementation(() => {
      characterServiceState.currentCharacter = {
        version: 1,
        id: 'character-reloaded',
        name: 'Reloaded',
        nameAliases: ['reloaded'],
        identity: {
          tagline: 'tagline',
          background: 'background',
          coreTraits: [],
          boundaries: []
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
          xpPerConversation: 15,
          favorPerConversation: 1.5,
          cooldownMs: 60_000,
          bonusConditions: []
        },
        meta: {
          author: 'test',
          version: '1.0.0',
          license: 'MIT',
          description: 'reloaded',
          tags: [],
          createdAt: '2026-04-22',
          updatedAt: '2026-04-22'
        }
      };
      return characterServiceState.currentCharacter as any;
    });

    const { initSpriteManagerIPC } = await import('../packages/sprite-core/handler/sprite-manager-ipc');
    await initSpriteManagerIPC(windowStub.win as any, { addAllowedResourceRoot: vi.fn() });

    const { SpriteManager } = await import('../packages/sprite-core/manager');
    expect(
      SpriteManager.getInstance()
        .getAnimationList()
        .map((entry) => entry.id)
    ).toEqual(['idle-pack-a']);

    const reloadCharacter = electronState.handlers.get('sprite:character:reload') as (() => Promise<unknown>) | undefined;
    expect(reloadCharacter).toBeTypeOf('function');
    await expect(reloadCharacter?.()).resolves.toEqual({
      ok: true,
      character: {
        id: 'character-reloaded',
        name: 'Reloaded',
        nameAliases: ['reloaded'],
        tagline: 'tagline'
      },
      runtime: {
        characterId: 'character-reloaded',
        layerApplied: false,
        matcherIds: []
      },
      personaSlot: {
        slotId: 'character:character-reloaded',
        restored: false,
        switched: true
      }
    });

    expect(
      SpriteManager.getInstance()
        .getAnimationList()
        .map((entry) => entry.id)
    ).toEqual(['idle-pack-b']);
    expect(windowStub.sent).toContainEqual({
      channel: 'sprite:play',
      payload: expect.objectContaining({
        animationId: 'idle-pack-b'
      })
    });

    expect(windowStub.sent).toContainEqual({
      channel: 'sprite:capabilities:changed',
      payload: { source: 'character.reload' }
    });
  });

  it('persists persona state per character slot when reloading between characters', async () => {
    listSpritesMock.mockResolvedValue([]);

    const characterService = await import('../packages/sprite-core/character-service');
    const characterA = createCharacterPayload('character-a', 'Alpha', 'alpha');
    const characterB = createCharacterPayload('character-b', 'Beta', 'beta');
    characterServiceState.currentCharacter = characterA;

    vi.mocked(characterService.reloadCharacter)
      .mockImplementationOnce(() => {
        characterServiceState.currentCharacter = characterB;
        return characterB as any;
      })
      .mockImplementationOnce(() => {
        characterServiceState.currentCharacter = characterA;
        return characterA as any;
      });

    const { initSpriteManagerIPC } = await import('../packages/sprite-core/handler/sprite-manager-ipc');
    await initSpriteManagerIPC(windowStub.win as any, { addAllowedResourceRoot: vi.fn() });

    const { SpriteManager } = await import('../packages/sprite-core/manager');
    const manager = SpriteManager.getInstance();
    manager.addXP(42, 'alpha-test');
    manager.changeFavor(8, 'alpha-test');
    manager.updateDimension('curiosity', 5, 100);
    const alphaSnapshotBeforeSwitch = manager.getPersonaState();

    const reloadCharacter = electronState.handlers.get('sprite:character:reload') as (() => Promise<any>) | undefined;
    expect(reloadCharacter).toBeTypeOf('function');

    await expect(reloadCharacter?.()).resolves.toMatchObject({
      personaSlot: {
        slotId: 'character:character-b',
        restored: false,
        switched: true
      }
    });

    expect(manager.getPersonaState()).toMatchObject({
      name: 'Beta',
      xp: 0,
      favor: 50
    });

    manager.addXP(7, 'beta-test');
    manager.changeFavor(-4, 'beta-test');

    await expect(reloadCharacter?.()).resolves.toMatchObject({
      personaSlot: {
        slotId: 'character:character-a',
        restored: true,
        switched: true
      }
    });

    expect(manager.getPersonaState()).toMatchObject({
      name: alphaSnapshotBeforeSwitch.name,
      xp: alphaSnapshotBeforeSwitch.xp,
      favor: alphaSnapshotBeforeSwitch.favor
    });
    expect(manager.getPersonaState().dimensions).toMatchObject({
      curiosity: alphaSnapshotBeforeSwitch.dimensions.curiosity
    });
  });

  it('routes renderer persona mutations through unified reward entry', async () => {
    listSpritesMock.mockResolvedValue([]);

    const { initSpriteManagerIPC } = await import('../packages/sprite-core/handler/sprite-manager-ipc');
    await initSpriteManagerIPC(windowStub.win as any, { addAllowedResourceRoot: vi.fn() });

    const grantReward = electronState.handlers.get('sprite:persona:grantReward') as
      | ((_: unknown, payload: { xp?: number; favor?: number; source?: string; achievementId?: string }) => any)
      | undefined;
    const addXP = electronState.handlers.get('sprite:persona:addXP') as ((_: unknown, payload: { amount: number; source?: string }) => any) | undefined;
    const changeFavor = electronState.handlers.get('sprite:persona:changeFavor') as ((_: unknown, payload: { delta: number; reason?: string }) => any) | undefined;
    const unlockAchievement = electronState.handlers.get('sprite:persona:unlockAchievement') as ((_: unknown, payload: { id: string }) => any) | undefined;

    expect(grantReward).toBeTypeOf('function');

    const { SpriteManager } = await import('../packages/sprite-core/manager');
    const initialFavor = SpriteManager.getInstance().getPersonaState().favor;

    expect(grantReward!(undefined, { xp: 12, favor: 3, source: 'unified-test' })).toMatchObject({
      ok: true,
      source: 'unified-test',
      applied: { xp: 12, favor: 3 },
      xpGained: 12,
      oldFavor: initialFavor,
      newFavor: initialFavor + 3,
      state: { favor: initialFavor + 3 }
    });

    expect(addXP!(undefined, { amount: 5, source: 'legacy-xp' })).toMatchObject({
      ok: true,
      source: 'legacy-xp',
      applied: { xp: 5, favor: 0 },
      xpGained: 5
    });

    expect(changeFavor!(undefined, { delta: -2, reason: 'legacy-favor' })).toMatchObject({
      ok: true,
      source: 'legacy-favor',
      oldFavor: initialFavor + 3,
      newFavor: initialFavor + 1
    });

    expect(unlockAchievement!(undefined, { id: 'legacy-achievement' })).toMatchObject({
      ok: true,
      unlocked: true,
      state: {
        achievements: expect.arrayContaining(['legacy-achievement'])
      }
    });
  });
});

describe('persona daily-login payload', () => {
  it('emits xpBonus in persona:daily-login payload', () => {
    const eventBus = new SpriteEventBus();
    const payloads: Array<{ streak: number; xpBonus: number }> = [];

    eventBus.on('persona:daily-login', (event) => {
      payloads.push(event.payload as { streak: number; xpBonus: number });
    });

    const manager = new PersonaStateManager({
      eventBus,
      initialState: {
        lastLoginDate: '2000-01-01',
        loginStreak: 0
      }
    });

    const result = manager.recordDailyLogin();

    expect(result.isNewDay).toBe(true);
    expect(payloads).toEqual([
      {
        streak: result.streak,
        xpBonus: result.xpBonus
      }
    ]);
  });
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { CharacterStatePersistence } from '../../packages/sprite-core/manager/persistence';
import { SpriteManager } from '../../packages/sprite-core/manager/sprite-manager';

function createTestWindow(): {
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
  const win = {
    webContents: {
      send: () => undefined
    },
    getBounds: () => ({ x: 0, y: 0, width: 200, height: 200 }),
    setPosition: vi.fn(),
    setSize: vi.fn(),
    isDestroyed: () => false
  };

  return { win };
}

function createManager(dataDir: string): SpriteManager {
  const { win } = createTestWindow();
  return SpriteManager.init({
    win: win as any,
    dataDir,
    getScreenSize: () => ({ width: 1280, height: 720 }),
    appName: 'SpriteTest'
  });
}

async function destroyManager(): Promise<void> {
  if (SpriteManager.hasInstance()) {
    try {
      await SpriteManager.getInstance().destroy();
    } catch {
      (SpriteManager as any).instance = null;
    }
  }
}

describe('sprite persistence', () => {
  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await destroyManager();
  });

  it('normalizes legacy persona-state snapshots on load and ignores progression fields', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'sprite-persistence-test-'));
    const settingsDir = path.join(dataDir, 'data');
    const filePath = path.join(settingsDir, 'persona-state.json');
    mkdirSync(settingsDir, { recursive: true });

    writeFileSync(
      filePath,
      JSON.stringify(
        {
          id: 123,
          xp: 'bad',
          level: 12,
          favor: 88,
          mood: 'joyful',
          moodIntensity: 72,
          loginStreak: 5,
          claimedRewards: { 'quest:x': { at: 1 } },
          achievements: '["first-chat","power-user",123]',
          dimensions: {
            curiosity: 12.5,
            broken: 'x',
            completion: 7
          },
          createdAt: 111,
          updatedAt: 222
        },
        null,
        2
      ),
      'utf8'
    );

    const persistence = new CharacterStatePersistence(dataDir);
    await expect(persistence.load()).resolves.toEqual({
      id: 'default',
      version: 2,
      name: 'Chobits',
      description: undefined,
      mood: 'joyful',
      moodIntensity: 72,
      achievements: ['first-chat', 'power-user'],
      dimensions: {
        curiosity: 12.5,
        completion: 7
      },
      createdAt: 111,
      updatedAt: 222
    });

    rmSync(dataDir, { recursive: true, force: true });
  });

  it('round-trips persona state through manager destroy/start with the same data dir', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'sprite-persistence-test-'));

    const first = createManager(dataDir);
    vi.spyOn((first as any).speakService, 'speak').mockResolvedValue({ ok: false } as any);

    first.setMood('joyful', 72);
    first.initDimensions([{ id: 'curiosity', initialValue: 5 }]);
    (first as any).characterState.loadState({
      achievements: ['first-chat']
    });

    await first.destroy();

    const second = createManager(dataDir);
    vi.spyOn((second as any).speakService, 'init').mockResolvedValue(undefined);
    await second.start();

    expect(second.getCharacterState()).toMatchObject({
      // 养成字段已移除，等级/好感度为固定展示值
      level: 1,
      favor: 50,
      favorLevel: 'friend',
      mood: 'joyful',
      moodIntensity: 72,
      achievements: ['first-chat']
    });
    expect(second.getCharacterState().dimensions).toEqual({
      curiosity: 5
    });

    await second.destroy();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('stores independent persona slots for different characters in the same persistence file', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'sprite-persistence-test-'));
    const persistence = new CharacterStatePersistence(dataDir);

    await persistence.save({
      id: 'character:alpha',
      version: 2,
      name: 'Alpha',
      mood: 'joyful',
      moodIntensity: 80,
      achievements: ['alpha-achievement'],
      dimensions: {
        curiosity: 4
      },
      createdAt: 1,
      updatedAt: 2
    });
    await persistence.save({
      id: 'character:beta',
      version: 2,
      name: 'Beta',
      mood: 'neutral',
      moodIntensity: 50,
      achievements: [],
      dimensions: {
        calm: 2
      },
      createdAt: 3,
      updatedAt: 4
    });

    await expect(persistence.load('character:alpha')).resolves.toMatchObject({
      id: 'character:alpha',
      name: 'Alpha',
      mood: 'joyful',
      achievements: ['alpha-achievement']
    });
    await expect(persistence.load('character:beta')).resolves.toMatchObject({
      id: 'character:beta',
      name: 'Beta',
      mood: 'neutral',
      dimensions: {
        calm: 2
      }
    });
    await expect(persistence.load('character:missing')).resolves.toBeNull();

    rmSync(dataDir, { recursive: true, force: true });
  });

  it('loads the configured character persona slot on startup', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'sprite-persistence-test-'));
    const persistence = new CharacterStatePersistence(dataDir);
    await persistence.save({
      id: 'character:alpha',
      version: 2,
      name: 'Alpha',
      mood: 'joyful',
      moodIntensity: 70,
      achievements: ['alpha-memory'],
      dimensions: {
        curiosity: 9
      },
      createdAt: 1,
      updatedAt: 2
    });

    const manager = createManager(dataDir);
    vi.spyOn((manager as any).speakService, 'init').mockResolvedValue(undefined);
    manager.configureCharacterStateSlot('character:alpha', { name: 'Alpha' });

    await manager.start();

    expect(manager.getActiveCharacterStateId()).toBe('character:alpha');
    expect(manager.getCharacterState()).toMatchObject({
      name: 'Alpha',
      mood: 'joyful',
      achievements: ['alpha-memory']
    });
    expect(manager.getCharacterState().dimensions).toEqual({
      curiosity: 9
    });

    await manager.destroy();
    rmSync(dataDir, { recursive: true, force: true });
  });
});

import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

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
  sent: Array<{ channel: string; payload: unknown }>;
} {
  const sent: Array<{ channel: string; payload: unknown }> = [];
  const win = {
    webContents: {
      send: (channel: string, payload: unknown) => {
        sent.push({ channel, payload });
      }
    },
    getBounds: () => ({ x: 0, y: 0, width: 200, height: 200 }),
    setPosition: vi.fn(),
    setSize: vi.fn(),
    isDestroyed: () => false
  };

  return { win, sent };
}

function createManager(dataDir?: string): {
  mgr: SpriteManager;
  dataDir: string;
  sent: Array<{ channel: string; payload: unknown }>;
} {
  const resolvedDataDir = dataDir ?? mkdtempSync(path.join(os.tmpdir(), 'sprite-interaction-test-'));
  const { win, sent } = createTestWindow();
  const mgr = SpriteManager.init({
    win: win as any,
    dataDir: resolvedDataDir,
    getScreenSize: () => ({ width: 1280, height: 720 }),
    appName: 'SpriteTest'
  });

  return { mgr, dataDir: resolvedDataDir, sent };
}

async function destroyManager(dataDir?: string): Promise<void> {
  if (SpriteManager.hasInstance()) {
    try {
      await SpriteManager.getInstance().destroy();
    } catch {
      (SpriteManager as any).instance = null;
    }
  }

  if (dataDir) {
    rmSync(dataDir, { recursive: true, force: true });
  }
}

describe('sprite interaction runtime', () => {
  const dataDirs = new Set<string>();

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await destroyManager();
    for (const dataDir of dataDirs) {
      rmSync(dataDir, { recursive: true, force: true });
    }
    dataDirs.clear();
  });

  it('routes click interaction through event bus into tracker stats', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-21T12:00:00.000Z'));

    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);
    vi.spyOn(mgr, 'playOnce').mockReturnValue(true);
    vi.spyOn(mgr, 'showToast').mockImplementation(() => undefined);

    mgr.reportInteraction('click');
    mgr.reportInteraction('click');

    vi.advanceTimersByTime(5_000);
    mgr.reportInteraction('click');

    // 养成数值已移除，角色状态保持固定展示值
    expect(mgr.getCharacterState()).toMatchObject({
      favor: 50,
      favorLevel: 'friend',
      mood: 'neutral'
    });

    const stats = (mgr as any).interactionTracker.getStats();
    expect(stats).toMatchObject({
      total: 3,
      todayCount: 3,
      mostFrequent: 'click'
    });
    expect(stats.byType.click).toBe(3);
  });
});

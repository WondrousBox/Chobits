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

  it('routes click interaction through event bus into tracker stats and persona rewards', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-21T12:00:00.000Z'));

    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);
    vi.spyOn(mgr, 'playOnce').mockReturnValue(true);
    vi.spyOn(mgr, 'showToast').mockImplementation(() => undefined);

    expect(mgr.getPersonaState()).toMatchObject({
      xp: 0,
      favor: 50,
      totalInteractions: 0
    });

    mgr.reportInteraction('click');
    expect(mgr.getPersonaState()).toMatchObject({
      xp: 2,
      favor: 50.5,
      totalInteractions: 1
    });

    mgr.reportInteraction('click');
    expect(mgr.getPersonaState()).toMatchObject({
      xp: 4,
      favor: 50.5,
      totalInteractions: 2
    });

    vi.advanceTimersByTime(5_000);
    mgr.reportInteraction('click');

    expect(mgr.getPersonaState()).toMatchObject({
      xp: 6,
      favor: 51,
      totalInteractions: 3
    });

    const stats = (mgr as any).interactionTracker.getStats();
    expect(stats).toMatchObject({
      total: 3,
      todayCount: 3,
      mostFrequent: 'click'
    });
    expect(stats.byType.click).toBe(3);
  });

  it('keeps file-drop on the same interaction -> reaction -> reward entry', () => {
    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);
    const playOnceSpy = vi.spyOn(mgr, 'playOnce').mockReturnValue(true);
    const showToastSpy = vi.spyOn(mgr, 'showToast').mockImplementation(() => undefined);

    mgr.reportInteraction('file-drop', { fileCount: 2 });

    expect(mgr.getPersonaState()).toMatchObject({
      xp: 10,
      favor: 51,
      totalInteractions: 1
    });
    expect(playOnceSpy).toHaveBeenCalledWith('file-drop', { durationMs: 800 });
    expect(showToastSpy).not.toHaveBeenCalled();

    const stats = (mgr as any).interactionTracker.getStats();
    expect(stats.byType['file-drop']).toBe(1);
  });
});

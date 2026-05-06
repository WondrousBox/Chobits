import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SpriteManager } from '../packages/sprite-core/manager/sprite-manager';

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

function createManager(dataDir: string): {
  mgr: SpriteManager;
  sent: Array<{ channel: string; payload: unknown }>;
} {
  const { win, sent } = createTestWindow();
  const mgr = SpriteManager.init({
    win: win as any,
    dataDir,
    getScreenSize: () => ({ width: 1280, height: 720 }),
    appName: 'SpriteTest'
  });

  return { mgr, sent };
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

describe('sprite config authority', () => {
  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await destroyManager();
  });

  it('broadcasts runtime sprite metrics immediately but only persists auto-walk authority across restart', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'sprite-config-test-'));

    const first = createManager(dataDir);
    first.mgr.setSpriteConfig({
      width: 260,
      height: 210,
      padding: 40,
      showDebugOverlay: true,
      autoWalkEnabled: false
    });

    expect(first.mgr.getInitialState().config).toEqual({
      width: 260,
      height: 210,
      padding: 40,
      animationPlaylistMode: 'list-loop',
      autoWalkEnabled: false,
      showDebugOverlay: true
    });
    expect(first.sent).toContainEqual({
      channel: 'sprite:config',
      payload: {
        width: 260,
        height: 210,
        padding: 40,
        animationPlaylistMode: 'list-loop',
        autoWalkEnabled: false,
        showDebugOverlay: true
      }
    });

    const autoWalkFile = JSON.parse(readFileSync(path.join(dataDir, 'data', 'auto-walk-config.json'), 'utf8'));
    expect(autoWalkFile).toEqual({ enabled: false });

    await first.mgr.destroy();

    const second = createManager(dataDir);
    vi.spyOn((second.mgr as any).speakService, 'init').mockResolvedValue(undefined);
    await second.mgr.start();

    expect(second.mgr.getInitialState().config).toEqual({
      width: 200,
      height: 200,
      padding: 100,
      animationPlaylistMode: 'list-loop',
      autoWalkEnabled: false,
      showDebugOverlay: false
    });

    await second.mgr.destroy();
    rmSync(dataDir, { recursive: true, force: true });
  });
});

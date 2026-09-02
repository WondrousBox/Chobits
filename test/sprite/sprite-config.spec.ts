import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

  it('broadcasts runtime sprite metrics immediately without persisting them across restart', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'sprite-config-test-'));

    const first = createManager(dataDir);
    first.mgr.setSpriteConfig({
      width: 260,
      height: 210,
      padding: 40,
      debugOverlayEnabled: true
    });

    expect(first.mgr.getInitialState().config).toEqual({
      width: 260,
      height: 210,
      padding: 40,
      animationPlaylistMode: 'list-loop',
      debugOverlayEnabled: true,
      bubbleMode: 'fixed-top'
    });
    expect(first.sent).toContainEqual({
      channel: 'sprite:config',
      payload: {
        width: 260,
        height: 210,
        padding: 40,
        animationPlaylistMode: 'list-loop',
        debugOverlayEnabled: true,
        bubbleMode: 'fixed-top'
      }
    });

    await first.mgr.destroy();

    const second = createManager(dataDir);
    vi.spyOn((second.mgr as any).speakService, 'init').mockResolvedValue(undefined);
    await second.mgr.start();

    expect(second.mgr.getInitialState().config).toEqual({
      width: 200,
      height: 200,
      padding: 100,
      animationPlaylistMode: 'list-loop',
      debugOverlayEnabled: false,
      bubbleMode: 'fixed-top'
    });

    await second.mgr.destroy();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('uses fixed-top by default and persists it after a mode change', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'sprite-bubble-mode-test-'));

    const first = createManager(dataDir);
    expect(first.mgr.getBubbleMode()).toBe('fixed-top');
    expect(first.mgr.getEffectivePadding()).toBe(0);
    expect(first.mgr.getSpriteConfig().bubbleMode).toBe('fixed-top');
    expect(first.mgr.setBubbleMode('inline')).toBe('inline');
    expect(first.mgr.getEffectivePadding()).toBe(100);
    expect(first.mgr.setBubbleMode('fixed-top')).toBe('fixed-top');
    expect(first.mgr.getEffectivePadding()).toBe(0);

    const bubbleModeFile = JSON.parse(readFileSync(path.join(dataDir, 'data', 'sprite-bubble-mode.json'), 'utf8'));
    expect(bubbleModeFile).toEqual({ mode: 'fixed-top' });

    await first.mgr.destroy();
    rmSync(dataDir, { recursive: true, force: true });
  });
});

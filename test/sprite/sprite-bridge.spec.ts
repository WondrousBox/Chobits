import { afterEach, describe, expect, it, vi } from 'vitest';

const electronHarness = vi.hoisted(() => {
  const listeners = new Map<string, Set<(...args: any[]) => void>>();
  const invoke = vi.fn(async () => undefined);
  const on = vi.fn((channel: string, handler: (...args: any[]) => void) => {
    if (!listeners.has(channel)) {
      listeners.set(channel, new Set());
    }
    listeners.get(channel)!.add(handler);
  });
  const off = vi.fn((channel: string, handler: (...args: any[]) => void) => {
    listeners.get(channel)?.delete(handler);
  });

  return {
    invoke,
    on,
    off,
    emit(channel: string, payload: unknown) {
      for (const handler of listeners.get(channel) ?? []) {
        handler({}, payload);
      }
    },
    reset() {
      listeners.clear();
      invoke.mockClear();
      on.mockClear();
      off.mockClear();
    }
  };
});

vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: electronHarness.invoke,
    on: electronHarness.on,
    off: electronHarness.off
  }
}));

import { spriteBridge } from '../../packages/sprite-core/preload/sprite-bridge';

describe('sprite preload bridge', () => {
  afterEach(() => {
    electronHarness.reset();
  });

  it('forwards trigger payloads through ipcRenderer.invoke', async () => {
    await spriteBridge.trigger('celebrate', { durationMs: 1500, silent: true });

    expect(electronHarness.invoke).toHaveBeenCalledTimes(1);
    expect(electronHarness.invoke).toHaveBeenNthCalledWith(1, 'sprite:trigger', {
      trigger: 'celebrate',
      durationMs: 1500,
      silent: true
    });
  });

  it('forwards sprite config updates without going through registration', async () => {
    await spriteBridge.updateConfig('wave-1', {
      width: 180,
      height: 240,
      padding: 80,
      loop: true,
      loopCount: 2,
      meta: {
        title: 'Wave Edited',
        primaryTrigger: 'wave'
      }
    });

    expect(electronHarness.invoke).toHaveBeenCalledTimes(1);
    expect(electronHarness.invoke).toHaveBeenNthCalledWith(1, 'sprite:update-config', {
      id: 'wave-1',
      patch: {
        width: 180,
        height: 240,
        padding: 80,
        loop: true,
        loopCount: 2,
        meta: {
          title: 'Wave Edited',
          primaryTrigger: 'wave'
        }
      }
    });
  });

  it('forwards animation playlist mode config calls', async () => {
    await spriteBridge.getAnimationPlaylistMode();
    await spriteBridge.setAnimationPlaylistMode('list-loop');
    await spriteBridge.getAnimationPlaylistMode('idle');
    await spriteBridge.setAnimationPlaylistMode('list-once', 'idle');

    expect(electronHarness.invoke).toHaveBeenNthCalledWith(1, 'sprite:config:get-animation-playlist-mode');
    expect(electronHarness.invoke).toHaveBeenNthCalledWith(2, 'sprite:config:set-animation-playlist-mode', { mode: 'list-loop' });
    expect(electronHarness.invoke).toHaveBeenNthCalledWith(3, 'sprite:config:get-animation-playlist-mode', { trigger: 'idle' });
    expect(electronHarness.invoke).toHaveBeenNthCalledWith(4, 'sprite:config:set-animation-playlist-mode', { mode: 'list-once', trigger: 'idle' });
  });

  it('forwards animation completion with an optional playId', async () => {
    await spriteBridge.animComplete('thinking-purpose', 'full', 'purpose-1:play-1');

    expect(electronHarness.invoke).toHaveBeenCalledTimes(1);
    expect(electronHarness.invoke).toHaveBeenNthCalledWith(1, 'sprite:anim-complete', {
      animId: 'thinking-purpose',
      phase: 'full',
      playId: 'purpose-1:play-1'
    });
  });

  it('forwards purpose events and retrospective queries', async () => {
    await spriteBridge.emitPurposeEvent({
      source: 'purpose-event',
      event: 'fileAction:selected',
      correlationId: 'drop-1',
      payload: { actionId: 'summarize' }
    });
    await spriteBridge.getPurposeDailyRetrospective({ date: '2026-05-03', limit: 5 });

    expect(electronHarness.invoke).toHaveBeenNthCalledWith(1, 'sprite:purpose:event', {
      source: 'purpose-event',
      event: 'fileAction:selected',
      correlationId: 'drop-1',
      payload: { actionId: 'summarize' }
    });
    expect(electronHarness.invoke).toHaveBeenNthCalledWith(2, 'sprite:purpose:get-daily-retrospective', {
      date: '2026-05-03',
      limit: 5
    });
  });

  it('subscribes to sprite:config and removes the same listener on cleanup', () => {
    const callback = vi.fn();

    const cleanup = spriteBridge.onConfig(callback);
    const handler = electronHarness.on.mock.calls[0]?.[1];
    expect(electronHarness.on).toHaveBeenCalledWith('sprite:config', expect.any(Function));

    electronHarness.emit('sprite:config', { debugOverlayEnabled: false });
    expect(callback).toHaveBeenCalledWith({ debugOverlayEnabled: false });

    cleanup();
    expect(electronHarness.off).toHaveBeenCalledWith('sprite:config', handler);
  });
});

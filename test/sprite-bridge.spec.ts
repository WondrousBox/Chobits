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

import { spriteBridge } from '../packages/sprite-core/preload/sprite-bridge';
import { MESSAGE_IPC_CHANNELS } from '../packages/sprite-core/types';

describe('sprite preload bridge', () => {
  afterEach(() => {
    electronHarness.reset();
  });

  it('forwards previewMovement and trigger payloads through ipcRenderer.invoke', async () => {
    const previewConfig = {
      width: 320,
      height: 240,
      padding: 24,
      movement: {
        enabled: true,
        mode: 'direction' as const,
        direction: 'left' as const,
        speed: 64
      }
    };

    await spriteBridge.previewMovement(previewConfig);
    await spriteBridge.trigger('celebrate', { durationMs: 1500, silent: true });

    expect(electronHarness.invoke).toHaveBeenNthCalledWith(1, 'sprite:previewMovement', previewConfig);
    expect(electronHarness.invoke).toHaveBeenNthCalledWith(2, 'sprite:trigger', {
      trigger: 'celebrate',
      durationMs: 1500,
      silent: true
    });
  });

  it('forwards listByTrigger queries through the trigger-named IPC contract', async () => {
    await spriteBridge.listByTrigger('celebrate');

    expect(electronHarness.invoke).toHaveBeenCalledTimes(1);
    expect(electronHarness.invoke).toHaveBeenNthCalledWith(1, 'sprite:listByTrigger', {
      trigger: 'celebrate'
    });
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

  it('forwards purpose events and history queries', async () => {
    await spriteBridge.emitPurposeEvent({
      source: 'purpose-event',
      event: 'fileAction:selected',
      correlationId: 'drop-1',
      payload: { actionId: 'summarize' }
    });
    await spriteBridge.listPurposeHistory({ kind: 'file.drop.intake', limit: 20 });
    await spriteBridge.getPurposeDailyRetrospective({ date: '2026-05-03', limit: 5 });

    expect(electronHarness.invoke).toHaveBeenNthCalledWith(1, 'sprite:purpose:event', {
      source: 'purpose-event',
      event: 'fileAction:selected',
      correlationId: 'drop-1',
      payload: { actionId: 'summarize' }
    });
    expect(electronHarness.invoke).toHaveBeenNthCalledWith(2, 'sprite:purpose:listHistory', {
      kind: 'file.drop.intake',
      limit: 20
    });
    expect(electronHarness.invoke).toHaveBeenNthCalledWith(3, 'sprite:purpose:getDailyRetrospective', {
      date: '2026-05-03',
      limit: 5
    });
  });

  it('forwards purpose planner preferences and status IPC calls', async () => {
    await spriteBridge.getPurposePlannerPreferences();
    await spriteBridge.updatePurposePlannerPreferences({ enabled: true, historyLimit: 12 });
    await spriteBridge.getPurposePlannerStatus();

    expect(electronHarness.invoke).toHaveBeenNthCalledWith(1, 'sprite:purposePlanner:getPreferences');
    expect(electronHarness.invoke).toHaveBeenNthCalledWith(2, 'sprite:purposePlanner:updatePreferences', {
      enabled: true,
      historyLimit: 12
    });
    expect(electronHarness.invoke).toHaveBeenNthCalledWith(3, 'sprite:purposePlanner:getStatus');
  });

  it('subscribes to sprite:config and removes the same listener on cleanup', () => {
    const callback = vi.fn();

    const cleanup = spriteBridge.onConfig(callback);
    const handler = electronHarness.on.mock.calls[0]?.[1];
    expect(electronHarness.on).toHaveBeenCalledWith('sprite:config', expect.any(Function));

    electronHarness.emit('sprite:config', { autoWalkEnabled: false });
    expect(callback).toHaveBeenCalledWith({ autoWalkEnabled: false });

    cleanup();
    expect(electronHarness.off).toHaveBeenCalledWith('sprite:config', handler);
  });

  it('only relays sprite show bridge messages to onMessage subscribers', () => {
    const callback = vi.fn();
    const cleanup = spriteBridge.onMessage(callback);

    electronHarness.emit(MESSAGE_IPC_CHANNELS.BRIDGE, {
      kind: 'show',
      source: 'app',
      payload: { type: 'toast', content: 'ignore app source' }
    });
    electronHarness.emit(MESSAGE_IPC_CHANNELS.BRIDGE, {
      kind: 'clear',
      source: 'sprite',
      payload: { type: 'toast' }
    });
    electronHarness.emit(MESSAGE_IPC_CHANNELS.BRIDGE, {
      kind: 'show',
      source: 'sprite',
      payload: { type: 'toast', content: 'keep me' }
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ type: 'toast', content: 'keep me' });

    cleanup();
  });

  it('only clears busy subscribers for busy-like clear events', () => {
    const callback = vi.fn();
    const cleanup = spriteBridge.onBusyClear(callback);

    electronHarness.emit(MESSAGE_IPC_CHANNELS.BRIDGE, {
      kind: 'show',
      source: 'sprite',
      payload: { type: 'busy', content: 'loading' }
    });
    electronHarness.emit(MESSAGE_IPC_CHANNELS.BRIDGE, {
      kind: 'clear',
      source: 'app',
      payload: { type: 'busy' }
    });
    electronHarness.emit(MESSAGE_IPC_CHANNELS.BRIDGE, {
      kind: 'clear',
      source: 'sprite',
      payload: { type: 'toast' }
    });
    electronHarness.emit(MESSAGE_IPC_CHANNELS.BRIDGE, {
      kind: 'clear',
      source: 'sprite',
      payload: { type: 'busy' }
    });
    electronHarness.emit(MESSAGE_IPC_CHANNELS.BRIDGE, {
      kind: 'clear',
      source: 'sprite',
      payload: { type: 'all' }
    });

    expect(callback).toHaveBeenCalledTimes(2);

    cleanup();
  });
});

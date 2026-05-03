import { afterEach, describe, expect, it, vi } from 'vitest';

import { DAILY_CARE_SNAPSHOT_UPDATED_CHANNEL } from '../electron/main/daily/types';
import { SPRITE_CAPABILITY_CHANGED_CHANNEL } from '../packages/sprite-core/capability-events';

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

import { dailyCareBridge } from '../electron/main/daily/ipc-renderer';
import { personaApi } from '../electron/preload/apis/persona';

describe('persona and daily-care preload bridges', () => {
  afterEach(() => {
    electronHarness.reset();
  });

  it('subscribes to capability changes through the persona preload bridge', () => {
    const callback = vi.fn();

    const cleanup = personaApi.onCapabilityChanged(callback);
    const handler = electronHarness.on.mock.calls[0]?.[1];
    expect(electronHarness.on).toHaveBeenCalledWith(SPRITE_CAPABILITY_CHANGED_CHANNEL, expect.any(Function));

    electronHarness.emit(SPRITE_CAPABILITY_CHANGED_CHANNEL, { source: 'test-source' });
    expect(callback).toHaveBeenCalledWith({ source: 'test-source' });

    cleanup();
    expect(electronHarness.off).toHaveBeenCalledWith(SPRITE_CAPABILITY_CHANGED_CHANNEL, handler);
  });

  it('subscribes to persona state changes only through sprite:state', () => {
    const callback = vi.fn();

    const cleanup = personaApi.onStateChanged(callback);
    const handler = electronHarness.on.mock.calls[0]?.[1];
    expect(electronHarness.on).toHaveBeenCalledTimes(1);
    expect(electronHarness.on).toHaveBeenCalledWith('sprite:state', expect.any(Function));

    electronHarness.emit('sprite:state', {
      personaSnapshot: {
        level: 7,
        xp: 42,
        favor: 3,
        favorLevel: 'friend',
        mood: 'calm',
        moodIntensity: 10,
        achievements: [],
        dimensions: {}
      }
    });
    expect(callback).toHaveBeenCalledWith({
      level: 7,
      xp: 42,
      favor: 3,
      favorLevel: 'friend',
      mood: 'calm',
      moodIntensity: 10,
      achievements: [],
      dimensions: {}
    });

    cleanup();
    expect(electronHarness.off).not.toHaveBeenCalledWith('persona:state-changed', expect.any(Function));
    expect(electronHarness.off).toHaveBeenCalledWith('sprite:state', handler);
  });

  it('exposes character pack IPC helpers through the persona preload bridge', async () => {
    await personaApi.listCharacterPacks();
    expect(electronHarness.invoke).toHaveBeenNthCalledWith(1, 'sprite:character:listPacks');

    await personaApi.getActiveCharacterPack();
    expect(electronHarness.invoke).toHaveBeenNthCalledWith(2, 'sprite:character:getActivePack');

    await personaApi.activateCharacterPack('pack-beta', 'installed');
    expect(electronHarness.invoke).toHaveBeenNthCalledWith(3, 'sprite:character:activatePack', {
      packId: 'pack-beta',
      source: 'installed'
    });

    await personaApi.inspectCharacterPackFromArchive('/tmp/pack-delta.chobits-character');
    expect(electronHarness.invoke).toHaveBeenNthCalledWith(4, 'sprite:character:inspectPackFromArchive', {
      archivePath: '/tmp/pack-delta.chobits-character'
    });

    await personaApi.installCharacterPackFromArchive('/tmp/pack-delta.chobits-character', {
      activate: true
    });
    expect(electronHarness.invoke).toHaveBeenNthCalledWith(5, 'sprite:character:installPackFromArchive', {
      archivePath: '/tmp/pack-delta.chobits-character',
      replaceExisting: undefined,
      activate: true
    });

    await personaApi.removeCharacterPack('pack-delta', 'installed');
    expect(electronHarness.invoke).toHaveBeenNthCalledWith(6, 'sprite:character:removePack', {
      packId: 'pack-delta',
      source: 'installed'
    });
  });

  it('subscribes to character switched events through the persona preload bridge', () => {
    const callback = vi.fn();

    const cleanup = personaApi.onCharacterSwitched(callback);
    const handler = electronHarness.on.mock.calls[0]?.[1];
    expect(electronHarness.on).toHaveBeenCalledWith('persona:character-switched', expect.any(Function));

    electronHarness.emit('persona:character-switched', {
      previousPack: { id: 'pack-alpha', source: 'builtin' },
      nextPack: { id: 'pack-beta', source: 'installed' },
      previousCharacter: { id: 'character-alpha', name: 'Alpha', nameAliases: ['alpha'], tagline: 'alpha' },
      nextCharacter: { id: 'character-beta', name: 'Beta', nameAliases: ['beta'], tagline: 'beta' },
      personaSlotId: 'character:character-beta'
    });
    expect(callback).toHaveBeenCalledWith({
      previousPack: { id: 'pack-alpha', source: 'builtin' },
      nextPack: { id: 'pack-beta', source: 'installed' },
      previousCharacter: { id: 'character-alpha', name: 'Alpha', nameAliases: ['alpha'], tagline: 'alpha' },
      nextCharacter: { id: 'character-beta', name: 'Beta', nameAliases: ['beta'], tagline: 'beta' },
      personaSlotId: 'character:character-beta'
    });

    cleanup();
    expect(electronHarness.off).toHaveBeenCalledWith('persona:character-switched', handler);
  });

  it('subscribes to daily-care snapshot updates through the bridge', () => {
    const callback = vi.fn();

    const cleanup = dailyCareBridge.onSnapshotUpdated(callback);
    const handler = electronHarness.on.mock.calls[0]?.[1];
    expect(electronHarness.on).toHaveBeenCalledWith(DAILY_CARE_SNAPSHOT_UPDATED_CHANNEL, expect.any(Function));

    electronHarness.emit(DAILY_CARE_SNAPSHOT_UPDATED_CHANNEL, {
      enabled: true,
      routines: [],
      customReminders: [],
      lastUpdated: 123
    });
    expect(callback).toHaveBeenCalledWith({
      enabled: true,
      routines: [],
      customReminders: [],
      lastUpdated: 123
    });

    cleanup();
    expect(electronHarness.off).toHaveBeenCalledWith(DAILY_CARE_SNAPSHOT_UPDATED_CHANNEL, handler);
  });
});

import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const electronHarness = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => unknown>();
  return {
    handlers,
    handle: vi.fn((channel: string, handler: (...args: any[]) => unknown) => {
      handlers.set(channel, handler);
    }),
    reset() {
      handlers.clear();
      this.handle.mockClear();
    }
  };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: electronHarness.handle
  }
}));

import { initSpritePurposePlannerHandlers } from '../../electron/main/handlers/sprite/purpose-planner-ipc';
import { SpritePurposePlannerPreferencesStore } from '../../electron/main/handlers/sprite/purpose-planner-preferences';
import { SpritePurposePlannerService } from '../../electron/main/handlers/sprite/purpose-planner-service';
import { DEFAULT_SPRITE_ROUTINE_PRESETS } from '../../packages/sprite-core/purpose';

describe('sprite purpose planner IPC', () => {
  let tempDir = '';

  afterEach(() => {
    electronHarness.reset();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('exposes persisted preferences and read-only status', async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'purpose-planner-ipc-'));
    const store = new SpritePurposePlannerPreferencesStore(tempDir);
    const service = new SpritePurposePlannerService({
      presets: DEFAULT_SPRITE_ROUTINE_PRESETS,
      preferences: store.read()
    });

    initSpritePurposePlannerHandlers(service, store);

    const getPreferences = electronHarness.handlers.get('sprite:purpose-planner:get-preferences');
    const updatePreferences = electronHarness.handlers.get('sprite:purpose-planner:update-preferences');
    const getStatus = electronHarness.handlers.get('sprite:purpose-planner:get-status');

    expect(getPreferences).toBeTypeOf('function');
    expect(updatePreferences).toBeTypeOf('function');
    expect(getStatus).toBeTypeOf('function');

    expect(getPreferences?.({} as never)).toEqual({ enabled: false, historyLimit: 20 });
    await expect(updatePreferences?.({} as never, { enabled: true, historyLimit: 9 })).resolves.toEqual({ enabled: true, historyLimit: 9 });
    expect(store.read()).toEqual({ enabled: true, historyLimit: 9 });
    expect(getStatus?.({} as never)).toMatchObject({
      enabled: true,
      historyLimit: 9,
      hasExecutor: false
    });
  });
});

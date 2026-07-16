import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  eventManager: { emit: vi.fn() },
  restoreMock: vi.fn()
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
      state.handlers.set(channel, handler);
    })
  }
}));

vi.mock('@packages/event', () => ({
  AppEvent: {
    RESOURCE_UPDATED: 'RESOURCE_UPDATED',
    FOLDER_UPDATED: 'FOLDER_UPDATED',
    SPRITE_TRASH_RESTORE: 'SPRITE_TRASH_RESTORE',
    SPRITE_TRASH_DELETE: 'SPRITE_TRASH_DELETE'
  },
  eventManager: state.eventManager
}));

vi.mock('../electron/main/db/repositories', () => ({
  RecycleBinRepo: {
    list: vi.fn(),
    restoreEntitiesByRecycleIds: state.restoreMock,
    purgeEntitiesByRecycleIds: vi.fn(),
    empty: vi.fn()
  }
}));

vi.mock('../electron/main/handlers/memory/memory-cleanup', () => ({
  cleanupMemoryForConversations: vi.fn()
}));

import { initTrashHandlers } from '../electron/main/handlers/trash/ipc-main';

describe('trash:restore handler', () => {
  beforeEach(() => {
    state.handlers.clear();
    state.eventManager.emit.mockClear();
    state.restoreMock.mockReset();
    initTrashHandlers();
  });

  it('broadcasts resource and folder refresh events after restore', async () => {
    state.restoreMock.mockResolvedValue(1);

    const restore = state.handlers.get('trash:restore');
    expect(restore).toBeDefined();

    await expect(restore!(null, { recycleIds: ['res:resource-1'] })).resolves.toEqual({ restored: 1 });

    expect(state.eventManager.emit).toHaveBeenNthCalledWith(1, 'RESOURCE_UPDATED', {
      action: 'restored',
      recycleIds: ['res:resource-1']
    });
    expect(state.eventManager.emit).toHaveBeenNthCalledWith(2, 'FOLDER_UPDATED', {
      action: 'restored',
      recycleIds: ['res:resource-1']
    });
    expect(state.eventManager.emit).toHaveBeenNthCalledWith(3, 'SPRITE_TRASH_RESTORE', { message: '已恢复 1 个项目' });
  });

  it('does not broadcast refresh events when nothing is restored', async () => {
    state.restoreMock.mockResolvedValue(0);

    const restore = state.handlers.get('trash:restore');
    expect(restore).toBeDefined();

    await expect(restore!(null, { recycleIds: ['missing'] })).resolves.toEqual({ restored: 0 });
    expect(state.eventManager.emit).not.toHaveBeenCalled();
  });
});

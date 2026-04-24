import { beforeEach, describe, expect, it, vi } from 'vitest';

const ipcHandlers = new Map<string, unknown>();
const ipcMainHandle = vi.fn((channel: string, handler: unknown) => {
  ipcHandlers.set(channel, handler);
});

const assertSpriteCapabilityUnlockedMock = vi.fn((capabilityId: string) => {
  throw new Error(`Sprite capability locked: ${capabilityId}`);
});

const saveShortcutEnabledConfigMock = vi.fn();

vi.mock('electron', () => ({
  ipcMain: {
    handle: ipcMainHandle
  },
  BrowserWindow: {
    getAllWindows: () => [],
    fromWebContents: () => null
  },
  globalShortcut: {
    register: vi.fn(() => true),
    unregister: vi.fn()
  },
  desktopCapturer: {
    getSources: vi.fn(async () => [])
  },
  dialog: {
    showMessageBox: vi.fn(async () => ({ response: 1 }))
  },
  screen: {
    getAllDisplays: () => []
  },
  shell: {
    openExternal: vi.fn()
  },
  systemPreferences: {
    getMediaAccessStatus: vi.fn(() => 'granted')
  }
}));

vi.mock('../packages/sprite-core/capability-runtime', () => ({
  assertSpriteCapabilityUnlocked: assertSpriteCapabilityUnlockedMock
}));

vi.mock('@aim-packages/window-manager', () => ({
  windowManager: {
    createOrShow: vi.fn(),
    get: vi.fn(),
    show: vi.fn()
  }
}));

vi.mock('../electron/main/db/repositories', () => ({
  FoldersRepo: {},
  ResourcesRepo: {
    upsert: vi.fn()
  },
  WorkspacesRepo: {
    getDefault: vi.fn()
  }
}));

vi.mock('../packages/event', () => ({
  eventManager: {
    emit: vi.fn()
  }
}));

vi.mock('../electron/main/shortcut-store', () => ({
  getShortcutSchema: vi.fn(() => []),
  loadShortcutEnabledConfig: vi.fn(() => ({ screenshot: false })),
  loadShortcutsConfig: vi.fn(() => ({})),
  notifyShortcutEnabledUpdatedTo: vi.fn(),
  notifyShortcutsUpdatedTo: vi.fn(),
  onShortcutEnabledChanged: vi.fn(() => () => undefined),
  onShortcutsConfigChanged: vi.fn(() => () => undefined),
  resolveAcceleratorsForPlatform: vi.fn(() => ({})),
  saveShortcutEnabledConfig: saveShortcutEnabledConfigMock,
  saveShortcutsConfig: vi.fn((partial) => partial),
  validateShortcutsConfig: vi.fn()
}));

describe('capability runtime main-process entrypoints', () => {
  beforeEach(() => {
    vi.resetModules();
    ipcHandlers.clear();
    ipcMainHandle.mockClear();
    assertSpriteCapabilityUnlockedMock.mockClear();
    assertSpriteCapabilityUnlockedMock.mockImplementation((capabilityId: string) => {
      throw new Error(`Sprite capability locked: ${capabilityId}`);
    });
    saveShortcutEnabledConfigMock.mockReset();
  });

  it('blocks screenshot execution at the real manager entrypoints', async () => {
    const { screenshotManager } = await import('../electron/main/screenshot');

    await expect(screenshotManager.start()).rejects.toThrow('Sprite capability locked: screenshot');
    await expect(screenshotManager.save('data:image/png;base64,AAAA')).rejects.toThrow('Sprite capability locked: screenshot');

    expect(assertSpriteCapabilityUnlockedMock).toHaveBeenCalledWith('screenshot');
  });

  it('blocks enabling screenshot shortcuts when the capability authority rejects it', async () => {
    const win = {
      webContents: {
        send: vi.fn()
      }
    };

    const { initShortcutsHandlers } = await import('../electron/main/handlers/shortcuts');
    initShortcutsHandlers(win as never);

    const setEnabledConfig = ipcHandlers.get('shortcuts:setEnabledConfig') as ((event: unknown, partial: { screenshot?: boolean }) => { ok: boolean; error?: string }) | undefined;
    expect(setEnabledConfig).toBeTypeOf('function');

    const result = setEnabledConfig?.({} as never, { screenshot: true });

    expect(assertSpriteCapabilityUnlockedMock).toHaveBeenCalledWith('screenshot');
    expect(saveShortcutEnabledConfigMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining('Sprite capability locked: screenshot')
    });
  });

  it('blocks daily-care mutations when the capability authority rejects them', async () => {
    const service = {
      getSnapshot: vi.fn(() => ({ enabled: false })),
      updateSettings: vi.fn(),
      upsertCustomReminder: vi.fn(),
      removeCustomReminder: vi.fn(),
      triggerRoutineById: vi.fn(),
      handleButtonClick: vi.fn()
    };

    const { initDailyCareIPC } = await import('../electron/main/daily/ipc-main');
    initDailyCareIPC(service as never);

    const updateSettings = ipcHandlers.get('dailyCare:updateSettings') as ((event: unknown, payload: { enabled?: boolean }) => unknown) | undefined;
    const upsertCustomReminder = ipcHandlers.get('dailyCare:upsertCustomReminder') as ((event: unknown, payload: { title: string }) => unknown) | undefined;
    const removeCustomReminder = ipcHandlers.get('dailyCare:removeCustomReminder') as ((event: unknown, id: string) => unknown) | undefined;
    const triggerNow = ipcHandlers.get('dailyCare:triggerNow') as ((event: unknown, id: string) => unknown) | undefined;
    const handleButtonClick = ipcHandlers.get('dailyCare:handleButtonClick') as ((event: unknown, routineId: string, buttonId: string, action?: string) => unknown) | undefined;

    expect(() => updateSettings?.({} as never, { enabled: true })).toThrow('Sprite capability locked: dailyCare');
    expect(() => upsertCustomReminder?.({} as never, { title: 'Test reminder' } as never)).toThrow('Sprite capability locked: dailyCare');
    expect(() => removeCustomReminder?.({} as never, 'reminder-id')).toThrow('Sprite capability locked: dailyCare');
    expect(() => triggerNow?.({} as never, 'routine-id')).toThrow('Sprite capability locked: dailyCare');
    expect(() => handleButtonClick?.({} as never, 'routine-id', 'snooze', 'snooze')).toThrow('Sprite capability locked: dailyCare');

    expect(service.updateSettings).not.toHaveBeenCalled();
    expect(service.upsertCustomReminder).not.toHaveBeenCalled();
    expect(service.removeCustomReminder).not.toHaveBeenCalled();
    expect(service.triggerRoutineById).not.toHaveBeenCalled();
    expect(service.handleButtonClick).not.toHaveBeenCalled();
  });
});

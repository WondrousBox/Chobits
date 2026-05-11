import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ipcHandlers = new Map<string, unknown>();
const ipcMainHandle = vi.fn((channel: string, handler: unknown) => {
  ipcHandlers.set(channel, handler);
});
const ipcMainRemoveHandler = vi.fn((channel: string) => {
  ipcHandlers.delete(channel);
});
const browserWindowFromWebContents = vi.fn();
const dynamicRequireMock = vi.fn(() => {
  throw new Error('uiohook unavailable in tests');
});
let cursorPoint = { x: 0, y: 0 };

const windowManagerState = {
  init: vi.fn(),
  destroyAll: vi.fn(),
  get: vi.fn(),
  create: vi.fn(() => Promise.resolve(null)),
  adjustMainWindowForPadding: vi.fn(),
  setAnchorWidth: vi.fn(),
  setAnchorHeight: vi.fn()
};

vi.mock('@aim-packages/window-manager', () => ({
  initIpcMain: vi.fn(),
  windowManager: {
    init: (...args: any[]) => windowManagerState.init(...args),
    destroyAll: (...args: any[]) => windowManagerState.destroyAll(...args),
    get: (...args: any[]) => windowManagerState.get(...args),
    create: (...args: any[]) => windowManagerState.create(...args),
    adjustMainWindowForPadding: (...args: any[]) => windowManagerState.adjustMainWindowForPadding(...args),
    setAnchorWidth: (...args: any[]) => windowManagerState.setAnchorWidth(...args),
    setAnchorHeight: (...args: any[]) => windowManagerState.setAnchorHeight(...args)
  }
}));

vi.mock('node:module', () => ({
  createRequire: () => dynamicRequireMock
}));

vi.mock('electron', () => ({
  app: {
    getAppPath: () => '/app'
  },
  BrowserWindow: Object.assign(vi.fn(), {
    fromWebContents: (...args: unknown[]) => browserWindowFromWebContents(...args)
  }),
  ipcMain: {
    handle: ipcMainHandle,
    removeHandler: ipcMainRemoveHandler
  },
  screen: {
    getCursorScreenPoint: () => cursorPoint,
    getDisplayMatching: vi.fn(() => ({ workArea: { x: 10, y: 20, width: 1280, height: 720 } })),
    getPrimaryDisplay: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }))
  }
}));

function createWindowStub(): any {
  return {
    __preloadPath: '/preload/index.mjs',
    getBounds: vi.fn(() => ({ x: 0, y: 0, width: 200, height: 200 })),
    on: vi.fn(),
    isDestroyed: vi.fn(() => false),
    setIgnoreMouseEvents: vi.fn(),
    setSize: vi.fn()
  };
}

describe('window handlers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    ipcHandlers.clear();
    ipcMainHandle.mockClear();
    ipcMainRemoveHandler.mockClear();
    browserWindowFromWebContents.mockReset();
    dynamicRequireMock.mockClear();
    cursorPoint = { x: 0, y: 0 };
    Object.values(windowManagerState).forEach((mockFn) => mockFn.mockClear());
    process.env.APP_ROOT = '/app-root';
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    delete process.env.APP_ROOT;
  });

  it('does not register legacy auto-walk authority in window handlers', async () => {
    const { initWindowHandlers } = await import('../electron/main/handlers/window');
    const win = createWindowStub();

    initWindowHandlers(win);

    expect(ipcHandlers.has('getAutoWalkEnabled')).toBe(false);
    expect(ipcHandlers.has('setAutoWalkEnabled')).toBe(false);
    expect(ipcHandlers.has('setAssistantSize')).toBe(true);
    expect(windowManagerState.init).toHaveBeenCalledOnce();
    expect(windowManagerState.create).toHaveBeenCalledWith('menu');

    const [, windowManagerOptions] = windowManagerState.init.mock.calls[0] ?? [];
    expect(windowManagerOptions.windowConfigs.skillTree.trueFullscreen).toBe(true);
    expect(windowManagerOptions.windowConfigs.skillTree.showOnReady).toBe(true);
    expect(win.setIgnoreMouseEvents).not.toHaveBeenCalled();
    expect(dynamicRequireMock).not.toHaveBeenCalled();
  });

  it('does not start hover click-through when assistant padding is zero', async () => {
    const { initWindowHandlers } = await import('../electron/main/handlers/window');
    const win = createWindowStub();
    initWindowHandlers(win);

    const setAssistantSize = ipcHandlers.get('setAssistantSize') as (
      event: unknown,
      params: { width: number; height: number; padding: number }
    ) => { success: boolean };

    cursorPoint = { x: 400, y: 400 };
    expect(setAssistantSize({}, { width: 120, height: 120, padding: 0 })).toEqual({ success: true });
    expect(win.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
    expect(win.setIgnoreMouseEvents).not.toHaveBeenCalledWith(true, { forward: true });
    expect(dynamicRequireMock).not.toHaveBeenCalled();
  });

  it('stops hover click-through when padding switches back to zero', async () => {
    const { initWindowHandlers } = await import('../electron/main/handlers/window');
    const win = createWindowStub();
    win.getBounds.mockReturnValue({ x: 100, y: 100, width: 320, height: 320 });
    initWindowHandlers(win);

    const setAssistantSize = ipcHandlers.get('setAssistantSize') as (
      event: unknown,
      params: { width: number; height: number; padding: number }
    ) => { success: boolean };

    cursorPoint = { x: 20, y: 20 };
    expect(setAssistantSize({}, { width: 120, height: 120, padding: 100 })).toEqual({ success: true });
    expect(dynamicRequireMock).toHaveBeenCalledWith('uiohook-napi');
    expect(win.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });

    dynamicRequireMock.mockClear();
    expect(setAssistantSize({}, { width: 120, height: 120, padding: 0 })).toEqual({ success: true });
    expect(win.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });
    expect(dynamicRequireMock).not.toHaveBeenCalled();
  });

  it('opens toggled devtools as a detached window for the invoking window', async () => {
    const { initWindowHandlers } = await import('../electron/main/handlers/window');
    const win = createWindowStub();
    const sender = {};
    const webContents = {
      isDevToolsOpened: vi.fn(() => false),
      openDevTools: vi.fn(),
      closeDevTools: vi.fn()
    };
    const targetWindow = {
      isDestroyed: vi.fn(() => false),
      webContents
    };

    browserWindowFromWebContents.mockReturnValue(targetWindow);
    initWindowHandlers(win);

    expect(ipcMainRemoveHandler).toHaveBeenCalledWith('window:devtools:toggle');
    const toggleDevTools = ipcHandlers.get('window:devtools:toggle') as (event: { sender: unknown }) => boolean;
    expect(toggleDevTools({ sender })).toBe(true);

    expect(browserWindowFromWebContents).toHaveBeenCalledWith(sender);
    expect(webContents.openDevTools).toHaveBeenCalledWith({ mode: 'detach', activate: true });
    expect(webContents.closeDevTools).not.toHaveBeenCalled();
  });

  it('closes toggled devtools when they are already open', async () => {
    const { initWindowHandlers } = await import('../electron/main/handlers/window');
    const win = createWindowStub();
    const webContents = {
      isDevToolsOpened: vi.fn(() => true),
      openDevTools: vi.fn(),
      closeDevTools: vi.fn()
    };

    browserWindowFromWebContents.mockReturnValue({
      isDestroyed: vi.fn(() => false),
      webContents
    });
    initWindowHandlers(win);

    const toggleDevTools = ipcHandlers.get('window:devtools:toggle') as (event: { sender: unknown }) => boolean;
    expect(toggleDevTools({ sender: {} })).toBe(true);

    expect(webContents.closeDevTools).toHaveBeenCalledOnce();
    expect(webContents.openDevTools).not.toHaveBeenCalled();
  });

  it('supports work-area lookup and bounds updates for managed windows', async () => {
    const { initWindowHandlers } = await import('../electron/main/handlers/window');
    const win = createWindowStub();
    const targetWindow = {
      getBounds: vi.fn(() => ({ x: 12, y: 24, width: 400, height: 300 })),
      isDestroyed: vi.fn(() => false),
      setBounds: vi.fn()
    };

    windowManagerState.get.mockReturnValue(targetWindow);
    initWindowHandlers(win);

    const getWorkArea = ipcHandlers.get('screen:work-area:get') as (event: { sender: unknown }, key?: string) => { x: number; y: number; width: number; height: number };
    const setBounds = ipcHandlers.get('window:bounds:set') as (
      event: { sender: unknown },
      key: string,
      bounds: { x: number; y: number; width: number; height: number }
    ) => { success: boolean; bounds?: { x: number; y: number; width: number; height: number } };

    expect(getWorkArea({ sender: {} }, 'chatOverlay')).toEqual({ x: 10, y: 20, width: 1280, height: 720 });
    expect(setBounds({ sender: {} }, 'chatOverlay', { x: 10.4, y: 20.6, width: 560.2, height: 719.8 })).toEqual({
      success: true,
      bounds: { x: 12, y: 24, width: 400, height: 300 }
    });
    expect(windowManagerState.get).toHaveBeenCalledWith('chatOverlay');
    expect(targetWindow.setBounds).toHaveBeenCalledWith({ x: 10, y: 21, width: 560, height: 720 });
  });

  it('treats reported inline message regions as interactive for click-through', async () => {
    const { initWindowHandlers } = await import('../electron/main/handlers/window');
    const win = createWindowStub();
    win.getBounds.mockReturnValue({ x: 100, y: 100, width: 400, height: 400 });
    initWindowHandlers(win);

    const setAssistantSize = ipcHandlers.get('setAssistantSize') as (
      event: unknown,
      params: { width: number; height: number; padding: number }
    ) => { success: boolean };
    const setAssistantInteractiveRegions = ipcHandlers.get('setAssistantInteractiveRegions') as (
      event: unknown,
      params: { regions: Array<{ x: number; y: number; width: number; height: number }> }
    ) => { success: boolean };

    cursorPoint = { x: 250, y: 130 };
    expect(setAssistantSize({}, { width: 120, height: 120, padding: 100 })).toEqual({ success: true });
    expect(win.setIgnoreMouseEvents).not.toHaveBeenCalledWith(false, { forward: true });

    expect(setAssistantInteractiveRegions({}, { regions: [{ x: 140, y: 20, width: 160, height: 60 }] })).toEqual({ success: true });
    expect(win.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false, { forward: true });

    expect(setAssistantInteractiveRegions({}, { regions: [] })).toEqual({ success: true });
    expect(win.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true });
  });
});

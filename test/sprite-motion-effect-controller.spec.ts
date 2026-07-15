import { beforeEach, describe, expect, it, vi } from 'vitest';

const ipcHandlers = new Map<string, (event: any, payload?: any) => any>();
const browserWindowFromWebContents = vi.fn((webContents: any) => webContents?.owner ?? null);
const windowManagerState = {
  get: vi.fn(),
  create: vi.fn(),
  show: vi.fn(),
  hide: vi.fn(async () => null)
};

vi.mock('@aim-packages/window-manager', () => ({
  windowManager: windowManagerState
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: (...args: any[]) => browserWindowFromWebContents(...args)
  },
  ipcMain: {
    handle: (channel: string, handler: (event: any, payload?: any) => any) => ipcHandlers.set(channel, handler),
    removeHandler: (channel: string) => ipcHandlers.delete(channel)
  },
  systemPreferences: {
    getAnimationSettings: () => ({ prefersReducedMotion: false })
  }
}));

function createWindow(id: number, bounds: { x: number; y: number; width: number; height: number }): any {
  const webContents = { send: vi.fn(), owner: null as any };
  const listeners = new Map<string, () => void>();
  const window = {
    id,
    webContents,
    getBounds: vi.fn(() => ({ ...bounds })),
    setBounds: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
    isDestroyed: vi.fn(() => false),
    once: vi.fn((event: string, listener: () => void) => listeners.set(event, listener)),
    emit: (event: string) => listeners.get(event)?.()
  };
  webContents.owner = window;
  return window;
}

describe('SpriteMotionEffectController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    vi.resetModules();
    ipcHandlers.clear();
    browserWindowFromWebContents.mockClear();
    Object.values(windowManagerState).forEach((mock) => mock.mockReset());
    windowManagerState.hide.mockResolvedValue(null);
  });

  it('broadcasts one run, jumps at the shared midpoint and hides the overlay on completion', async () => {
    const mainWindow = createWindow(1, { x: 100, y: 200, width: 240, height: 300 });
    const effectWindow = createWindow(2, { x: 0, y: 0, width: 1, height: 1 });
    windowManagerState.get.mockReturnValue(effectWindow);
    windowManagerState.create.mockResolvedValue(effectWindow);
    windowManagerState.show.mockResolvedValue(effectWindow);

    const { initSpriteMotionEffectController } = await import('../electron/main/handlers/sprite-motion-effect');
    const { SPRITE_MOTION_EFFECT_IPC_CHANNELS } = await import('../packages/sprite-core/types');
    const controller = initSpriteMotionEffectController(mainWindow);
    ipcHandlers.get(SPRITE_MOTION_EFFECT_IPC_CHANNELS.READY)?.({ sender: effectWindow.webContents });

    const playPromise = controller.play({ type: 'warp', targetX: 760, targetY: 420 });
    await vi.advanceTimersByTimeAsync(0);
    const startCall = effectWindow.webContents.send.mock.calls.find((call: any[]) => call[0] === SPRITE_MOTION_EFFECT_IPC_CHANNELS.START);
    expect(startCall).toBeDefined();
    const run = startCall?.[1];
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(SPRITE_MOTION_EFFECT_IPC_CHANNELS.START, run);
    expect(effectWindow.setBounds).toHaveBeenCalledWith(run.overlayBounds, false);

    const jumpDelay = run.startsAt - Date.now() + (run.timeline.travelStartMs + run.timeline.travelEndMs) / 2;
    await vi.advanceTimersByTimeAsync(jumpDelay);
    expect(mainWindow.setBounds).toHaveBeenCalledWith({ x: 760, y: 420, width: 240, height: 300 }, false);

    ipcHandlers.get(SPRITE_MOTION_EFFECT_IPC_CHANNELS.COMPLETE)?.({ sender: effectWindow.webContents }, { runId: run.runId });
    await expect(playPromise).resolves.toBe(true);
    expect(windowManagerState.hide).toHaveBeenCalledWith('spriteMotionEffect');
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(SPRITE_MOTION_EFFECT_IPC_CHANNELS.CANCEL, expect.objectContaining({ runId: run.runId, reason: 'completed' }));
    controller.dispose();
  });

  it('rejects a forged ready sender and returns false after the readiness timeout', async () => {
    const mainWindow = createWindow(3, { x: 10, y: 20, width: 200, height: 220 });
    const effectWindow = createWindow(4, { x: 0, y: 0, width: 1, height: 1 });
    const foreignWindow = createWindow(5, { x: 0, y: 0, width: 1, height: 1 });
    windowManagerState.get.mockReturnValue(effectWindow);
    windowManagerState.create.mockResolvedValue(effectWindow);
    windowManagerState.show.mockResolvedValue(effectWindow);

    const { initSpriteMotionEffectController } = await import('../electron/main/handlers/sprite-motion-effect');
    const { SPRITE_MOTION_EFFECT_IPC_CHANNELS } = await import('../packages/sprite-core/types');
    const controller = initSpriteMotionEffectController(mainWindow);
    ipcHandlers.get(SPRITE_MOTION_EFFECT_IPC_CHANNELS.READY)?.({ sender: foreignWindow.webContents });

    const playPromise = controller.play({ type: 'warp', targetX: 500, targetY: 360 });
    await vi.advanceTimersByTimeAsync(1500);
    await expect(playPromise).resolves.toBe(false);
    expect(mainWindow.webContents.send).not.toHaveBeenCalledWith(SPRITE_MOTION_EFFECT_IPC_CHANNELS.START, expect.anything());
    expect(mainWindow.setBounds).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('does not start a pending warp after it has been cancelled', async () => {
    const mainWindow = createWindow(8, { x: 50, y: 80, width: 200, height: 260 });
    const effectWindow = createWindow(9, { x: 0, y: 0, width: 1, height: 1 });
    windowManagerState.get.mockReturnValue(effectWindow);
    windowManagerState.create.mockResolvedValue(effectWindow);
    windowManagerState.show.mockResolvedValue(effectWindow);

    const { initSpriteMotionEffectController } = await import('../electron/main/handlers/sprite-motion-effect');
    const { SPRITE_MOTION_EFFECT_IPC_CHANNELS } = await import('../packages/sprite-core/types');
    const controller = initSpriteMotionEffectController(mainWindow);
    const playPromise = controller.play({ type: 'warp', targetX: 700, targetY: 440 });

    controller.cancel();
    ipcHandlers.get(SPRITE_MOTION_EFFECT_IPC_CHANNELS.READY)?.({ sender: effectWindow.webContents });
    await vi.advanceTimersByTimeAsync(0);

    await expect(playPromise).resolves.toBe(false);
    expect(effectWindow.webContents.send).not.toHaveBeenCalledWith(SPRITE_MOTION_EFFECT_IPC_CHANNELS.START, expect.anything());
    expect(mainWindow.setBounds).not.toHaveBeenCalled();
    expect(windowManagerState.hide).toHaveBeenCalledWith('spriteMotionEffect');
    controller.dispose();
  });

  it('moves to the destination and restores the main renderer when the effect window closes mid-run', async () => {
    const mainWindow = createWindow(6, { x: 30, y: 40, width: 180, height: 240 });
    const effectWindow = createWindow(7, { x: 0, y: 0, width: 1, height: 1 });
    windowManagerState.get.mockReturnValue(effectWindow);
    windowManagerState.create.mockResolvedValue(effectWindow);
    windowManagerState.show.mockResolvedValue(effectWindow);

    const { initSpriteMotionEffectController } = await import('../electron/main/handlers/sprite-motion-effect');
    const { SPRITE_MOTION_EFFECT_IPC_CHANNELS } = await import('../packages/sprite-core/types');
    const controller = initSpriteMotionEffectController(mainWindow);
    ipcHandlers.get(SPRITE_MOTION_EFFECT_IPC_CHANNELS.READY)?.({ sender: effectWindow.webContents });

    const playPromise = controller.play({ type: 'warp', targetX: 640, targetY: 380 });
    await vi.advanceTimersByTimeAsync(0);
    effectWindow.emit('closed');

    await expect(playPromise).resolves.toBe(true);
    expect(mainWindow.setBounds).toHaveBeenCalledWith({ x: 640, y: 380, width: 180, height: 240 }, false);
    expect(mainWindow.webContents.send).toHaveBeenCalledWith(SPRITE_MOTION_EFFECT_IPC_CHANNELS.CANCEL, expect.objectContaining({ reason: 'failed' }));
    controller.dispose();
  });
});

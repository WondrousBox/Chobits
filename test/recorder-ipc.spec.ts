import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const electronState = {
  userDataDir: '',
  handlers: new Map<string, unknown>(),
  windows: [] as Array<any>
};

const ipcMainHandle = vi.fn((channel: string, handler: unknown) => {
  electronState.handlers.set(channel, handler);
});

const recorderServerState = {
  start: vi.fn(async () => true),
  stop: vi.fn(async () => true),
  isRunning: vi.fn(() => false)
};

const disableASRRuntimeMock = vi.fn();
const assertSpriteCapabilityUnlockedMock = vi.fn();

vi.mock('electron', () => ({
  app: {
    getPath: () => electronState.userDataDir
  },
  BrowserWindow: {
    getAllWindows: () => electronState.windows
  },
  ipcMain: {
    handle: ipcMainHandle
  }
}));

vi.mock('../packages/recorder/index', () => ({
  recorderServer: recorderServerState
}));

vi.mock('../packages/sherpa/ipc-main', () => ({
  disableASRRuntime: disableASRRuntimeMock
}));

vi.mock('../packages/sprite-core/capability-runtime', () => ({
  assertSpriteCapabilityUnlocked: assertSpriteCapabilityUnlockedMock
}));

describe('recorder IPC capability dependency', () => {
  let dataDir = '';
  let sent: Array<{ channel: string; payload: unknown }> = [];

  beforeEach(async () => {
    vi.resetModules();
    ipcMainHandle.mockClear();
    electronState.handlers.clear();
    recorderServerState.start.mockClear();
    recorderServerState.stop.mockClear();
    recorderServerState.isRunning.mockClear();
    disableASRRuntimeMock.mockReset();
    assertSpriteCapabilityUnlockedMock.mockReset();
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'recorder-ipc-test-'));
    electronState.userDataDir = dataDir;
    sent = [];
    electronState.windows = [
      {
        isDestroyed: () => false,
        webContents: {
          send: (channel: string, payload: unknown) => {
            sent.push({ channel, payload });
          }
        }
      }
    ];
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('disables ASR config on startup when recorder capability is already off', async () => {
    const { initRecorderHandlers } = await import('../packages/recorder/ipc-main');
    initRecorderHandlers();

    expect(disableASRRuntimeMock).toHaveBeenCalledWith({ disableConfig: true });
    expect(recorderServerState.start).not.toHaveBeenCalled();
  });

  it('stops dependent ASR runtime when recorder service stops', async () => {
    const configFile = path.join(dataDir, 'data', 'recorder-config.json');
    mkdirSync(path.dirname(configFile), { recursive: true });
    writeFileSync(configFile, JSON.stringify({ enabled: true }), 'utf8');

    const { initRecorderHandlers } = await import('../packages/recorder/ipc-main');
    initRecorderHandlers();

    const stopRecorder = electronState.handlers.get('recorder:stop') as (() => Promise<boolean>) | undefined;
    await expect(stopRecorder?.()).resolves.toBe(true);
    expect(recorderServerState.stop).toHaveBeenCalledOnce();
    expect(disableASRRuntimeMock).toHaveBeenLastCalledWith({ disableConfig: true });
    expect(sent).toContainEqual({
      channel: 'recorder-status-updated',
      payload: { running: false }
    });
    expect(sent).toContainEqual({
      channel: 'sprite:capabilities:changed',
      payload: { source: 'recorder.status' }
    });
  });

  it('stops dependent ASR runtime when recorder config is turned off', async () => {
    const configFile = path.join(dataDir, 'data', 'recorder-config.json');
    mkdirSync(path.dirname(configFile), { recursive: true });
    writeFileSync(configFile, JSON.stringify({ enabled: true }), 'utf8');

    const { initRecorderHandlers } = await import('../packages/recorder/ipc-main');
    initRecorderHandlers();

    const updateConfig = electronState.handlers.get('recorder:updateConfig') as ((event: unknown, payload: { enabled: boolean }) => { enabled?: boolean }) | undefined;
    expect(updateConfig?.({} as never, { enabled: false })).toEqual({ enabled: false });
    expect(disableASRRuntimeMock).toHaveBeenLastCalledWith({ disableConfig: true });
    expect(sent).toContainEqual({
      channel: 'recorder-status-updated',
      payload: { running: false }
    });
    expect(sent).toContainEqual({
      channel: 'sprite:capabilities:changed',
      payload: { source: 'recorder.status' }
    });
  });

  it('blocks recorder startup when microphone capability is locked', async () => {
    assertSpriteCapabilityUnlockedMock.mockImplementation(() => {
      throw new Error('Sprite capability locked: microphone');
    });

    const { initRecorderHandlers } = await import('../packages/recorder/ipc-main');
    initRecorderHandlers();

    const startRecorder = electronState.handlers.get('recorder:start') as ((event: unknown, port?: number) => Promise<boolean>) | undefined;
    await expect(startRecorder?.({} as never, 8765)).rejects.toThrow('Sprite capability locked: microphone');

    expect(recorderServerState.start).not.toHaveBeenCalled();
  });

  it('blocks enabling recorder config when microphone capability is locked', async () => {
    assertSpriteCapabilityUnlockedMock.mockImplementation(() => {
      throw new Error('Sprite capability locked: microphone');
    });

    const { initRecorderHandlers } = await import('../packages/recorder/ipc-main');
    initRecorderHandlers();

    const updateConfig = electronState.handlers.get('recorder:updateConfig') as ((event: unknown, payload: { enabled: boolean }) => { enabled?: boolean }) | undefined;
    expect(() => updateConfig?.({} as never, { enabled: true })).toThrow('Sprite capability locked: microphone');

    expect(recorderServerState.start).not.toHaveBeenCalled();
  });
});

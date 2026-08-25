import { beforeEach, describe, expect, it, vi } from 'vitest';

const ipcHandlers = new Map<string, unknown>();
const ipcMainHandle = vi.fn((channel: string, handler: unknown) => {
  ipcHandlers.set(channel, handler);
});

const asrCreateInstanceMock = vi.fn(async () => ({
  handler: undefined as unknown
}));
const asrFreeInstanceMock = vi.fn();
const asrSendDataMock = vi.fn();
const getASRInstanceMock = vi.fn(() => null);

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/chobits-test'
  },
  BrowserWindow: {
    getAllWindows: () => []
  },
  ipcMain: {
    handle: ipcMainHandle
  }
}));

vi.mock('../../packages/sherpa/index', () => ({
  ASR_createInstance: asrCreateInstanceMock,
  ASR_freeInstance: asrFreeInstanceMock,
  ASR_sendData: asrSendDataMock,
  TTS_createInstance: vi.fn(),
  TTS_freeInstance: vi.fn(),
  TTS_generateSpeech: vi.fn()
}));

vi.mock('../../packages/sherpa/asr-instance-manager', () => ({
  getASRInstance: getASRInstanceMock
}));

vi.mock('@packages/tts/common', () => ({
  stripEmoji: (value: string) => value
}));

vi.mock('../../electron/main/db/repositories', () => ({
  ResourcesRepo: {},
  WorkspacesRepo: {}
}));

vi.mock('../../electron/main/handlers/resource', () => ({
  ensureDailyFolder: vi.fn()
}));

describe('capability runtime sherpa guards', () => {
  beforeEach(async () => {
    vi.resetModules();
    ipcHandlers.clear();
    ipcMainHandle.mockClear();
    asrCreateInstanceMock.mockClear();
    asrFreeInstanceMock.mockClear();
    asrSendDataMock.mockClear();
    getASRInstanceMock.mockClear();
    getASRInstanceMock.mockReturnValue(null);

    const { initSpriteCapabilityRuntime } = await import('../../packages/sprite-core/capability-runtime');
    initSpriteCapabilityRuntime({
      resolveContext: () => ({
        personaLevel: 1,
        achievements: [],
        activeSignals: {}
      })
    });
  });

  it('blocks enabling ASR config when speechRecognition is still locked', async () => {
    const { initSherpaHandlers } = await import('../../packages/sherpa/ipc-main');
    initSherpaHandlers();

    const saveASRConfig = ipcHandlers.get('sherpa:saveASRConfig') as ((event: unknown, payload: { enabled?: boolean }) => unknown) | undefined;
    expect(() => saveASRConfig?.({} as never, { enabled: true })).toThrow('Sprite capability locked: speechRecognition');
  });

  it('blocks creating an ASR runtime instance when speechRecognition is still locked', async () => {
    const { initSherpaHandlers } = await import('../../packages/sherpa/ipc-main');
    initSherpaHandlers();

    const createInstance = ipcHandlers.get('sherpa:createInstance') as ((event: unknown, payload: { language?: string }) => Promise<boolean>) | undefined;
    await expect(createInstance?.({} as never, { language: 'zh' })).rejects.toThrow('Sprite capability locked: speechRecognition');
    expect(asrCreateInstanceMock).not.toHaveBeenCalled();
  });

  it('blocks recording materialization when speechRecognition is unlocked but not active yet', async () => {
    const { initSpriteCapabilityRuntime } = await import('../../packages/sprite-core/capability-runtime');
    initSpriteCapabilityRuntime({
      resolveContext: () => ({
        personaLevel: 1,
        achievements: [],
        activeSignals: {
          'recorder.enabled': true
        }
      })
    });

    const { initSherpaHandlers } = await import('../../packages/sherpa/ipc-main');
    initSherpaHandlers();

    const startRecording = ipcHandlers.get('sherpa:startRecording') as
      | ((event: unknown, payload: { workspaceId?: string; folderId?: string }) => Promise<{ success: boolean; error?: string }>)
      | undefined;
    const resumeRecording = ipcHandlers.get('sherpa:resumeRecording') as ((event: unknown, payload: { resourceId: string }) => Promise<{ success: boolean; error?: string }>) | undefined;
    const sendData = ipcHandlers.get('sherpa:sendData') as ((event: unknown, payload: { uuid: string; data: Float32Array; save?: boolean }) => Promise<void>) | undefined;

    await expect(startRecording?.({} as never, {})).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('Sprite capability inactive: speechRecognition')
    });
    await expect(resumeRecording?.({} as never, { resourceId: 'resource-1' })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('Sprite capability inactive: speechRecognition')
    });
    await expect(sendData?.({} as never, { uuid: 'stream', data: new Float32Array([0.1, 0.2]) })).rejects.toThrow('Sprite capability inactive: speechRecognition');
    expect(asrSendDataMock).not.toHaveBeenCalled();
  });

  it('allows ASR startup once the microphone capability becomes active', async () => {
    const { initSpriteCapabilityRuntime } = await import('../../packages/sprite-core/capability-runtime');
    initSpriteCapabilityRuntime({
      resolveContext: () => ({
        personaLevel: 1,
        achievements: [],
        activeSignals: {
          'recorder.enabled': true
        }
      })
    });

    const { initSherpaHandlers } = await import('../../packages/sherpa/ipc-main');
    initSherpaHandlers();

    const createInstance = ipcHandlers.get('sherpa:createInstance') as ((event: unknown, payload: { language?: string }) => Promise<boolean>) | undefined;
    const sendData = ipcHandlers.get('sherpa:sendData') as ((event: unknown, payload: { uuid: string; data: Float32Array; save?: boolean }) => Promise<void>) | undefined;
    await expect(createInstance?.({} as never, { language: 'zh' })).resolves.toBe(true);

    initSpriteCapabilityRuntime({
      resolveContext: () => ({
        personaLevel: 1,
        achievements: [],
        activeSignals: {
          'recorder.enabled': true,
          'asr.running': true
        }
      })
    });

    await expect(sendData?.({} as never, { uuid: 'stream', data: new Float32Array([0.3, 0.4]) })).resolves.toBeUndefined();
    expect(asrCreateInstanceMock).toHaveBeenCalledOnce();
    expect(asrSendDataMock).toHaveBeenCalledOnce();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const translateSubtitlesMock = vi.hoisted(() => vi.fn());
const resourcesGetByIdMock = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => 'F:/Develop/chobits'),
    getPath: vi.fn(() => 'F:/tmp/chobits-test'),
    isPackaged: false
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
}));

vi.mock('electron-log', () => ({
  default: {
    initialize: vi.fn(),
    scope: vi.fn(() => ({
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
      warn: vi.fn()
    })),
    functions: {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
      warn: vi.fn()
    },
    transports: {
      console: {},
      file: {}
    },
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn()
  }
}));

vi.mock('../../packages/event', () => ({
  sendAppBusyEnd: vi.fn(),
  sendAppBusyProgress: vi.fn(),
  sendAppBusyStart: vi.fn()
}));

vi.mock('../../packages/common/db', () => ({
  ResourcesRepo: {
    getById: resourcesGetByIdMock
  },
  WorkspacesRepo: {
    getById: vi.fn()
  }
}));

vi.mock('../../packages/ai/services/translation-service', () => ({
  TranslationService: {
    translateSubtitles: translateSubtitlesMock
  }
}));

vi.mock('../../packages/ai/runtime/pi/session-service', () => ({
  PiSessionService: class {
    getAvailability() {
      return { available: true, missingPackages: [], requested: false };
    }
  }
}));

vi.mock('../../packages/ai/runtime/pi/task-chat', () => ({
  createPiTaskChatRuntimeFromRequest: vi.fn()
}));

vi.mock('../../packages/ai/services/summary-service', () => ({
  SummaryService: {
    cancelSummary: vi.fn(),
    getAllActiveSummaries: vi.fn(() => []),
    summarize: vi.fn()
  }
}));

vi.mock('../../packages/ai/services/mindmap-service', () => ({
  MindmapService: {
    cancelMindmap: vi.fn(),
    generateMindmap: vi.fn()
  }
}));

beforeEach(() => {
  resourcesGetByIdMock.mockReset();
  translateSubtitlesMock.mockReset();
});

describe('startSubtitleTranslationTask dedupe', () => {
  it('reuses the same subtitle translation task for concurrent duplicate requests', async () => {
    const segments = [{ st: '00:00:00,000', et: '00:00:01,000', text: 'hello' }] as any[];
    resourcesGetByIdMock.mockResolvedValue({
      id: 'subtitle-1',
      filePath: 'F:/workspace/video.srt',
      workspaceId: 'workspace-1'
    });
    let completeTranslation!: () => void;
    translateSubtitlesMock.mockImplementation(
      (_request: any, emit: any) =>
        new Promise((resolve) => {
          completeTranslation = () => {
            emit({
              type: 'completed',
              data: {
                displayInfo: { resourceId: 'subtitle-1' },
                originalTranslation: 'hello translated',
                segments,
                translations: ['[0]hello translated']
              }
            });
            resolve(segments);
          };
        })
    );

    const { startSubtitleTranslationTask } = await import('../../packages/ai/ipc-handler-helpers');
    const payload = {
      chatFn: vi.fn(),
      languageNames: {},
      metadata: { resourceId: 'subtitle-1' },
      model: 'model-a',
      options: { chunkSize: 1000 },
      providerId: 'provider-a',
      resourceId: 'subtitle-1',
      segments,
      targetLanguage: 'zh-CN'
    };

    const firstPromise = startSubtitleTranslationTask(payload);
    const secondPromise = startSubtitleTranslationTask({ ...payload, requestId: 'new-request-id' });
    const [first, second] = await Promise.all([firstPromise, secondPromise]);

    completeTranslation();
    await first.completionPromise;

    expect(second.requestId).toBe(first.requestId);
    expect(second.eventsChannel).toBe(first.eventsChannel);
    expect(second.reused).toBe(true);
    expect(translateSubtitlesMock).toHaveBeenCalledTimes(1);
  });

  it('reuses a recently completed subtitle translation task', async () => {
    const segments = [{ st: '00:00:00,000', et: '00:00:01,000', text: 'hello' }] as any[];
    resourcesGetByIdMock.mockResolvedValue({
      id: 'subtitle-completed',
      filePath: 'F:/workspace/video.srt',
      workspaceId: 'workspace-1'
    });
    translateSubtitlesMock.mockImplementation(async (_request: any, emit: any) => {
      emit({
        type: 'completed',
        data: {
          displayInfo: { resourceId: 'subtitle-completed' },
          originalTranslation: 'hello translated',
          segments,
          translations: ['[0]hello translated']
        }
      });
      return segments;
    });

    const { startSubtitleTranslationTask } = await import('../../packages/ai/ipc-handler-helpers');
    const payload = {
      chatFn: vi.fn(),
      languageNames: {},
      metadata: { resourceId: 'subtitle-completed' },
      model: 'model-a',
      options: { chunkSize: 1000 },
      providerId: 'provider-a',
      resourceId: 'subtitle-completed',
      segments,
      targetLanguage: 'zh-CN'
    };

    const first = await startSubtitleTranslationTask(payload);
    await first.completionPromise;
    const second = await startSubtitleTranslationTask({ ...payload, requestId: 'new-request-id' });

    expect(second.requestId).toBe(first.requestId);
    expect(second.eventsChannel).toBe(first.eventsChannel);
    expect(second.reused).toBe(true);
    expect(translateSubtitlesMock).toHaveBeenCalledTimes(1);
  });
});

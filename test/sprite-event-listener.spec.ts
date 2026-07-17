import { afterEach, describe, expect, it, vi } from 'vitest';

const mockedAppEvent = vi.hoisted(
  () =>
    ({
      SPRITE_AI_START: 'SPRITE_AI_START',
      SPRITE_AI_COMPLETE: 'SPRITE_AI_COMPLETE',
      SPRITE_AI_ERROR: 'SPRITE_AI_ERROR',
      AI_PROVIDER_CONFIG_UPDATED: 'AI_PROVIDER_CONFIG_UPDATED',
      APP_WINDOW_CLOSED: 'APP_WINDOW_CLOSED',
      APP_WINDOW_OPENED: 'APP_WINDOW_OPENED',
      SPRITE_WORKFLOW_START: 'SPRITE_WORKFLOW_START',
      SPRITE_WORKFLOW_PROGRESS: 'SPRITE_WORKFLOW_PROGRESS',
      SPRITE_WORKFLOW_COMPLETE: 'SPRITE_WORKFLOW_COMPLETE',
      SPRITE_WORKFLOW_FAIL: 'SPRITE_WORKFLOW_FAIL',
      SPRITE_WORKFLOW_CANCEL: 'SPRITE_WORKFLOW_CANCEL',
      SPRITE_RESOURCE_IMPORT_START: 'SPRITE_RESOURCE_IMPORT_START',
      SPRITE_RESOURCE_IMPORT_PROGRESS: 'SPRITE_RESOURCE_IMPORT_PROGRESS',
      SPRITE_RESOURCE_IMPORT_COMPLETE: 'SPRITE_RESOURCE_IMPORT_COMPLETE',
      SPRITE_RESOURCE_IMPORT_ERROR: 'SPRITE_RESOURCE_IMPORT_ERROR',
      SPRITE_DOWNLOAD_START: 'SPRITE_DOWNLOAD_START',
      SPRITE_DOWNLOAD_COMPLETE: 'SPRITE_DOWNLOAD_COMPLETE',
      SPRITE_DOWNLOAD_FAIL: 'SPRITE_DOWNLOAD_FAIL',
      SPRITE_PLUGIN_INSTALL: 'SPRITE_PLUGIN_INSTALL',
      SPRITE_PLUGIN_REMOVE: 'SPRITE_PLUGIN_REMOVE',
      SPRITE_PLUGIN_UPDATE: 'SPRITE_PLUGIN_UPDATE',
      SPRITE_SYSTEM_READY: 'SPRITE_SYSTEM_READY',
      SPRITE_SYSTEM_QUIT: 'SPRITE_SYSTEM_QUIT',
      SPRITE_SYSTEM_FOCUS: 'SPRITE_SYSTEM_FOCUS',
      SPRITE_SYSTEM_BLUR: 'SPRITE_SYSTEM_BLUR',
      SPRITE_NETWORK_CONNECT: 'SPRITE_NETWORK_CONNECT',
      SPRITE_NETWORK_DISCONNECT: 'SPRITE_NETWORK_DISCONNECT',
      SPRITE_NETWORK_TIMEOUT: 'SPRITE_NETWORK_TIMEOUT',
      SPRITE_MEDIA_PROCESS_START: 'SPRITE_MEDIA_PROCESS_START',
      SPRITE_MEDIA_PROCESS_COMPLETE: 'SPRITE_MEDIA_PROCESS_COMPLETE',
      SPRITE_RSS_REFRESH: 'SPRITE_RSS_REFRESH',
      SPRITE_RSS_NEW_CONTENT: 'SPRITE_RSS_NEW_CONTENT',
      SPRITE_TRASH_DELETE: 'SPRITE_TRASH_DELETE',
      SPRITE_TRASH_RESTORE: 'SPRITE_TRASH_RESTORE',
      MEMORY_EXTRACTION_STARTED: 'MEMORY_EXTRACTION_STARTED',
      MEMORY_EXTRACTION_PROGRESS: 'MEMORY_EXTRACTION_PROGRESS',
      MEMORY_EXTRACTION_COMPLETED: 'MEMORY_EXTRACTION_COMPLETED',
      MEMORY_EXTRACTION_FAILED: 'MEMORY_EXTRACTION_FAILED',
      USER_PERSONA_UPDATE_STARTED: 'USER_PERSONA_UPDATE_STARTED',
      USER_PERSONA_UPDATE_COMPLETED: 'USER_PERSONA_UPDATE_COMPLETED',
      USER_PERSONA_UPDATE_FAILED: 'USER_PERSONA_UPDATE_FAILED',
      USER_PERSONA_UPDATE_SKIPPED: 'USER_PERSONA_UPDATE_SKIPPED'
    }) as const
);

const eventHarness = vi.hoisted(() => {
  const listeners = new Map<string, Set<(data?: unknown) => void>>();
  const on = vi.fn((event: string, handler: (data?: unknown) => void) => {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    listeners.get(event)!.add(handler);
  });
  const off = vi.fn((event: string, handler: (data?: unknown) => void) => {
    listeners.get(event)?.delete(handler);
  });

  return {
    on,
    off,
    emit(event: string, data?: unknown) {
      for (const handler of listeners.get(event) ?? []) {
        handler(data);
      }
    },
    reset() {
      listeners.clear();
      on.mockClear();
      off.mockClear();
    }
  };
});

vi.mock('@packages/event', () => ({
  AppEvent: mockedAppEvent,
  eventManager: {
    on: eventHarness.on,
    off: eventHarness.off
  }
}));

vi.mock('../packages/sprite-core/character-service', () => ({
  getCharacterPackDefinition: () => null,
  getCharacterDefinition: () => null,
  getCharacterPackSource: () => null,
  getActivityRewards: () => ({
    'workflow-complete': { xp: 0, favor: 0, dimensionGrowth: undefined },
    'resource-import-complete': { xp: 0, favor: 0, dimensionGrowth: undefined },
    'memory-extraction-completed': { xp: 0, favor: 0, dimensionGrowth: undefined },
    'user-persona-update-completed': { xp: 0, favor: 0, dimensionGrowth: undefined }
  }),
  getConversationRewards: () => ({
    cooldownMs: 0,
    xpPerConversation: 0,
    favorPerConversation: 0,
    bonusConditions: []
  }),
  getDimensionSchema: () => []
}));

import { AppEvent } from '@packages/event';

import { initSpriteEventListener } from '../packages/sprite-core/handler/sprite-event-listener';

function createManagerStub(): {
  showToast: ReturnType<typeof vi.fn>;
  showBusy: ReturnType<typeof vi.fn>;
  updateBusy: ReturnType<typeof vi.fn>;
  clearBusy: ReturnType<typeof vi.fn>;
  trigger: ReturnType<typeof vi.fn>;
  speak: ReturnType<typeof vi.fn>;
  playOnce: ReturnType<typeof vi.fn>;
  recordConversationEvent: ReturnType<typeof vi.fn>;
  applyPersonaReward: ReturnType<typeof vi.fn>;
  addXP: ReturnType<typeof vi.fn>;
  changeFavor: ReturnType<typeof vi.fn>;
  updateDimension: ReturnType<typeof vi.fn>;
  emitPurposeEvent: ReturnType<typeof vi.fn>;
  startPurpose: ReturnType<typeof vi.fn>;
  getPurposeSnapshot: ReturnType<typeof vi.fn>;
  isRealtimeSpeechEnabled: ReturnType<typeof vi.fn>;
} {
  return {
    showToast: vi.fn(),
    showBusy: vi.fn(),
    updateBusy: vi.fn(),
    clearBusy: vi.fn(),
    trigger: vi.fn(),
    speak: vi.fn(async () => ({ success: true })),
    playOnce: vi.fn(),
    recordConversationEvent: vi.fn(),
    applyPersonaReward: vi.fn(),
    addXP: vi.fn(),
    changeFavor: vi.fn(),
    updateDimension: vi.fn(),
    emitPurposeEvent: vi.fn(() => ({ matched: 0 })),
    startPurpose: vi.fn(async () => ({ accepted: true, status: 'started' })),
    getPurposeSnapshot: vi.fn(() => ({ current: null, routine: null, queue: [] })),
    isRealtimeSpeechEnabled: vi.fn(() => false)
  };
}

describe('sprite event listener', () => {
  afterEach(() => {
    eventHarness.reset();
    vi.clearAllMocks();
  });

  it('routes business animation semantics through trigger() instead of playOnce()', () => {
    const mgr = createManagerStub();
    const cleanup = initSpriteEventListener(mgr as any, { workflow: 'trigger', resourceImport: 'trigger' });

    eventHarness.emit(AppEvent.SPRITE_AI_START, { message: '思考中...' });
    eventHarness.emit(AppEvent.SPRITE_AI_ERROR, { error: 'boom' });
    eventHarness.emit(AppEvent.SPRITE_WORKFLOW_START, { workflowName: '整理文档' });
    eventHarness.emit(AppEvent.SPRITE_WORKFLOW_FAIL, { error: 'failed' });
    eventHarness.emit(AppEvent.SPRITE_RESOURCE_IMPORT_START, { message: '开始导入' });
    eventHarness.emit(AppEvent.SPRITE_RESOURCE_IMPORT_ERROR, { error: 'import failed' });
    eventHarness.emit(AppEvent.MEMORY_EXTRACTION_COMPLETED, { message: '记住啦' });
    eventHarness.emit(AppEvent.MEMORY_EXTRACTION_FAILED, { error: 'memory failed' });
    eventHarness.emit(AppEvent.USER_PERSONA_UPDATE_COMPLETED, { message: '画像更新完成' });
    eventHarness.emit(AppEvent.USER_PERSONA_UPDATE_FAILED, { error: 'persona failed' });

    expect(mgr.trigger.mock.calls).toEqual([
      ['thinking', { durationMs: 2000, silent: true }],
      ['error', { durationMs: 1500, silent: true }],
      ['processing', { durationMs: 1500, silent: true }],
      ['failure', { durationMs: 1500, silent: true }],
      ['loading', { durationMs: 1500, silent: true }],
      ['error', { durationMs: 1500, silent: true }],
      ['write', { silent: true }],
      ['error', { durationMs: 1500, silent: true }],
      ['celebrate', { durationMs: 1500, silent: true }],
      ['error', { durationMs: 1500, silent: true }]
    ]);
    expect(mgr.playOnce).not.toHaveBeenCalled();

    cleanup();
  });

  it('keeps success-style business events on explicit trigger channels', () => {
    const mgr = createManagerStub();
    const cleanup = initSpriteEventListener(mgr as any);

    eventHarness.emit(AppEvent.SPRITE_AI_COMPLETE, { message: '完成啦' });
    eventHarness.emit(AppEvent.SPRITE_WORKFLOW_COMPLETE, { message: '工作流完成' });
    eventHarness.emit(AppEvent.SPRITE_RESOURCE_IMPORT_COMPLETE, { message: '导入完成', count: 2 });

    expect(mgr.trigger.mock.calls).toEqual([
      ['celebrate', { durationMs: 1500, silent: true }],
      ['celebrate', { durationMs: 2000, silent: true }],
      ['celebrate', { durationMs: 1500, silent: true }]
    ]);
    expect(mgr.recordConversationEvent).toHaveBeenCalledWith({
      assistantContentLength: undefined,
      toolCallCount: undefined
    });
    expect(mgr.applyPersonaReward.mock.calls).toEqual([
      [{ xp: 0, favor: 0, dimensions: [] }, 'workflow-complete'],
      [{ xp: 0, favor: 0, dimensions: [] }, 'resource-import-complete']
    ]);
    expect(mgr.playOnce).not.toHaveBeenCalled();
    expect(mgr.addXP).not.toHaveBeenCalled();
    expect(mgr.changeFavor).not.toHaveBeenCalled();
    expect(mgr.updateDimension).not.toHaveBeenCalled();

    cleanup();
  });

  it('suppresses AI event toast speech when chat realtime speech is enabled for the scope', () => {
    const mgr = createManagerStub();
    mgr.isRealtimeSpeechEnabled.mockReturnValue(true);
    const cleanup = initSpriteEventListener(mgr as any);

    eventHarness.emit(AppEvent.SPRITE_AI_START, {
      message: '思考中...',
      spriteRealtimeSpeechScope: 'mainChat'
    });
    eventHarness.emit(AppEvent.SPRITE_AI_COMPLETE, {
      message: '完成啦',
      spriteRealtimeSpeechScope: 'mainChat'
    });
    eventHarness.emit(AppEvent.SPRITE_AI_ERROR, {
      error: '失败了',
      spriteRealtimeSpeechScope: 'mainChat'
    });

    expect(mgr.isRealtimeSpeechEnabled).toHaveBeenCalledWith({ source: 'chat', scope: 'mainChat' });
    expect(mgr.showToast.mock.calls).toEqual([
      ['思考中...', { category: 'loading', speak: false }],
      ['完成啦', { category: 'success', duration: 1500, speak: false }],
      ['失败了', { category: 'error', duration: 2000, speak: false }]
    ]);
    expect(mgr.trigger.mock.calls).toEqual([
      ['thinking', { durationMs: 2000, silent: true }],
      ['celebrate', { durationMs: 1500, silent: true }],
      ['error', { durationMs: 1500, silent: true }]
    ]);

    cleanup();
  });

  it('starts the MiniMax music easter egg purpose when a guide routine does not handle the save', async () => {
    const mgr = createManagerStub();
    const cleanup = initSpriteEventListener(mgr as any);

    eventHarness.emit(AppEvent.AI_PROVIDER_CONFIG_UPDATED, {
      providerId: 'minimax',
      presetId: 'preset-minimax',
      action: 'preset-secrets-updated'
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(mgr.emitPurposeEvent).toHaveBeenCalledWith({
      source: 'app-event',
      event: AppEvent.AI_PROVIDER_CONFIG_UPDATED,
      payload: {
        providerId: 'minimax',
        presetId: 'preset-minimax',
        action: 'preset-secrets-updated'
      }
    });
    expect(mgr.startPurpose).toHaveBeenCalledWith({
      kind: 'easter-egg.chat-api-config-minimax',
      reason: 'MiniMax 配置完成后的语音彩蛋',
      source: 'app-event',
      title: 'MiniMax 配置彩蛋',
      priority: 80,
      interruptPolicy: 'urgent',
      presentationMode: 'occupy-main-flow',
      presetId: 'easter-egg.chat-api-config-minimax',
      plannerMode: 'preset-only',
      coalesceKey: 'easter-egg.chat-api-config-minimax'
    });
    expect(mgr.speak).not.toHaveBeenCalled();

    cleanup();
  });

  it('starts the MiniMax easter egg after the chat API config guide captures the save event', async () => {
    const mgr = createManagerStub();
    mgr.emitPurposeEvent.mockReturnValue({ matched: 1 });
    const cleanup = initSpriteEventListener(mgr as any);

    eventHarness.emit(AppEvent.AI_PROVIDER_CONFIG_UPDATED, {
      providerId: 'minimax',
      presetId: 'preset-minimax',
      action: 'preset-secrets-updated'
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(mgr.startPurpose).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'easter-egg.chat-api-config-minimax',
      presentationMode: 'occupy-main-flow'
    }));

    cleanup();
  });

  it('lets an active workflow.waiting purpose own workflow busy presentation', () => {
    const mgr = createManagerStub();
    mgr.getPurposeSnapshot.mockReturnValue({
      current: {
        kind: 'workflow.waiting',
        context: { workflowRunId: 'run-1' }
      },
      routine: null,
      queue: []
    });
    const cleanup = initSpriteEventListener(mgr as any);

    eventHarness.emit(AppEvent.SPRITE_WORKFLOW_START, { runId: 'run-1', workflowName: '转录' });
    eventHarness.emit(AppEvent.SPRITE_WORKFLOW_PROGRESS, { runId: 'run-1', progress: 42, message: '转录中' });
    eventHarness.emit(AppEvent.SPRITE_WORKFLOW_COMPLETE, { runId: 'run-1', message: '完成' });

    expect(mgr.emitPurposeEvent.mock.calls).toEqual([
      [
        {
          source: 'app-event',
          event: AppEvent.SPRITE_WORKFLOW_START,
          payload: { runId: 'run-1', workflowName: '转录' }
        }
      ],
      [
        {
          source: 'app-event',
          event: AppEvent.SPRITE_WORKFLOW_PROGRESS,
          payload: { runId: 'run-1', progress: 42, message: '转录中' }
        }
      ],
      [
        {
          source: 'app-event',
          event: AppEvent.SPRITE_WORKFLOW_COMPLETE,
          payload: { runId: 'run-1', message: '完成' }
        }
      ]
    ]);
    expect(mgr.showBusy).not.toHaveBeenCalled();
    expect(mgr.updateBusy).not.toHaveBeenCalled();
    expect(mgr.clearBusy).not.toHaveBeenCalled();
    expect(mgr.showToast).not.toHaveBeenCalled();
    expect(mgr.trigger).not.toHaveBeenCalled();
    expect(mgr.applyPersonaReward).toHaveBeenCalledWith({ xp: 0, favor: 0, dimensions: [] }, 'workflow-complete');

    cleanup();
  });

  it('routes workflow start events into workflow.waiting purpose mode by default', () => {
    const mgr = createManagerStub();
    const cleanup = initSpriteEventListener(mgr as any);

    eventHarness.emit(AppEvent.SPRITE_WORKFLOW_START, {
      runId: 'run-default-purpose',
      workflowId: 'wf-default',
      workflowName: 'Default workflow purpose'
    });

    expect(mgr.startPurpose).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'workflow.waiting',
        presetId: 'workflow.waiting',
        source: 'app-event',
        correlationId: 'run-default-purpose',
        coalesceKey: 'workflow:run-default-purpose',
        context: expect.objectContaining({
          runId: 'run-default-purpose',
          workflowRunId: 'run-default-purpose',
          workflowId: 'wf-default',
          workflowName: 'Default workflow purpose'
        })
      })
    );
    expect(mgr.showBusy).not.toHaveBeenCalled();
    expect(mgr.trigger).not.toHaveBeenCalled();

    cleanup();
  });

  it('routes resource import start events into resource.import.waiting purpose mode by default', () => {
    const mgr = createManagerStub();
    const cleanup = initSpriteEventListener(mgr as any);

    eventHarness.emit(AppEvent.SPRITE_RESOURCE_IMPORT_START, {
      resourceId: 'resource-default',
      workspaceId: 'workspace-default',
      message: 'Importing by default'
    });

    expect(mgr.startPurpose).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'resource.import.waiting',
        presetId: 'resource.import.waiting',
        source: 'app-event',
        correlationId: 'resource-default',
        coalesceKey: 'resource-import:resource-default',
        context: expect.objectContaining({
          resourceId: 'resource-default',
          workspaceId: 'workspace-default',
          message: 'Importing by default'
        })
      })
    );
    expect(mgr.showBusy).not.toHaveBeenCalled();
    expect(mgr.trigger).not.toHaveBeenCalled();

    cleanup();
  });

  it('keeps legacy workflow presentation for unmatched active workflow purposes', () => {
    const mgr = createManagerStub();
    mgr.getPurposeSnapshot.mockReturnValue({
      current: {
        kind: 'workflow.waiting',
        context: { workflowRunId: 'run-1' }
      },
      routine: null,
      queue: []
    });
    const cleanup = initSpriteEventListener(mgr as any, { workflow: 'auto' });

    eventHarness.emit(AppEvent.SPRITE_WORKFLOW_PROGRESS, { runId: 'run-2', progress: 64, message: '另一个任务' });
    eventHarness.emit(AppEvent.SPRITE_WORKFLOW_PROGRESS, { progress: 70, message: '旧事件' });

    expect(mgr.updateBusy.mock.calls).toEqual([
      [64, '另一个任务'],
      [70, '旧事件']
    ]);

    cleanup();
  });

  it('can route workflow start events into workflow.waiting purpose mode', () => {
    const mgr = createManagerStub();
    const cleanup = initSpriteEventListener(mgr as any, { workflow: 'purpose' });

    eventHarness.emit(AppEvent.SPRITE_WORKFLOW_START, {
      runId: 'run-purpose-1',
      workflowId: 'wf-1',
      workflowName: 'Transcribe'
    });

    expect(mgr.startPurpose).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'workflow.waiting',
        presetId: 'workflow.waiting',
        source: 'app-event',
        priority: 65,
        correlationId: 'run-purpose-1',
        coalesceKey: 'workflow:run-purpose-1',
        context: expect.objectContaining({
          runId: 'run-purpose-1',
          workflowRunId: 'run-purpose-1',
          workflowId: 'wf-1',
          workflowName: 'Transcribe'
        })
      })
    );
    expect(mgr.showBusy).not.toHaveBeenCalled();
    expect(mgr.trigger).not.toHaveBeenCalled();

    cleanup();
  });

  it('can route resource import start events into resource.import.waiting purpose mode', () => {
    const mgr = createManagerStub();
    const cleanup = initSpriteEventListener(mgr as any, { resourceImport: 'purpose' });

    eventHarness.emit(AppEvent.SPRITE_RESOURCE_IMPORT_START, {
      resourceId: 'resource-1',
      workspaceId: 'workspace-1',
      message: 'Importing resource'
    });

    expect(mgr.startPurpose).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'resource.import.waiting',
        presetId: 'resource.import.waiting',
        source: 'app-event',
        priority: 65,
        correlationId: 'resource-1',
        coalesceKey: 'resource-import:resource-1',
        context: expect.objectContaining({
          resourceId: 'resource-1',
          workspaceId: 'workspace-1',
          message: 'Importing resource'
        })
      })
    );
    expect(mgr.showBusy).not.toHaveBeenCalled();
    expect(mgr.trigger).not.toHaveBeenCalled();

    cleanup();
  });
});

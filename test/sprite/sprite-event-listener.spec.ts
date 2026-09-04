import { afterEach, describe, expect, it, vi } from 'vitest';

const mockedAppEvent = vi.hoisted(
  () =>
    ({
      SPRITE_AI_START: 'SPRITE_AI_START',
      SPRITE_AI_COMPLETED: 'SPRITE_AI_COMPLETED',
      SPRITE_AI_ERROR: 'SPRITE_AI_ERROR',
      AI_PROVIDER_CONFIG_UPDATED: 'AI_PROVIDER_CONFIG_UPDATED',
      APP_WINDOW_CLOSED: 'APP_WINDOW_CLOSED',
      APP_WINDOW_OPENED: 'APP_WINDOW_OPENED',
      SPRITE_DOWNLOAD_START: 'SPRITE_DOWNLOAD_START',
      SPRITE_DOWNLOAD_COMPLETE: 'SPRITE_DOWNLOAD_COMPLETE',
      SPRITE_DOWNLOAD_FAILED: 'SPRITE_DOWNLOAD_FAILED',
      SPRITE_PLUGIN_INSTALLED: 'SPRITE_PLUGIN_INSTALLED',
      SPRITE_PLUGIN_REMOVED: 'SPRITE_PLUGIN_REMOVED',
      SPRITE_SYSTEM_READY: 'SPRITE_SYSTEM_READY',
      SPRITE_SYSTEM_QUIT: 'SPRITE_SYSTEM_QUIT'
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

vi.mock('../../packages/sprite-core/character-service', () => ({
  getCharacterPackDefinition: () => null,
  getCharacterDefinition: () => null,
  getCharacterPackSource: () => null,
  getDimensionSchema: () => []
}));

import { AppEvent } from '@packages/event';

import { initSpriteEventListener } from '../../packages/sprite-core/handlers/sprite-event-listener';

function createManagerStub(): {
  showToast: ReturnType<typeof vi.fn>;
  showBusy: ReturnType<typeof vi.fn>;
  updateBusy: ReturnType<typeof vi.fn>;
  clearBusy: ReturnType<typeof vi.fn>;
  trigger: ReturnType<typeof vi.fn>;
  speak: ReturnType<typeof vi.fn>;
  playOnce: ReturnType<typeof vi.fn>;
  emitPurposeEvent: ReturnType<typeof vi.fn>;
  startPurpose: ReturnType<typeof vi.fn>;
} {
  return {
    showToast: vi.fn(),
    showBusy: vi.fn(),
    updateBusy: vi.fn(),
    clearBusy: vi.fn(),
    trigger: vi.fn(),
    speak: vi.fn(async () => ({ ok: true })),
    playOnce: vi.fn(),
    emitPurposeEvent: vi.fn(() => ({ matched: 0 })),
    startPurpose: vi.fn(async () => ({ accepted: true, status: 'started' }))
  };
}

describe('sprite event listener', () => {
  afterEach(() => {
    eventHarness.reset();
    vi.clearAllMocks();
  });

  it('routes business animation semantics through trigger() instead of playOnce()', () => {
    const mgr = createManagerStub();
    const cleanup = initSpriteEventListener(mgr as any);

    eventHarness.emit(AppEvent.SPRITE_AI_START, { message: '思考中...' });
    eventHarness.emit(AppEvent.SPRITE_AI_ERROR, { error: 'boom' });

    expect(mgr.trigger.mock.calls).toEqual([
      ['thinking', { durationMs: 2000, silent: true }],
      ['error', { durationMs: 1500, silent: true }]
    ]);
    expect(mgr.playOnce).not.toHaveBeenCalled();

    cleanup();
  });

  it('keeps success-style business events on explicit trigger channels', () => {
    const mgr = createManagerStub();
    const cleanup = initSpriteEventListener(mgr as any);

    eventHarness.emit(AppEvent.SPRITE_AI_COMPLETED, { message: '完成啦' });

    expect(mgr.trigger.mock.calls).toEqual([['celebrate', { durationMs: 1500, silent: true }]]);
    expect(mgr.playOnce).not.toHaveBeenCalled();

    cleanup();
  });

  it('suppresses AI event toast speech for chat-scoped events regardless of the realtime speech toggle', () => {
    const mgr = createManagerStub();
    // 「AI 说话」开启时实时朗读会读回复，状态 toast 静音避免重复；
    // 关闭时用户已明确静音聊天语音，状态 toast 同样不读
    const cleanup = initSpriteEventListener(mgr as any);

    eventHarness.emit(AppEvent.SPRITE_AI_START, {
      message: '思考中...',
      realtimeSpeechScope: 'mainChat'
    });
    eventHarness.emit(AppEvent.SPRITE_AI_COMPLETED, {
      message: '完成啦',
      realtimeSpeechScope: 'mainChat'
    });
    eventHarness.emit(AppEvent.SPRITE_AI_ERROR, {
      error: '失败了',
      realtimeSpeechScope: 'mainChat'
    });

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

  it('keeps toast speech for AI events without a chat speech scope', () => {
    const mgr = createManagerStub();
    const cleanup = initSpriteEventListener(mgr as any);

    // 非聊天来源（后台任务等）的 AI 事件维持原行为：状态 toast 照常朗读
    eventHarness.emit(AppEvent.SPRITE_AI_ERROR, { error: '后台失败' });

    expect(mgr.showToast.mock.calls).toEqual([['后台失败', { category: 'error', duration: 2000 }]]);

    cleanup();
  });

  it('speaks the MiniMax music easter egg when a MiniMax API key config save is not handled by a guide routine', () => {
    const mgr = createManagerStub();
    const cleanup = initSpriteEventListener(mgr as any);

    eventHarness.emit(AppEvent.AI_PROVIDER_CONFIG_UPDATED, {
      providerId: 'minimax',
      presetId: 'preset-minimax',
      action: 'preset-secrets-updated'
    });

    expect(mgr.emitPurposeEvent).toHaveBeenCalledWith({
      source: 'app-event',
      event: AppEvent.AI_PROVIDER_CONFIG_UPDATED,
      payload: {
        providerId: 'minimax',
        presetId: 'preset-minimax',
        action: 'preset-secrets-updated'
      }
    });
    expect(mgr.speak).toHaveBeenCalledWith('MiniMax 还可以制作音乐，以后可以和我说哦', {
      bubbleDuration: 6200
    });

    cleanup();
  });

  it('lets the chat API config guide own the MiniMax easter egg when it captures the save event', () => {
    const mgr = createManagerStub();
    mgr.emitPurposeEvent.mockReturnValue({ matched: 1 });
    const cleanup = initSpriteEventListener(mgr as any);

    eventHarness.emit(AppEvent.AI_PROVIDER_CONFIG_UPDATED, {
      providerId: 'minimax',
      presetId: 'preset-minimax',
      action: 'preset-secrets-updated'
    });

    expect(mgr.speak).not.toHaveBeenCalled();

    cleanup();
  });
});

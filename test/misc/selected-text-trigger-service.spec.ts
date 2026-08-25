import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SelectedTextLearningConfig, SelectedTextLearningPreparedSelection } from '../../electron/main/selected-text/types';

const listeners = vi.hoisted(() => ({
  keydown: [] as Array<(event: { keycode: number }) => void>,
  keyup: [] as Array<(event: { keycode: number }) => void>,
  mousedown: [] as Array<() => void>
}));

const globalInputMonitorMock = vi.hoisted(() => ({
  keys: {
    C: 46,
    Ctrl: 29,
    CtrlRight: 3613,
    Meta: 3675,
    MetaRight: 3676
  },
  on: vi.fn((eventName: 'keydown' | 'keyup' | 'mousedown', listener: any) => {
    listeners[eventName].push(listener);
    return () => {
      const index = listeners[eventName].indexOf(listener);
      if (index >= 0) listeners[eventName].splice(index, 1);
    };
  })
}));

vi.mock('../../electron/main/global-input-monitor', () => ({
  globalInputMonitor: globalInputMonitorMock
}));

function emitKeyDown(keycode = 29): void {
  for (const listener of [...listeners.keydown]) listener({ keycode });
}

function emitKeyUp(keycode = 29): void {
  for (const listener of [...listeners.keyup]) listener({ keycode });
}

function createConfig(): SelectedTextLearningConfig {
  return {
    autoSpeak: false,
    dedupeWindowMs: 8000,
    enabled: true,
    holdMs: 500,
    maxTextLength: 2000,
    restoreClipboard: true,
    showOverlay: true
  };
}

function createPreparedSelection(text = 'Hello world'): SelectedTextLearningPreparedSelection {
  return {
    detection: {
      confidence: 0.95,
      normalizedText: text,
      ok: true
    },
    read: {
      elapsedMs: 80,
      restored: true,
      source: 'clipboard-copy',
      text
    },
    text
  };
}

describe('SelectedTextTriggerService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-08T10:00:00Z'));
    listeners.keydown.length = 0;
    listeners.keyup.length = 0;
    listeners.mousedown.length = 0;
    globalInputMonitorMock.on.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows hold progress for selected text and triggers once when the bar completes', async () => {
    const { SelectedTextTriggerService } = await import('../../electron/main/selected-text/trigger-service');
    const prepared = createPreparedSelection();
    const prepareSelection = vi.fn(async () => prepared);
    const onTrigger = vi.fn();
    const showProgress = vi.fn();
    const clearProgress = vi.fn();
    const service = new SelectedTextTriggerService({
      clearProgress,
      getConfig: createConfig,
      onTrigger,
      prepareSelection,
      showProgress
    });

    expect(service.start()).toBe(true);

    emitKeyDown();
    emitKeyDown(46);
    await vi.advanceTimersByTimeAsync(100);

    expect(prepareSelection).toHaveBeenCalledWith({ usePhysicalCtrlShortcut: true });
    expect(showProgress).toHaveBeenCalledWith(20, '长按划词翻译');
    expect(onTrigger).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);

    expect(showProgress).toHaveBeenLastCalledWith(100, '长按划词翻译');
    expect(onTrigger).toHaveBeenCalledOnce();
    expect(onTrigger).toHaveBeenCalledWith(prepared);

    emitKeyDown();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onTrigger).toHaveBeenCalledOnce();

    emitKeyUp();
    await vi.advanceTimersByTimeAsync(700);

    emitKeyDown();
    await vi.advanceTimersByTimeAsync(500);
    expect(onTrigger).toHaveBeenCalledTimes(2);

    service.stop();
  });

  it('clears progress and does not trigger when ctrl is released before completion', async () => {
    const { SelectedTextTriggerService } = await import('../../electron/main/selected-text/trigger-service');
    const onTrigger = vi.fn();
    const clearProgress = vi.fn();
    const service = new SelectedTextTriggerService({
      clearProgress,
      getConfig: createConfig,
      onTrigger,
      prepareSelection: vi.fn(async () => createPreparedSelection()),
      showProgress: vi.fn()
    });

    service.start();
    emitKeyDown();
    await vi.advanceTimersByTimeAsync(100);
    emitKeyUp();
    await vi.advanceTimersByTimeAsync(500);

    expect(onTrigger).not.toHaveBeenCalled();
    expect(clearProgress).toHaveBeenCalled();

    service.stop();
  });

  it('does not show progress when no selected text can be prepared', async () => {
    const { SelectedTextTriggerService } = await import('../../electron/main/selected-text/trigger-service');
    const onTrigger = vi.fn();
    const showProgress = vi.fn();
    const service = new SelectedTextTriggerService({
      clearProgress: vi.fn(),
      getConfig: createConfig,
      onTrigger,
      prepareSelection: vi.fn(async () => null),
      showProgress
    });

    service.start();
    emitKeyDown();
    await vi.advanceTimersByTimeAsync(1000);

    expect(showProgress).not.toHaveBeenCalled();
    expect(onTrigger).not.toHaveBeenCalled();

    service.stop();
  });
});

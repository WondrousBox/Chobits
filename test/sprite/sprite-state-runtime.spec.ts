import { describe, expect, it, vi } from 'vitest';

import type { SpriteConfig, SpriteInitialState, SpritePlayCommand, SpriteStateSnapshot, SpriteWalkState } from '../../packages/sprite-core/types';
import {
  applyInitialSpriteState,
  applySpriteConfig,
  applySpritePlayCommand,
  applySpriteStateSnapshot,
  applySpriteWalkState,
  createDefaultSpriteStateContextValue,
  SpriteStateRuntimeController
} from '../../src/features/sprite-assistant/context/sprite-state-runtime';

function createBridgeHarness(options?: { initialState?: SpriteInitialState; initialStatePromise?: Promise<SpriteInitialState>; readyImpl?: () => Promise<void> }): {
  bridge: {
    getInitialState: ReturnType<typeof vi.fn>;
    ready: ReturnType<typeof vi.fn>;
    onState: ReturnType<typeof vi.fn>;
    onPlay: ReturnType<typeof vi.fn>;
    onWalk: ReturnType<typeof vi.fn>;
    onConfig: ReturnType<typeof vi.fn>;
  };
  emitState(data: SpriteStateSnapshot): void;
  emitPlay(data: SpritePlayCommand): void;
  emitWalk(data: SpriteWalkState): void;
  emitConfig(data: SpriteConfig): void;
} {
  let stateHandler: ((data: SpriteStateSnapshot) => void) | undefined;
  let playHandler: ((data: SpritePlayCommand) => void) | undefined;
  let walkHandler: ((data: SpriteWalkState) => void) | undefined;
  let configHandler: ((data: SpriteConfig) => void) | undefined;

  return {
    bridge: {
      getInitialState: vi.fn(() => options?.initialStatePromise ?? Promise.resolve(options?.initialState ?? ({} as SpriteInitialState))),
      ready: vi.fn(options?.readyImpl ?? (async () => undefined)),
      onState: vi.fn((cb: (data: SpriteStateSnapshot) => void) => {
        stateHandler = cb;
        return () => {
          stateHandler = undefined;
        };
      }),
      onPlay: vi.fn((cb: (data: SpritePlayCommand) => void) => {
        playHandler = cb;
        return () => {
          playHandler = undefined;
        };
      }),
      onWalk: vi.fn((cb: (data: SpriteWalkState) => void) => {
        walkHandler = cb;
        return () => {
          walkHandler = undefined;
        };
      }),
      onConfig: vi.fn((cb: (data: SpriteConfig) => void) => {
        configHandler = cb;
        return () => {
          configHandler = undefined;
        };
      })
    },
    emitState(data: SpriteStateSnapshot) {
      stateHandler?.(data);
    },
    emitPlay(data: SpritePlayCommand) {
      playHandler?.(data);
    },
    emitWalk(data: SpriteWalkState) {
      walkHandler?.(data);
    },
    emitConfig(data: SpriteConfig) {
      configHandler?.(data);
    }
  };
}

describe('sprite state runtime helpers', () => {
  it('creates the default provider snapshot', () => {
    expect(createDefaultSpriteStateContextValue()).toEqual({
      spriteState: 'idle',
      subState: null,
      personaState: null,
      currentAnimation: null,
      walkDirection: null,
      isWalking: false,
      isDragging: false,
      spriteConfig: {
        width: 180,
        height: 240,
        padding: 100,
        animationPlaylistMode: 'list-loop',
        showDebugOverlay: false,
        bubbleMode: 'fixed-top'
      },
      ready: false
    });
  });

  it('applies initial/play/walk/config snapshots onto the runtime value', () => {
    const initial = applyInitialSpriteState(createDefaultSpriteStateContextValue(), {
      state: 'walking',
      subState: 'custom',
      personaState: { favor: 88 } as any,
      currentAnimation: {
        animationId: 'intro',
        source: { localPath: './intro.webm', type: 'video/webm' },
        playback: { width: 320, height: 200, padding: 24 }
      },
      config: {
        width: 260,
        height: 220,
        padding: 48,
        animationPlaylistMode: 'list-loop',
        showDebugOverlay: true
      }
    } as SpriteInitialState);

    const withState = applySpriteStateSnapshot(initial, {
      state: 'reacting',
      subState: 'click',
      personaSnapshot: { favor: 90 } as any
    });
    const withPlay = applySpritePlayCommand(withState, {
      animationId: 'thinking',
      source: { localPath: './thinking.webm', type: 'video/webm' },
      playback: { width: 300, padding: 60 }
    });
    const withWalk = applySpriteWalkState(withPlay, { active: true, direction: 'right' });
    const withConfig = applySpriteConfig(withWalk, {
      width: 200,
      height: 180,
      padding: 12,
      animationPlaylistMode: 'list-once',
      showDebugOverlay: false
    });

    expect(withConfig).toMatchObject({
      spriteState: 'reacting',
      subState: 'click',
      currentAnimation: { animationId: 'thinking' },
      walkDirection: 'right',
      isWalking: true,
      spriteConfig: {
        width: 200,
        height: 180,
        padding: 12,
        animationPlaylistMode: 'list-once',
        showDebugOverlay: false
      },
      ready: true
    });
  });
});

describe('SpriteStateRuntimeController', () => {
  it('loads initial state, subscribes to bridge events, and calls ready()', async () => {
    const harness = createBridgeHarness({
      initialState: {
        state: 'idle',
        subState: null,
        personaState: { favor: 50 } as any,
        currentAnimation: {
          animationId: 'idle-default',
          source: { localPath: './idle.webm', type: 'video/webm' },
          playback: { width: 320, height: 260, padding: 24 }
        },
        animations: [],
        config: {
          width: 200,
          height: 220,
          padding: 80,
          animationPlaylistMode: 'list-loop',
          showDebugOverlay: true
        }
      } as SpriteInitialState
    });
    const commits: any[] = [];
    const controller = new SpriteStateRuntimeController(harness.bridge as any, (value) => {
      commits.push(value);
    });

    controller.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.bridge.getInitialState).toHaveBeenCalledTimes(1);
    expect(harness.bridge.ready).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({
      spriteState: 'idle',
      personaState: { favor: 50 },
      spriteConfig: {
        width: 200,
        height: 220,
        padding: 80,
        animationPlaylistMode: 'list-loop',
        showDebugOverlay: true
      },
      ready: true
    });

    harness.emitState({
      state: 'walking',
      subState: 'custom',
      personaSnapshot: { favor: 52 } as any
    });
    harness.emitPlay({
      animationId: 'wave',
      source: { localPath: './wave.webm', type: 'video/webm' },
      playback: { width: 280, padding: 40 }
    });
    harness.emitWalk({ active: true, direction: 'left' });
    harness.emitConfig({
      width: 188,
      height: 244,
      padding: 16,
      animationPlaylistMode: 'list-once',
      showDebugOverlay: false
    });

    expect(controller.getSnapshot()).toMatchObject({
      spriteState: 'walking',
      subState: 'custom',
      currentAnimation: { animationId: 'wave' },
      walkDirection: 'left',
      isWalking: true,
      spriteConfig: {
        width: 188,
        height: 244,
        padding: 16,
        animationPlaylistMode: 'list-once',
        showDebugOverlay: false
      }
    });
    expect(commits.length).toBeGreaterThanOrEqual(5);

    controller.dispose();
  });

  it('marks ready and reports init errors without throwing', async () => {
    vi.useFakeTimers();
    try {
      const error = new Error('init failed');
      const harness = createBridgeHarness({
        initialStatePromise: Promise.reject(error)
      });
      const onChange = vi.fn();
      const onError = vi.fn();
      const controller = new SpriteStateRuntimeController(harness.bridge as any, onChange, onError);

      controller.start();
      // 初始状态拉取失败会按 INITIAL_STATE_RETRY_DELAYS_MS 重试，耗尽后标记 ready 并上报
      await vi.advanceTimersByTimeAsync(60_000);

      expect(onError).toHaveBeenCalledWith(error);
      expect(controller.getSnapshot().ready).toBe(true);
      expect(harness.bridge.ready).toHaveBeenCalled();
      controller.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores late init results and bridge events after dispose', async () => {
    let resolveInitial: ((value: SpriteInitialState) => void) | undefined;
    const initialStatePromise = new Promise<SpriteInitialState>((resolve) => {
      resolveInitial = resolve;
    });
    const harness = createBridgeHarness({ initialStatePromise });
    const onChange = vi.fn();
    const controller = new SpriteStateRuntimeController(harness.bridge as any, onChange);

    controller.start();
    controller.dispose();

    resolveInitial?.({
      state: 'walking',
      subState: null,
      personaState: null,
      currentAnimation: null,
      animations: [],
      config: {
        width: 200,
        height: 200,
        padding: 20,
        animationPlaylistMode: 'list-loop',
        showDebugOverlay: false
      }
    } as SpriteInitialState);

    await Promise.resolve();
    await Promise.resolve();

    harness.emitState({ state: 'reacting' });
    harness.emitWalk({ active: true, direction: 'right' });

    expect(onChange).not.toHaveBeenCalled();
    expect(harness.bridge.ready).not.toHaveBeenCalled();
  });
});

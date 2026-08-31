import { describe, expect, it, vi } from 'vitest';

import type { SpriteConfig, SpriteInitialState, SpritePlayCommand, SpriteStateSnapshot, SpriteWalkState } from '../../packages/sprite-core/types';
import type { SpriteStateContextValue } from '../../src/features/sprite-assistant/context/sprite-state-context';
import { installMiniDom, isFakeVideoElement } from '../utils/minidom';

vi.mock('@/lib/resource-protocol', () => ({
  makeResSrc: (absPath: string) => 'res://local/' + encodeURIComponent(absPath.replace(/\\/g, '/'))
}));

function getActiveVideo(root: any): any {
  return root.querySelector('video[data-active="true"]');
}

function getInactiveVideo(root: any): any {
  return root.querySelector('video[data-active="false"]');
}

function createSpriteBridgeHarness(initialState: SpriteInitialState): {
  bridge: {
    getInitialState: ReturnType<typeof import('vitest').vi.fn>;
    ready: ReturnType<typeof import('vitest').vi.fn>;
    animComplete: ReturnType<typeof import('vitest').vi.fn>;
    onState: ReturnType<typeof import('vitest').vi.fn>;
    onPlay: ReturnType<typeof import('vitest').vi.fn>;
    onWalk: ReturnType<typeof import('vitest').vi.fn>;
    onConfig: ReturnType<typeof import('vitest').vi.fn>;
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
      getInitialState: vi.fn(async () => initialState),
      ready: vi.fn(async () => undefined),
      animComplete: vi.fn(async () => undefined),
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

describe('sprite renderer mount', () => {
  it('retries renderer initial state and sends ready after a transient failure', async () => {
    vi.useFakeTimers();
    const { SpriteStateRuntimeController } = await import('../../src/features/sprite-assistant/context/sprite-state-runtime');
    const initialState: SpriteInitialState = {
      state: 'idle',
      subState: null,
      personaState: null,
      animations: [],
      currentAnimation: null,
      config: {
        width: 200,
        height: 220,
        padding: 80,
        animationPlaylistMode: 'list-loop',
        showDebugOverlay: false,
        bubbleMode: 'fixed-top'
      }
    };
    const bridge = {
      getInitialState: vi.fn().mockRejectedValueOnce(new Error('handler missing')).mockResolvedValueOnce(initialState),
      ready: vi.fn(async () => undefined),
      onState: vi.fn(() => () => undefined),
      onPlay: vi.fn(() => () => undefined),
      onWalk: vi.fn(() => () => undefined),
      onConfig: vi.fn(() => () => undefined)
    };
    const onChange = vi.fn();
    const onError = vi.fn();

    const controller = new SpriteStateRuntimeController(bridge, onChange, onError);
    controller.start();

    await Promise.resolve();
    expect(bridge.getInitialState).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();

    expect(bridge.getInitialState).toHaveBeenCalledTimes(2);
    expect(bridge.ready).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ ready: true }));

    controller.dispose();
    vi.useRealTimers();
  });

  it('renders the debug overlay from the context-menu switch with the effective runtime padding', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');

    const env = installMiniDom();

    const { SpriteStateContext } = await import('../../src/features/sprite-assistant/context/sprite-state-context');
    const { default: PaddingDebugOverlay } = await import('../../src/features/sprite-assistant/ui/PaddingDebugOverlay');

    const state = {
      spriteState: 'idle',
      subState: null,
      personaState: null,
      currentAnimation: null,
      walkDirection: null,
      isWalking: false,
      isDragging: false,
      ready: true,
      spriteConfig: {
        width: 180,
        height: 240,
        padding: 100,
        animationPlaylistMode: 'list-loop',
        showDebugOverlay: true,
        bubbleMode: 'fixed-top'
      }
    } satisfies SpriteStateContextValue;

    const root = createRoot(env.container as any);

    await act(async () => {
      root.render(
        <SpriteStateContext.Provider value={state}>
          <PaddingDebugOverlay padding={0} />
        </SpriteStateContext.Provider>
      );
      await Promise.resolve();
    });

    const overlay = env.container.firstChild as any;

    expect(overlay).not.toBeNull();
    expect(overlay.style.left).toBe('0');
    expect(overlay.style.top).toBe('0');
    expect(overlay.style.width).toBe('180px');
    expect(overlay.style.height).toBe('240px');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    env.cleanup();
  });

  it('mounts SpriteStateProvider and rerenders VideoSprite from bridge events', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');

    const env = installMiniDom();
    const harness = createSpriteBridgeHarness({
      state: 'idle',
      subState: null,
      personaState: { favor: 50 } as any,
      animations: [],
      currentAnimation: {
        animationId: 'idle-default',
        source: { localPath: './idle.webm', type: 'video/webm' },
        playback: {
          width: 320,
          height: 240,
          padding: 24,
          loop: false
        }
      },
      config: {
        width: 200,
        height: 220,
        padding: 80,
        animationPlaylistMode: 'list-loop',
        showDebugOverlay: true
      }
    } as SpriteInitialState);

    (env.window as any).YUA = { sprite: harness.bridge };

    const { SpriteStateProvider } = await import('../../src/features/sprite-assistant/context/SpriteStateContext');
    const { useSpriteState } = await import('../../src/features/sprite-assistant/context/hooks');
    const { default: VideoSprite } = await import('../../src/features/sprite-assistant/renderers/VideoSprite');

    function MountedSprite(): JSX.Element {
      const { ready, walkDirection } = useSpriteState();
      return (
        <section data-ready={ready ? 'yes' : 'no'}>
          <VideoSprite walkDirection={walkDirection} />
        </section>
      );
    }

    const root = createRoot(env.container as any);

    await act(async () => {
      root.render(
        <SpriteStateProvider>
          <MountedSprite />
        </SpriteStateProvider>
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const section = env.container.firstChild as any;
    let video = getActiveVideo(section);

    expect(section.getAttribute('data-ready')).toBe('yes');
    expect(harness.bridge.getInitialState).toHaveBeenCalledTimes(1);
    expect(harness.bridge.ready).toHaveBeenCalledTimes(1);
    expect(isFakeVideoElement(video)).toBe(true);
    expect(video.src).toContain('res://local/');
    expect(video.style.width).toBe('320px');
    expect(video.style.height).toBe('240px');
    expect((section.firstChild as any).style.transform).toBe('none');
    expect(video.getAttribute('loop')).toBeNull();

    await act(async () => {
      harness.emitState({
        state: 'walking',
        subState: null,
        personaSnapshot: { favor: 52 } as any
      });
      harness.emitWalk({ active: true, direction: 'right' });
      harness.emitPlay({
        animationId: 'walk-right',
        source: { localPath: './walk-right.webm', type: 'video/webm' },
        playback: {
          width: 280,
          height: 210,
          padding: 20,
          loop: true
        }
      });
      await Promise.resolve();
    });

    expect(getActiveVideo(section).src).toContain('idle');
    expect(getInactiveVideo(section).src).toContain('walk-right');

    await act(async () => {
      getInactiveVideo(section).dispatchEvent({ type: 'loadeddata' });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    video = getActiveVideo(section);
    expect(video.src).toContain('walk-right');
    expect(video.style.width).toBe('280px');
    expect(video.style.height).toBe('210px');
    expect((section.firstChild as any).style.transform).toBe('scaleX(-1)');
    expect(video.getAttribute('loop')).toBe('');

    await act(async () => {
      harness.emitPlay({
        animationId: 'walk-right-finite',
        source: { localPath: './walk-right-finite.webm', type: 'video/webm' },
        playback: {
          width: 280,
          height: 210,
          padding: 20,
          loop: true,
          loopCount: 2
        }
      });
      await Promise.resolve();
    });

    expect(getActiveVideo(section).src).toContain('walk-right');
    expect(getInactiveVideo(section).src).toContain('walk-right-finite');

    await act(async () => {
      getInactiveVideo(section).dispatchEvent({ type: 'loadeddata' });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    video = getActiveVideo(section);
    expect(video.src).toContain('walk-right-finite');
    expect(video.getAttribute('loop')).toBeNull();

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    env.cleanup();
  });

  it('forwards canplay and completion events through the mounted renderer', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');

    const env = installMiniDom();
    const harness = createSpriteBridgeHarness({
      state: 'idle',
      subState: null,
      personaState: null,
      animations: [],
      currentAnimation: {
        animationId: 'loading-loop',
        source: { localPath: './loading.webm', type: 'video/webm' },
        playback: {
          loop: false,
          loopEndMs: 900,
          width: 240,
          height: 240,
          padding: 16
        }
      },
      config: {
        width: 240,
        height: 240,
        padding: 16,
        animationPlaylistMode: 'list-loop',
        showDebugOverlay: false
      }
    } as SpriteInitialState);

    (env.window as any).YUA = { sprite: harness.bridge };

    const { SpriteStateProvider } = await import('../../src/features/sprite-assistant/context/SpriteStateContext');
    const { useSpriteState } = await import('../../src/features/sprite-assistant/context/hooks');
    const { default: VideoSprite } = await import('../../src/features/sprite-assistant/renderers/VideoSprite');

    function MountedSprite(): JSX.Element | null {
      const { walkDirection } = useSpriteState();
      return <VideoSprite walkDirection={walkDirection} />;
    }

    const root = createRoot(env.container as any);

    await act(async () => {
      root.render(
        <SpriteStateProvider>
          <MountedSprite />
        </SpriteStateProvider>
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const video = getActiveVideo(env.container);
    expect(isFakeVideoElement(video)).toBe(true);

    const playSpy = vi.fn(async () => undefined);
    video.play = playSpy;
    video.duration = 1.2;

    await act(async () => {
      video.dispatchEvent({ type: 'canplay' });
      await Promise.resolve();
    });
    expect(playSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      video.currentTime = 0.91;
      video.dispatchEvent({ type: 'timeupdate' });
      await Promise.resolve();
    });

    expect(harness.bridge.animComplete).toHaveBeenCalledWith('loading-loop', 'full');

    harness.bridge.animComplete.mockClear();
    await act(async () => {
      video.dispatchEvent({ type: 'ended' });
      await Promise.resolve();
    });
    expect(harness.bridge.animComplete).toHaveBeenCalledWith('loading-loop', 'full');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    env.cleanup();
  });

  it('switches back to an already-loaded idle slot without another media ready event', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');

    const env = installMiniDom();
    const harness = createSpriteBridgeHarness({
      state: 'idle',
      subState: null,
      personaState: null,
      animations: [],
      currentAnimation: {
        animationId: 'idle-default',
        trigger: 'idle',
        source: { localPath: './idle.webm', type: 'video/webm' },
        playback: {
          width: 180,
          height: 240,
          padding: 100,
          loop: true,
          autoIdle: true
        }
      },
      config: {
        width: 180,
        height: 240,
        padding: 100,
        animationPlaylistMode: 'list-loop',
        showDebugOverlay: false
      }
    } as SpriteInitialState);

    (env.window as any).YUA = { sprite: harness.bridge };

    const { SpriteStateProvider } = await import('../../src/features/sprite-assistant/context/SpriteStateContext');
    const { useSpriteState } = await import('../../src/features/sprite-assistant/context/hooks');
    const { default: VideoSprite } = await import('../../src/features/sprite-assistant/renderers/VideoSprite');

    function MountedSprite(): JSX.Element | null {
      const { walkDirection } = useSpriteState();
      return <VideoSprite walkDirection={walkDirection} />;
    }

    const root = createRoot(env.container as any);

    await act(async () => {
      root.render(
        <SpriteStateProvider>
          <MountedSprite />
        </SpriteStateProvider>
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const initialIdleVideo = getActiveVideo(env.container);
    expect(initialIdleVideo.src).toContain('idle');
    initialIdleVideo.readyState = 2;

    await act(async () => {
      harness.emitPlay({
        animationId: 'welcome-once',
        trigger: 'welcome',
        source: { localPath: './welcome.webm', type: 'video/webm' },
        playback: {
          width: 180,
          height: 240,
          padding: 100,
          loop: false,
          autoIdle: true
        }
      });
      await Promise.resolve();
    });

    expect(getActiveVideo(env.container).src).toContain('idle');
    const welcomeVideo = getInactiveVideo(env.container);
    expect(welcomeVideo.src).toContain('welcome');
    welcomeVideo.readyState = 2;

    await act(async () => {
      welcomeVideo.dispatchEvent({ type: 'loadeddata' });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(getActiveVideo(env.container).src).toContain('welcome');
    const inactiveIdleVideo = getInactiveVideo(env.container);
    expect(inactiveIdleVideo.src).toContain('idle');
    inactiveIdleVideo.readyState = 2;

    await act(async () => {
      harness.emitPlay({
        animationId: 'idle-default',
        trigger: 'idle',
        source: { localPath: './idle.webm', type: 'video/webm' },
        playback: {
          width: 180,
          height: 240,
          padding: 100,
          loop: true,
          autoIdle: true
        }
      });
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(getActiveVideo(env.container).src).toContain('idle');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    env.cleanup();
  });

  it('exits a segmented state-bound walk loop when sprite state returns to idle', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');

    const env = installMiniDom();
    const harness = createSpriteBridgeHarness({
      state: 'walking',
      subState: null,
      personaState: null,
      animations: [],
      currentAnimation: {
        animationId: 'walk-segmented',
        trigger: 'walk',
        sessionMode: 'state-bound',
        source: { localPath: './walk-segmented.webm', type: 'video/webm' },
        playback: {
          width: 180,
          height: 240,
          padding: 100,
          loop: true,
          loopStartMs: 300,
          loopEndMs: 900,
          autoIdle: true
        }
      },
      config: {
        width: 180,
        height: 240,
        padding: 100,
        animationPlaylistMode: 'list-loop',
        showDebugOverlay: false
      }
    } as SpriteInitialState);

    (env.window as any).YUA = { sprite: harness.bridge };

    const { SpriteStateProvider } = await import('../../src/features/sprite-assistant/context/SpriteStateContext');
    const { useSpriteState } = await import('../../src/features/sprite-assistant/context/hooks');
    const { default: VideoSprite } = await import('../../src/features/sprite-assistant/renderers/VideoSprite');

    function MountedSprite(): JSX.Element | null {
      const { walkDirection } = useSpriteState();
      return <VideoSprite walkDirection={walkDirection} />;
    }

    const root = createRoot(env.container as any);

    await act(async () => {
      root.render(
        <SpriteStateProvider>
          <MountedSprite />
        </SpriteStateProvider>
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const video = getActiveVideo(env.container);
    expect(isFakeVideoElement(video)).toBe(true);
    video.duration = 1.5;
    video.play = vi.fn(async () => undefined);
    video.pause = vi.fn();

    await act(async () => {
      video.currentTime = 0.32;
      video.dispatchEvent({ type: 'timeupdate' });
      await Promise.resolve();
    });

    await act(async () => {
      harness.emitState({
        state: 'idle',
        subState: null,
        personaSnapshot: { favor: 52 } as any
      });
      harness.emitWalk({ active: false });
      await Promise.resolve();
    });

    expect(video.currentTime).toBeCloseTo(0.9);
    expect(video.play).toHaveBeenCalled();

    await act(async () => {
      video.currentTime = 1.5;
      video.dispatchEvent({ type: 'timeupdate' });
      await Promise.resolve();
    });

    expect(harness.bridge.animComplete).toHaveBeenCalledWith('walk-segmented', 'outro');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    env.cleanup();
  });

  it('keeps a segmented state-bound idle animation looping while sprite state is idle', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');

    const env = installMiniDom();
    const harness = createSpriteBridgeHarness({
      state: 'idle',
      subState: null,
      personaState: null,
      animations: [],
      currentAnimation: {
        animationId: 'idle-segmented',
        trigger: 'idle',
        sessionMode: 'state-bound',
        source: { localPath: './idle-segmented.webm', type: 'video/webm' },
        playback: {
          width: 180,
          height: 240,
          padding: 100,
          loop: true,
          loopStartMs: 300,
          loopEndMs: 900,
          autoIdle: true
        }
      },
      config: {
        width: 180,
        height: 240,
        padding: 100,
        animationPlaylistMode: 'list-loop',
        showDebugOverlay: false
      }
    } as SpriteInitialState);

    (env.window as any).YUA = { sprite: harness.bridge };

    const { SpriteStateProvider } = await import('../../src/features/sprite-assistant/context/SpriteStateContext');
    const { useSpriteState } = await import('../../src/features/sprite-assistant/context/hooks');
    const { default: VideoSprite } = await import('../../src/features/sprite-assistant/renderers/VideoSprite');

    function MountedSprite(): JSX.Element | null {
      const { walkDirection } = useSpriteState();
      return <VideoSprite walkDirection={walkDirection} />;
    }

    const root = createRoot(env.container as any);

    await act(async () => {
      root.render(
        <SpriteStateProvider>
          <MountedSprite />
        </SpriteStateProvider>
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const video = getActiveVideo(env.container);
    expect(isFakeVideoElement(video)).toBe(true);
    video.duration = 1.5;
    video.play = vi.fn(async () => undefined);
    video.pause = vi.fn();

    await act(async () => {
      video.currentTime = 0.32;
      video.dispatchEvent({ type: 'timeupdate' });
      await Promise.resolve();
    });

    expect(video.currentTime).toBeCloseTo(0.32);

    await act(async () => {
      video.currentTime = 0.92;
      video.dispatchEvent({ type: 'timeupdate' });
      await Promise.resolve();
    });

    expect(video.currentTime).toBeCloseTo(0.3);
    expect(harness.bridge.animComplete).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    env.cleanup();
  });
});

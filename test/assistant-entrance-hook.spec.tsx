import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAssistantEntranceRun } from '../packages/sprite-core/assistant-entrance';
import { installMiniDom } from './utils/minidom';

describe('assistant entrance renderer hook', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reveals the renderer on the shared timeline and reports completion once', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const { act } = await import('react');
    const React = await import('react');
    const { createRoot } = await import('react-dom/client');
    const env = installMiniDom();
    const run = createAssistantEntranceRun(
      {
        surface: { width: 180, height: 240 },
        characterRect: { x: 0, y: 0, width: 180, height: 240 },
        reducedMotion: false
      },
      { runId: 'hook-run', now: Date.now(), seed: 9 }
    );
    const prepareEntrance = vi.fn(async () => ({ played: true, run }));
    const completeEntrance = vi.fn(async () => undefined);
    let startHandler: ((payload: typeof run) => void) | null = null;
    (env.window as any).YUA = {
      sprite: {
        prepareEntrance,
        completeEntrance,
        onEntranceStart: (callback: (payload: typeof run) => void) => {
          startHandler = callback;
          return () => {
            startHandler = null;
          };
        }
      }
    };

    const { useAssistantEntrance } = await import('../src/features/sprite-assistant/hooks/useAssistantEntrance');

    function Harness(): JSX.Element {
      const { entranceComplete, rendererWrapperRef, reportFirstFrame } = useAssistantEntrance({
        enabled: true,
        sizeReady: true,
        surface: { width: 180, height: 240 },
        characterRect: { x: 0, y: 0, width: 180, height: 240 }
      });
      React.useEffect(() => {
        reportFirstFrame();
      }, [reportFirstFrame]);
      return <div ref={rendererWrapperRef} data-complete={entranceComplete ? 'yes' : 'no'} />;
    }

    const root = createRoot(env.container as any);
    await act(async () => {
      root.render(<Harness />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(prepareEntrance).toHaveBeenCalledOnce();
    expect(startHandler).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2200);
    });

    const wrapper = env.container.firstChild as any;
    expect(wrapper.getAttribute('data-complete')).toBe('yes');
    expect(wrapper.style.clipPath).toBe('inset(0 0 0 0)');
    expect(wrapper.style.opacity).toBe('1');
    expect(completeEntrance).toHaveBeenCalledOnce();
    expect(completeEntrance).toHaveBeenCalledWith('hook-run');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    env.cleanup();
  });

  it('fails open when the main process declines to play the entrance', async () => {
    const { act } = await import('react');
    const React = await import('react');
    const { createRoot } = await import('react-dom/client');
    const env = installMiniDom();
    (env.window as any).YUA = {
      sprite: {
        prepareEntrance: vi.fn(async () => ({ played: false, reason: 'already-played' })),
        completeEntrance: vi.fn(async () => undefined),
        onEntranceStart: vi.fn(() => () => undefined)
      }
    };
    const { useAssistantEntrance } = await import('../src/features/sprite-assistant/hooks/useAssistantEntrance');

    function Harness(): JSX.Element {
      const { entranceComplete, rendererWrapperRef, reportFirstFrame } = useAssistantEntrance({
        enabled: true,
        sizeReady: true,
        surface: { width: 180, height: 240 },
        characterRect: { x: 0, y: 0, width: 180, height: 240 }
      });
      React.useEffect(() => {
        reportFirstFrame();
      }, [reportFirstFrame]);
      return <div ref={rendererWrapperRef} data-complete={entranceComplete ? 'yes' : 'no'} />;
    }

    const root = createRoot(env.container as any);
    await act(async () => {
      root.render(<Harness />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const wrapper = env.container.firstChild as any;
    expect(wrapper.getAttribute('data-complete')).toBe('yes');
    expect(wrapper.style.clipPath).toBe('inset(0 0 0 0)');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    env.cleanup();
  });
});

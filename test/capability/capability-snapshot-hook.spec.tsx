import { describe, expect, it } from 'vitest';
import { installMiniDom } from '../utils/minidom';

describe('useSpriteCapabilitySnapshot', () => {
  it('refreshes from the unified capability changed channel', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');

    const env = installMiniDom();

    let currentLevel = 1;
    let characterStateListener: (() => void) | undefined;
    let capabilityListener: (() => void) | undefined;
    let callCount = 0;

    (env.window as any).chobits = {
      character: {
        getCapabilitySnapshot: async () => {
          callCount += 1;
          return {
            personaLevel: currentLevel,
            capabilities: {},
            ordered: [],
            totals: { total: 0, active: 0, unlocked: 0, locked: 0 }
          };
        },
        onStateChanged: (listener: () => void) => {
          characterStateListener = listener;
          return () => {
            characterStateListener = undefined;
          };
        },
        onCapabilityChanged: (listener: () => void) => {
          capabilityListener = listener;
          return () => {
            capabilityListener = undefined;
          };
        }
      }
    };

    const { useSpriteCapabilitySnapshot } = await import('../../src/features/sprite-assistant/hooks/useSpriteCapabilitySnapshot');

    function Probe(): JSX.Element {
      const { snapshot, loading } = useSpriteCapabilitySnapshot();
      return <div data-level={String(snapshot?.personaLevel ?? -1)} data-loading={loading ? 'yes' : 'no'} />;
    }

    const root = createRoot(env.container as any);

    await act(async () => {
      root.render(<Probe />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const probe = env.container.firstChild as any;
    expect(callCount).toBe(1);
    expect(probe.getAttribute('data-level')).toBe('1');
    expect(probe.getAttribute('data-loading')).toBe('no');

    currentLevel = 8;
    await act(async () => {
      capabilityListener?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(callCount).toBe(2);
    expect(probe.getAttribute('data-level')).toBe('8');

    currentLevel = 12;
    await act(async () => {
      characterStateListener?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(callCount).toBe(3);
    expect(probe.getAttribute('data-level')).toBe('12');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    env.cleanup();
  });
});

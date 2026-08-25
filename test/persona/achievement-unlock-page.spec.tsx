import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installMiniDom, type MiniDomEnvironment } from '../utils/minidom';

const toastMockState = vi.hoisted(() => ({
  latestProps: null as any
}));

vi.mock('../../src/features/sprite-assistant/ui/AchievementUnlockToast', async () => {
  const React = await import('react');
  return {
    default: (props: any) => {
      toastMockState.latestProps = props;
      return React.createElement('div', null, props.achievement?.title ?? '');
    }
  };
});

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function installAchievementWindowEnv(initialAchievementId?: string | null, options?: { href?: string }): {
  env: MiniDomEnvironment;
  ipcListeners: Map<string, any>;
  closeWindow: ReturnType<typeof vi.fn>;
  setBounds: ReturnType<typeof vi.fn>;
  getWorkArea: ReturnType<typeof vi.fn>;
  getPayload: ReturnType<typeof vi.fn>;
} {
  const env = installMiniDom();
  if (options?.href) {
    const url = new URL(options.href);
    (env.window as any).location = {
      href: url.href,
      search: url.search,
      hash: url.hash
    };
  }
  const ipcListeners = new Map<string, any>();
  const closeWindow = vi.fn(async () => true);
  const setBounds = vi.fn(async () => ({ success: true }));
  const getWorkArea = vi.fn(async () => ({ x: 10, y: 20, width: 1280, height: 720 }));
  const getPayload = vi.fn(async () => (initialAchievementId ? { achievementId: initialAchievementId } : null));

  (env.window as any).ipcRenderer = {
    on: vi.fn((event: string, listener: any) => {
      ipcListeners.set(event, listener);
    }),
    off: vi.fn((event: string, listener: any) => {
      if (ipcListeners.get(event) === listener) ipcListeners.delete(event);
    })
  };
  (env.window as any).YUA = {
    window: {
      'window:payload:get': getPayload,
      'screen:work-area:get': getWorkArea,
      'window:bounds:set': setBounds,
      'window:close': closeWindow
    }
  };

  return { env, ipcListeners, closeWindow, setBounds, getWorkArea, getPayload };
}

describe('AchievementUnlockPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    toastMockState.latestProps = null;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('ignores the same initial payload when open-ready also delivers it', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { default: AchievementUnlockPage } = await import('../../src/features/sprite-assistant/pages/AchievementUnlock');
    const { env, ipcListeners, closeWindow, getWorkArea, setBounds } = installAchievementWindowEnv('first-workspace');
    const root = createRoot(env.container as any);

    await act(async () => {
      root.render(<AchievementUnlockPage />);
      await flushPromises();
    });
    expect(env.container.textContent).toContain('第一个工作空间');

    await act(async () => {
      ipcListeners.get('on:window:open:ready')?.(null, { achievementId: 'first-workspace' });
      await flushPromises();
    });

    await act(async () => {
      vi.advanceTimersByTime(5600);
      await flushPromises();
    });
    await act(async () => {
      toastMockState.latestProps.onExitComplete();
      await flushPromises();
    });

    expect(closeWindow).toHaveBeenCalledTimes(1);
    expect(getWorkArea).not.toHaveBeenCalled();
    expect(setBounds).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    env.cleanup();
  });

  it('queues later achievement payloads until the current toast exits', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { default: AchievementUnlockPage } = await import('../../src/features/sprite-assistant/pages/AchievementUnlock');
    const { env, ipcListeners, closeWindow } = installAchievementWindowEnv('first-workspace');
    const root = createRoot(env.container as any);

    await act(async () => {
      root.render(<AchievementUnlockPage />);
      await flushPromises();
    });

    await act(async () => {
      ipcListeners.get('on:window:open:ready')?.(null, { achievementId: 'first-import' });
      await flushPromises();
    });
    expect(env.container.textContent).toContain('第一个工作空间');

    await act(async () => {
      vi.advanceTimersByTime(5600);
      await flushPromises();
    });
    await act(async () => {
      toastMockState.latestProps.onExitComplete();
      await flushPromises();
    });

    expect(env.container.textContent).toContain('第一次托付文件');
    expect(closeWindow).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(5600);
      await flushPromises();
    });
    await act(async () => {
      toastMockState.latestProps.onExitComplete();
      await flushPromises();
    });

    expect(closeWindow).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    env.cleanup();
  });

  it('can render a debug achievement from hash search params', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { default: AchievementUnlockPage } = await import('../../src/features/sprite-assistant/pages/AchievementUnlock');
    const { env, closeWindow } = installAchievementWindowEnv(null, {
      href: 'http://localhost/#/achievement-unlock?debugAchievementId=first-import&debugDurationMs=0'
    });
    const root = createRoot(env.container as any);

    await act(async () => {
      root.render(<AchievementUnlockPage />);
      await flushPromises();
    });

    expect(env.container.textContent).toContain('第一次托付文件');
    expect(toastMockState.latestProps.durationMs).toBe(0);

    await act(async () => {
      vi.advanceTimersByTime(30000);
      await flushPromises();
    });

    expect(env.container.textContent).toContain('第一次托付文件');
    expect(closeWindow).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    env.cleanup();
  });

  it('keeps a payload achievement visible when debugDurationMs is zero', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { default: AchievementUnlockPage } = await import('../../src/features/sprite-assistant/pages/AchievementUnlock');
    const { env, ipcListeners, closeWindow, getPayload } = installAchievementWindowEnv('first-workspace');
    getPayload.mockResolvedValueOnce({ achievementId: 'first-workspace', debugDurationMs: 0 });
    const root = createRoot(env.container as any);

    await act(async () => {
      root.render(<AchievementUnlockPage />);
      await flushPromises();
    });
    expect(env.container.textContent).toContain('第一个工作空间');

    await act(async () => {
      vi.advanceTimersByTime(30000);
      await flushPromises();
    });

    expect(env.container.textContent).toContain('第一个工作空间');
    expect(closeWindow).not.toHaveBeenCalled();

    await act(async () => {
      ipcListeners.get('on:window:open:ready')?.(null, { achievementId: 'first-import', debugDurationMs: 12000 });
      await flushPromises();
    });

    await act(async () => {
      toastMockState.latestProps.onClose();
      await flushPromises();
      toastMockState.latestProps.onExitComplete();
      await flushPromises();
    });

    expect(closeWindow).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    env.cleanup();
  });
});

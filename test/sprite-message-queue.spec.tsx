import { afterEach, describe, expect, it, vi } from 'vitest';

import { installMiniDom } from './utils/minidom';

describe('useMessageQueue', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows sequential speech bubbles with different content', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1700000000000);

    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { useMessageQueue } = await import('../src/features/sprite-assistant/message/useMessageQueue');

    const env = installMiniDom();
    let queue: ReturnType<typeof useMessageQueue> | null = null;

    function Probe(): JSX.Element {
      queue = useMessageQueue();
      return <div data-content={queue.current?.content ?? ''} />;
    }

    const root = createRoot(env.container as any);

    await act(async () => {
      root.render(<Probe />);
      await Promise.resolve();
    });

    await act(async () => {
      queue?.showToast({
        category: 'message',
        content: '工作空间会存放所有重要的数据。',
        duration: 5200
      });
      await Promise.resolve();
    });

    expect((env.container.firstChild as any).getAttribute('data-content')).toBe('工作空间会存放所有重要的数据。');

    await act(async () => {
      vi.setSystemTime(1700000005000);
      queue?.showToast({
        category: 'message',
        content: '快速开始会默认创建到文档文件夹。',
        duration: 4200
      });
      await Promise.resolve();
    });

    expect((env.container.firstChild as any).getAttribute('data-content')).toBe('快速开始会默认创建到文档文件夹。');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    env.cleanup();
  });

  it('keeps next actions on speech bubble toasts', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1700000000000);

    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { useMessageQueue } = await import('../src/features/sprite-assistant/message/useMessageQueue');

    const env = installMiniDom();
    let queue: ReturnType<typeof useMessageQueue> | null = null;

    function Probe(): JSX.Element {
      queue = useMessageQueue();
      return <div data-action={queue.current?.type === 'toast' ? (queue.current.nextAction?.action ?? '') : ''} />;
    }

    const root = createRoot(env.container as any);

    await act(async () => {
      root.render(<Probe />);
      await Promise.resolve();
    });

    await act(async () => {
      queue?.showToast({
        category: 'message',
        content: '你好，我是你的专属桌面助手。',
        duration: 3600,
        nextAction: {
          id: 'workspace-onboarding-next',
          label: '下一句',
          action: 'purpose:workspace-onboarding-next'
        }
      });
      await Promise.resolve();
    });

    expect((env.container.firstChild as any).getAttribute('data-action')).toBe('purpose:workspace-onboarding-next');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    env.cleanup();
  });

  it('keeps image metadata on toast messages', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1700000000000);

    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { useMessageQueue } = await import('../src/features/sprite-assistant/message/useMessageQueue');

    const env = installMiniDom();
    let queue: ReturnType<typeof useMessageQueue> | null = null;

    function Probe(): JSX.Element {
      queue = useMessageQueue();
      const imageUrl = queue.current?.type === 'toast' ? queue.current.image?.url : '';
      return <div data-image={imageUrl ?? ''} />;
    }

    const root = createRoot(env.container as any);

    await act(async () => {
      root.render(<Probe />);
      await Promise.resolve();
    });

    await act(async () => {
      queue?.showToast({
        content: '表情标题',
        duration: 3000,
        image: {
          alt: '表情',
          title: '表情标题',
          url: 'res://emoji/test.gif'
        }
      });
      await Promise.resolve();
    });

    expect((env.container.firstChild as any).getAttribute('data-image')).toBe('res://emoji/test.gif');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    env.cleanup();
  });

  it('still dedupes preset category toasts', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1700000000000);

    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { useMessageQueue } = await import('../src/features/sprite-assistant/message/useMessageQueue');

    const env = installMiniDom();
    let queue: ReturnType<typeof useMessageQueue> | null = null;

    function Probe(): JSX.Element {
      queue = useMessageQueue();
      return <div data-content={queue.current?.content ?? ''} />;
    }

    const root = createRoot(env.container as any);

    await act(async () => {
      root.render(<Probe />);
      await Promise.resolve();
    });

    await act(async () => {
      queue?.showToast({
        category: 'success',
        content: '第一次完成',
        duration: 0
      });
      await Promise.resolve();
    });

    await act(async () => {
      vi.setSystemTime(1700000000001);
      queue?.showToast({
        category: 'success',
        content: '第二次完成',
        duration: 0
      });
      await Promise.resolve();
    });

    expect((env.container.firstChild as any).getAttribute('data-content')).toBe('第一次完成');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    env.cleanup();
  });
});

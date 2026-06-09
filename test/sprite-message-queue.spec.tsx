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
        content: '快速开始会默认创建到文档中',
        duration: 4200
      });
      await Promise.resolve();
    });

    expect((env.container.firstChild as any).getAttribute('data-content')).toBe('快速开始会默认创建到文档中');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    env.cleanup();
  });

  it('does not restore an older toast after a newer toast expires', async () => {
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
        content: '旧提示',
        duration: 5000
      });
      await Promise.resolve();
    });

    await act(async () => {
      vi.setSystemTime(1700000001000);
      queue?.showToast({
        category: 'message',
        content: '新提示',
        duration: 1000
      });
      await Promise.resolve();
    });

    expect((env.container.firstChild as any).getAttribute('data-content')).toBe('新提示');

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect((env.container.firstChild as any).getAttribute('data-content')).toBe('');

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

  it('replaces preset category toasts with the latest toast', async () => {
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

    expect((env.container.firstChild as any).getAttribute('data-content')).toBe('第二次完成');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    env.cleanup();
  });

  it('starts a recommended quest from notice button actions', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1700000000000);

    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { MessageProvider, useMessage } = await import('../src/features/sprite-assistant/message/MessageContext');
    type MessageContextValue = import('../src/features/sprite-assistant/message/types').MessageContextValue;
    type MessageButton = import('../src/features/sprite-assistant/message/types').MessageButton;

    const env = installMiniDom();
    const startQuest = vi.fn(async () => ({ ok: true, startResult: { accepted: true, status: 'started' } }));
    (env.window as any).YUA = {
      quest: {
        'quest:start': startQuest
      },
      sprite: {},
      messages: {
        on: () => () => undefined
      }
    };
    let messageContext: MessageContextValue | null = null;

    function Probe(): JSX.Element {
      messageContext = useMessage();
      return <div data-content={messageContext.current?.content ?? ''} />;
    }

    const root = createRoot(env.container as any);

    await act(async () => {
      root.render(
        <MessageProvider>
          <Probe />
        </MessageProvider>
      );
      await Promise.resolve();
    });

    await act(async () => {
      messageContext?.showNotice({
        content: '要不要继续下一个任务？',
        persistent: true,
        buttons: [{ id: 'start-next', label: '继续', action: 'quest:start:first-file-drop' }]
      });
      await Promise.resolve();
    });

    await act(async () => {
      const button: MessageButton = { id: 'start-next', label: '继续', action: 'quest:start:first-file-drop' };
      await messageContext?.handleButtonClick(button);
      await Promise.resolve();
    });

    expect(startQuest).toHaveBeenCalledWith({ id: 'first-file-drop', source: 'recommendation' });
    expect((env.container.firstChild as any).getAttribute('data-content')).toBe('任务引导已启动');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    env.cleanup();
  });
});

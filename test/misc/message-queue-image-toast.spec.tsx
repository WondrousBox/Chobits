import { afterEach, describe, expect, it, vi } from 'vitest';

import { installMiniDom } from '../utils/minidom';

describe('useMessageQueue image toast priority', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps an image toast visible when a plain toast arrives immediately after it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1782120020621);

    const { act, useEffect } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { useMessageQueue } = await import('../../src/features/sprite-assistant/message/useMessageQueue');
    type UseMessageQueueReturn = ReturnType<typeof useMessageQueue>;

    const env = installMiniDom();
    let queue: UseMessageQueueReturn | null = null;

    function Probe(): JSX.Element {
      const currentQueue = useMessageQueue();
      const current = currentQueue.current;
      const imageUrl = current?.type === 'toast' ? current.image?.url : '';

      useEffect(() => {
        queue = currentQueue;
      }, [currentQueue]);

      return <div data-content={current?.content ?? ''} data-image={imageUrl ?? ''} />;
    }

    const root = createRoot(env.container as any);

    await act(async () => {
      root.render(<Probe />);
      await Promise.resolve();
    });

    await act(async () => {
      queue?.showToast({
        id: 'emoji-send-emoji-fallback-send-1782120020583',
        content: '',
        duration: 3000,
        image: {
          alt: '猝死就猝死，关你什么事',
          title: '猝死就猝死，关你什么事',
          url: 'res://ws/emoji-packs/sleep/test.jpg'
        }
      });
      await Promise.resolve();
    });

    await act(async () => {
      vi.setSystemTime(1782120020626);
      queue?.showToast({
        category: 'message',
        content: '嗨～欢迎回来！',
        duration: 5200
      });
      await Promise.resolve();
    });

    const node = env.container.firstChild as any;
    expect(node.getAttribute('data-image')).toBe('res://ws/emoji-packs/sleep/test.jpg');
    expect(node.getAttribute('data-content')).toBe('');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    env.cleanup();
  });
});

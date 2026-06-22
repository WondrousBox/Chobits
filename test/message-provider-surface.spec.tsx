import { describe, expect, it } from 'vitest';

import { installMiniDom } from './utils/minidom';

describe('MessageProvider surface routing', () => {
  it('keeps sprite-targeted bridge messages out of the app message surface', async () => {
    const { act, useEffect } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { MessageProvider } = await import('../src/features/sprite-assistant/message/MessageContext');
    const { useMessage } = await import('../src/features/sprite-assistant/message/useMessage');
    type MessageBridgePayload = import('../src/features/sprite-assistant/message/types').MessageBridgePayload;
    type MessageContextValue = import('../src/features/sprite-assistant/message/types').MessageContextValue;

    const env = installMiniDom();
    let bridgeHandler: ((payload: MessageBridgePayload) => void) | null = null;
    let messageContext: MessageContextValue | null = null;
    (env.window as any).YUA = {
      sprite: {},
      messages: {
        on: (callback: (payload: MessageBridgePayload) => void) => {
          bridgeHandler = callback;
          return () => {
            bridgeHandler = null;
          };
        }
      }
    };

    function Probe(): JSX.Element {
      const currentContext = useMessage();
      useEffect(() => {
        messageContext = currentContext;
      }, [currentContext]);
      return <div data-content={currentContext.current?.content ?? ''} />;
    }

    const root = createRoot(env.container as any);

    await act(async () => {
      root.render(
        <MessageProvider surface="app">
          <Probe />
        </MessageProvider>
      );
      await Promise.resolve();
    });

    await act(async () => {
      bridgeHandler?.({
        kind: 'show',
        source: 'app',
        target: 'sprite',
        payload: { id: 'sprite-only', type: 'toast', content: '只给独立气泡' }
      });
      await Promise.resolve();
    });

    expect((env.container.firstChild as any).getAttribute('data-content')).toBe('');
    expect(messageContext?.current).toBeNull();

    await act(async () => {
      bridgeHandler?.({
        kind: 'show',
        source: 'app',
        payload: { id: 'app-message', type: 'toast', content: '主窗口可见' }
      });
      await Promise.resolve();
    });

    expect((env.container.firstChild as any).getAttribute('data-content')).toBe('主窗口可见');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    env.cleanup();
  });

  it('accepts sprite-targeted bridge messages on the sprite bubble surface', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { MessageProvider } = await import('../src/features/sprite-assistant/message/MessageContext');
    const { useMessage } = await import('../src/features/sprite-assistant/message/useMessage');
    type MessageBridgePayload = import('../src/features/sprite-assistant/message/types').MessageBridgePayload;

    const env = installMiniDom();
    let bridgeHandler: ((payload: MessageBridgePayload) => void) | null = null;
    (env.window as any).YUA = {
      sprite: {},
      messages: {
        on: (callback: (payload: MessageBridgePayload) => void) => {
          bridgeHandler = callback;
          return () => {
            bridgeHandler = null;
          };
        }
      }
    };

    function Probe(): JSX.Element {
      const messageContext = useMessage();
      return <div data-content={messageContext.current?.content ?? ''} />;
    }

    const root = createRoot(env.container as any);

    await act(async () => {
      root.render(
        <MessageProvider surface="sprite-bubble">
          <Probe />
        </MessageProvider>
      );
      await Promise.resolve();
    });

    await act(async () => {
      bridgeHandler?.({
        kind: 'show',
        source: 'app',
        target: 'sprite',
        payload: { id: 'sprite-only', type: 'toast', content: '独立气泡可见' }
      });
      await Promise.resolve();
    });

    expect((env.container.firstChild as any).getAttribute('data-content')).toBe('独立气泡可见');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
    env.cleanup();
  });
});

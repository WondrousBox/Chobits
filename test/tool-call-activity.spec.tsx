import { describe, expect, it, vi } from 'vitest';

import { installMiniDom } from './utils/minidom';

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function findButtonsByTitle(root: any, title: string): any[] {
  const matched: any[] = [];

  const visit = (node: any): void => {
    if (node?.localName === 'button' && node.getAttribute?.('title') === title) {
      matched.push(node);
    }
    for (const child of node?.children ?? []) {
      visit(child);
    }
  };

  visit(root);
  return matched;
}

describe('ToolCallActivity', () => {
  it('copies full tool input and output values from detail blocks', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { default: ToolCallActivity } = await import('../src/components/chat/ToolCallActivity');

    const env = installMiniDom();
    const writeText = vi.fn(async () => undefined);
    (env.window.navigator as any).clipboard = { writeText };
    (globalThis.navigator as any).clipboard = { writeText };

    const longResult = 'x'.repeat(2500);
    const root = createRoot(env.container as any);

    await act(async () => {
      root.render(
        <ToolCallActivity
          activities={[
            {
              args: { query: 'copy me' },
              callId: 'tool-call-1',
              name: 'search',
              result: longResult,
              status: 'done'
            }
          ]}
        />
      );
      await flushPromises();
    });

    await act(async () => {
      (env.container.querySelector('button') as any)?.dispatchEvent({ type: 'click' });
      await flushPromises();
    });

    const [copyArgsButton] = findButtonsByTitle(env.container, '复制参数');
    const [copyResultButton] = findButtonsByTitle(env.container, '复制结果');

    await act(async () => {
      copyArgsButton.dispatchEvent({ type: 'click' });
      copyResultButton.dispatchEvent({ type: 'click' });
      await flushPromises();
    });

    expect(writeText).toHaveBeenNthCalledWith(1, '{\n  "query": "copy me"\n}');
    expect(writeText).toHaveBeenNthCalledWith(2, longResult);

    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    env.cleanup();
  });

  it('shows emoji send calls with compact args and expandable parameters', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { default: ToolCallActivity } = await import('../src/components/chat/ToolCallActivity');

    const env = installMiniDom();
    const root = createRoot(env.container as any);

    await act(async () => {
      root.render(
        <ToolCallActivity
          activities={[
            {
              args: { query: '嚣张', caption: '嚣张一下' },
              callId: 'emoji-call-1',
              name: 'emojiSendTool',
              status: 'calling'
            }
          ]}
        />
      );
      await flushPromises();
    });

    expect(env.container.textContent).toContain('发送表情包...');
    expect(env.container.textContent).toContain('query: 嚣张');
    expect(env.container.textContent).not.toContain('"caption": "嚣张一下"');

    await act(async () => {
      (env.container.querySelector('button') as any)?.dispatchEvent({ type: 'click' });
      await flushPromises();
    });

    expect(env.container.textContent).toContain('参数');
    expect(env.container.textContent).toContain('"caption": "嚣张一下"');

    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    env.cleanup();
  });

  it('keeps the emoji preview after the send tool completes', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { default: ToolCallActivity } = await import('../src/components/chat/ToolCallActivity');

    const env = installMiniDom();
    const root = createRoot(env.container as any);

    await act(async () => {
      root.render(
        <ToolCallActivity
          activities={[
            {
              args: { query: 'happy' },
              callId: 'emoji-call-2',
              name: 'emojiSendTool',
              result: {
                details: {
                  caption: '发这张',
                  emoji: {
                    title: '你这图不错',
                    url: 'res://ws/test/emoji.jpg'
                  },
                  success: true
                }
              },
              status: 'done'
            }
          ]}
        />
      );
      await flushPromises();
    });

    const img = env.container.querySelector('img');
    expect(env.container.textContent).toContain('发送表情包完成');
    expect(env.container.textContent).toContain('query: happy');
    expect(env.container.textContent).toContain('发这张');
    expect(img?.getAttribute('src')).toBe('res://ws/test/emoji.jpg');
    expect(img?.getAttribute('alt')).toBe('你这图不错');

    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    env.cleanup();
  });

  it('renders content-only emoji send calls without tool call chrome', async () => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { default: ToolCallActivity } = await import('../src/components/chat/ToolCallActivity');

    const env = installMiniDom();
    const root = createRoot(env.container as any);

    await act(async () => {
      root.render(
        <ToolCallActivity
          activities={[
            {
              args: { query: 'content-only-query' },
              callId: 'emoji-call-3',
              display: { mode: 'content-only' },
              name: 'emojiSendTool',
              result: {
                details: {
                  caption: 'content only',
                  emoji: {
                    title: 'hello',
                    url: 'res://ws/test/emoji-content-only.jpg'
                  },
                  success: true
                }
              },
              status: 'done'
            }
          ]}
        />
      );
      await flushPromises();
    });

    const img = env.container.querySelector('img');
    expect(env.container.textContent).toContain('content only');
    expect(env.container.textContent).not.toContain('query: content-only-query');
    expect(env.container.textContent).not.toContain('鍙戦€佽〃鎯呭寘瀹屾垚');
    expect(img?.getAttribute('src')).toBe('res://ws/test/emoji-content-only.jpg');

    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    env.cleanup();
  });
});

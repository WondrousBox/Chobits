import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLegacyStreamEmitter } from '../packages/ai/runtime/pi/stream-adapter';
import { createJsonToolResult } from '../packages/ai/runtime/pi/tools/result';
import { extractToolSpeechFromResult, normalizeToolSpeech } from '../packages/ai/tool-speech';

const originalWindow = (globalThis as any).window;

afterEach(() => {
  (globalThis as any).window = originalWindow;
  vi.restoreAllMocks();
});

describe('tool speech metadata', () => {
  it('attaches normalized speech metadata to json tool results', () => {
    const result = createJsonToolResult(
      {
        success: true
      },
      {
        speech: {
          delayMs: 150,
          showBubble: false,
          text: '  表情 名称  '
        }
      }
    );

    expect(result.details).toEqual({
      speech: {
        delayMs: 150,
        showBubble: false,
        text: '表情 名称'
      },
      success: true
    });
    expect(extractToolSpeechFromResult(result)).toEqual({
      delayMs: 150,
      showBubble: false,
      text: '表情 名称'
    });
  });

  it('emits tool result speech for the renderer without changing the raw result', () => {
    const emit = vi.fn();
    const legacy = createLegacyStreamEmitter(emit);
    const result = createJsonToolResult(
      {
        success: true
      },
      {
        speech: {
          showBubble: false,
          text: '表情名称'
        }
      }
    );

    legacy.toolResult('tool-call-1', result);

    expect(emit).toHaveBeenCalledWith({
      data: {
        callId: 'tool-call-1',
        result,
        speech: {
          showBubble: false,
          text: '表情名称'
        }
      },
      type: 'tool_result'
    });
  });

  it('normalizes unsafe or empty speech payloads', () => {
    expect(normalizeToolSpeech({ text: '   ' })).toBeUndefined();
    expect(normalizeToolSpeech({ bubbleDuration: -1, delayMs: 999_999, showBubble: true, text: 'ok' })).toEqual({
      delayMs: 10000,
      showBubble: true,
      text: 'ok'
    });
  });

  it('plays renderer tool result speech through the sprite bridge', async () => {
    const speak = vi.fn(async () => ({ success: true }));
    (globalThis as any).window = {
      YUA: {
        sprite: {
          speak
        }
      }
    };
    const { speakToolResultSpeech } = await import('../src/lib/tool-speech');

    speakToolResultSpeech({
      result: createJsonToolResult(
        { success: true },
        {
          speech: {
            bubbleDuration: 1200,
            showBubble: false,
            text: '发送表情'
          }
        }
      )
    });

    expect(speak).toHaveBeenCalledWith('发送表情', {
      bubbleDuration: 1200,
      showBubble: false
    });
  });

  it('skips renderer tool result speech when auxiliary speech is suppressed', async () => {
    const speak = vi.fn(async () => ({ success: true }));
    (globalThis as any).window = {
      YUA: {
        sprite: {
          speak
        }
      }
    };
    const { speakToolResultSpeech } = await import('../src/lib/tool-speech');

    speakToolResultSpeech(
      {
        result: createJsonToolResult(
          { success: true },
          {
            speech: {
              showBubble: false,
              text: '发送表情'
            }
          }
        )
      },
      { suppress: true }
    );

    expect(speak).not.toHaveBeenCalled();
  });
});

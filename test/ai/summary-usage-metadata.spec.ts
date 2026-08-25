import { describe, expect, it, vi } from 'vitest';

import { SummaryService } from '../../packages/ai/services/summary-service';

describe('summary usage metadata', () => {
  it('records truncated content length and provider request id', async () => {
    const emit = vi.fn();
    const onUsageEvent = vi.fn();

    await SummaryService.summarize(
      emit,
      {
        chatFn: async (_prompt, onEvent) => {
          onEvent({
            type: 'delta',
            data: {
              text: '{"keywords":["要点"],"summary":"总结","keyPoints":[],"timeline":[]}'
            }
          });
          onEvent({
            type: 'message_completed',
            data: {
              providerRequestId: 'provider-req-summary-1',
              rawUsage: {
                prompt_tokens: 18,
                completion_tokens: 6,
                total_tokens: 24
              },
              usage: {
                inputTokens: 18,
                outputTokens: 6,
                totalTokens: 24
              }
            }
          });
        },
        content: 'a'.repeat(20),
        languageNames: {
          'zh-CN': '中文'
        },
        model: 'gpt-4.1-mini',
        onUsageEvent,
        options: {
          maxChars: 10
        },
        providerId: 'openai',
        requestId: 'summary-req-1',
        targetLanguage: 'zh-CN'
      },
      undefined
    );

    expect(onUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          contentLength: 10
        }),
        providerRequestId: 'provider-req-summary-1',
        status: 'completed',
        usage: expect.objectContaining({
          inputTokens: 18,
          outputTokens: 6,
          totalTokens: 24
        })
      })
    );
  });
});

import { File as NodeFile } from 'node:buffer';

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../packages/ai/runtime/pi/model-resolver', () => ({
  resolvePiModelConfig: vi.fn()
}));

import { executeOpenAIEmbedding, executeOpenAITranscription } from '../../packages/ai/providers/openai-runtime';
import { normalizeOpenAIImageUsage } from '../../packages/ai/runtime/pi/image-generation-service';

if (typeof globalThis.File === 'undefined') {
  (globalThis as typeof globalThis & { File: typeof NodeFile }).File = NodeFile;
}

describe('OpenAI runtime usage normalization', () => {
  it('maps embedding usage into display and billable token fields', async () => {
    const response = await executeOpenAIEmbedding({
      client: {
        embeddings: {
          create: async () => ({
            data: [{ embedding: [0.1, 0.2, 0.3] }],
            usage: {
              prompt_tokens: 12,
              total_tokens: 12
            }
          })
        }
      } as any,
      defaultModel: 'text-embedding-3-small',
      providerId: 'openai',
      request: {
        providerId: 'openai',
        texts: ['hello world']
      } as any
    });

    expect(response).toMatchObject({
      dim: 3,
      model: 'text-embedding-3-small',
      providerId: 'openai',
      usage: {
        billableInputTokens: 12,
        billableTotalTokens: 12,
        inputTokens: 12,
        totalTokens: 12
      }
    });
    expect(response.rawUsage).toEqual({
      prompt_tokens: 12,
      total_tokens: 12
    });
  });

  it('maps token-billed transcription usage into display and billable token fields', async () => {
    const response = await executeOpenAITranscription({
      client: {
        audio: {
          transcriptions: {
            create: async () => ({
              text: 'hello transcript',
              usage: {
                input_tokens: 20,
                output_tokens: 5,
                total_tokens: 25,
                type: 'tokens'
              }
            })
          }
        }
      } as any,
      defaultModel: 'gpt-4o-mini-transcribe',
      file: Buffer.from('audio'),
      options: {},
      providerId: 'openai'
    });

    expect(response).toMatchObject({
      model: 'gpt-4o-mini-transcribe',
      providerId: 'openai',
      text: 'hello transcript',
      usage: {
        billableInputTokens: 20,
        billableOutputTokens: 5,
        billableTotalTokens: 25,
        inputTokens: 20,
        outputTokens: 5,
        totalTokens: 25
      }
    });
    expect(response.rawUsage).toEqual({
      input_tokens: 20,
      output_tokens: 5,
      total_tokens: 25,
      type: 'tokens'
    });
  });

  it('keeps duration-billed transcription token usage undefined instead of faking zeros', async () => {
    const response = await executeOpenAITranscription({
      client: {
        audio: {
          transcriptions: {
            create: async () => ({
              text: 'duration transcript',
              usage: {
                seconds: 12.5,
                type: 'duration'
              }
            })
          }
        }
      } as any,
      defaultModel: 'gpt-4o-mini-transcribe',
      file: Buffer.from('audio'),
      options: {},
      providerId: 'openai'
    });

    expect(response).toMatchObject({
      model: 'gpt-4o-mini-transcribe',
      providerId: 'openai',
      text: 'duration transcript'
    });
    expect(response.usage).toBeUndefined();
    expect(response.rawUsage).toEqual({
      seconds: 12.5,
      type: 'duration'
    });
  });

  it('maps image generation usage into display and billable token fields', () => {
    expect(
      normalizeOpenAIImageUsage({
        input_tokens: 42,
        output_tokens: 84,
        total_tokens: 126,
        input_tokens_details: {
          image_tokens: 12,
          text_tokens: 30
        }
      })
    ).toEqual({
      billableInputTokens: 42,
      billableOutputTokens: 84,
      billableTotalTokens: 126,
      inputTokens: 42,
      outputTokens: 84,
      totalTokens: 126
    });
  });

  it('keeps image generation token usage undefined when provider does not report it', () => {
    expect(normalizeOpenAIImageUsage(undefined)).toBeUndefined();
  });
});

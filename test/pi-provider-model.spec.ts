import { describe, expect, it } from 'vitest';

import { resolvePiApi, resolvePiFallbackBaseUrl, resolvePiModelReasoningCapability } from '../packages/ai/runtime/pi/provider-model';

describe('Pi provider model resolution', () => {
  it('routes official MiniMax Pi traffic to the Anthropic-compatible endpoint', () => {
    const model = {
      canonicalProviderId: 'minimax',
      modelId: 'MiniMax-M2.7',
      providerId: 'minimax',
      secrets: {},
      source: 'provider'
    } as any;

    expect(resolvePiApi(model)).toBe('anthropic-messages');
    expect(resolvePiFallbackBaseUrl(model)).toBe('https://api.minimaxi.com/anthropic');
  });

  it('normalizes the official MiniMax v1 endpoint to the Pi Anthropic endpoint', () => {
    const model = {
      baseUrl: 'https://api.minimaxi.com/v1',
      canonicalProviderId: 'minimax',
      modelId: 'MiniMax-M2.7',
      providerId: 'minimax',
      secrets: {},
      source: 'provider'
    } as any;

    expect(resolvePiApi(model)).toBe('anthropic-messages');
    expect(resolvePiFallbackBaseUrl(model)).toBe('https://api.minimaxi.com/anthropic');
  });

  it('keeps custom MiniMax proxies on the OpenAI-compatible transport', () => {
    const model = {
      baseUrl: 'https://proxy.example.com/minimax',
      canonicalProviderId: 'minimax',
      modelId: 'MiniMax-M2.7',
      providerId: 'minimax',
      secrets: {},
      source: 'provider'
    } as any;

    expect(resolvePiApi(model)).toBe('openai-completions');
    expect(resolvePiFallbackBaseUrl(model)).toBe('https://proxy.example.com/minimax');
  });

  it('prefers provider model metadata over regex guessing for reasoning capability', () => {
    const model = {
      canonicalProviderId: 'minimax',
      modelId: 'MiniMax-M2.7',
      providerId: 'minimax',
      secrets: {},
      source: 'provider'
    } as any;

    expect(resolvePiModelReasoningCapability(model)).toBe(true);
  });
});

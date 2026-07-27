import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateMock } = vi.hoisted(() => ({
  generateMock: vi.fn()
}));

vi.mock('openai', () => ({
  default: class OpenAI {
    images = { generate: generateMock };
  },
  toFile: vi.fn()
}));

vi.mock('../packages/ai/providers/service', () => ({
  getProviderDefinitionPiBaseUrl: vi.fn()
}));

vi.mock('../packages/ai/provider-preset', () => ({
  normalizeProviderPreset: vi.fn((value) => value)
}));

vi.mock('../packages/ai/runtime/pi/model-resolver', () => ({
  resolvePiModelConfig: vi.fn()
}));

vi.mock('../packages/ai/registry', () => ({
  getProvider: vi.fn(() => ({ getSecrets: vi.fn(async () => ({})) }))
}));

vi.mock('../packages/ai/settings-store', () => ({
  getFirstApiKey: vi.fn((value?: string) => value)
}));

import { PiImageGenerationService } from '../packages/ai/runtime/pi/image-generation-service';

describe('Pi image generation cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateMock.mockResolvedValue({ data: [{ url: 'https://example.com/image.png' }] });
  });

  it('passes the abort signal to the OpenAI image request options', async () => {
    const signal = new AbortController().signal;

    await new PiImageGenerationService().generateImage({
      model: 'image-model',
      prompt: 'draw an image',
      providerId: 'openai',
      secrets: { apiKey: 'test-key' },
      signal
    });

    expect(generateMock).toHaveBeenCalledWith(expect.any(Object), { signal });
  });

  it('does not start an image request when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      new PiImageGenerationService().generateImage({
        model: 'image-model',
        prompt: 'draw an image',
        providerId: 'openai',
        secrets: { apiKey: 'test-key' },
        signal: controller.signal
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(generateMock).not.toHaveBeenCalled();
  });
});

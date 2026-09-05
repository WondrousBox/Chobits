import { describe, expect, it } from 'vitest';

import { filterUnconfiguredProviders } from '../../src/lib/ai-provider-visibility';

describe('ProviderModelSelect filterUnconfiguredProviders', () => {
  it('hides providers that are explicitly unconfigured', () => {
    // 未配置 key 的 provider（configured === false）应从选择列表中隐藏
    const providers = [
      { id: 'openai', label: 'OpenAI', configured: true },
      { id: 'minimax', label: 'MiniMax', configured: false },
      { id: 'deepseek', label: 'DeepSeek', configured: false }
    ];

    const result = filterUnconfiguredProviders(providers);

    expect(result.map((p) => p.id)).toEqual(['openai']);
  });

  it('keeps providers with undefined configured (legacy rows) visible', () => {
    // configured 为 undefined（老数据/未返回）时保持现有行为，不参与隐藏
    const providers = [
      { id: 'openai', label: 'OpenAI' },
      { id: 'ollama', label: 'Ollama', configured: undefined }
    ];

    const result = filterUnconfiguredProviders(providers);

    expect(result.map((p) => p.id)).toEqual(['openai', 'ollama']);
  });

  it('preserves order and does not mutate the input', () => {
    const providers = [
      { id: 'a', label: 'A', configured: false },
      { id: 'b', label: 'B', configured: true },
      { id: 'c', label: 'C' }
    ];

    const result = filterUnconfiguredProviders(providers);

    expect(result.map((p) => p.id)).toEqual(['b', 'c']);
    expect(providers).toHaveLength(3);
  });
});

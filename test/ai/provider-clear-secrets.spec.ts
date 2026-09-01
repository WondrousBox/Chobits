import { afterEach, describe, expect, it, vi } from 'vitest';

import { gptSovitsDefinition } from '../../packages/ai/providers/builtins/gpt-sovits/definition';
import { vllmDefinition } from '../../packages/ai/providers/builtins/vllm/definition';
import { GptSovitsProvider } from '../../packages/ai/providers/gpt-sovits';
import { OpenAIProvider } from '../../packages/ai/providers/openai';
import { VllmProvider } from '../../packages/ai/providers/vllm';

// 与 gpt-sovits/vllm 用例相同：https 默认服务器走宽松 TLS（npm undici fetch + Agent），
// 测试环境用假的 undici 模块观察实际发出的请求参数
const undiciFetchMock = vi.fn();
vi.mock('undici', () => ({
  Agent: class FakeAgent {
    constructor(public options: unknown) {}
  },
  fetch: (...args: unknown[]) => undiciFetchMock(...args)
}));

const WAV_BYTES = Buffer.from('RIFF....WAVEfmt fake-wav-data', 'utf8');

function fakeUndiciWavResponse(): Response {
  return {
    arrayBuffer: async () => WAV_BYTES.buffer.slice(WAV_BYTES.byteOffset, WAV_BYTES.byteOffset + WAV_BYTES.byteLength),
    ok: true,
    status: 200,
    statusText: 'OK'
  } as unknown as Response;
}

describe('provider clearSecrets', () => {
  afterEach(() => {
    undiciFetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps setSecrets merge semantics for partial field updates', () => {
    // ai:setProviderSecrets 的调用方（设置页自动保存）只传部分字段，合并语义必须保留
    const provider = new OpenAIProvider();
    provider.setSecrets({ baseUrl: 'https://example.com/v1' });
    provider.setSecrets({ apiKey: 'user-key' });

    expect(provider.getSecrets()).toMatchObject({ apiKey: 'user-key', baseUrl: 'https://example.com/v1' });
  });

  it('drops the user key from getSecrets/isConfigured after clearSecrets (openai)', () => {
    const provider = new OpenAIProvider();
    provider.setSecrets({ apiKey: 'user-key' });
    expect(provider.isConfigured()).toBe(true);
    expect(provider.getSecrets()).toMatchObject({ apiKey: 'user-key' });

    provider.clearSecrets();

    expect(provider.isConfigured()).toBe(false);
    expect((provider.getSecrets() as Record<string, unknown>).apiKey).toBeUndefined();
  });

  it('falls back to the built-in default server config after clearSecrets (vllm)', async () => {
    const provider = new VllmProvider();
    provider.setSecrets({ apiKey: 'user-key', baseUrl: 'http://127.0.0.1:8000/v1' });
    expect(provider.getSecrets()).toMatchObject({ apiKey: 'user-key', baseUrl: 'http://127.0.0.1:8000/v1' });

    provider.clearSecrets();

    // 与「未配置」初始状态一致：回落到 defaults.config 的内置默认服务器
    expect(provider.getSecrets()).toMatchObject({
      apiKey: vllmDefinition.defaults.config?.apiKey,
      baseUrl: vllmDefinition.defaults.config?.baseUrl,
      model: 'chi-chat'
    });
    // listModels 走同一份内存 secrets，返回内置清单且不依赖被清除的用户 key
    const models = await provider.listModels();
    expect(models.map((model) => model.id)).toEqual(['chi-chat', 'chi-translate']);
  });

  it('falls back to the built-in default server config after clearSecrets (gpt-sovits)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    undiciFetchMock.mockImplementation(fakeUndiciWavResponse);

    const provider = new GptSovitsProvider();
    provider.setSecrets({ apiKey: 'user-key', baseUrl: 'http://127.0.0.1:9880' });
    expect(provider.getSecrets()).toMatchObject({ apiKey: 'user-key', baseUrl: 'http://127.0.0.1:9880' });

    provider.clearSecrets();
    expect((provider.getSecrets() as Record<string, unknown>).apiKey).toBeUndefined();

    // 清除后实际发出的 TTS 请求必须回到内置默认服务器与默认 key，而不是用户已清除的配置
    await provider.synthesizeSpeech({ model: 'chi-tts', providerId: 'gpt-sovits', text: 'テスト' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(undiciFetchMock).toHaveBeenCalledOnce();
    const [url, init] = undiciFetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe(`${gptSovitsDefinition.defaults.config?.baseUrl}/v1/audio/speech`);
    expect(new Headers(init.headers).get('authorization')).toBe(`Bearer ${gptSovitsDefinition.defaults.config?.apiKey}`);
  });
});

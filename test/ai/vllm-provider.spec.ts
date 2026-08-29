import { afterEach, describe, expect, it, vi } from 'vitest';

import { createOpenAIClient } from '../../packages/ai/providers/openai-runtime';
import { getProviderCapabilities, getProviderDefaultModels, getProviderDefinitionSchema, registerBuiltinProviderDefinitions } from '../../packages/ai/providers/service';
import { VllmProvider } from '../../packages/ai/providers/vllm';

function mockFetchJson(payload: unknown): ReturnType<typeof vi.fn> {
  return vi.fn(async () => {
    return {
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => payload,
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify(payload)
    } as unknown as Response;
  });
}

describe('vLLM builtin provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('declares vLLM chat capability and default model', () => {
    registerBuiltinProviderDefinitions();

    expect(getProviderCapabilities('vllm').chat).toBe(true);
    expect(getProviderCapabilities('vllm').modelListing).toBe(true);
    expect(getProviderCapabilities('vllm').speechSynthesis).toBe(false);
    expect(getProviderCapabilities('vllm').transcribe).toBe(false);
    expect(getProviderDefaultModels('vllm').chat).toBe('Qwen2.5-7B-Instruct-AWQ');
  });

  it('declares baseUrl/apiKey/allowInsecureTls schema fields', () => {
    registerBuiltinProviderDefinitions();

    const provider = new VllmProvider();
    expect(provider.id).toBe('vllm');

    const schema = getProviderDefinitionSchema('vllm');
    expect(schema?.fields.map((field) => field.key)).toEqual(['baseUrl', 'apiKey', 'allowInsecureTls']);
    expect(schema?.fields.find((field) => field.key === 'apiKey')?.required).toBe(true);
    const tlsField = schema?.fields.find((field) => field.key === 'allowInsecureTls');
    expect(tlsField?.type).toBe('select');
    expect(tlsField?.options?.map((option) => option.value)).toEqual(['false', 'true']);
  });

  it('lists the curated placeholder model without hitting the network', async () => {
    const fetchMock = mockFetchJson({ data: [{ id: 'Qwen2.5-7B-Instruct-AWQ' }, { id: 'other-model' }] });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new VllmProvider();
    provider.setSecrets({ apiKey: 'test-key', baseUrl: 'https://127.0.0.1:8000/v1' });

    // 定义里内置了占位模型时直接返回内置清单（与其他 openai-compatible provider 一致）；
    // 服务端 /v1/models 拉取链路在 openai-runtime 的 TLS 用例里覆盖
    const models = await provider.listModels();

    expect(models.map((model) => model.id)).toEqual(['Qwen2.5-7B-Instruct-AWQ']);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('OpenAI runtime insecure TLS passthrough', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses a custom fetch implementation when allowInsecureTls is enabled', async () => {
    const globalFetchMock = mockFetchJson({ data: [{ id: 'm1' }] });
    vi.stubGlobal('fetch', globalFetchMock);
    // 模拟 tls.ts 默认工厂的产物：undici fetch + 宽松 Agent dispatcher
    const customFetchMock = mockFetchJson({ data: [{ id: 'm1' }] });

    const client = await createOpenAIClient({ allowInsecureTls: 'true', apiKey: 'k', baseUrl: 'https://127.0.0.1:8000/v1' }, { fetchFactory: () => customFetchMock as any });
    const page = await client.models.list();

    // SDK 走了 client 级自定义 fetch，而非全局 fetch
    expect(globalFetchMock).not.toHaveBeenCalled();
    expect(customFetchMock).toHaveBeenCalledOnce();
    expect(page.data.map((model) => model.id)).toEqual(['m1']);
    const [url] = customFetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe('https://127.0.0.1:8000/v1/models');
  });

  it('keeps the SDK default fetch when allowInsecureTls is not enabled', async () => {
    const globalFetchMock = mockFetchJson({ data: [{ id: 'm1' }] });
    vi.stubGlobal('fetch', globalFetchMock);
    const factory = vi.fn(() => mockFetchJson({ data: [] }) as any);

    for (const allowInsecureTls of [undefined, 'false', '']) {
      const client = await createOpenAIClient({ allowInsecureTls, apiKey: 'k', baseUrl: 'https://127.0.0.1:8000/v1' }, { fetchFactory: factory });
      await client.models.list();
    }

    expect(factory).not.toHaveBeenCalled();
    expect(globalFetchMock).toHaveBeenCalledTimes(3);
  });
});

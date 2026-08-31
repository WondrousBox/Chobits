import { afterEach, describe, expect, it, vi } from 'vitest';

import { createOpenAIClient } from '../../packages/ai/providers/openai-runtime';
import { vllmDefinition } from '../../packages/ai/providers/builtins/vllm/definition';
import { getProviderCapabilities, getProviderDefaultModels, getProviderDefinitionSchema, registerBuiltinProviderDefinitions } from '../../packages/ai/providers/service';
import { VllmProvider } from '../../packages/ai/providers/vllm';

// 与 gpt-sovits 用例相同：测试环境不应真的发 TLS 请求，
// 这里用假的 undici fetch + Agent 验证「默认服务器走宽松 TLS」的接线
const fakeAgentInstances: unknown[] = [];
const undiciFetchMock = vi.fn();
vi.mock('undici', () => ({
  Agent: class FakeAgent {
    constructor(public options: unknown) {
      fakeAgentInstances.push(this);
    }
  },
  fetch: (...args: unknown[]) => undiciFetchMock(...args)
}));

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
    fakeAgentInstances.length = 0;
    undiciFetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('declares vLLM chat capability and default model', () => {
    registerBuiltinProviderDefinitions();

    expect(getProviderCapabilities('vllm').chat).toBe(true);
    expect(getProviderCapabilities('vllm').modelListing).toBe(true);
    expect(getProviderCapabilities('vllm').speechSynthesis).toBe(false);
    expect(getProviderCapabilities('vllm').transcribe).toBe(false);
    expect(getProviderDefaultModels('vllm').chat).toBe('chi-chat');
    // defaults.config 是运行时回落与设置页表单预填共用的内置默认配置
    expect(vllmDefinition.defaults.config).toMatchObject({
      allowInsecureTls: 'true',
      apiKey: 'S8-ae2yp0H0DxYG5A7I9g3xBAvaqiUmOSDDuzEcjxms',
      baseUrl: 'https://124.221.9.24:8080/v1'
    });
  });

  it('declares baseUrl/apiKey/allowInsecureTls schema fields', () => {
    registerBuiltinProviderDefinitions();

    const provider = new VllmProvider();
    expect(provider.id).toBe('vllm');

    const schema = getProviderDefinitionSchema('vllm');
    expect(schema?.fields.map((field) => field.key)).toEqual(['baseUrl', 'apiKey', 'allowInsecureTls']);
    // apiKey 有内置默认值（defaults.config）兜底，不再是必填项
    expect(schema?.fields.find((field) => field.key === 'apiKey')?.required).toBeFalsy();
    const tlsField = schema?.fields.find((field) => field.key === 'allowInsecureTls');
    expect(tlsField?.type).toBe('select');
    expect(tlsField?.options?.map((option) => option.value)).toEqual(['false', 'true']);
  });

  it('lists the curated placeholder models without hitting the network', async () => {
    const fetchMock = mockFetchJson({ data: [{ id: 'chi-chat' }, { id: 'other-model' }] });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new VllmProvider();
    provider.setSecrets({ apiKey: 'test-key', baseUrl: 'http://127.0.0.1:8000/v1' });

    // 定义里内置了占位模型时直接返回内置清单（与其他 openai-compatible provider 一致）；
    // 服务端 /v1/models 拉取链路在 openai-runtime 的 TLS 用例里覆盖
    const models = await provider.listModels();

    expect(models.map((model) => model.id)).toEqual(['chi-chat', 'chi-translate']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to the built-in default server and API key when nothing is configured', async () => {
    const provider = new VllmProvider();

    expect(provider.getSecrets()).toMatchObject({
      apiKey: 'S8-ae2yp0H0DxYG5A7I9g3xBAvaqiUmOSDDuzEcjxms',
      baseUrl: 'https://124.221.9.24:8080/v1',
      model: 'chi-chat'
    });
  });

  it('posts chat completions to the default server with the built-in API key over relaxed TLS', async () => {
    const fetchMock = mockFetchJson({});
    vi.stubGlobal('fetch', fetchMock);
    undiciFetchMock.mockImplementation(async () => {
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ちぃです' } }] }), {
        headers: { 'content-type': 'application/json' },
        status: 200
      });
    });

    const provider = new VllmProvider();
    const response = await provider.chat({
      messages: [{ content: 'おはよう、ちぃ！', role: 'user' }],
      providerId: 'vllm'
    });

    expect(response.message.content).toBe('ちぃです');
    // 默认 https 服务器未显式配置 TLS 校验时走宽松 undici fetch，而非全局 fetch
    expect(fetchMock).not.toHaveBeenCalled();
    expect(undiciFetchMock).toHaveBeenCalledOnce();
    const [url, init] = undiciFetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe('https://124.221.9.24:8080/v1/chat/completions');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer S8-ae2yp0H0DxYG5A7I9g3xBAvaqiUmOSDDuzEcjxms');
    expect(JSON.parse(String(init.body)).model).toBe('chi-chat');
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

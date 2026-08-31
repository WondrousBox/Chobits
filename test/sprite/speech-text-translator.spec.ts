import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// preset-service / settings-store 依赖 Electron 存储（Node 测试环境不可用），整体 mock；
// tls.ts 的 resolveFetch 用真实实现，undici 用假模块验证宽松 TLS 链路
const mocks = vi.hoisted(() => ({
  getAllSecrets: vi.fn(async () => ({}) as Record<string, string>),
  getPresetSecrets: vi.fn(async () => ({}) as Record<string, string>),
  resolveUsablePreset: vi.fn(async () => ({ id: 'vllm-chi-cloud', providerId: 'vllm', name: 'vllm-chi-cloud' }) as any)
}));

vi.mock('../../packages/ai/preset-service', () => ({
  getPresetSecrets: mocks.getPresetSecrets,
  resolveUsablePreset: mocks.resolveUsablePreset
}));

vi.mock('../../packages/ai/settings-store', () => ({
  getAllSecrets: mocks.getAllSecrets,
  getFirstApiKey: (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)
}));

const undiciFetchMock = vi.fn();
vi.mock('undici', () => ({
  Agent: class FakeAgent {
    constructor(public options: unknown) {}
  },
  fetch: (...args: unknown[]) => undiciFetchMock(...args)
}));

import { createSpriteSpeechTextTranslator } from '../../electron/main/handlers/sprite/speech-text-translator';

const GATEWAY_URL = 'https://124.221.9.24:8080/v1/chat/completions';
const BUILTIN_DEFAULT_KEY = 'S8-ae2yp0H0DxYG5A7I9g3xBAvaqiUmOSDDuzEcjxms';

function mockGatewayResponse(payload: unknown, status = 200): ReturnType<typeof vi.fn> {
  return vi.fn(async () => {
    return {
      json: async () => payload,
      ok: status >= 200 && status < 300,
      status,
      statusText: 'STATUS',
      text: async () => (typeof payload === 'string' ? payload : JSON.stringify(payload))
    } as unknown as Response;
  });
}

function translateResponse(translation: string): unknown {
  return { choices: [{ message: { content: translation } }] };
}

function arrangeSecrets(secrets: Record<string, string>): void {
  mocks.getAllSecrets.mockResolvedValue({});
  mocks.getPresetSecrets.mockResolvedValue(secrets);
}

describe('speech text translator gateway', () => {
  beforeEach(() => {
    mocks.resolveUsablePreset.mockResolvedValue({ id: 'vllm-chi-cloud', providerId: 'vllm', name: 'vllm-chi-cloud' } as any);
    // 内置 defaults.config 里 allowInsecureTls 默认为 'true'，显式 'false' 让用例走全局 fetch
    arrangeSecrets({ allowInsecureTls: 'false', apiKey: 'gateway-key' });
    undiciFetchMock.mockImplementation(async () => mockGatewayResponse(translateResponse('おはよう'))());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('posts an OpenAI chat completion with the chi-translate model and the preset Bearer key', async () => {
    const fetchMock = mockGatewayResponse(translateResponse('おはよう'));
    vi.stubGlobal('fetch', fetchMock);

    const translator = createSpriteSpeechTextTranslator();
    const result = await translator.translate({ sourceLang: 'zh', targetLang: 'ja', text: '早上好' });

    expect(result).toBe('おはよう');
    expect(mocks.resolveUsablePreset).toHaveBeenCalledWith('vllm');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(GATEWAY_URL);
    expect(init.method).toBe('POST');
    // 方向由服务端按内容自动判断，客户端只透传原文
    expect(JSON.parse(String(init.body))).toEqual({
      messages: [{ content: '早上好', role: 'user' }],
      model: 'chi-translate',
      stream: false
    });
    expect(init.headers).toMatchObject({ Authorization: 'Bearer gateway-key' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(translator.lastBackend).toEqual({ model: 'chi-translate', providerId: 'vllm' });
  });

  it('falls back to the built-in default server and API key when no usable preset exists', async () => {
    mocks.resolveUsablePreset.mockResolvedValue(undefined as any);
    const globalFetchMock = mockGatewayResponse(translateResponse('unused'));
    vi.stubGlobal('fetch', globalFetchMock);

    const translator = createSpriteSpeechTextTranslator();
    const result = await translator.translate({ sourceLang: 'zh', targetLang: 'ja', text: '早上好' });

    expect(result).toBe('おはよう');
    // 内置默认是 https 自签名 → 默认放宽 TLS，走 undici fetch
    expect(globalFetchMock).not.toHaveBeenCalled();
    expect(undiciFetchMock).toHaveBeenCalledOnce();
    const [url, init] = undiciFetchMock.mock.calls[0] as [string, Record<string, any>];
    expect(url).toBe(GATEWAY_URL);
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${BUILTIN_DEFAULT_KEY}` });
  });

  it.each([
    [401, 'unauthorized'],
    [400, 'bad request'],
    [502, 'upstream exploded']
  ])('throws with the status code and server message on %i', async (status, message) => {
    // OpenAI 标准错误格式
    const fetchMock = mockGatewayResponse({ error: { message, type: 'invalid_request_error' } }, status);
    vi.stubGlobal('fetch', fetchMock);

    const translator = createSpriteSpeechTextTranslator();
    await expect(translator.translate({ sourceLang: 'zh', targetLang: 'ja', text: '早上好' })).rejects.toThrow(`Speech translation gateway failed (${status}): ${message}`);
  });

  it('throws when the gateway returns an empty translation', async () => {
    const fetchMock = mockGatewayResponse(translateResponse('  '));
    vi.stubGlobal('fetch', fetchMock);

    const translator = createSpriteSpeechTextTranslator();
    await expect(translator.translate({ sourceLang: 'zh', targetLang: 'ja', text: '早上好' })).rejects.toThrow('empty translation');
  });

  it('routes through the relaxed TLS fetch when allowInsecureTls is enabled in the preset', async () => {
    arrangeSecrets({ allowInsecureTls: 'true', apiKey: 'gateway-key' });
    const globalFetchMock = mockGatewayResponse({});
    vi.stubGlobal('fetch', globalFetchMock);

    const translator = createSpriteSpeechTextTranslator();
    const result = await translator.translate({ sourceLang: 'zh', targetLang: 'ja', text: '早上好' });

    expect(result).toBe('おはよう');
    // 全局 fetch 未被使用，请求走了 npm undici 包的 fetch（宽松 TLS Agent 在 tls.ts 内合入）
    expect(globalFetchMock).not.toHaveBeenCalled();
    expect(undiciFetchMock).toHaveBeenCalledOnce();
    const [url, init] = undiciFetchMock.mock.calls[0] as [string, Record<string, any>];
    expect(url).toBe(GATEWAY_URL);
    expect(init.dispatcher).toBeDefined();
    expect(init.headers).toMatchObject({ Authorization: 'Bearer gateway-key' });
  });

  it('rejects same-language translation requests', async () => {
    const translator = createSpriteSpeechTextTranslator();
    await expect(translator.translate({ sourceLang: 'zh', targetLang: 'zh', text: '早上好' })).rejects.toThrow('Unsupported speech translation direction');
  });
});

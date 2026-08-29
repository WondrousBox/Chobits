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

function arrangeSecrets(secrets: Record<string, string>): void {
  mocks.getAllSecrets.mockResolvedValue({});
  mocks.getPresetSecrets.mockResolvedValue(secrets);
}

describe('speech text translator gateway', () => {
  beforeEach(() => {
    mocks.resolveUsablePreset.mockResolvedValue({ id: 'vllm-chi-cloud', providerId: 'vllm', name: 'vllm-chi-cloud' } as any);
    arrangeSecrets({ apiKey: 'gateway-key' });
    undiciFetchMock.mockImplementation(async () => mockGatewayResponse({ direction: 'zh2ja', translation: 'おはよう' })());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('posts text and direction to the gateway with the preset Bearer key', async () => {
    const fetchMock = mockGatewayResponse({ direction: 'zh2ja', translation: 'おはよう' });
    vi.stubGlobal('fetch', fetchMock);

    const translator = createSpriteSpeechTextTranslator();
    const result = await translator.translate({ sourceLang: 'zh', targetLang: 'ja', text: '早上好' });

    expect(result).toBe('おはよう');
    expect(mocks.resolveUsablePreset).toHaveBeenCalledWith('vllm');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://124.221.9.24:8080/translate');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ direction: 'zh2ja', text: '早上好' });
    expect(init.headers).toMatchObject({ Authorization: 'Bearer gateway-key' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(translator.lastBackend).toEqual({ model: 'server-side', providerId: 'chi-llm-gateway' });
  });

  it('maps ja -> zh to the ja2zh direction', async () => {
    const fetchMock = mockGatewayResponse({ direction: 'ja2zh', translation: '早上好' });
    vi.stubGlobal('fetch', fetchMock);

    const translator = createSpriteSpeechTextTranslator();
    await translator.translate({ sourceLang: 'ja', targetLang: 'zh', text: 'おはよう' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ direction: 'ja2zh', text: 'おはよう' });
  });

  it.each([
    [401, 'unauthorized'],
    [400, 'bad request'],
    [502, 'upstream exploded']
  ])('throws with the status code and server message on %i', async (status, message) => {
    const fetchMock = mockGatewayResponse({ message }, status);
    vi.stubGlobal('fetch', fetchMock);

    const translator = createSpriteSpeechTextTranslator();
    await expect(translator.translate({ sourceLang: 'zh', targetLang: 'ja', text: '早上好' })).rejects.toThrow(`Speech translation gateway failed (${status}): ${message}`);
  });

  it('throws when the gateway returns an empty translation', async () => {
    const fetchMock = mockGatewayResponse({ direction: 'zh2ja', translation: '  ' });
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
    expect(url).toBe('https://124.221.9.24:8080/translate');
    expect(init.dispatcher).toBeDefined();
    expect(init.headers).toMatchObject({ Authorization: 'Bearer gateway-key' });
  });

  it('throws when no usable vllm preset exists', async () => {
    mocks.resolveUsablePreset.mockResolvedValue(undefined as any);
    const fetchMock = mockGatewayResponse({});
    vi.stubGlobal('fetch', fetchMock);

    const translator = createSpriteSpeechTextTranslator();
    await expect(translator.translate({ sourceLang: 'zh', targetLang: 'ja', text: '早上好' })).rejects.toThrow('No usable vllm provider preset');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

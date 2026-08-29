import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GptSovitsProvider } from '../../packages/ai/providers/gpt-sovits';
import { getProviderCapabilities, getProviderDefaultModels, registerBuiltinProviderDefinitions } from '../../packages/ai/providers/service';

// 测试环境 Node 18 无法加载传递依赖 undici@8（且不应真的发 TLS 请求），
// 这里用假的 undici fetch + Agent 验证「同包 fetch + dispatcher」的接线
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

const WAV_BYTES = Buffer.from('RIFF....WAVEfmt fake-wav-data', 'utf8');

function fakeUndiciWavResponse(): Response {
  return {
    arrayBuffer: async () => WAV_BYTES.buffer.slice(WAV_BYTES.byteOffset, WAV_BYTES.byteOffset + WAV_BYTES.byteLength),
    ok: true,
    status: 200,
    statusText: 'OK'
  } as unknown as Response;
}

function mockFetchWav(bytes: Buffer = WAV_BYTES): ReturnType<typeof vi.fn> {
  return vi.fn(async () => {
    return {
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      ok: true,
      status: 200,
      statusText: 'OK'
    } as unknown as Response;
  });
}

function mockFetchError(status: number, message: string): ReturnType<typeof vi.fn> {
  return vi.fn(async () => {
    return {
      ok: false,
      status,
      statusText: 'Bad Request',
      text: async () => JSON.stringify({ message })
    } as unknown as Response;
  });
}

describe('GPT-SoVITS speech synthesis provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('declares GPT-SoVITS speech synthesis capability and default model', () => {
    registerBuiltinProviderDefinitions();

    expect(getProviderCapabilities('gpt-sovits').speechSynthesis).toBe(true);
    expect(getProviderCapabilities('gpt-sovits').chat).toBe(false);
    expect(getProviderDefaultModels('gpt-sovits').speechSynthesis).toBe('chi-e10');
  });

  it('synthesizes speech over HTTP and returns base64 wav audio without an API key', async () => {
    const fetchMock = mockFetchWav();
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GptSovitsProvider();
    provider.setSecrets({ baseUrl: 'http://127.0.0.1:9880' });

    const response = await provider.synthesizeSpeech({
      model: 'chi-e10',
      providerId: 'gpt-sovits',
      speed: 1.1,
      text: 'おはよう',
      voiceId: 'chi-default'
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:9880/tts');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();

    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      media_type: 'wav',
      prompt_lang: 'ja',
      prompt_text: '秀樹は地位を拾ってくれた',
      ref_audio_path: '/home/ubuntu/Github/Chobits-Chi-TTS/models/ref_audio.wav',
      speed_factor: 1.1,
      streaming_mode: false,
      text: 'おはよう',
      text_lang: 'ja'
    });

    const expectedBase64 = WAV_BYTES.toString('base64');
    expect(response).toMatchObject({
      audioBase64: expectedBase64,
      model: 'chi-e10',
      providerId: 'gpt-sovits',
      voice: 'chi-default',
      voiceId: 'chi-default'
    });
    expect(response.artifacts[0]).toMatchObject({
      audioBase64: expectedBase64,
      format: 'wav',
      mimeType: 'audio/wav',
      sampleRate: 32000,
      sizeBytes: WAV_BYTES.length
    });
    expect(response.artifacts[0].metadata).toMatchObject({
      mode: 'complete',
      transport: 'http',
      voiceId: 'chi-default'
    });
  });

  it('sends Authorization header when an API key is configured', async () => {
    const fetchMock = mockFetchWav();
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GptSovitsProvider();
    provider.setSecrets({ apiKey: 'proxy-token', baseUrl: 'https://tts.example.com/' });

    await provider.synthesizeSpeech({
      model: 'chi-e10',
      providerId: 'gpt-sovits',
      text: 'テスト'
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://tts.example.com/tts');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer proxy-token' });
  });

  it('maps req.language to text_lang', async () => {
    const fetchMock = mockFetchWav();
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GptSovitsProvider();

    await provider.synthesizeSpeech({
      language: 'Chinese',
      model: 'chi-e10',
      providerId: 'gpt-sovits',
      text: '你好'
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.text_lang).toBe('zh');
  });

  it('lets extras.gptSovits override the reference audio settings', async () => {
    const fetchMock = mockFetchWav();
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GptSovitsProvider();

    await provider.synthesizeSpeech({
      extras: {
        gptSovits: {
          promptLang: 'ja',
          promptText: '上書きプロンプト',
          refAudioPath: '/srv/sovits/override.wav'
        }
      },
      model: 'chi-e10',
      providerId: 'gpt-sovits',
      text: 'おはよう',
      voiceId: 'chi-default'
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.ref_audio_path).toBe('/srv/sovits/override.wav');
    expect(body.prompt_text).toBe('上書きプロンプト');
    expect(body.prompt_lang).toBe('ja');
  });

  it('falls back to default reference audio when voiceId misses and no extras are given', async () => {
    const fetchMock = mockFetchWav();
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GptSovitsProvider();

    await provider.synthesizeSpeech({
      model: 'chi-e10',
      providerId: 'gpt-sovits',
      text: 'おはよう',
      voiceId: 'unknown-voice'
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.ref_audio_path).toBe('/home/ubuntu/Github/Chobits-Chi-TTS/models/ref_audio.wav');
    expect(body.prompt_text).toBe('秀樹は地位を拾ってくれた');
  });

  it('throws with status code and server message on non-200 responses', async () => {
    const fetchMock = mockFetchError(400, 'ref_audio_path is empty');
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GptSovitsProvider();

    await expect(
      provider.synthesizeSpeech({
        model: 'chi-e10',
        providerId: 'gpt-sovits',
        text: 'おはよう'
      })
    ).rejects.toThrow('GPT-SoVITS speech synthesis failed (400): ref_audio_path is empty');
  });

  it('rejects empty text and non-complete modes', async () => {
    const provider = new GptSovitsProvider();

    await expect(provider.synthesizeSpeech({ model: 'chi-e10', providerId: 'gpt-sovits', text: '  ' })).rejects.toThrow('GPT-SoVITS speech synthesis requires text');
    await expect(provider.synthesizeSpeech({ model: 'chi-e10', mode: 'output-stream', providerId: 'gpt-sovits', text: 'hi' })).rejects.toThrow('mode "output-stream"');
    await expect(provider.synthesizeSpeech({ model: 'chi-e10', providerId: 'gpt-sovits', text: 'hi', transportPreference: 'websocket' })).rejects.toThrow('transport "websocket"');
  });
});

describe('GPT-SoVITS insecure TLS option', () => {
  beforeEach(() => {
    undiciFetchMock.mockImplementation(async () => fakeUndiciWavResponse());
  });

  afterEach(() => {
    fakeAgentInstances.length = 0;
    undiciFetchMock.mockReset();
  });

  it('routes through the undici fetch with relaxed Agent when allowInsecureTls is enabled', async () => {
    const fetchMock = mockFetchWav();
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GptSovitsProvider();
    provider.setSecrets({ allowInsecureTls: 'true', baseUrl: 'https://tts.example.com' });

    const response = await provider.synthesizeSpeech({
      model: 'chi-e10',
      providerId: 'gpt-sovits',
      text: 'テスト'
    });

    expect(response.audioBase64).toBe(WAV_BYTES.toString('base64'));
    // 全局 fetch 未被使用，请求走了 npm undici 包的 fetch + 配套宽松 Agent
    expect(fetchMock).not.toHaveBeenCalled();
    expect(undiciFetchMock).toHaveBeenCalledOnce();
    const [url, init] = undiciFetchMock.mock.calls[0] as [string, Record<string, any>];
    expect(url).toBe('https://tts.example.com/tts');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toMatchObject({ text: 'テスト', text_lang: 'ja' });
    expect(init.dispatcher).toBe(fakeAgentInstances[0]);
    expect(fakeAgentInstances).toHaveLength(1);
    expect((fakeAgentInstances[0] as any).options).toMatchObject({ connect: { rejectUnauthorized: false } });
  });

  it('keeps strict TLS verification by default and with explicit false', async () => {
    for (const allowInsecureTls of [undefined, 'false'] as Array<string | undefined>) {
      const fetchMock = mockFetchWav();
      vi.stubGlobal('fetch', fetchMock);

      const provider = new GptSovitsProvider();
      provider.setSecrets({ ...(allowInsecureTls !== undefined ? { allowInsecureTls } : {}), baseUrl: 'https://tts.example.com' });

      await provider.synthesizeSpeech({
        model: 'chi-e10',
        providerId: 'gpt-sovits',
        text: 'テスト'
      });

      // 未开启时走全局 fetch，init 不带 dispatcher
      expect(fetchMock).toHaveBeenCalledOnce();
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect((init as any).dispatcher).toBeUndefined();
      vi.unstubAllGlobals();
    }
    expect(undiciFetchMock).not.toHaveBeenCalled();
    expect(fakeAgentInstances).toHaveLength(0);
  });
});

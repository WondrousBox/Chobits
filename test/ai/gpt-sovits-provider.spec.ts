import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { gptSovitsDefinition } from '../../packages/ai/providers/builtins/gpt-sovits/definition';
import { GptSovitsProvider } from '../../packages/ai/providers/gpt-sovits';
import { getProviderCapabilities, getProviderDefaultModels, getProviderDefinitionModel, registerBuiltinProviderDefinitions } from '../../packages/ai/providers/service';

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
      // OpenAI 标准错误格式
      text: async () => JSON.stringify({ error: { message, type: 'invalid_request_error' } })
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
    expect(getProviderDefaultModels('gpt-sovits').speechSynthesis).toBe('chi-tts');
    // defaults.config 是运行时回落与设置页表单预填共用的内置默认配置
    expect(gptSovitsDefinition.defaults.config).toMatchObject({
      allowInsecureTls: 'true',
      apiKey: '9479f6c491217e258c7f8643d4df4da8af295f1d8b816883',
      baseUrl: 'https://124.221.9.24:9880'
    });
  });

  it('synthesizes speech over HTTP and returns base64 wav audio without an API key', async () => {
    const fetchMock = mockFetchWav();
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GptSovitsProvider();
    // 显式清空内置默认 API Key，验证未配置鉴权时不带 Authorization 头
    provider.setSecrets({ apiKey: '', baseUrl: 'http://127.0.0.1:9880' });

    const response = await provider.synthesizeSpeech({
      model: 'chi-tts',
      providerId: 'gpt-sovits',
      speed: 1.1,
      text: 'おはよう',
      voiceId: 'chi-default'
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:9880/v1/audio/speech');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();

    // OpenAI 兼容 TTS 报文；历史 voiceId 'chi-default' 映射到服务端音色 'chi'
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      input: 'おはよう',
      model: 'chi-tts',
      response_format: 'wav',
      speed: 1.1,
      voice: 'chi'
    });

    const expectedBase64 = WAV_BYTES.toString('base64');
    expect(response).toMatchObject({
      audioBase64: expectedBase64,
      model: 'chi-tts',
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
    provider.setSecrets({ allowInsecureTls: 'false', apiKey: 'proxy-token', baseUrl: 'https://tts.example.com/' });

    await provider.synthesizeSpeech({
      model: 'chi-tts',
      providerId: 'gpt-sovits',
      text: 'テスト'
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://tts.example.com/v1/audio/speech');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer proxy-token' });
  });

  it('retries once with the default voice when the server rejects an unknown voice', async () => {
    // 第一次 400（voice 不存在，OpenAI 错误格式），第二次成功
    const errorResponse = {
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => JSON.stringify({ error: { message: "voice: female-shaonv 不存在, 可用: ['chi']", type: 'invalid_request_error' } })
    } as unknown as Response;
    const okResponse = {
      arrayBuffer: async () => WAV_BYTES.buffer.slice(WAV_BYTES.byteOffset, WAV_BYTES.byteOffset + WAV_BYTES.byteLength),
      ok: true,
      status: 200,
      statusText: 'OK'
    } as unknown as Response;
    const fetchMock = vi.fn(async () => (fetchMock.mock.calls.length === 1 ? errorResponse : okResponse));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GptSovitsProvider();
    provider.setSecrets({ baseUrl: 'http://127.0.0.1:9880' });

    // 历史配置里可能残留其他 provider 的 voiceId（如 minimax 的 female-shaonv）
    const response = await provider.synthesizeSpeech({
      model: 'chi-tts',
      providerId: 'gpt-sovits',
      text: 'おはよう',
      voiceId: 'female-shaonv'
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [, secondInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(firstInit.body)).voice).toBe('female-shaonv');
    expect(JSON.parse(String(secondInit.body)).voice).toBe('chi');
    expect(response.audioBase64).toBe(WAV_BYTES.toString('base64'));
  });

  it('does not retry non-voice 400 errors', async () => {
    const fetchMock = mockFetchError(400, 'input is empty');
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GptSovitsProvider();
    provider.setSecrets({ baseUrl: 'http://127.0.0.1:9880' });

    await expect(
      provider.synthesizeSpeech({
        model: 'chi-tts',
        providerId: 'gpt-sovits',
        text: 'おはよう'
      })
    ).rejects.toThrow('GPT-SoVITS speech synthesis failed (400): input is empty');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects empty text and non-complete modes', async () => {
    const provider = new GptSovitsProvider();

    await expect(provider.synthesizeSpeech({ model: 'chi-tts', providerId: 'gpt-sovits', text: '  ' })).rejects.toThrow('GPT-SoVITS speech synthesis requires text');
    await expect(provider.synthesizeSpeech({ model: 'chi-tts', mode: 'output-stream', providerId: 'gpt-sovits', text: 'hi' })).rejects.toThrow('mode "output-stream"');
    await expect(provider.synthesizeSpeech({ model: 'chi-tts', providerId: 'gpt-sovits', text: 'hi', transportPreference: 'websocket' })).rejects.toThrow('transport "websocket"');
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
      model: 'chi-tts',
      providerId: 'gpt-sovits',
      text: 'テスト'
    });

    expect(response.audioBase64).toBe(WAV_BYTES.toString('base64'));
    // 全局 fetch 未被使用，请求走了 npm undici 包的 fetch + 配套宽松 Agent
    expect(fetchMock).not.toHaveBeenCalled();
    expect(undiciFetchMock).toHaveBeenCalledOnce();
    const [url, init] = undiciFetchMock.mock.calls[0] as [string, Record<string, any>];
    expect(url).toBe('https://tts.example.com/v1/audio/speech');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toMatchObject({ input: 'テスト', model: 'chi-tts', voice: 'chi' });
    expect(init.dispatcher).toBe(fakeAgentInstances[0]);
    expect(fakeAgentInstances).toHaveLength(1);
    expect((fakeAgentInstances[0] as any).options).toMatchObject({ connect: { rejectUnauthorized: false } });
  });

  it('keeps strict TLS verification with explicit false', async () => {
    const fetchMock = mockFetchWav();
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GptSovitsProvider();
    provider.setSecrets({ allowInsecureTls: 'false', baseUrl: 'https://tts.example.com' });

    await provider.synthesizeSpeech({
      model: 'chi-tts',
      providerId: 'gpt-sovits',
      text: 'テスト'
    });

    // 显式关闭时走全局 fetch，init 不带 dispatcher
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init as any).dispatcher).toBeUndefined();
    expect(undiciFetchMock).not.toHaveBeenCalled();
    expect(fakeAgentInstances).toHaveLength(0);
  });

  it('defaults to relaxed TLS verification for https baseUrl when allowInsecureTls is not configured', async () => {
    const fetchMock = mockFetchWav();
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GptSovitsProvider();
    provider.setSecrets({ baseUrl: 'https://tts.example.com' });

    await provider.synthesizeSpeech({
      model: 'chi-tts',
      providerId: 'gpt-sovits',
      text: 'テスト'
    });

    // https 且未显式配置时默认放宽校验（自托管 HTTPS 基本是自签名证书）
    expect(fetchMock).not.toHaveBeenCalled();
    expect(undiciFetchMock).toHaveBeenCalledOnce();
    const [url] = undiciFetchMock.mock.calls[0] as [string, Record<string, any>];
    expect(url).toBe('https://tts.example.com/v1/audio/speech');
  });

  it('uses the built-in default server and API key when nothing is configured', async () => {
    const fetchMock = mockFetchWav();
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GptSovitsProvider();

    await provider.synthesizeSpeech({
      model: 'chi-tts',
      providerId: 'gpt-sovits',
      text: 'テスト'
    });

    // 未配置任何 secrets 时直连内置默认服务器（https → 默认放宽 TLS，走 undici fetch）
    expect(fetchMock).not.toHaveBeenCalled();
    expect(undiciFetchMock).toHaveBeenCalledOnce();
    const [url, init] = undiciFetchMock.mock.calls[0] as [string, Record<string, any>];
    expect(url).toBe('https://124.221.9.24:9880/v1/audio/speech');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer 9479f6c491217e258c7f8643d4df4da8af295f1d8b816883'
    });
  });
});

function buildWavHeader(dataSize: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(32000, 24);
  header.writeUInt32LE(64000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return header;
}

function mockFetchStreamChunks(chunks: Uint8Array[]): ReturnType<typeof vi.fn> {
  return vi.fn(async () => {
    return {
      body: new ReadableStream({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk);
          controller.close();
        }
      }),
      ok: true,
      status: 200,
      statusText: 'OK'
    } as unknown as Response;
  });
}

describe('GPT-SoVITS streaming speech synthesis', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('streams PCM audio deltas without the WAV header and returns the full wav artifact', async () => {
    const pcmPayload = Buffer.alloc(101, 7); // 奇数长度，验证 s16le 样本对齐逻辑
    const fullWav = Buffer.concat([buildWavHeader(pcmPayload.length), pcmPayload]);
    // 故意把 WAV 头拆到两个 chunk，且 PCM 按奇数边界切分
    const chunks = [fullWav.subarray(0, 10), fullWav.subarray(10, 44 + 51), fullWav.subarray(44 + 51)];
    const fetchMock = mockFetchStreamChunks(chunks);
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GptSovitsProvider();
    provider.setSecrets({ baseUrl: 'http://127.0.0.1:9880' });

    const events: Array<{ type: string; data?: any }> = [];
    const result = await provider.streamSpeechSynthesis(
      {
        mode: 'output-stream',
        model: 'chi-tts',
        providerId: 'gpt-sovits',
        text: 'おはよう',
        transportPreference: 'http-stream',
        voiceId: 'chi-default'
      },
      (event) => events.push(event)
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:9880/v1/audio/speech');
    expect(JSON.parse(String(init.body))).toMatchObject({ input: 'おはよう', model: 'chi-tts', response_format: 'wav', voice: 'chi' });

    // started 声明 PCM 参数，供实时播放管线（PcmStreamPlayer）使用
    const started = events.find((event) => event.type === 'started');
    expect(started?.data).toMatchObject({ channels: 1, format: 'pcm', sampleFormat: 's16le', sampleRate: 32000, transport: 'http-stream' });

    // audio_delta 全部是剥掉 WAV 头的 PCM；拼接后与原始 PCM 完全一致（含结尾残留的半个样本字节）
    const deltas = events.filter((event) => event.type === 'audio_delta');
    expect(deltas.length).toBeGreaterThan(0);
    const streamed = Buffer.concat(deltas.map((event) => Buffer.from(event.data.chunk)));
    expect(streamed.equals(pcmPayload)).toBe(true);
    // 除最后一块（样本对齐残留字节）外，每块都是偶数长度
    deltas.slice(0, -1).forEach((event) => expect(event.data.chunk.length % 2).toBe(0));
    deltas.forEach((event, index) => expect(event.data.sequence).toBe(index + 1));

    // completed / done 都发出，返回值携带完整 WAV（含头）供落盘与缓存
    expect(events.some((event) => event.type === 'completed')).toBe(true);
    expect(events[events.length - 1]?.type).toBe('done');
    expect(result.audioBase64).toBe(fullWav.toString('base64'));
    expect(result.artifacts[0]).toMatchObject({ format: 'wav', mimeType: 'audio/wav', sampleRate: 32000, sizeBytes: fullWav.length });
  });

  it('declares streaming capability in the chi-tts model metadata', () => {
    registerBuiltinProviderDefinitions();
    const model = getProviderDefinitionModel('gpt-sovits', 'chi-tts');

    // 实时语音管线按这份元数据筛选策略：output-stream/http-stream + pcm 缺一不可
    expect(model?.speechSynthesis).toMatchObject({
      audioFormats: ['wav', 'pcm'],
      modes: ['complete', 'output-stream'],
      transports: ['http', 'http-stream']
    });
  });

  it('lists the builtin chi-tts model without hitting the network', async () => {
    const fetchMock = mockFetchWav();
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GptSovitsProvider();
    const models = await provider.listModels();

    expect(models.map((model) => model.id)).toEqual(['chi-tts']);
    expect(getProviderCapabilities('gpt-sovits', provider).modelListing).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects duplex-stream mode and websocket transport', async () => {
    const provider = new GptSovitsProvider();

    await expect(provider.streamSpeechSynthesis({ model: 'chi-tts', mode: 'duplex-stream', providerId: 'gpt-sovits', text: 'hi' }, () => undefined)).rejects.toThrow('mode "duplex-stream"');
    await expect(provider.streamSpeechSynthesis({ model: 'chi-tts', providerId: 'gpt-sovits', text: 'hi', transportPreference: 'websocket' }, () => undefined)).rejects.toThrow(
      'transport "websocket"'
    );
  });

  it('rejects when the server returns an error before streaming starts', async () => {
    const fetchMock = mockFetchError(400, 'input is empty');
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GptSovitsProvider();
    provider.setSecrets({ baseUrl: 'http://127.0.0.1:9880' });

    const events: Array<{ type: string }> = [];
    await expect(provider.streamSpeechSynthesis({ model: 'chi-tts', providerId: 'gpt-sovits', text: 'おはよう' }, (event) => events.push(event))).rejects.toThrow(
      'GPT-SoVITS speech synthesis failed (400): input is empty'
    );
    expect(events.some((event) => event.type === 'audio_delta')).toBe(false);
  });
});

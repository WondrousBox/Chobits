import { EventEmitter } from 'node:events';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { MiniMaxProvider } from '../packages/ai/providers/minimax';
import { getProviderCapabilities, getProviderDefaultModels, listProviderRuntimeModels, registerBuiltinProviderDefinitions } from '../packages/ai/providers/service';

function mockFetchJson(payload: unknown): ReturnType<typeof vi.fn> {
  return vi.fn(async () => {
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify(payload)
    } as unknown as Response;
  });
}

function mockFetchStream(chunks: string[]): ReturnType<typeof vi.fn> {
  return vi.fn(async () => {
    const encoder = new TextEncoder();
    return {
      body: new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        }
      }),
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => chunks.join('')
    } as unknown as Response;
  });
}

class FakeMiniMaxWebSocket extends EventEmitter {
  readyState = 1;
  readonly sent: any[] = [];
  closed = false;

  constructor() {
    super();
    queueMicrotask(() => {
      this.emit('open');
      this.emit('message', JSON.stringify({ event: 'connected_success', trace_id: 'trace-ws-connected' }));
    });
  }

  send(data: string, cb?: (error?: Error) => void): void {
    const payload = JSON.parse(data);
    this.sent.push(payload);

    if (payload.event === 'task_start') {
      queueMicrotask(() => {
        this.emit('message', JSON.stringify({ event: 'task_started', trace_id: 'trace-ws-started' }));
      });
    }

    if (payload.event === 'task_continue') {
      const audio = payload.text === '第一段' ? 'ff00' : '01';
      queueMicrotask(() => {
        this.emit('message', JSON.stringify({ data: { audio }, event: 'task_continued' }));
      });
    }

    if (payload.event === 'task_finish') {
      queueMicrotask(() => {
        this.emit('message', JSON.stringify({ data: { status: 2 }, event: 'task_finished', extra_info: { audio_duration: 88 }, trace_id: 'trace-ws-finished' }));
      });
    }

    cb?.();
  }

  close(): void {
    this.closed = true;
    this.emit('close');
  }
}

async function* speechInputChunks() {
  yield { type: 'text' as const, text: '第一段' };
  yield { type: 'flush' as const };
  yield { type: 'text' as const, text: '第二段' };
  yield { type: 'close' as const };
}

describe('MiniMax music generation provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('declares MiniMax music generation capability and models', async () => {
    registerBuiltinProviderDefinitions();

    expect(getProviderCapabilities('minimax').musicGeneration).toBe(true);
    expect(getProviderCapabilities('minimax').speechSynthesis).toBe(true);
    expect(getProviderDefaultModels('minimax').chat).toBe('MiniMax-M3');
    expect(getProviderDefaultModels('minimax').musicGeneration).toBe('music-2.6');
    expect(getProviderDefaultModels('minimax').speechSynthesis).toBe('speech-2.8-turbo');

    const models = await listProviderRuntimeModels('minimax');
    const chatModelIds = models.filter((model) => model.type === 'chat').map((model) => model.id);
    const musicModel = models.find((model) => model.id === 'music-2.6');
    const speechModel = models.find((model) => model.id === 'speech-2.8-turbo');

    expect(chatModelIds).toEqual([
      'MiniMax-M3',
      'MiniMax-M2.7',
      'MiniMax-M2.7-highspeed',
      'MiniMax-M2.5',
      'MiniMax-M2.5-highspeed',
      'MiniMax-M2.1',
      'MiniMax-M2.1-highspeed',
      'MiniMax-M2',
      'M2-her'
    ]);
    expect(musicModel?.type).toBe('text2music');
    expect(musicModel?.capabilities?.music_generation).toBe(true);
    expect(speechModel?.type).toBe('tts');
    expect(speechModel?.capabilities?.speech_synthesis).toBe(true);
  });

  it('maps MiniMax URL music responses to audio artifacts', async () => {
    const fetchMock = mockFetchJson({
      base_resp: { status_code: 0, status_msg: '' },
      data: { audio: 'https://example.com/generated-song.mp3', status: 2 },
      extra_info: {
        music_bitrate: 256000,
        music_channel: 2,
        music_duration: 30000,
        music_sample_rate: 44100
      },
      trace_id: 'trace-123'
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new MiniMaxProvider();
    provider.setSecrets({ apiKey: 'test-key', baseUrl: 'https://api.minimaxi.com/v1' });

    const response = await provider.generateMusic({
      audioSetting: { format: 'mp3' },
      lyrics: 'hello world',
      model: 'music-2.6',
      outputFormat: 'url',
      prompt: 'upbeat city pop',
      providerId: 'minimax'
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.minimaxi.com/v1/music_generation');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer test-key' });

    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('music-2.6');
    expect(body.output_format).toBe('url');
    expect(body.stream).toBe(false);
    expect(body.audio_setting.format).toBe('mp3');

    expect(response.providerId).toBe('minimax');
    expect(response.artifacts[0]).toMatchObject({
      audioUrl: 'https://example.com/generated-song.mp3',
      bitrate: 256000,
      channels: 2,
      durationMs: 30000,
      mimeType: 'audio/mpeg',
      sampleRate: 44100
    });
  });

  it('maps MiniMax hex music responses to base64 audio artifacts', async () => {
    const fetchMock = mockFetchJson({
      base_resp: { status_code: 0, status_msg: '' },
      data: { audio: 'ff0001', status: 2 },
      trace_id: 'trace-hex'
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new MiniMaxProvider();
    provider.setSecrets({ apiKey: 'test-key' });

    const response = await provider.generateMusic({
      audioSetting: { format: 'mp3' },
      model: 'music-2.6',
      outputFormat: 'hex',
      prompt: 'ambient piano',
      providerId: 'minimax'
    });

    expect(response.artifacts[0].audioBase64).toBe(Buffer.from('ff0001', 'hex').toString('base64'));
    expect(response.artifacts[0].audioHex).toBe('ff0001');
    expect(response.artifacts[0].audioUrl).toBeUndefined();
  });

  it('enables MiniMax lyrics optimization for prompt-only vocal music', async () => {
    const fetchMock = mockFetchJson({
      base_resp: { status_code: 0, status_msg: '' },
      data: { audio: 'https://example.com/generated-song.mp3', status: 2 },
      trace_id: 'trace-prompt-only'
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new MiniMaxProvider();
    provider.setSecrets({ apiKey: 'test-key' });

    await provider.generateMusic({
      audioSetting: { format: 'mp3' },
      mode: 'text-to-music',
      model: 'music-2.6',
      outputFormat: 'url',
      prompt: 'upbeat city pop with a bright chorus',
      providerId: 'minimax'
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.lyrics).toBeUndefined();
    expect(body.is_instrumental).toBeUndefined();
    expect(body.lyrics_optimizer).toBe(true);
  });

  it('maps MiniMax HTTP speech synthesis requests and hex responses', async () => {
    const fetchMock = mockFetchJson({
      base_resp: { status_code: 0, status_msg: '' },
      data: { audio: 'ff0001', status: 2, subtitle_file: 'https://example.com/subtitles.json' },
      extra_info: {
        audio_duration: 1234,
        audio_sample_rate: 32000,
        audio_size: 3
      },
      trace_id: 'trace-speech'
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new MiniMaxProvider();
    provider.setSecrets({ apiKey: 'test-key', baseUrl: 'https://api.minimaxi.com/v1' });

    const response = await provider.synthesizeSpeech({
      audioSetting: {
        bitrate: 128000,
        channels: 1,
        format: 'mp3',
        sampleRate: 32000
      },
      emotion: 'happy',
      language: 'Chinese',
      model: 'speech-2.8-turbo',
      outputFormat: 'hex',
      pitch: 0,
      providerId: 'minimax',
      speed: 1.1,
      subtitle: { enabled: true, type: 'sentence' },
      text: '你好，世界',
      voiceId: 'female-shaonv',
      volume: 1.2
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.minimaxi.com/v1/t2a_v2');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer test-key' });

    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      language_boost: 'Chinese',
      model: 'speech-2.8-turbo',
      output_format: 'hex',
      stream: false,
      subtitle_enable: true,
      subtitle_type: 'sentence',
      text: '你好，世界'
    });
    expect(body.voice_setting).toMatchObject({
      emotion: 'happy',
      pitch: 0,
      speed: 1.1,
      voice_id: 'female-shaonv',
      vol: 1.2
    });
    expect(body.audio_setting).toMatchObject({
      bitrate: 128000,
      channel: 1,
      format: 'mp3',
      sample_rate: 32000
    });

    expect(response).toMatchObject({
      audioBase64: Buffer.from('ff0001', 'hex').toString('base64'),
      model: 'speech-2.8-turbo',
      providerId: 'minimax',
      voice: 'female-shaonv',
      voiceId: 'female-shaonv'
    });
    expect(response.artifacts[0]).toMatchObject({
      audioBase64: Buffer.from('ff0001', 'hex').toString('base64'),
      audioHex: 'ff0001',
      durationMs: 1234,
      format: 'mp3',
      mimeType: 'audio/mpeg',
      sampleRate: 32000,
      sizeBytes: 3
    });
    expect(response.artifacts[0].metadata).toMatchObject({
      outputFormat: 'hex',
      subtitleFile: 'https://example.com/subtitles.json',
      traceId: 'trace-speech',
      transport: 'http',
      voiceId: 'female-shaonv'
    });
  });

  it('maps MiniMax HTTP speech synthesis URL responses', async () => {
    const fetchMock = mockFetchJson({
      base_resp: { status_code: 0, status_msg: '' },
      data: { audio: 'https://example.com/generated-voice.mp3', status: 2 },
      trace_id: 'trace-speech-url'
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new MiniMaxProvider();
    provider.setSecrets({ apiKey: 'test-key' });

    const response = await provider.synthesizeSpeech({
      model: 'speech-2.8-turbo',
      outputFormat: 'url',
      providerId: 'minimax',
      text: 'hello',
      voice: 'male-qn-qingse'
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.output_format).toBe('url');
    expect(body.voice_setting.voice_id).toBe('male-qn-qingse');
    expect(response.audioUrl).toBe('https://example.com/generated-voice.mp3');
    expect(response.artifacts[0].audioUrl).toBe('https://example.com/generated-voice.mp3');
    expect(response.artifacts[0].audioBase64).toBeUndefined();
  });

  it('streams MiniMax HTTP speech synthesis hex chunks and aggregates the final artifact', async () => {
    const fetchMock = mockFetchStream([
      'data: {"data":{"audio":"ff00"}}\n\n',
      'data: {"data":{"audio":"01","status":2},"extra_info":{"audio_duration":50},"trace_id":"trace-stream"}\n\n'
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const provider = new MiniMaxProvider();
    provider.setSecrets({ apiKey: 'test-key', baseUrl: 'https://api.minimaxi.com/v1' });
    const events: any[] = [];

    const response = await provider.streamSpeechSynthesis(
      {
        audioSetting: { format: 'mp3', sampleRate: 32000 },
        model: 'speech-2.8-turbo',
        mode: 'output-stream',
        providerId: 'minimax',
        text: 'stream hello',
        transportPreference: 'http-stream',
        voiceId: 'female-shaonv'
      },
      (event) => events.push(event)
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.minimaxi.com/v1/t2a_v2');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      model: 'speech-2.8-turbo',
      stream: true,
      text: 'stream hello'
    });
    expect(body.output_format).toBeUndefined();
    expect(body.stream_options.exclude_aggregated_audio).toBe(true);

    const audioEvents = events.filter((event) => event.type === 'audio_delta');
    expect(audioEvents).toHaveLength(2);
    expect(audioEvents[0].data.chunk).toEqual(Buffer.from('ff00', 'hex'));
    expect(audioEvents[1].data.chunk).toEqual(Buffer.from('01', 'hex'));
    expect(events.map((event) => event.type)).toContain('completed');
    expect(events.at(-1)?.type).toBe('done');
    expect(response.artifacts[0]).toMatchObject({
      audioBase64: Buffer.from('ff0001', 'hex').toString('base64'),
      audioHex: 'ff0001',
      durationMs: 50,
      mimeType: 'audio/mpeg'
    });
  });

  it('streams MiniMax WebSocket duplex speech synthesis with input chunks', async () => {
    let fakeSocket: FakeMiniMaxWebSocket | undefined;
    const provider = new MiniMaxProvider();
    provider.setSecrets({ apiKey: 'test-key', baseUrl: 'https://api.minimaxi.com/v1' });
    const events: any[] = [];

    const response = await provider.streamSpeechSynthesis(
      {
        audioSetting: { format: 'mp3', sampleRate: 32000 },
        extras: {
          minimax: {
            webSocketFactory: (url: string, options: { headers: Record<string, string> }) => {
              expect(url).toBe('wss://api.minimaxi.com/ws/v1/t2a_v2');
              expect(options.headers.Authorization).toBe('Bearer test-key');
              fakeSocket = new FakeMiniMaxWebSocket();
              return fakeSocket as any;
            }
          }
        },
        model: 'speech-2.8-turbo',
        mode: 'duplex-stream',
        providerId: 'minimax',
        transportPreference: 'websocket',
        voiceId: 'female-shaonv'
      },
      (event) => events.push(event),
      undefined,
      speechInputChunks()
    );

    expect(fakeSocket?.closed).toBe(true);
    expect(fakeSocket?.sent.map((payload) => payload.event)).toEqual(['task_start', 'task_continue', 'task_continue', 'task_finish']);
    expect(fakeSocket?.sent[0]).toMatchObject({
      audio_setting: { format: 'mp3', sample_rate: 32000 },
      continuous_sound: true,
      event: 'task_start',
      model: 'speech-2.8-turbo',
      voice_setting: { voice_id: 'female-shaonv' }
    });
    expect(fakeSocket?.sent[1].text).toBe('第一段');
    expect(fakeSocket?.sent[2].text).toBe('第二段');

    const audioEvents = events.filter((event) => event.type === 'audio_delta');
    expect(audioEvents).toHaveLength(2);
    expect(audioEvents[0].data.chunk).toEqual(Buffer.from('ff00', 'hex'));
    expect(audioEvents[1].data.chunk).toEqual(Buffer.from('01', 'hex'));
    expect(events.map((event) => event.type)).toContain('completed');
    expect(events.at(-1)?.type).toBe('done');
    expect(response.artifacts[0]).toMatchObject({
      audioBase64: Buffer.from('ff0001', 'hex').toString('base64'),
      audioHex: 'ff0001',
      durationMs: 88,
      mimeType: 'audio/mpeg'
    });
    expect(response.artifacts[0].metadata).toMatchObject({
      traceId: 'trace-ws-finished',
      transport: 'websocket',
      voiceId: 'female-shaonv'
    });
  });

  it('generates lyrics through the MiniMax lyrics endpoint', async () => {
    const fetchMock = mockFetchJson({
      base_resp: { status_code: 0, status_msg: '' },
      lyrics: '[Verse]\nNeon rain\n[Chorus]\nWe keep dancing',
      song_title: 'Neon Rain',
      style_tags: 'city pop, upbeat',
      trace_id: 'trace-lyrics'
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new MiniMaxProvider();
    provider.setSecrets({ apiKey: 'test-key', baseUrl: 'https://api.minimaxi.com/v1' });

    const response = await provider.generateLyrics({
      mode: 'write_full_song',
      prompt: 'Write a city pop song about late-night rain',
      providerId: 'minimax'
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.minimaxi.com/v1/lyrics_generation');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer test-key' });

    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      mode: 'write_full_song',
      prompt: 'Write a city pop song about late-night rain'
    });
    expect(body.model).toBeUndefined();

    expect(response).toMatchObject({
      lyrics: '[Verse]\nNeon rain\n[Chorus]\nWe keep dancing',
      providerId: 'minimax',
      songTitle: 'Neon Rain',
      styleTags: 'city pop, upbeat'
    });
  });
});

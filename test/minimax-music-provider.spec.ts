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

describe('MiniMax music generation provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('declares MiniMax music generation capability and models', async () => {
    registerBuiltinProviderDefinitions();

    expect(getProviderCapabilities('minimax').musicGeneration).toBe(true);
    expect(getProviderDefaultModels('minimax').musicGeneration).toBe('music-2.6');

    const models = await listProviderRuntimeModels('minimax');
    const musicModel = models.find((model) => model.id === 'music-2.6');

    expect(musicModel?.type).toBe('text2music');
    expect(musicModel?.capabilities?.music_generation).toBe(true);
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
    expect(response.artifacts[0].audioUrl).toBeUndefined();
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

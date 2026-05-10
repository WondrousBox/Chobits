import { OpenAICompatibleProvider } from './openai-compatible';
import type {
  GeneratedAudioArtifact,
  LyricsGenerationRequest,
  LyricsGenerationResponse,
  MusicGenerationAudioSetting,
  MusicGenerationRequest,
  MusicGenerationResponse,
  ProviderSecrets
} from '../types';

type MiniMaxMusicResponse = {
  base_resp?: {
    status_code?: number;
    status_msg?: string;
  };
  data?: {
    audio?: string;
    status?: number;
    [key: string]: any;
  };
  extra_info?: Record<string, any>;
  trace_id?: string;
  [key: string]: any;
};

type MiniMaxLyricsResponse = {
  base_resp?: {
    status_code?: number;
    status_msg?: string;
  };
  lyrics?: string;
  song_title?: string;
  style_tags?: string;
  title?: string;
  data?: {
    lyrics?: string;
    song_title?: string;
    style_tags?: string;
    title?: string;
    [key: string]: any;
  };
  extra_info?: Record<string, any>;
  trace_id?: string;
  [key: string]: any;
};

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | undefined {
  const numberValue = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function normalizeBaseUrl(baseUrl?: string): string {
  const normalized = String(baseUrl || 'https://api.minimaxi.com/v1').trim() || 'https://api.minimaxi.com/v1';
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function toEndpointUrl(baseUrl: string | undefined, endpoint: string): string {
  return new URL(endpoint.replace(/^\//, ''), normalizeBaseUrl(baseUrl)).toString();
}

function stripUndefined<T extends Record<string, any>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== '')) as T;
}

function trimString(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
}

function normalizeFormat(format?: string): string {
  return String(format || 'mp3')
    .trim()
    .toLowerCase();
}

function formatToMimeType(format?: string): string | undefined {
  switch (normalizeFormat(format)) {
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'flac':
      return 'audio/flac';
    case 'aac':
      return 'audio/aac';
    case 'm4a':
      return 'audio/mp4';
    case 'ogg':
    case 'opus':
      return 'audio/ogg';
    default:
      return undefined;
  }
}

function hexToBase64(hex: string): string | undefined {
  const normalized = hex.replace(/\s+/g, '');
  if (!normalized || normalized.length % 2 !== 0 || !/^[a-fA-F0-9]+$/.test(normalized)) {
    return undefined;
  }
  return Buffer.from(normalized, 'hex').toString('base64');
}

async function readJsonResponse<T extends Record<string, any>>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: text } as unknown as T;
  }
}

export class MiniMaxProvider extends OpenAICompatibleProvider {
  constructor() {
    super('minimax');
  }

  async generateLyrics(req: LyricsGenerationRequest, signal?: AbortSignal): Promise<LyricsGenerationResponse> {
    const overrideSecrets = (req.extras as any)?.secrets as Partial<ProviderSecrets> | undefined;
    const secrets = this.resolveSecrets(overrideSecrets as any);
    const apiKey = String(secrets.apiKey || '').trim();

    if (!apiKey) {
      throw new Error('MiniMax lyrics generation requires an API key');
    }

    const minimaxExtras = isRecord(req.extras?.minimax) ? req.extras.minimax : {};
    const body = this.buildLyricsRequestBody(req, minimaxExtras);
    const response = await fetch(toEndpointUrl(secrets.baseUrl, '/lyrics_generation'), {
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      method: 'POST',
      signal
    });
    const payload = await readJsonResponse<MiniMaxLyricsResponse>(response);

    if (!response.ok) {
      const message = payload.base_resp?.status_msg || payload.error || response.statusText || 'MiniMax lyrics generation failed';
      throw new Error(`MiniMax lyrics generation failed (${response.status}): ${message}`);
    }

    const statusCode = toFiniteNumber(payload.base_resp?.status_code);
    if (statusCode !== undefined && statusCode !== 0) {
      throw new Error(`MiniMax lyrics generation failed (${statusCode}): ${payload.base_resp?.status_msg || 'unknown error'}`);
    }

    const lyrics = this.extractLyrics(payload);
    if (!lyrics) {
      throw new Error('MiniMax lyrics generation failed: response did not include lyrics');
    }

    const songTitle = trimString(payload.song_title || payload.title || payload.data?.song_title || payload.data?.title);
    const styleTags = trimString(payload.style_tags || payload.data?.style_tags);

    return stripUndefined({
      lyrics,
      model: req.model,
      providerId: this.id,
      rawResponse: payload,
      ...(payload.extra_info ? { rawUsage: payload.extra_info } : {}),
      songTitle,
      styleTags
    });
  }

  async generateMusic(req: MusicGenerationRequest, signal?: AbortSignal): Promise<MusicGenerationResponse> {
    const overrideSecrets = (req.extras as any)?.secrets as Partial<ProviderSecrets> | undefined;
    const secrets = this.resolveSecrets(overrideSecrets as any);
    const apiKey = String(secrets.apiKey || '').trim();

    if (!apiKey) {
      throw new Error('MiniMax music generation requires an API key');
    }

    const prompt = String(req.prompt || '').trim();
    if (!prompt) {
      throw new Error('MiniMax music generation requires a prompt');
    }

    const minimaxExtras = isRecord(req.extras?.minimax) ? req.extras.minimax : {};
    const requestedStream = Boolean(req.stream ?? minimaxExtras.stream ?? false);
    if (requestedStream) {
      throw new Error('MiniMax music streaming is not supported by this provider adapter yet');
    }

    const outputFormat = String(req.outputFormat || minimaxExtras.output_format || minimaxExtras.outputFormat || 'url').trim() || 'url';
    const audioSetting = this.resolveAudioSetting(req.audioSetting, minimaxExtras.audio_setting || minimaxExtras.audioSetting);
    const body = this.buildMusicRequestBody(req, minimaxExtras, outputFormat, audioSetting);
    const response = await fetch(toEndpointUrl(secrets.baseUrl, '/music_generation'), {
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      method: 'POST',
      signal
    });
    const payload = await readJsonResponse<MiniMaxMusicResponse>(response);

    if (!response.ok) {
      const message = payload.base_resp?.status_msg || payload.error || response.statusText || 'MiniMax music generation failed';
      throw new Error(`MiniMax music generation failed (${response.status}): ${message}`);
    }

    const statusCode = toFiniteNumber(payload.base_resp?.status_code);
    if (statusCode !== undefined && statusCode !== 0) {
      throw new Error(`MiniMax music generation failed (${statusCode}): ${payload.base_resp?.status_msg || 'unknown error'}`);
    }

    const audio = typeof payload.data?.audio === 'string' ? payload.data.audio.trim() : '';
    if (!audio) {
      throw new Error('MiniMax music generation failed: response did not include audio data');
    }

    const artifact = this.toAudioArtifact(audio, payload, outputFormat, audioSetting, req);

    return {
      artifacts: [artifact],
      ...(artifact.audioUrl ? { audioUrl: artifact.audioUrl } : {}),
      ...(artifact.audioBase64 ? { audioBase64: artifact.audioBase64 } : {}),
      model: req.model,
      providerId: this.id,
      rawResponse: payload,
      ...(payload.extra_info ? { rawUsage: payload.extra_info } : {})
    };
  }

  private resolveAudioSetting(requestSetting?: MusicGenerationAudioSetting, rawSetting?: Record<string, any>): Record<string, any> {
    const format = normalizeFormat(requestSetting?.format || rawSetting?.format);
    return stripUndefined({
      ...(rawSetting || {}),
      bitrate: requestSetting?.bitrate ?? rawSetting?.bitrate ?? 256000,
      format,
      sample_rate: requestSetting?.sampleRate ?? rawSetting?.sample_rate ?? rawSetting?.sampleRate ?? 44100
    });
  }

  private buildMusicRequestBody(req: MusicGenerationRequest, minimaxExtras: Record<string, any>, outputFormat: string, audioSetting: Record<string, any>): Record<string, any> {
    const isInstrumental = req.isInstrumental ?? minimaxExtras.is_instrumental ?? minimaxExtras.isInstrumental ?? (req.mode === 'instrumental' ? true : undefined);
    const lyricsOptimizer = req.lyricsOptimizer ?? minimaxExtras.lyrics_optimizer ?? minimaxExtras.lyricsOptimizer;
    const referenceAudioUrl = req.referenceAudioUrl || minimaxExtras.audio_url || minimaxExtras.referenceAudioUrl;
    const referenceAudioBase64 = req.referenceAudioBase64 || minimaxExtras.audio_base64 || minimaxExtras.referenceAudioBase64;
    const coverFeatureId = req.coverFeatureId || minimaxExtras.cover_feature_id || minimaxExtras.coverFeatureId;

    return stripUndefined({
      ...minimaxExtras,
      audio_base64: referenceAudioBase64,
      audio_setting: audioSetting,
      audio_url: referenceAudioUrl,
      cover_feature_id: coverFeatureId,
      is_instrumental: isInstrumental,
      lyrics: req.lyrics,
      lyrics_optimizer: lyricsOptimizer,
      model: req.model,
      output_format: outputFormat,
      prompt: req.prompt,
      stream: false
    });
  }

  private buildLyricsRequestBody(req: LyricsGenerationRequest, minimaxExtras: Record<string, any>): Record<string, any> {
    const mode = req.mode || minimaxExtras.mode || (trimString(req.lyrics) ? 'edit' : 'write_full_song');
    const prompt = trimString(req.prompt) || trimString(minimaxExtras.prompt);
    const lyrics = trimString(req.lyrics) || trimString(minimaxExtras.lyrics);

    if (!prompt && !lyrics) {
      throw new Error('MiniMax lyrics generation requires prompt or lyrics');
    }

    return stripUndefined({
      ...minimaxExtras,
      lyrics,
      mode,
      prompt
    });
  }

  private extractLyrics(payload: MiniMaxLyricsResponse): string | undefined {
    const direct = trimString(payload.lyrics);
    if (direct) return direct;

    const dataLyrics = trimString(payload.data?.lyrics);
    if (dataLyrics) return dataLyrics;

    const candidates = [payload.data?.result, payload.data?.text, payload.result, payload.text];
    for (const candidate of candidates) {
      const text = trimString(candidate);
      if (text) return text;
    }

    return undefined;
  }

  private toAudioArtifact(
    audio: string,
    payload: MiniMaxMusicResponse,
    outputFormat: string,
    audioSetting: Record<string, any>,
    req: MusicGenerationRequest
  ): GeneratedAudioArtifact {
    const extraInfo = isRecord(payload.extra_info) ? payload.extra_info : {};
    const format = normalizeFormat(audioSetting.format || extraInfo.audio_format || extraInfo.format);
    const audioUrl = /^https?:\/\//i.test(audio) ? audio : undefined;
    const audioBase64 = audioUrl ? undefined : hexToBase64(audio);
    const durationMs = toFiniteNumber(extraInfo.music_duration ?? extraInfo.duration_ms ?? extraInfo.duration);
    const sampleRate = toFiniteNumber(extraInfo.music_sample_rate ?? extraInfo.sample_rate ?? audioSetting.sample_rate);
    const bitrate = toFiniteNumber(extraInfo.music_bitrate ?? extraInfo.bitrate ?? audioSetting.bitrate);
    const channels = toFiniteNumber(extraInfo.music_channel ?? extraInfo.channels);

    if (!audioUrl && !audioBase64) {
      throw new Error('MiniMax music generation failed: unsupported audio payload format');
    }

    return stripUndefined({
      audioBase64,
      audioUrl,
      bitrate,
      channels,
      durationMs,
      format,
      metadata: stripUndefined({
        extraInfo,
        mode: req.mode,
        outputFormat,
        status: payload.data?.status,
        traceId: payload.trace_id
      }),
      mimeType: formatToMimeType(format),
      sampleRate
    });
  }
}

import WebSocket from 'ws';

import { OpenAICompatibleProvider } from './openai-compatible';
import type {
  GeneratedAudioArtifact,
  LyricsGenerationRequest,
  LyricsGenerationResponse,
  MusicGenerationAudioSetting,
  MusicGenerationRequest,
  MusicGenerationResponse,
  ProviderSecrets,
  SpeechSynthesisStreamEvent,
  SpeechSynthesisRequest,
  SpeechSynthesisResponse,
  SpeechTextInputChunk
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

type MiniMaxSpeechResponse = {
  base_resp?: {
    status_code?: number;
    status_msg?: string;
  };
  data?: {
    audio?: string;
    status?: number;
    subtitle_file?: string;
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

type WebSocketLike = {
  readyState?: number;
  send(data: string, cb?: (error?: Error) => void): void;
  close(code?: number, reason?: string): void;
  on(event: string, listener: (...args: any[]) => void): any;
  once?(event: string, listener: (...args: any[]) => void): any;
  off?(event: string, listener: (...args: any[]) => void): any;
  removeListener?(event: string, listener: (...args: any[]) => void): any;
};

type MiniMaxWebSocketFactory = (url: string, options: { headers: Record<string, string> }) => WebSocketLike;

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

function toWebSocketEndpointUrl(baseUrl: string | undefined, endpoint = '/ws/v1/t2a_v2'): string {
  const normalized = String(baseUrl || 'https://api.minimaxi.com/v1').trim() || 'https://api.minimaxi.com/v1';
  const url = new URL(normalized.endsWith('/') ? normalized : `${normalized}/`);
  url.protocol = url.protocol === 'http:' || url.protocol === 'ws:' ? 'wss:' : 'wss:';
  const basePath = url.pathname.replace(/\/+$/, '').replace(/\/v1$/i, '');
  url.pathname = `${basePath}${endpoint}`.replace(/\/{2,}/g, '/');
  url.search = '';
  url.hash = '';
  return url.toString();
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
    case 'pcm':
      return 'audio/pcm';
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

function parseJsonRecord(text: string): Record<string, any> | undefined {
  if (!text.trim()) {
    return undefined;
  }

  try {
    const value = JSON.parse(text);
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

async function* readTextStream(response: Response): AsyncIterable<string> {
  if (!response.body) {
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        yield decoder.decode(value, { stream: true });
      }
    }

    const trailing = decoder.decode();
    if (trailing) {
      yield trailing;
    }
  } finally {
    reader.releaseLock();
  }
}

async function* readJsonStream(response: Response): AsyncIterable<Record<string, any>> {
  let buffer = '';

  for await (const chunk of readTextStream(response)) {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;
      const data = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
      if (!data || data === '[DONE]') continue;
      const parsed = parseJsonRecord(data);
      if (parsed) {
        yield parsed;
      }
    }
  }

  const trailing = buffer.trim();
  if (trailing && trailing !== '[DONE]') {
    const data = trailing.startsWith('data:') ? trailing.slice(5).trim() : trailing;
    const parsed = parseJsonRecord(data);
    if (parsed) {
      yield parsed;
    }
  }
}

function hexToBuffer(hex: string): Buffer | undefined {
  const normalized = hex.replace(/\s+/g, '');
  if (!normalized || normalized.length % 2 !== 0 || !/^[a-fA-F0-9]+$/.test(normalized)) {
    return undefined;
  }
  return Buffer.from(normalized, 'hex');
}

function sanitizeMiniMaxExtras(extras: Record<string, any>): Record<string, any> {
  const {
    webSocketFactory: _webSocketFactory,
    websocketFactory: _websocketFactory,
    wsFactory: _wsFactory,
    websocket_url: _websocketUrlSnake,
    websocketUrl: _websocketUrl,
    webSocketUrl: _webSocketUrl,
    ...rest
  } = extras;
  return rest;
}

function rawWebSocketDataToString(data: unknown): string {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (Array.isArray(data) && data.every((item) => Buffer.isBuffer(item))) {
    return Buffer.concat(data).toString('utf8');
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
  }
  return String(data || '');
}

function addWebSocketListener(socket: WebSocketLike, event: string, listener: (...args: any[]) => void): void {
  socket.on(event, listener);
}

function removeWebSocketListener(socket: WebSocketLike, event: string, listener: (...args: any[]) => void): void {
  if (socket.off) {
    socket.off(event, listener);
    return;
  }
  socket.removeListener?.(event, listener);
}

function waitForWebSocketOpen(socket: WebSocketLike, signal?: AbortSignal): Promise<void> {
  if (socket.readyState === WebSocket.OPEN || socket.readyState === 1) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      removeWebSocketListener(socket, 'open', onOpen);
      removeWebSocketListener(socket, 'error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const onOpen = (): void => {
      cleanup();
      resolve();
    };
    const onError = (error: unknown): void => {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error || 'WebSocket connection failed')));
    };
    const onAbort = (): void => {
      cleanup();
      try {
        socket.close();
      } catch {
        //
      }
      reject(new DOMException('MiniMax WebSocket speech synthesis aborted', 'AbortError'));
    };

    addWebSocketListener(socket, 'open', onOpen);
    addWebSocketListener(socket, 'error', onError);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function createWebSocketMessageQueue(socket: WebSocketLike, signal?: AbortSignal): {
  close: () => void;
  next: () => Promise<Record<string, any> | undefined>;
} {
  const messages: Record<string, any>[] = [];
  let closed = false;
  let failure: Error | undefined;
  let waiter: (() => void) | undefined;

  const wake = (): void => {
    const resolve = waiter;
    waiter = undefined;
    resolve?.();
  };
  const onMessage = (data: unknown): void => {
    const payload = parseJsonRecord(rawWebSocketDataToString(data));
    if (payload) {
      messages.push(payload);
      wake();
    }
  };
  const onError = (error: unknown): void => {
    failure = error instanceof Error ? error : new Error(String(error || 'MiniMax WebSocket error'));
    wake();
  };
  const onClose = (): void => {
    closed = true;
    wake();
  };
  const onAbort = (): void => {
    failure = new DOMException('MiniMax WebSocket speech synthesis aborted', 'AbortError') as Error;
    try {
      socket.close();
    } catch {
      //
    }
    wake();
  };
  const cleanup = (): void => {
    removeWebSocketListener(socket, 'message', onMessage);
    removeWebSocketListener(socket, 'error', onError);
    removeWebSocketListener(socket, 'close', onClose);
    signal?.removeEventListener('abort', onAbort);
  };

  addWebSocketListener(socket, 'message', onMessage);
  addWebSocketListener(socket, 'error', onError);
  addWebSocketListener(socket, 'close', onClose);
  signal?.addEventListener('abort', onAbort, { once: true });

  return {
    close: cleanup,
    async next() {
      while (!messages.length && !closed && !failure) {
        await new Promise<void>((resolve) => {
          waiter = resolve;
        });
      }

      if (failure) {
        throw failure;
      }

      return messages.shift();
    }
  };
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

  async synthesizeSpeech(req: SpeechSynthesisRequest, signal?: AbortSignal): Promise<SpeechSynthesisResponse> {
    const overrideSecrets = (req.extras as any)?.secrets as Partial<ProviderSecrets> | undefined;
    const secrets = this.resolveSecrets(overrideSecrets as any);
    const apiKey = String(secrets.apiKey || '').trim();

    if (!apiKey) {
      throw new Error('MiniMax speech synthesis requires an API key');
    }

    const text = String(req.text || '').trim();
    if (!text) {
      throw new Error('MiniMax speech synthesis requires text');
    }

    const mode = req.mode || 'complete';
    if (mode !== 'complete') {
      throw new Error(`MiniMax speech synthesis mode "${mode}" requires streamSpeechSynthesis, which is not implemented yet`);
    }

    const transportPreference = req.transportPreference || 'auto';
    if (transportPreference !== 'auto' && transportPreference !== 'http') {
      throw new Error(`MiniMax speech synthesis transport "${transportPreference}" is not supported by synthesizeSpeech`);
    }

    const minimaxExtras = isRecord(req.extras?.minimax) ? req.extras.minimax : {};
    const outputFormat = this.resolveSpeechOutputFormat(req, minimaxExtras);
    const audioSetting = this.resolveSpeechAudioSetting(req, minimaxExtras.audio_setting || minimaxExtras.audioSetting);
    const { body, voiceId } = this.buildSpeechRequestBody(req, minimaxExtras, text, outputFormat, audioSetting);
    const response = await fetch(toEndpointUrl(secrets.baseUrl, '/t2a_v2'), {
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      method: 'POST',
      signal
    });
    const payload = await readJsonResponse<MiniMaxSpeechResponse>(response);

    if (!response.ok) {
      const message = payload.base_resp?.status_msg || payload.error || response.statusText || 'MiniMax speech synthesis failed';
      throw new Error(`MiniMax speech synthesis failed (${response.status}): ${message}`);
    }

    const statusCode = toFiniteNumber(payload.base_resp?.status_code);
    if (statusCode !== undefined && statusCode !== 0) {
      throw new Error(`MiniMax speech synthesis failed (${statusCode}): ${payload.base_resp?.status_msg || 'unknown error'}`);
    }

    const audio = typeof payload.data?.audio === 'string' ? payload.data.audio.trim() : '';
    if (!audio) {
      throw new Error('MiniMax speech synthesis failed: response did not include audio data');
    }

    const artifact = this.toSpeechAudioArtifact(audio, payload, outputFormat, audioSetting, req, voiceId);

    return stripUndefined({
      artifacts: [artifact],
      ...(artifact.audioUrl ? { audioUrl: artifact.audioUrl } : {}),
      ...(artifact.audioBase64 ? { audioBase64: artifact.audioBase64 } : {}),
      model: req.model,
      providerId: this.id,
      rawResponse: payload,
      ...(payload.extra_info ? { rawUsage: payload.extra_info } : {}),
      voice: req.voice || voiceId,
      voiceId
    });
  }

  async streamSpeechSynthesis(
    req: SpeechSynthesisRequest,
    onEvent: (event: SpeechSynthesisStreamEvent) => void,
    signal?: AbortSignal,
    input?: AsyncIterable<SpeechTextInputChunk>
  ): Promise<SpeechSynthesisResponse> {
    const overrideSecrets = (req.extras as any)?.secrets as Partial<ProviderSecrets> | undefined;
    const secrets = this.resolveSecrets(overrideSecrets as any);
    const apiKey = String(secrets.apiKey || '').trim();

    if (!apiKey) {
      throw new Error('MiniMax speech synthesis streaming requires an API key');
    }

    const mode = req.mode || 'output-stream';
    const transportPreference = req.transportPreference || 'auto';
    const minimaxExtras = isRecord(req.extras?.minimax) ? sanitizeMiniMaxExtras(req.extras.minimax) : {};
    const text = String(req.text || '').trim();
    const shouldUseWebSocket = mode === 'duplex-stream' || transportPreference === 'websocket';

    if (!text && !shouldUseWebSocket) {
      throw new Error('MiniMax speech synthesis streaming requires text');
    }

    if (shouldUseWebSocket) {
      if (!text && !input) {
        throw new Error('MiniMax WebSocket speech synthesis requires text or input chunks');
      }
      return this.streamSpeechSynthesisWebSocket(req, minimaxExtras, secrets, apiKey, onEvent, signal, input);
    }

    if (transportPreference !== 'auto' && transportPreference !== 'http-stream') {
      throw new Error(`MiniMax speech synthesis transport "${transportPreference}" is not supported by streamSpeechSynthesis`);
    }

    return this.streamSpeechSynthesisHttp(req, minimaxExtras, secrets, apiKey, onEvent, signal);
  }

  private async streamSpeechSynthesisHttp(
    req: SpeechSynthesisRequest,
    minimaxExtras: Record<string, any>,
    secrets: ProviderSecrets,
    apiKey: string,
    onEvent: (event: SpeechSynthesisStreamEvent) => void,
    signal?: AbortSignal
  ): Promise<SpeechSynthesisResponse> {
    const mode = req.mode || 'output-stream';
    const text = String(req.text || '').trim();
    const audioSetting = this.resolveSpeechAudioSetting(req, minimaxExtras.audio_setting || minimaxExtras.audioSetting);
    const { body, voiceId } = this.buildSpeechRequestBody(req, minimaxExtras, text, 'hex', audioSetting);
    const streamBody = stripUndefined({
      ...body,
      output_format: undefined,
      stream: true,
      stream_options: {
        ...(isRecord(minimaxExtras.stream_options) ? minimaxExtras.stream_options : {}),
        ...(isRecord(minimaxExtras.streamOptions) ? minimaxExtras.streamOptions : {}),
        exclude_aggregated_audio: true
      }
    });

    onEvent({
      type: 'started',
      data: {
        mode,
        transport: 'http-stream'
      }
    });

    const response = await fetch(toEndpointUrl(secrets.baseUrl, '/t2a_v2'), {
      body: JSON.stringify(streamBody),
      headers: {
        Accept: 'text/event-stream, application/x-ndjson, application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      method: 'POST',
      signal
    });

    if (!response.ok) {
      const payload = await readJsonResponse<MiniMaxSpeechResponse>(response);
      const message = payload.base_resp?.status_msg || payload.error || response.statusText || 'MiniMax speech synthesis streaming failed';
      throw new Error(`MiniMax speech synthesis streaming failed (${response.status}): ${message}`);
    }

    const audioChunks: string[] = [];
    let finalPayload: MiniMaxSpeechResponse | undefined;
    let sequence = 0;

    for await (const eventPayload of readJsonStream(response)) {
      const statusCode = toFiniteNumber(eventPayload.base_resp?.status_code);
      if (statusCode !== undefined && statusCode !== 0) {
        throw new Error(`MiniMax speech synthesis streaming failed (${statusCode}): ${eventPayload.base_resp?.status_msg || 'unknown error'}`);
      }

      const audio = typeof eventPayload.data?.audio === 'string' ? eventPayload.data.audio.trim() : '';
      if (audio) {
        const chunkBuffer = hexToBuffer(audio);
        if (chunkBuffer) {
          sequence += 1;
          audioChunks.push(audio.replace(/\s+/g, ''));
          onEvent({
            type: 'audio_delta',
            data: {
              chunk: chunkBuffer,
              encoding: 'hex',
              format: normalizeFormat(audioSetting.format),
              mimeType: formatToMimeType(audioSetting.format),
              sampleRate: toFiniteNumber(audioSetting.sample_rate),
              sequence
            }
          });
        }
      }

      if (eventPayload.extra_info || eventPayload.trace_id || eventPayload.data?.status !== undefined || eventPayload.data?.subtitle_file) {
        finalPayload = eventPayload as MiniMaxSpeechResponse;
        onEvent({
          type: 'metadata',
          data: stripUndefined({
            extraInfo: eventPayload.extra_info,
            status: eventPayload.data?.status,
            subtitleFile: eventPayload.data?.subtitle_file,
            traceId: eventPayload.trace_id
          })
        });
      }
    }

    if (!audioChunks.length) {
      throw new Error('MiniMax speech synthesis streaming failed: response did not include audio data');
    }

    const payload: MiniMaxSpeechResponse = {
      ...(finalPayload || {}),
      data: {
        ...(finalPayload?.data || {}),
        audio: audioChunks.join('')
      }
    };
    const artifact = this.toSpeechAudioArtifact(payload.data!.audio!, payload, 'hex', audioSetting, { ...req, mode }, voiceId, 'http-stream');
    const result = stripUndefined({
      artifacts: [artifact],
      ...(artifact.audioBase64 ? { audioBase64: artifact.audioBase64 } : {}),
      model: req.model,
      providerId: this.id,
      rawResponse: payload,
      ...(payload.extra_info ? { rawUsage: payload.extra_info } : {}),
      voice: req.voice || voiceId,
      voiceId
    });

    onEvent({ type: 'completed', data: result });
    onEvent({ type: 'done' });

    return result;
  }

  private async streamSpeechSynthesisWebSocket(
    req: SpeechSynthesisRequest,
    minimaxExtras: Record<string, any>,
    secrets: ProviderSecrets,
    apiKey: string,
    onEvent: (event: SpeechSynthesisStreamEvent) => void,
    signal?: AbortSignal,
    input?: AsyncIterable<SpeechTextInputChunk>
  ): Promise<SpeechSynthesisResponse> {
    const text = String(req.text || '').trim();
    const audioSetting = this.resolveSpeechAudioSetting(req, minimaxExtras.audio_setting || minimaxExtras.audioSetting);
    const { body, voiceId } = this.buildSpeechRequestBody({ ...req, text: undefined }, minimaxExtras, '', 'hex', audioSetting);
    const taskStartBody = stripUndefined({
      ...body,
      output_format: undefined,
      stream: undefined,
      text: undefined,
      event: 'task_start'
    });
    const wsUrl = String((req.extras?.minimax as any)?.websocketUrl || (req.extras?.minimax as any)?.webSocketUrl || (req.extras?.minimax as any)?.websocket_url || '').trim();
    const factory =
      typeof (req.extras?.minimax as any)?.webSocketFactory === 'function'
        ? ((req.extras?.minimax as any).webSocketFactory as MiniMaxWebSocketFactory)
        : typeof (req.extras?.minimax as any)?.websocketFactory === 'function'
          ? ((req.extras?.minimax as any).websocketFactory as MiniMaxWebSocketFactory)
          : typeof (req.extras?.minimax as any)?.wsFactory === 'function'
            ? ((req.extras?.minimax as any).wsFactory as MiniMaxWebSocketFactory)
            : (url: string, options: { headers: Record<string, string> }) => new WebSocket(url, options);
    const socket = factory(wsUrl || toWebSocketEndpointUrl(secrets.baseUrl), {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    });
    const queue = createWebSocketMessageQueue(socket, signal);
    const audioChunks: string[] = [];
    let sequence = 0;
    let finalPayload: MiniMaxSpeechResponse | undefined;

    const sendJson = async (payload: Record<string, any>): Promise<void> => {
      await new Promise<void>((resolve, reject) => {
        try {
          socket.send(JSON.stringify(payload), (error?: Error) => {
            if (error) reject(error);
            else resolve();
          });
        } catch (error) {
          reject(error);
        }
      });
    };

    const handlePayload = (payload: Record<string, any>): 'continue' | 'started' | 'finished' => {
      const eventName = String(payload.event || payload.type || '').trim();
      const statusCode = toFiniteNumber(payload.base_resp?.status_code);
      if (statusCode !== undefined && statusCode !== 0) {
        throw new Error(`MiniMax WebSocket speech synthesis failed (${statusCode}): ${payload.base_resp?.status_msg || 'unknown error'}`);
      }
      if (eventName === 'task_failed') {
        const message = payload.base_resp?.status_msg || payload.message || payload.error || 'unknown error';
        throw new Error(`MiniMax WebSocket speech synthesis failed: ${message}`);
      }

      const audio = typeof payload.data?.audio === 'string' ? payload.data.audio.trim() : '';
      if (audio) {
        const chunkBuffer = hexToBuffer(audio);
        if (chunkBuffer) {
          sequence += 1;
          audioChunks.push(audio.replace(/\s+/g, ''));
          onEvent({
            type: 'audio_delta',
            data: {
              chunk: chunkBuffer,
              encoding: 'hex',
              format: normalizeFormat(audioSetting.format),
              mimeType: formatToMimeType(audioSetting.format),
              sampleRate: toFiniteNumber(audioSetting.sample_rate),
              sequence
            }
          });
        }
      }

      if (payload.extra_info || payload.trace_id || payload.data?.status !== undefined || payload.data?.subtitle_file || eventName === 'task_finished') {
        finalPayload = payload as MiniMaxSpeechResponse;
        onEvent({
          type: 'metadata',
          data: stripUndefined({
            event: eventName || undefined,
            extraInfo: payload.extra_info,
            status: payload.data?.status,
            subtitleFile: payload.data?.subtitle_file,
            traceId: payload.trace_id
          })
        });
      }

      if (eventName === 'task_started') return 'started';
      if (eventName === 'task_finished') return 'finished';
      return 'continue';
    };

    try {
      await waitForWebSocketOpen(socket, signal);

      onEvent({
        type: 'started',
        data: {
          mode: 'duplex-stream',
          transport: 'websocket'
        }
      });

      let connected = false;
      while (!connected) {
        const payload = await queue.next();
        if (!payload) {
          throw new Error('MiniMax WebSocket closed before connected_success');
        }
        const eventName = String(payload.event || payload.type || '').trim();
        if (eventName === 'connected_success') {
          connected = true;
          onEvent({ type: 'metadata', data: { event: eventName, traceId: payload.trace_id } });
        } else {
          handlePayload(payload);
        }
      }

      await sendJson(taskStartBody);

      let taskStarted = false;
      while (!taskStarted) {
        const payload = await queue.next();
        if (!payload) {
          throw new Error('MiniMax WebSocket closed before task_started');
        }
        taskStarted = handlePayload(payload) === 'started';
      }

      let sentText = false;
      let finished = false;
      const receiveUntilFinished = (async (): Promise<void> => {
        while (!finished) {
          const payload = await queue.next();
          if (!payload) {
            if (!finished) {
              throw new Error('MiniMax WebSocket closed before task_finished');
            }
            return;
          }
          finished = handlePayload(payload) === 'finished';
        }
      })();

      if (text) {
        await sendJson({
          event: 'task_continue',
          text
        });
        sentText = true;
      }

      if (input) {
        const iterator = input[Symbol.asyncIterator]();
        while (!finished) {
          const nextInput = iterator.next();
          const result = await Promise.race([
            nextInput.then((value) => ({ kind: 'input' as const, value })),
            receiveUntilFinished.then(
              () => ({ kind: 'finished' as const }),
              (error) => ({ kind: 'error' as const, error })
            )
          ]);

          if (result.kind === 'error') {
            throw result.error;
          }
          if (result.kind === 'finished') {
            break;
          }
          if (result.value.done) {
            break;
          }

          const chunk = result.value.value;
          if (finished) break;
          if (chunk.type === 'text' && chunk.text.trim()) {
            await sendJson({
              event: 'task_continue',
              text: chunk.text
            });
            sentText = true;
          } else if (chunk.type === 'flush') {
            onEvent({ type: 'metadata', data: { event: 'flush' } });
          } else if (chunk.type === 'close') {
            break;
          }
        }
      }

      if (!sentText) {
        throw new Error('MiniMax WebSocket speech synthesis requires text or input chunks');
      }

      if (!finished) {
        await sendJson({ event: 'task_finish' });
      }
      await receiveUntilFinished;
    } finally {
      queue.close();
      try {
        socket.close();
      } catch {
        //
      }
    }

    if (!audioChunks.length) {
      throw new Error('MiniMax WebSocket speech synthesis failed: response did not include audio data');
    }

    const payload: MiniMaxSpeechResponse = {
      ...(finalPayload || {}),
      data: {
        ...(finalPayload?.data || {}),
        audio: audioChunks.join('')
      }
    };
    const artifact = this.toSpeechAudioArtifact(payload.data!.audio!, payload, 'hex', audioSetting, { ...req, mode: 'duplex-stream' }, voiceId, 'websocket');
    const result = stripUndefined({
      artifacts: [artifact],
      ...(artifact.audioBase64 ? { audioBase64: artifact.audioBase64 } : {}),
      model: req.model,
      providerId: this.id,
      rawResponse: payload,
      ...(payload.extra_info ? { rawUsage: payload.extra_info } : {}),
      voice: req.voice || voiceId,
      voiceId
    });

    onEvent({ type: 'completed', data: result });
    onEvent({ type: 'done' });

    return result;
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

  private resolveSpeechAudioSetting(req: SpeechSynthesisRequest, rawSetting?: Record<string, any>): Record<string, any> {
    const outputFormatAsAudioFormat = this.isSpeechPayloadOutputFormat(req.outputFormat) ? undefined : req.outputFormat;
    const format = normalizeFormat(req.audioSetting?.format || rawSetting?.format || outputFormatAsAudioFormat || 'mp3');

    return stripUndefined({
      ...(rawSetting || {}),
      bitrate: req.audioSetting?.bitrate ?? rawSetting?.bitrate ?? 128000,
      channel: req.audioSetting?.channels ?? rawSetting?.channel ?? rawSetting?.channels ?? 1,
      format,
      sample_rate: req.audioSetting?.sampleRate ?? rawSetting?.sample_rate ?? rawSetting?.sampleRate ?? 32000
    });
  }

  private isSpeechPayloadOutputFormat(format: unknown): boolean {
    const normalized = String(format || '')
      .trim()
      .toLowerCase();
    return normalized === 'hex' || normalized === 'url';
  }

  private resolveSpeechOutputFormat(req: SpeechSynthesisRequest, minimaxExtras: Record<string, any>): 'hex' | 'url' {
    const candidates = [req.outputFormat, minimaxExtras.output_format, minimaxExtras.outputFormat];

    for (const candidate of candidates) {
      const normalized = String(candidate || '')
        .trim()
        .toLowerCase();
      if (normalized === 'hex' || normalized === 'url') {
        return normalized;
      }
    }

    return 'hex';
  }

  private buildMusicRequestBody(req: MusicGenerationRequest, minimaxExtras: Record<string, any>, outputFormat: string, audioSetting: Record<string, any>): Record<string, any> {
    const model = String(req.model || minimaxExtras.model || '').trim();
    const isCoverModel = model === 'music-cover' || model === 'music-cover-free';
    const lyrics = trimString(req.lyrics) || trimString(minimaxExtras.lyrics);
    const isInstrumental = req.isInstrumental ?? minimaxExtras.is_instrumental ?? minimaxExtras.isInstrumental ?? (req.mode === 'instrumental' ? true : undefined);
    let lyricsOptimizer = req.lyricsOptimizer ?? minimaxExtras.lyrics_optimizer ?? minimaxExtras.lyricsOptimizer;
    if (!isCoverModel && !lyrics && isInstrumental !== true && lyricsOptimizer === undefined) {
      lyricsOptimizer = true;
    }

    if (!isCoverModel && !lyrics && isInstrumental !== true && lyricsOptimizer !== true) {
      throw new Error('MiniMax music generation requires lyrics, lyricsOptimizer=true, or isInstrumental=true');
    }

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
      lyrics,
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

  private buildSpeechRequestBody(
    req: SpeechSynthesisRequest,
    minimaxExtras: Record<string, any>,
    text: string,
    outputFormat: 'hex' | 'url',
    audioSetting: Record<string, any>
  ): { body: Record<string, any>; voiceId: string } {
    const rawVoiceSetting = isRecord(minimaxExtras.voice_setting) ? minimaxExtras.voice_setting : isRecord(minimaxExtras.voiceSetting) ? minimaxExtras.voiceSetting : {};
    const voiceId =
      trimString(req.voiceId) ||
      trimString(req.voice) ||
      trimString(rawVoiceSetting.voice_id) ||
      trimString(rawVoiceSetting.voiceId) ||
      trimString(minimaxExtras.voice_id) ||
      trimString(minimaxExtras.voiceId);

    if (!voiceId) {
      throw new Error('MiniMax speech synthesis requires voiceId or voice');
    }

    const voiceSetting = stripUndefined({
      ...rawVoiceSetting,
      emotion: req.emotion ?? rawVoiceSetting.emotion,
      pitch: req.pitch ?? rawVoiceSetting.pitch,
      speed: req.speed ?? req.rate ?? rawVoiceSetting.speed,
      voice_id: voiceId,
      vol: req.volume ?? rawVoiceSetting.vol ?? rawVoiceSetting.volume
    });
    const subtitleEnabled = req.subtitle?.enabled ?? minimaxExtras.subtitle_enable ?? minimaxExtras.subtitleEnable;
    const subtitleType = req.subtitle?.type ?? minimaxExtras.subtitle_type ?? minimaxExtras.subtitleType;
    const pronunciationDict = req.pronunciationDict || minimaxExtras.pronunciation_dict || minimaxExtras.pronunciationDict;
    const languageBoost = req.language || minimaxExtras.language_boost || minimaxExtras.languageBoost;
    const inputFormat = req.inputFormat && req.inputFormat !== 'text' ? req.inputFormat : undefined;

    return {
      body: stripUndefined({
        ...minimaxExtras,
        audio_setting: audioSetting,
        input_format: inputFormat,
        language_boost: languageBoost,
        model: req.model,
        output_format: outputFormat,
        pronunciation_dict: pronunciationDict,
        stream: false,
        subtitle_enable: subtitleEnabled,
        subtitle_type: subtitleType,
        text,
        voice_setting: voiceSetting
      }),
      voiceId
    };
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
    const audioHex = audioUrl || !audioBase64 ? undefined : audio.replace(/\s+/g, '');
    const durationMs = toFiniteNumber(extraInfo.music_duration ?? extraInfo.duration_ms ?? extraInfo.duration);
    const sampleRate = toFiniteNumber(extraInfo.music_sample_rate ?? extraInfo.sample_rate ?? audioSetting.sample_rate);
    const bitrate = toFiniteNumber(extraInfo.music_bitrate ?? extraInfo.bitrate ?? audioSetting.bitrate);
    const channels = toFiniteNumber(extraInfo.music_channel ?? extraInfo.channels);

    if (!audioUrl && !audioBase64) {
      throw new Error('MiniMax music generation failed: unsupported audio payload format');
    }

    return stripUndefined({
      audioBase64,
      audioHex,
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

  private toSpeechAudioArtifact(
    audio: string,
    payload: MiniMaxSpeechResponse,
    outputFormat: 'hex' | 'url',
    audioSetting: Record<string, any>,
    req: SpeechSynthesisRequest,
    voiceId: string,
    transport: 'http' | 'http-stream' | 'websocket' = 'http'
  ): GeneratedAudioArtifact {
    const extraInfo = isRecord(payload.extra_info) ? payload.extra_info : {};
    const format = normalizeFormat(audioSetting.format || extraInfo.audio_format || extraInfo.format);
    const audioUrl = /^(https?:\/\/|data:)/i.test(audio) ? audio : undefined;
    const audioBase64 = audioUrl ? undefined : hexToBase64(audio);
    const audioHex = audioUrl || !audioBase64 ? undefined : audio.replace(/\s+/g, '');
    const durationMs = toFiniteNumber(extraInfo.audio_length ?? extraInfo.audio_duration ?? extraInfo.duration_ms ?? extraInfo.duration);
    const sampleRate = toFiniteNumber(extraInfo.audio_sample_rate ?? extraInfo.sample_rate ?? audioSetting.sample_rate);
    const bitrate = toFiniteNumber(extraInfo.audio_bitrate ?? extraInfo.bitrate ?? audioSetting.bitrate);
    const channels = toFiniteNumber(extraInfo.audio_channel ?? extraInfo.channel ?? extraInfo.channels ?? audioSetting.channel);
    const sizeBytes = toFiniteNumber(extraInfo.audio_size ?? extraInfo.size_bytes ?? extraInfo.size);

    if (!audioUrl && !audioBase64) {
      throw new Error('MiniMax speech synthesis failed: unsupported audio payload format');
    }

    return stripUndefined({
      audioBase64,
      audioHex,
      audioUrl,
      bitrate,
      channels,
      durationMs,
      format,
      metadata: stripUndefined({
        extraInfo,
        mode: req.mode || 'complete',
        outputFormat,
        status: payload.data?.status,
        subtitleFile: payload.data?.subtitle_file,
        traceId: payload.trace_id,
        transport,
        voiceId
      }),
      mimeType: formatToMimeType(format),
      sampleRate,
      sizeBytes
    });
  }
}

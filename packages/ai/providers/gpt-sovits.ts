import type { GeneratedAudioArtifact, ProviderAdapter, ProviderSecrets, SpeechSynthesisRequest, SpeechSynthesisResponse, SpeechSynthesisStreamEvent, SpeechTextInputChunk } from '../types';
import { createOpenAIClient, listOpenAIModels } from './openai-runtime';
import { getBuiltinProviderDefinitionOrThrow } from './service';
import { resolveFetch } from './tls';
import type { BuiltinProviderDefinition } from './types';

// 服务端（chobits-chi-tts）提供 OpenAI 兼容 TTS 接口：POST {baseUrl}/v1/audio/speech，
// 模型固定 chi-tts；声线/参考音频由服务端按 voice 管理，客户端不再传 ref_audio_path 等原生字段
const DEFAULT_VOICE = 'chi';
const DEFAULT_MEDIA_TYPE = 'wav';
// 服务端输出固定为 32kHz 单声道 s16le PCM（wav 格式流式返回时是 WAV 头 + PCM 裸流）
const OUTPUT_SAMPLE_RATE = 32000;
const OUTPUT_CHANNELS = 1;
const OUTPUT_SAMPLE_FORMAT = 's16le';
// WAV 头解析上限：超过这么多字节还没找到 data 块就说明不是预期的 WAV 流
const MAX_WAV_HEADER_BYTES = 4096;

// 历史配置里的 voiceId 别名，映射到服务端音色名
const VOICE_ALIASES: Record<string, string> = {
  chi: 'chi',
  'chi-default': 'chi'
};

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function trimString(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
}

function normalizeBaseUrl(baseUrl: string | undefined, fallback: string): string {
  const normalized = trimString(baseUrl) || fallback;
  return normalized.replace(/\/+$/, '');
}

function toFiniteNumber(value: unknown): number | undefined {
  const numberValue = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function speechTextLogPayload(text: string): { text: string; textLength: number } {
  return {
    text,
    textLength: text.length
  };
}

function logGptSovitsSpeech(message: string, data?: Record<string, any>): void {
  console.log(`[GPT-SoVITS][Speech] ${message} ${data ? JSON.stringify(data || {}) : ''}`);
}

/**
 * 在 RIFF/WAVE 头里定位 'data' 块，返回 PCM 裸数据的起始偏移；
 * 头部还没收全（或不是 WAV）时返回 undefined。
 */
function findWavDataOffset(bytes: Buffer): number | undefined {
  // 'RIFF' + size + 'WAVE' 至少 12 字节
  if (bytes.length < 12) return undefined;
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') return undefined;

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkId = bytes.toString('ascii', offset, offset + 4);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    if (chunkId === 'data') return offset + 8;
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  return undefined;
}

type FetchLike = (url: string, init?: any) => Promise<Response>;

export class GptSovitsProvider implements ProviderAdapter {
  private readonly definition: BuiltinProviderDefinition = getBuiltinProviderDefinitionOrThrow('gpt-sovits');
  readonly id = this.definition.id;
  readonly label = this.definition.display.label;
  private secrets: ProviderSecrets = {};

  isConfigured(): boolean {
    // 本地/自部署服务，无鉴权也可用
    return true;
  }

  setSecrets(secrets: ProviderSecrets): void {
    this.secrets = { ...this.secrets, ...(secrets as any) };
  }

  clearSecrets(): void {
    // resolveSecrets 会重新叠加 defaults.config 的内置默认服务器配置，这里只需丢掉用户配置
    this.secrets = {};
  }

  getSecrets(): ProviderSecrets {
    return this.secrets;
  }

  async listModels(opts?: { secrets?: ProviderSecrets }): Promise<Array<{ id: string }>> {
    const secrets = this.resolveSecrets(opts?.secrets);
    // 服务端提供 OpenAI 兼容的 GET /v1/models；内置清单（chi-tts）存在时优先返回内置清单
    const client = await createOpenAIClient({
      allowInsecureTls: secrets.allowInsecureTls,
      apiKey: trimString(secrets.apiKey),
      baseUrl: `${normalizeBaseUrl(secrets.baseUrl, this.definition.protocol.baseUrl || '')}/v1`
    });
    return listOpenAIModels({
      client,
      providerId: this.id,
      defaultModel: this.definition.defaults.models.speechSynthesis
    });
  }

  private resolveSecrets(override?: Partial<ProviderSecrets>): ProviderSecrets {
    // defaults.config 提供内置默认服务器的 apiKey / baseUrl（设置页表单预填也用这份配置）；
    // allowInsecureTls 不从 config 取，走下面的 https 条件默认，避免 http 本地服务也被切到宽松 TLS
    const { allowInsecureTls: _ignored, ...configDefaults } = (this.definition.defaults.config || {}) as ProviderSecrets;
    const merged: ProviderSecrets = {
      baseUrl: this.definition.protocol.baseUrl,
      ...configDefaults,
      ...this.secrets,
      ...(override || {})
    };
    // 默认服务器是 HTTPS + 自签名证书：baseUrl 为 https 且用户未显式配置时，
    // 默认放宽 TLS 校验；显式设置 'false' 仍可回到严格校验
    if (merged.allowInsecureTls === undefined && String(merged.baseUrl || '').startsWith('https:')) {
      merged.allowInsecureTls = 'true';
    }
    return merged;
  }

  private resolveVoice(req: SpeechSynthesisRequest): string {
    const requested = trimString(req.voice) || trimString(req.voiceId);
    if (!requested) return DEFAULT_VOICE;
    return VOICE_ALIASES[requested] || requested;
  }

  private async buildRequest(req: SpeechSynthesisRequest): Promise<{ apiKey?: string; body: Record<string, unknown>; endpoint: string; fetchImpl: FetchLike; secrets: ProviderSecrets; text: string }> {
    const overrideSecrets = (req.extras as any)?.secrets as Partial<ProviderSecrets> | undefined;
    const secrets = this.resolveSecrets(overrideSecrets);
    const text = String(req.text || '').trim();
    if (!text) {
      throw new Error('GPT-SoVITS speech synthesis requires text');
    }

    const model = trimString(req.model) || this.definition.defaults.models.speechSynthesis || 'chi-tts';
    const speedFactor = toFiniteNumber(req.speed);

    // 自签名 HTTPS 部署时，用户在 provider 配置里开启「TLS 证书校验 → 允许自签名」；
    // 开启后用 npm undici 包自带的 fetch + 配套 Agent 发请求（跨版本 dispatcher 不兼容全局 fetch）
    const fetchImpl: FetchLike = (await resolveFetch(secrets)) ?? fetch;

    return {
      apiKey: trimString(secrets.apiKey),
      body: {
        input: text,
        model,
        response_format: DEFAULT_MEDIA_TYPE,
        voice: this.resolveVoice(req),
        ...(speedFactor !== undefined ? { speed: speedFactor } : {})
      },
      endpoint: `${normalizeBaseUrl(secrets.baseUrl, this.definition.protocol.baseUrl || '')}/v1/audio/speech`,
      fetchImpl,
      secrets,
      text
    };
  }

  private async postSpeech(fetchImpl: FetchLike, endpoint: string, body: Record<string, unknown>, apiKey: string | undefined, signal?: AbortSignal): Promise<Response> {
    return fetchImpl(endpoint, {
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        // 服务端支持 Authorization: Bearer <key> 鉴权；未配置 apiKey 时服务会返回 401
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      method: 'POST',
      signal
    });
  }

  /**
   * 发请求并处理错误；音色不存在（400）时用默认音色重试一次：
   * 历史配置里可能残留其他 provider 的 voiceId
   */
  private async requestSpeech(fetchImpl: FetchLike, endpoint: string, body: Record<string, unknown>, apiKey: string | undefined, signal?: AbortSignal): Promise<Response> {
    let response = await this.postSpeech(fetchImpl, endpoint, body, apiKey, signal);
    if (!response.ok && response.status === 400 && body.voice !== DEFAULT_VOICE) {
      const message = await this.readErrorMessage(response);
      if (/voice/i.test(message)) {
        logGptSovitsSpeech('HTTP voice fallback', { fallbackVoice: DEFAULT_VOICE, message, voice: body.voice });
        response = await this.postSpeech(fetchImpl, endpoint, { ...body, voice: DEFAULT_VOICE }, apiKey, signal);
      } else {
        logGptSovitsSpeech('HTTP failed', { httpStatus: 400, message });
        throw new Error(`GPT-SoVITS speech synthesis failed (400): ${message}`);
      }
    }

    if (!response.ok) {
      const message = await this.readErrorMessage(response);
      logGptSovitsSpeech('HTTP failed', { httpStatus: response.status, message });
      throw new Error(`GPT-SoVITS speech synthesis failed (${response.status}): ${message}`);
    }

    return response;
  }

  private toResult(audioBuffer: Buffer, req: SpeechSynthesisRequest): SpeechSynthesisResponse {
    const artifact = this.toSpeechAudioArtifact(audioBuffer, req);
    return {
      artifacts: [artifact],
      audioBase64: artifact.audioBase64,
      model: req.model,
      providerId: this.id,
      ...(req.voice || req.voiceId ? { voice: req.voice || req.voiceId } : {}),
      ...(req.voiceId ? { voiceId: req.voiceId } : {})
    };
  }

  async synthesizeSpeech(req: SpeechSynthesisRequest, signal?: AbortSignal): Promise<SpeechSynthesisResponse> {
    const mode = req.mode || 'complete';
    if (mode !== 'complete') {
      throw new Error(`GPT-SoVITS speech synthesis mode "${mode}" requires calling streamSpeechSynthesis instead of synthesizeSpeech`);
    }

    const transportPreference = req.transportPreference || 'auto';
    if (transportPreference !== 'auto' && transportPreference !== 'http') {
      throw new Error(`GPT-SoVITS speech synthesis transport "${transportPreference}" is not supported by synthesizeSpeech`);
    }

    const request = await this.buildRequest(req);

    logGptSovitsSpeech('HTTP complete start', {
      endpoint: request.endpoint,
      mode,
      model: request.body.model,
      transport: 'http',
      voice: request.body.voice,
      voiceId: req.voiceId,
      ...speechTextLogPayload(request.text)
    });

    try {
      const response = await this.requestSpeech(request.fetchImpl, request.endpoint, request.body, request.apiKey, signal);

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      if (!audioBuffer.length) {
        throw new Error('GPT-SoVITS speech synthesis failed: response did not include audio data');
      }

      const result = this.toResult(audioBuffer, req);

      logGptSovitsSpeech('HTTP complete done', {
        audioBase64Length: result.audioBase64?.length,
        mimeType: result.artifacts[0]?.mimeType,
        sizeBytes: result.artifacts[0]?.sizeBytes,
        transport: 'http'
      });

      return result;
    } catch (error) {
      this.logFetchFailure(error, 'http');
      throw error;
    }
  }

  async streamSpeechSynthesis(
    req: SpeechSynthesisRequest,
    onEvent: (event: SpeechSynthesisStreamEvent) => void,
    signal?: AbortSignal,
    input?: AsyncIterable<SpeechTextInputChunk>
  ): Promise<SpeechSynthesisResponse> {
    const mode = req.mode || 'output-stream';
    // 服务端只支持「一次性给文本、流式出音频」，不支持边输入文本边合成
    if (mode !== 'output-stream') {
      throw new Error(`GPT-SoVITS speech synthesis mode "${mode}" is not supported by streamSpeechSynthesis`);
    }

    const transportPreference = req.transportPreference || 'auto';
    if (transportPreference !== 'auto' && transportPreference !== 'http-stream') {
      throw new Error(`GPT-SoVITS speech synthesis transport "${transportPreference}" is not supported by streamSpeechSynthesis`);
    }

    const request = await this.buildRequest(req);

    logGptSovitsSpeech('HTTP stream start', {
      endpoint: request.endpoint,
      hasInput: Boolean(input),
      mode,
      model: request.body.model,
      transport: 'http-stream',
      voice: request.body.voice,
      voiceId: req.voiceId,
      ...speechTextLogPayload(request.text)
    });

    try {
      const response = await this.requestSpeech(request.fetchImpl, request.endpoint, request.body, request.apiKey, signal);

      const reader = (response.body as any)?.getReader?.();
      if (!reader) {
        throw new Error('GPT-SoVITS speech synthesis streaming failed: response did not include a readable stream');
      }

      onEvent({
        type: 'started',
        data: {
          channels: OUTPUT_CHANNELS,
          format: 'pcm',
          mode,
          sampleFormat: OUTPUT_SAMPLE_FORMAT,
          sampleRate: OUTPUT_SAMPLE_RATE,
          transport: 'http-stream'
        }
      });

      // 流式 wav 是「WAV 头 + PCM 裸流」：先缓存到能定位 data 块，
      // 之后把 PCM 边收边发（实时播放管线只接受 PCM），完整字节另存用于最终 artifact
      const fullBuffers: Buffer[] = [];
      let headerPending = Buffer.alloc(0);
      let headerParsed = false;
      let sampleAlignmentByte: Buffer | undefined;
      let sequence = 0;

      const emitPcm = (pcm: Buffer): void => {
        if (!pcm.length) return;
        sequence += 1;
        onEvent({
          type: 'audio_delta',
          data: {
            channels: OUTPUT_CHANNELS,
            chunk: pcm,
            format: 'pcm',
            mimeType: 'audio/wav',
            sampleFormat: OUTPUT_SAMPLE_FORMAT,
            sampleRate: OUTPUT_SAMPLE_RATE,
            sequence
          }
        });
      };

      while (true) {
        const { done, value } = (await reader.read()) as { done: boolean; value?: Uint8Array };
        if (done) break;
        if (!value?.length) continue;

        const chunk = Buffer.from(value);
        fullBuffers.push(chunk);

        let pcm: Buffer;
        if (!headerParsed) {
          headerPending = Buffer.concat([headerPending, chunk]);
          const dataOffset = findWavDataOffset(headerPending);
          if (dataOffset === undefined) {
            if (headerPending.length > MAX_WAV_HEADER_BYTES) {
              throw new Error('GPT-SoVITS speech synthesis streaming failed: could not locate WAV data chunk in response');
            }
            continue;
          }
          headerParsed = true;
          pcm = headerPending.subarray(dataOffset);
          headerPending = Buffer.alloc(0);
        } else {
          pcm = chunk;
        }

        // s16le 单样本 2 字节，跨 chunk 对齐样本边界，留半个样本到下一块
        const aligned = sampleAlignmentByte ? Buffer.concat([sampleAlignmentByte, pcm]) : pcm;
        const evenLength = aligned.length - (aligned.length % 2);
        sampleAlignmentByte = aligned.length % 2 ? aligned.subarray(evenLength) : undefined;
        emitPcm(aligned.subarray(0, evenLength));
      }

      // 结尾残留的单字节（理论上合法 s16le 流总长必为偶数，防御性发出）
      if (sampleAlignmentByte?.length) {
        emitPcm(sampleAlignmentByte);
      }

      const audioBuffer = Buffer.concat(fullBuffers);
      if (!audioBuffer.length || !sequence) {
        throw new Error('GPT-SoVITS speech synthesis streaming failed: response did not include audio data');
      }

      const result = this.toResult(audioBuffer, req);

      logGptSovitsSpeech('HTTP stream done', {
        audioChunkCount: sequence,
        sizeBytes: audioBuffer.length,
        transport: 'http-stream'
      });

      onEvent({ type: 'completed', data: result });
      onEvent({ type: 'done' });

      return result;
    } catch (error) {
      this.logFetchFailure(error, 'http-stream');
      throw error;
    }
  }

  private logFetchFailure(error: unknown, transport: string): void {
    if (error instanceof Error && error.message.startsWith('GPT-SoVITS speech synthesis failed')) return;
    // "fetch failed" 的根因在 error.cause 里（如 TLS 证书校验失败），一并打出来
    const cause = (error as any)?.cause;
    logGptSovitsSpeech('HTTP failed', {
      causeCode: cause?.code,
      causeMessage: cause instanceof Error ? cause.message : cause ? String(cause) : undefined,
      error: error instanceof Error ? error.message : String(error),
      transport
    });
  }

  private async readErrorMessage(response: Response): Promise<string> {
    try {
      const text = await response.text();
      const parsed = text.trim() ? JSON.parse(text) : undefined;
      // OpenAI 标准错误格式 { error: { message } }，兼容旧的 { message } 格式
      const errorMessage = isRecord(parsed) && isRecord(parsed.error) ? parsed.error.message : undefined;
      if (typeof errorMessage === 'string' && errorMessage.trim()) {
        return errorMessage;
      }
      if (isRecord(parsed) && typeof parsed.message === 'string' && parsed.message.trim()) {
        return parsed.message;
      }
      return text.trim() || response.statusText || 'unknown error';
    } catch {
      return response.statusText || 'unknown error';
    }
  }

  private toSpeechAudioArtifact(audioBuffer: Buffer, req: SpeechSynthesisRequest): GeneratedAudioArtifact {
    return {
      audioBase64: audioBuffer.toString('base64'),
      format: DEFAULT_MEDIA_TYPE,
      metadata: {
        mode: req.mode || 'complete',
        transport: req.mode && req.mode !== 'complete' ? 'http-stream' : 'http',
        ...(req.voiceId ? { voiceId: req.voiceId } : {})
      },
      mimeType: 'audio/wav',
      sampleRate: OUTPUT_SAMPLE_RATE,
      sizeBytes: audioBuffer.length
    };
  }
}

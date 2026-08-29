import type { GeneratedAudioArtifact, ProviderAdapter, ProviderSecrets, SpeechSynthesisRequest, SpeechSynthesisResponse } from '../types';
import { getBuiltinProviderDefinitionOrThrow } from './service';
import { resolveFetch } from './tls';
import type { BuiltinProviderDefinition } from './types';

// 以下为 GPT-SoVITS 服务端（api_v2.py）参考音频默认配置。
// 注意：refAudioPath 是**服务端本地文件系统**路径（服务端用它读取参考音频），
// 必须与 GPT-SoVITS 服务的实际部署目录保持一致，否则服务端会返回 400。
const DEFAULT_REF_AUDIO_PATH = '/home/ubuntu/Github/Chobits-Chi-TTS/models/ref_audio.wav'; // 服务端路径，需与部署一致
const DEFAULT_PROMPT_TEXT = '秀樹は地位を拾ってくれた';
const DEFAULT_PROMPT_LANG = 'ja';
const DEFAULT_TEXT_LANG = 'ja';
const DEFAULT_MEDIA_TYPE = 'wav';
// api_v2.py 输出固定为 32kHz WAV
const OUTPUT_SAMPLE_RATE = 32000;

export type GptSovitsVoiceProfile = {
  refAudioPath: string;
  promptText: string;
  promptLang: string;
};

// 预留的声线 profile 映射：req.voiceId 命中时使用对应 profile，
// 未命中且无 extras.gptSovits 覆盖时回落到顶部默认常量。
export const VOICE_PROFILES: Record<string, GptSovitsVoiceProfile> = {
  'chi-default': {
    promptLang: DEFAULT_PROMPT_LANG,
    promptText: DEFAULT_PROMPT_TEXT,
    refAudioPath: DEFAULT_REF_AUDIO_PATH
  }
};

type GptSovitsExtras = {
  refAudioPath?: string;
  promptText?: string;
  promptLang?: string;
};

const TEXT_LANG_ALIASES: Record<string, string> = {
  cantonese: 'yue',
  chinese: 'zh',
  en: 'en',
  'en-us': 'en',
  english: 'en',
  ja: 'ja',
  'ja-jp': 'ja',
  japanese: 'ja',
  ko: 'ko',
  korean: 'ko',
  yue: 'yue',
  zh: 'zh',
  'zh-cn': 'zh'
};

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function trimString(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
}

function normalizeBaseUrl(baseUrl?: string): string {
  const normalized = trimString(baseUrl) || 'http://127.0.0.1:9880';
  return normalized.replace(/\/+$/, '');
}

function normalizeTextLang(language?: string): string {
  const normalized = String(language || '')
    .trim()
    .toLowerCase();
  if (!normalized) return DEFAULT_TEXT_LANG;
  return TEXT_LANG_ALIASES[normalized] || normalized;
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

  getSecrets(): ProviderSecrets {
    return this.secrets;
  }

  private resolveSecrets(override?: Partial<ProviderSecrets>): ProviderSecrets {
    return {
      baseUrl: this.definition.protocol.baseUrl,
      ...this.secrets,
      ...(override || {})
    };
  }

  async synthesizeSpeech(req: SpeechSynthesisRequest, signal?: AbortSignal): Promise<SpeechSynthesisResponse> {
    const overrideSecrets = (req.extras as any)?.secrets as Partial<ProviderSecrets> | undefined;
    const secrets = this.resolveSecrets(overrideSecrets);
    const apiKey = trimString(secrets.apiKey);

    const text = String(req.text || '').trim();
    if (!text) {
      throw new Error('GPT-SoVITS speech synthesis requires text');
    }

    const mode = req.mode || 'complete';
    if (mode !== 'complete') {
      throw new Error(`GPT-SoVITS speech synthesis mode "${mode}" requires calling streamSpeechSynthesis instead of synthesizeSpeech`);
    }

    const transportPreference = req.transportPreference || 'auto';
    if (transportPreference !== 'auto' && transportPreference !== 'http') {
      throw new Error(`GPT-SoVITS speech synthesis transport "${transportPreference}" is not supported by synthesizeSpeech`);
    }

    const gptSovitsExtras: GptSovitsExtras = isRecord(req.extras?.gptSovits) ? req.extras.gptSovits : {};
    const profile = req.voiceId ? VOICE_PROFILES[req.voiceId] : undefined;
    const refAudioPath = trimString(gptSovitsExtras.refAudioPath) || profile?.refAudioPath || DEFAULT_REF_AUDIO_PATH;
    const promptText = trimString(gptSovitsExtras.promptText) || profile?.promptText || DEFAULT_PROMPT_TEXT;
    const promptLang = trimString(gptSovitsExtras.promptLang) || profile?.promptLang || DEFAULT_PROMPT_LANG;
    const textLang = normalizeTextLang(req.language);
    const speedFactor = toFiniteNumber(req.speed);

    const body = {
      media_type: DEFAULT_MEDIA_TYPE,
      prompt_lang: promptLang,
      prompt_text: promptText,
      ref_audio_path: refAudioPath,
      streaming_mode: false,
      text,
      text_lang: textLang,
      ...(speedFactor !== undefined ? { speed_factor: speedFactor } : {})
    };
    const endpoint = `${normalizeBaseUrl(secrets.baseUrl)}/tts`;

    logGptSovitsSpeech('HTTP complete start', {
      endpoint,
      mode,
      model: req.model,
      promptLang,
      refAudioPath,
      textLang,
      transport: 'http',
      voiceId: req.voiceId,
      ...speechTextLogPayload(text)
    });

    try {
      // 自签名 HTTPS 部署时，用户在 provider 配置里开启「TLS 证书校验 → 允许自签名」；
      // 开启后用 npm undici 包自带的 fetch + 配套 Agent 发请求（跨版本 dispatcher 不兼容全局 fetch）
      const fetchImpl = (await resolveFetch(secrets)) ?? fetch;
      const response = await fetchImpl(endpoint, {
        body: JSON.stringify(body),
        headers: {
          'Content-Type': 'application/json',
          // 服务端中间件支持 Authorization: Bearer <key> 鉴权；未配置 apiKey 时服务会返回 401
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        method: 'POST',
        signal
      });

      if (!response.ok) {
        const message = await this.readErrorMessage(response);
        logGptSovitsSpeech('HTTP complete failed', {
          httpStatus: response.status,
          message,
          transport: 'http'
        });
        throw new Error(`GPT-SoVITS speech synthesis failed (${response.status}): ${message}`);
      }

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      if (!audioBuffer.length) {
        throw new Error('GPT-SoVITS speech synthesis failed: response did not include audio data');
      }

      const artifact = this.toSpeechAudioArtifact(audioBuffer, req);
      const result: SpeechSynthesisResponse = {
        artifacts: [artifact],
        audioBase64: artifact.audioBase64,
        model: req.model,
        providerId: this.id,
        ...(req.voice || req.voiceId ? { voice: req.voice || req.voiceId } : {}),
        ...(req.voiceId ? { voiceId: req.voiceId } : {})
      };

      logGptSovitsSpeech('HTTP complete done', {
        audioBase64Length: artifact.audioBase64?.length,
        mimeType: artifact.mimeType,
        sizeBytes: artifact.sizeBytes,
        transport: 'http'
      });

      return result;
    } catch (error) {
      if (!(error instanceof Error && error.message.startsWith('GPT-SoVITS speech synthesis failed'))) {
        // "fetch failed" 的根因在 error.cause 里（如 TLS 证书校验失败），一并打出来
        const cause = (error as any)?.cause;
        logGptSovitsSpeech('HTTP complete failed', {
          causeCode: cause?.code,
          causeMessage: cause instanceof Error ? cause.message : cause ? String(cause) : undefined,
          error: error instanceof Error ? error.message : String(error),
          transport: 'http'
        });
      }
      throw error;
    }
  }

  private async readErrorMessage(response: Response): Promise<string> {
    try {
      const text = await response.text();
      const parsed = text.trim() ? JSON.parse(text) : undefined;
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
        transport: 'http',
        ...(req.voiceId ? { voiceId: req.voiceId } : {})
      },
      mimeType: 'audio/wav',
      sampleRate: OUTPUT_SAMPLE_RATE,
      sizeBytes: audioBuffer.length
    };
  }
}

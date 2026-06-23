import type { SpeechSynthesisRequest, SpeechSynthesisResponse, SpeechSynthesisStreamEvent, SpeechTextInputChunk } from '../../ai/types';

// ============================================================================
// Speech synthesis config
// ============================================================================

export type SpeakServiceType = 'Edge' | string;
export type SpriteSpeakEngine = 'edge' | 'ai-provider';

export type SpriteSpeakMode = Extract<NonNullable<SpeechSynthesisRequest['mode']>, 'complete' | 'output-stream' | 'duplex-stream'>;
export type SpriteSpeakTransportPreference = Extract<NonNullable<SpeechSynthesisRequest['transportPreference']>, 'auto' | 'http' | 'http-stream' | 'websocket'>;

export interface SpriteSpeakAIProviderConfig {
  providerId: string;
  providerPresetId?: string;
  model: string;
  voiceId: string;
  voice?: string;
  language?: string;
  mode?: SpriteSpeakMode;
  transportPreference?: SpriteSpeakTransportPreference;
  audioSetting?: {
    format?: string;
    sampleRate?: number;
    bitrate?: number;
    channels?: number;
  };
  speed?: number;
  pitch?: number;
  voiceVolume?: number;
  emotion?: string;
  subtitle?: {
    enabled?: boolean;
    type?: 'sentence' | 'word' | 'word_streaming' | string;
  };
  pronunciationDict?: Record<string, any>;
  extras?: Record<string, any>;
}

export interface SpriteSpeakConfig {
  /** Enables speech synthesis for sprite speech. */
  enabled: boolean;
  /** Active speech engine. Missing legacy values are interpreted from serviceType. */
  engine: SpriteSpeakEngine;
  /** Legacy Edge service type. Kept for old configs and Edge UI. */
  serviceType: SpeakServiceType;
  /** Edge voice name, for example zh-CN-XiaoxiaoNeural. */
  voiceName: string;
  /** Edge rate percent. */
  rate: number;
  /** Edge pitch percent. */
  pitch: number;
  /** Playback volume, not provider voice volume. */
  volume: number;
  /** AI Provider speech synthesis settings. */
  aiProvider?: SpriteSpeakAIProviderConfig;
}

export const DEFAULT_AI_PROVIDER_SPEAK_CONFIG: SpriteSpeakAIProviderConfig = {
  providerId: 'minimax',
  model: 'speech-2.8-turbo',
  voiceId: 'female-shaonv',
  mode: 'complete',
  transportPreference: 'auto',
  audioSetting: {
    format: 'mp3',
    sampleRate: 32000,
    bitrate: 128000,
    channels: 1
  },
  speed: 1,
  pitch: 0,
  voiceVolume: 1
};

export const DEFAULT_SPEAK_CONFIG: SpriteSpeakConfig = {
  enabled: true,
  engine: 'edge',
  serviceType: 'Edge',
  voiceName: 'zh-CN-XiaoxiaoNeural',
  rate: 20,
  pitch: 0,
  volume: 1,
  aiProvider: { ...DEFAULT_AI_PROVIDER_SPEAK_CONFIG }
};

export interface SpriteSpeechSynthesisExecutor {
  synthesize(req: SpeechSynthesisRequest): Promise<SpeechSynthesisResponse>;
  stream?(
    req: SpeechSynthesisRequest,
    onEvent: (event: SpeechSynthesisStreamEvent) => void,
    input?: AsyncIterable<SpeechTextInputChunk>
  ): Promise<SpeechSynthesisResponse>;
}

// ============================================================================
// Cache
// ============================================================================

export interface SpeakCacheEntry {
  cacheId: string;
  text: string;
  config: {
    engine?: SpriteSpeakEngine;
    serviceType?: SpeakServiceType;
    voiceName?: string;
    rate?: number;
    pitch?: number;
    aiProvider?: {
      providerId: string;
      providerPresetId?: string;
      model: string;
      voiceId: string;
      voice?: string;
      language?: string;
      mode?: string;
      transportPreference?: string;
      audioFormat?: string;
      speed?: number;
      pitch?: number;
      voiceVolume?: number;
      emotion?: string;
    };
  };
  fileName: string;
  mimeType?: string;
  durationMs?: number;
  createdAt: number;
  lastUsedAt: number;
}

export interface SpeakCacheIndex {
  version: number;
  entries: Record<string, SpeakCacheEntry>;
}

export interface SpeakCacheMetadata {
  text: string;
  config: SpeakCacheEntry['config'];
  extension?: string;
  mimeType?: string;
  durationMs?: number;
}

// ============================================================================
// IPC
// ============================================================================

export interface SpriteSpeakPayload {
  text: string;
  audioPath: string;
  cacheId: string;
  volume: number;
}

export interface SpriteSpeakPlaybackContext {
  talkDurationMs?: number;
  ownerPurposeId?: string;
  priority?: number;
  ignorePresentationLock?: boolean;
}

export interface SpeakRequest {
  text: string;
  showBubble?: boolean;
  bubbleDuration?: number;
}

export interface SpeakResult {
  success: boolean;
  cacheId?: string;
  audioPath?: string;
  fromCache?: boolean;
  error?: string;
}

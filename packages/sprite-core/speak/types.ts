import type { SpeechSynthesisRequest, SpeechSynthesisResponse, SpeechSynthesisStreamEvent, SpeechTextInputChunk } from '../../ai/types';

// ============================================================================
// Speech synthesis config
// ============================================================================

export type SpeakServiceType = 'Edge' | string;
export type SpriteSpeakEngine = 'edge' | 'ai-provider';

export type SpriteSpeakMode = Extract<NonNullable<SpeechSynthesisRequest['mode']>, 'complete' | 'output-stream' | 'duplex-stream'>;
export type SpriteSpeakTransportPreference = Extract<NonNullable<SpeechSynthesisRequest['transportPreference']>, 'auto' | 'http' | 'http-stream' | 'websocket'>;
export type SpriteRealtimeSpeechSource = 'chat';
export type SpriteRealtimeSpeechScope = 'mainChat' | 'resourceChatSidebar';
export type SpriteRealtimeSpeechSampleFormat = 's16le' | 'f32le' | string;

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

export interface SpriteSpeakChatRealtimeSpeechConfig {
  enabled: boolean;
  mode: Extract<SpriteSpeakMode, 'duplex-stream' | 'output-stream'>;
  transportPreference: Extract<SpriteSpeakTransportPreference, 'websocket' | 'http-stream' | 'auto'>;
  audioSetting: {
    format: 'pcm';
    sampleRate: number;
    channels: 1 | 2;
    sampleFormat?: SpriteRealtimeSpeechSampleFormat;
  };
  chunking: {
    minChars: number;
    maxChars: number;
    maxDelayMs: number;
    flushOnPunctuation: boolean;
  };
  playback: {
    startBufferMs: number;
    maxBufferMs: number;
    fadeInMs: number;
    fadeOutMs: number;
    volume?: number;
  };
  scopes: Record<SpriteRealtimeSpeechScope, boolean>;
  writeFinalCache?: boolean;
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
  /** Optional realtime speech for AI chat assistant deltas. Default disabled. */
  chatRealtimeSpeech: SpriteSpeakChatRealtimeSpeechConfig;
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

export const DEFAULT_CHAT_REALTIME_SPEECH_CONFIG: SpriteSpeakChatRealtimeSpeechConfig = {
  enabled: false,
  mode: 'duplex-stream',
  transportPreference: 'websocket',
  audioSetting: {
    format: 'pcm',
    sampleRate: 32000,
    channels: 1,
    sampleFormat: 's16le'
  },
  chunking: {
    minChars: 8,
    maxChars: 80,
    maxDelayMs: 350,
    flushOnPunctuation: true
  },
  playback: {
    startBufferMs: 160,
    maxBufferMs: 3000,
    fadeInMs: 12,
    fadeOutMs: 32
  },
  scopes: {
    mainChat: true,
    resourceChatSidebar: true
  },
  writeFinalCache: false
};

export const DEFAULT_SPEAK_CONFIG: SpriteSpeakConfig = {
  enabled: true,
  engine: 'edge',
  serviceType: 'Edge',
  voiceName: 'zh-CN-XiaoxiaoNeural',
  rate: 20,
  pitch: 0,
  volume: 1,
  aiProvider: { ...DEFAULT_AI_PROVIDER_SPEAK_CONFIG },
  chatRealtimeSpeech: { ...DEFAULT_CHAT_REALTIME_SPEECH_CONFIG }
};

export interface SpriteSpeechSynthesisExecutor {
  synthesize(req: SpeechSynthesisRequest): Promise<SpeechSynthesisResponse>;
  stream?(
    req: SpeechSynthesisRequest,
    onEvent: (event: SpeechSynthesisStreamEvent) => void,
    input?: AsyncIterable<SpeechTextInputChunk>,
    signal?: AbortSignal
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

export type SpriteRealtimeSpeechEvent =
  | {
      type: 'started';
      data: {
        sessionId: string;
        requestId?: string;
        providerRequestId?: string;
        mode?: string;
        transport?: string;
        format: 'pcm';
        sampleRate: number;
        channels: number;
        sampleFormat: SpriteRealtimeSpeechSampleFormat;
      };
    }
  | {
      type: 'audio_delta';
      data: {
        chunk: ArrayBuffer | Buffer | Uint8Array;
        format: 'pcm';
        mimeType?: string;
        sampleRate: number;
        channels: number;
        sampleFormat: SpriteRealtimeSpeechSampleFormat;
        sequence?: number;
      };
    }
  | { type: 'metadata'; data: Record<string, any> }
  | { type: 'completed'; data: { sessionId: string; filePath?: string; durationMs?: number } }
  | { type: 'error'; data: { message: string; code?: string } }
  | { type: 'done' };

export interface SpriteRealtimeSpeechSessionRequest {
  source: SpriteRealtimeSpeechSource;
  scope: SpriteRealtimeSpeechScope;
}

export interface SpriteRealtimeSpeechSessionStartResult {
  sessionId: string;
  eventsChannel: string;
  enabled: boolean;
  reason?: string;
}

export interface SpriteRealtimeSpeechHandle {
  sessionId: string;
  appendText(text: string): Promise<void>;
  flush(): Promise<void>;
  finish(): Promise<void>;
  cancel(): Promise<void>;
  on(cb: (event: SpriteRealtimeSpeechEvent) => void): () => void;
  off(cb: (event: SpriteRealtimeSpeechEvent) => void): void;
  dispose(): void;
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

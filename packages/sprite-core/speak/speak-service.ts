/**
 * Sprite Speak Service
 *
 * 核心语音合成服务，负责：
 * 1. 根据配置选择 TTS 服务提供商进行合成
 * 2. 利用缓存避免重复合成
 * 3. 返回合成结果（音频文件路径）
 *
 * 当前支持的 TTS 服务：
 * - Edge TTS (微软免费语音合成)
 *
 * 可扩展：实现新的 TTS 适配器并在 synthesizeWithService() 中注册即可
 */

import { stripEmoji } from '../../tts/common';
import EdgeTTS from '../../tts/edge';
import { SpeakCache } from './speak-cache';
import { SpeakConfigStore } from './speak-config-store';
import type {
  SpeakCacheEntry,
  SpeakCacheMetadata,
  SpeakResult,
  SpriteRealtimeSpeechAvailabilityRequest,
  SpriteRealtimeSpeechEvent,
  SpriteRealtimeSpeechSampleFormat,
  SpriteRealtimeSpeechScope,
  SpriteRealtimeSpeechSessionRequest,
  SpriteSpeakAIProviderConfig,
  SpriteSpeakChatRealtimeSpeechConfig,
  SpriteSpeakConfig,
  SpriteSpeakEngine,
  SpriteSpeakPayload,
  SpriteSpeakPlaybackContext,
  SpriteSpeechSynthesisExecutor
} from './types';
import type { SpeechSynthesisRequest, SpeechSynthesisStreamEvent, SpeechTextInputChunk } from '../../ai/types';

type SynthesisOutput = {
  buffer: Buffer;
  cacheMeta: SpeakCacheMetadata;
};

export interface SpriteRealtimeSpeechSession {
  sessionId: string;
  scope: SpriteRealtimeSpeechScope;
  appendText(text: string): Promise<void>;
  flush(): Promise<void>;
  finish(): Promise<void>;
  cancel(reason?: string): Promise<void>;
}

type RealtimeSpeechEventHandler = (sessionId: string, event: SpriteRealtimeSpeechEvent) => void;

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeEngine(config: SpriteSpeakConfig): SpriteSpeakEngine {
  if (config.engine === 'ai-provider') return 'ai-provider';
  return 'edge';
}

function normalizeFormat(format?: string): string {
  const raw = String(format || '')
    .trim()
    .toLowerCase();
  if (!raw) return 'mp3';
  if (raw.includes('wav')) return 'wav';
  if (raw.includes('flac')) return 'flac';
  if (raw.includes('aac')) return 'aac';
  if (raw.includes('m4a') || raw.includes('mp4')) return 'm4a';
  if (raw.includes('ogg') || raw.includes('opus')) return 'ogg';
  if (raw.includes('pcm')) return 'pcm';
  return 'mp3';
}

function normalizeSampleFormat(value?: string): SpriteRealtimeSpeechSampleFormat {
  const raw = String(value || '').trim().toLowerCase();
  return raw || 's16le';
}

function bufferFromAudioChunk(chunk: ArrayBuffer | Buffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(chunk)) return chunk;
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }
  return Buffer.from(chunk);
}

function extensionFromMimeOrFormat(format?: string, mimeType?: string): string {
  return normalizeFormat(format || mimeType);
}

function cloneStableExtras(extras: unknown): Record<string, any> | undefined {
  if (!isRecord(extras)) return undefined;
  const { secrets: _secrets, requestId: _requestId, outputDir: _outputDir, usage: _usage, ...rest } = extras;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

function decodeDataUrl(dataUrl: string): Buffer | undefined {
  const match = /^data:[^;]+;base64,(.+)$/s.exec(dataUrl.trim());
  if (!match) return undefined;
  return Buffer.from(match[1], 'base64');
}

function decodeHex(value: string): Buffer | undefined {
  const normalized = value.replace(/\s+/g, '');
  if (!normalized || normalized.length % 2 !== 0 || !/^[a-fA-F0-9]+$/.test(normalized)) {
    return undefined;
  }
  return Buffer.from(normalized, 'hex');
}

async function readAudioArtifactToBuffer(artifact: any): Promise<Buffer | undefined> {
  if (typeof artifact?.filePath === 'string' && artifact.filePath.trim()) {
    const fs = await import('node:fs/promises');
    return fs.readFile(artifact.filePath);
  }
  if (typeof artifact?.audioBase64 === 'string' && artifact.audioBase64.trim()) {
    return Buffer.from(artifact.audioBase64, 'base64');
  }
  if (typeof artifact?.audioHex === 'string' && artifact.audioHex.trim()) {
    return decodeHex(artifact.audioHex);
  }
  if (typeof artifact?.audioUrl === 'string' && artifact.audioUrl.startsWith('data:')) {
    return decodeDataUrl(artifact.audioUrl);
  }
  return undefined;
}

function buildEdgeCacheConfig(config: SpriteSpeakConfig): SpeakCacheEntry['config'] {
  return {
    engine: 'edge',
    serviceType: config.serviceType,
    voiceName: config.voiceName,
    rate: config.rate,
    pitch: config.pitch
  };
}

function buildLegacyEdgeCacheKeyConfig(config: SpriteSpeakConfig): Record<string, unknown> {
  return {
    serviceType: config.serviceType,
    voiceName: config.voiceName,
    rate: config.rate,
    pitch: config.pitch
  };
}

function buildAiProviderCacheConfig(aiProvider: SpriteSpeakAIProviderConfig): SpeakCacheEntry['config'] {
  return {
    engine: 'ai-provider',
    aiProvider: {
      audioFormat: normalizeFormat(aiProvider.audioSetting?.format),
      emotion: aiProvider.emotion,
      language: aiProvider.language,
      mode: aiProvider.mode || 'complete',
      model: aiProvider.model,
      pitch: aiProvider.pitch,
      providerId: aiProvider.providerId,
      providerPresetId: aiProvider.providerPresetId,
      speed: aiProvider.speed,
      transportPreference: aiProvider.transportPreference || 'auto',
      voice: aiProvider.voice,
      voiceId: aiProvider.voiceId,
      voiceVolume: aiProvider.voiceVolume
    }
  };
}

function buildAiProviderCacheKeyConfig(aiProvider: SpriteSpeakAIProviderConfig): Record<string, unknown> {
  return {
    ...buildAiProviderCacheConfig(aiProvider),
    audioSetting: aiProvider.audioSetting,
    extras: cloneStableExtras(aiProvider.extras),
    pronunciationDict: aiProvider.pronunciationDict,
    subtitle: aiProvider.subtitle
  };
}

class SpeechTextInputQueue {
  private queue: SpeechTextInputChunk[] = [];
  private closed = false;
  private waiter?: () => void;

  enqueue(chunk: SpeechTextInputChunk): void {
    if (this.closed) return;
    this.queue.push(chunk);
    if (chunk.type === 'close') {
      this.closed = true;
    }
    this.wake();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.queue.push({ type: 'close' });
    this.wake();
  }

  async *read(): AsyncIterable<SpeechTextInputChunk> {
    while (!this.closed || this.queue.length > 0) {
      if (!this.queue.length) {
        await new Promise<void>((resolve) => {
          this.waiter = resolve;
        });
        continue;
      }
      const chunk = this.queue.shift();
      if (!chunk) continue;
      yield chunk;
      if (chunk.type === 'close') break;
    }
  }

  private wake(): void {
    const waiter = this.waiter;
    this.waiter = undefined;
    waiter?.();
  }
}

class RealtimeSpeechSessionImpl implements SpriteRealtimeSpeechSession {
  readonly sessionId: string;
  readonly scope: SpriteRealtimeSpeechScope;

  private readonly aiProvider: SpriteSpeakAIProviderConfig;
  private readonly controller = new AbortController();
  private readonly emit: (event: SpriteRealtimeSpeechEvent) => void;
  private readonly executor: SpriteSpeechSynthesisExecutor;
  private readonly inputQueue = new SpeechTextInputQueue();
  private readonly realtimeConfig: SpriteSpeakChatRealtimeSpeechConfig;
  private readonly source: string;
  private readonly unregister: () => void;
  private done = false;
  private started = false;
  private terminalSent = false;

  constructor(options: {
    aiProvider: SpriteSpeakAIProviderConfig;
    emit: (event: SpriteRealtimeSpeechEvent) => void;
    executor: SpriteSpeechSynthesisExecutor;
    realtimeConfig: SpriteSpeakChatRealtimeSpeechConfig;
    scope: SpriteRealtimeSpeechScope;
    sessionId: string;
    source: string;
    unregister: () => void;
  }) {
    this.aiProvider = options.aiProvider;
    this.emit = options.emit;
    this.executor = options.executor;
    this.realtimeConfig = options.realtimeConfig;
    this.scope = options.scope;
    this.sessionId = options.sessionId;
    this.source = options.source;
    this.unregister = options.unregister;
  }

  start(): void {
    this.ensureStarted();
  }

  private ensureStarted(): void {
    if (this.started || this.done) return;
    this.started = true;
    const request = this.buildRequest();
    setTimeout(() => {
      void this.run(request);
    }, 0);
  }

  async appendText(text: string): Promise<void> {
    if (this.done) return;
    const sanitized = stripEmoji(text ?? '');
    if (!sanitized.trim()) return;
    this.inputQueue.enqueue({ type: 'text', text: sanitized });
    this.ensureStarted();
  }

  async flush(): Promise<void> {
    if (this.done || !this.started) return;
    this.inputQueue.enqueue({ type: 'flush' });
  }

  async finish(): Promise<void> {
    if (this.done) return;
    if (!this.started) {
      this.done = true;
      this.emitDone();
      this.unregister();
      return;
    }
    this.inputQueue.close();
  }

  async cancel(reason?: string): Promise<void> {
    if (this.done) return;
    this.done = true;
    this.inputQueue.close();
    this.controller.abort(reason || 'cancelled');
    this.emitDone();
    this.unregister();
  }

  private buildRequest(): SpeechSynthesisRequest {
    const audioSetting = this.realtimeConfig.audioSetting;
    return {
      audioSetting: {
        format: 'pcm',
        sampleRate: audioSetting.sampleRate,
        channels: audioSetting.channels
      },
      emotion: this.aiProvider.emotion,
      extras: {
        ...(this.aiProvider.extras || {}),
        usage: {
          operationKey: 'chat_realtime_speech',
          sourceId: `sprite-chat-realtime-speech:${this.scope}`,
          sourceLabel: 'AI 回复实时朗读',
          sourceType: 'sprite_chat_realtime_speech',
          usageFeature: 'sprite_chat_realtime_speech'
        }
      },
      language: this.aiProvider.language,
      mode: this.realtimeConfig.mode,
      model: this.aiProvider.model,
      pitch: this.aiProvider.pitch,
      pronunciationDict: this.aiProvider.pronunciationDict,
      providerId: this.aiProvider.providerId,
      providerPresetId: this.aiProvider.providerPresetId,
      rate: this.aiProvider.speed,
      speed: this.aiProvider.speed,
      subtitle: this.aiProvider.subtitle,
      transportPreference: this.realtimeConfig.transportPreference,
      voice: this.aiProvider.voice,
      voiceId: this.aiProvider.voiceId,
      volume: this.aiProvider.voiceVolume
    };
  }

  private async run(request: SpeechSynthesisRequest): Promise<void> {
    try {
      if (!this.executor.stream) {
        throw new Error('Streaming speech synthesis executor is not configured');
      }
      await this.executor.stream(request, (event) => this.handleProviderEvent(event, request), this.inputQueue.read(), this.controller.signal);
      this.emitDone();
    } catch (error) {
      if (!this.controller.signal.aborted && !this.terminalSent) {
        this.emit({
          type: 'error',
          data: {
            message: error instanceof Error ? error.message : String(error)
          }
        });
      }
      this.emitDone();
    } finally {
      this.done = true;
      this.inputQueue.close();
      this.unregister();
    }
  }

  private handleProviderEvent(event: SpeechSynthesisStreamEvent, request: SpeechSynthesisRequest): void {
    if (this.done) return;

    if (event.type === 'started') {
      const sample = this.resolveAudioSample(event, request);
      this.emit({
        type: 'started',
        data: {
          ...event.data,
          channels: sample.channels,
          format: 'pcm',
          sampleFormat: sample.sampleFormat,
          sampleRate: sample.sampleRate,
          sessionId: this.sessionId
        }
      });
      return;
    }

    if (event.type === 'audio_delta') {
      const format = normalizeFormat(event.data.format || request.audioSetting?.format);
      if (format !== 'pcm') {
        this.emit({
          type: 'error',
          data: {
            message: `Realtime speech playback requires PCM audio, got ${format || 'unknown'}`
          }
        });
        this.controller.abort('non-pcm-audio');
        return;
      }

      const sample = this.resolveAudioSample(event, request);
      this.emit({
        type: 'audio_delta',
        data: {
          chunk: bufferFromAudioChunk(event.data.chunk),
          channels: sample.channels,
          format: 'pcm',
          mimeType: event.data.mimeType,
          sampleFormat: sample.sampleFormat,
          sampleRate: sample.sampleRate,
          sequence: event.data.sequence
        }
      });
      return;
    }

    if (event.type === 'metadata') {
      this.emit({
        type: 'metadata',
        data: {
          ...event.data,
          scope: this.scope,
          sessionId: this.sessionId,
          source: this.source
        }
      });
      return;
    }

    if (event.type === 'completed') {
      this.emit({
        type: 'completed',
        data: {
          durationMs: event.data.artifacts?.[0]?.durationMs,
          filePath: event.data.artifacts?.[0]?.filePath || event.data.filePath,
          sessionId: this.sessionId
        }
      });
      return;
    }

    if (event.type === 'error') {
      this.emit({
        type: 'error',
        data: {
          code: event.data.code,
          message: event.data.message
        }
      });
      return;
    }

    if (event.type === 'done') {
      this.emitDone();
    }
  }

  private resolveAudioSample(event: SpeechSynthesisStreamEvent, request: SpeechSynthesisRequest): {
    sampleRate: number;
    channels: number;
    sampleFormat: SpriteRealtimeSpeechSampleFormat;
  } {
    const data = 'data' in event ? (event.data as Record<string, any>) : {};
    return {
      sampleRate: Number(data.sampleRate || request.audioSetting?.sampleRate || this.realtimeConfig.audioSetting.sampleRate),
      channels: Number(data.channels || request.audioSetting?.channels || this.realtimeConfig.audioSetting.channels),
      sampleFormat: normalizeSampleFormat(data.sampleFormat || this.realtimeConfig.audioSetting.sampleFormat)
    };
  }

  private emitDone(): void {
    if (this.terminalSent) return;
    this.terminalSent = true;
    this.emit({ type: 'done' });
  }
}

export class SpeakService {
  private configStore: SpeakConfigStore;
  private cache: SpeakCache;
  private edgeTTS: EdgeTTS;
  private speechSynthesisExecutor?: SpriteSpeechSynthesisExecutor;
  private initialized = false;
  private activeRealtimeSessions = new Map<SpriteRealtimeSpeechScope, SpriteRealtimeSpeechSession>();
  private realtimeSessionCounter = 0;

  /** 回调：通知渲染进程播放音频 */
  private onPlayAudio: ((payload: SpriteSpeakPayload, context?: SpriteSpeakPlaybackContext) => void) | null = null;
  private onRealtimeSpeechEvent: RealtimeSpeechEventHandler | null = null;

  constructor(dataDir: string, speechSynthesisExecutor?: SpriteSpeechSynthesisExecutor) {
    this.configStore = new SpeakConfigStore(dataDir);
    this.cache = new SpeakCache(dataDir);
    this.edgeTTS = new EdgeTTS();
    this.speechSynthesisExecutor = speechSynthesisExecutor;
  }

  /** 初始化：加载配置和缓存索引 */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.configStore.load();
    await this.cache.init();
    this.initialized = true;
    console.log('[SpeakService] Initialized');
  }

  /** 设置音频播放回调 */
  setPlayAudioCallback(cb: (payload: SpriteSpeakPayload, context?: SpriteSpeakPlaybackContext) => void): void {
    this.onPlayAudio = cb;
  }

  setRealtimeSpeechEventCallback(cb: RealtimeSpeechEventHandler): void {
    this.onRealtimeSpeechEvent = cb;
  }

  // ============================================================================
  // 配置管理 API
  // ============================================================================

  getConfig(): SpriteSpeakConfig {
    return this.configStore.getConfig();
  }

  setConfig(partial: Partial<SpriteSpeakConfig>): SpriteSpeakConfig {
    return this.configStore.setConfig(partial);
  }

  resetConfig(): SpriteSpeakConfig {
    return this.configStore.reset();
  }

  // ============================================================================
  // 缓存管理 API
  // ============================================================================

  getCacheStats(): { totalEntries: number; totalSizeBytes: number } {
    return this.cache.getStats();
  }

  async clearCache(): Promise<void> {
    await this.cache.clear();
  }

  async startRealtimeSession(request: SpriteRealtimeSpeechSessionRequest, onEvent?: (event: SpriteRealtimeSpeechEvent) => void): Promise<SpriteRealtimeSpeechSession> {
    if (!this.initialized) {
      await this.init();
    }

    const config = this.configStore.getConfig();
    const realtimeConfig = config.chatRealtimeSpeech;

    if (!realtimeConfig.enabled) {
      throw new Error('AI chat realtime speech is disabled');
    }
    if (!realtimeConfig.scopes[request.scope]) {
      throw new Error(`AI chat realtime speech scope "${request.scope}" is disabled`);
    }
    if (normalizeEngine(config) !== 'ai-provider') {
      throw new Error('AI chat realtime speech requires AI Provider speech engine');
    }
    if (!this.speechSynthesisExecutor?.stream) {
      throw new Error('AI chat realtime speech requires streaming speech synthesis support');
    }

    const existing = this.activeRealtimeSessions.get(request.scope);
    if (existing) {
      await existing.cancel('replaced-by-new-session');
    }

    const aiProvider = this.resolveAiProviderConfig(config);
    const sessionId = `sprite-rt-speech-${Date.now()}-${++this.realtimeSessionCounter}`;
    const session = new RealtimeSpeechSessionImpl({
      aiProvider,
      emit: (event) => {
        this.onRealtimeSpeechEvent?.(sessionId, event);
        onEvent?.(event);
      },
      executor: this.speechSynthesisExecutor,
      realtimeConfig,
      scope: request.scope,
      sessionId,
      source: request.source,
      unregister: () => {
        if (this.activeRealtimeSessions.get(request.scope) === session) {
          this.activeRealtimeSessions.delete(request.scope);
        }
      }
    });

    this.activeRealtimeSessions.set(request.scope, session);
    return session;
  }

  isRealtimeSpeechEnabled(request: SpriteRealtimeSpeechAvailabilityRequest): boolean {
    const config = this.configStore.getConfig();
    const realtimeConfig = config.chatRealtimeSpeech;

    if (!config.enabled || normalizeEngine(config) !== 'ai-provider' || !realtimeConfig.enabled) {
      return false;
    }
    if (request.source !== 'chat') {
      return false;
    }
    if (request.scope) {
      return Boolean(realtimeConfig.scopes[request.scope]);
    }

    return Object.values(realtimeConfig.scopes).some(Boolean);
  }

  async appendRealtimeSpeechText(sessionId: string, text: string): Promise<void> {
    const session = this.findRealtimeSession(sessionId);
    if (!session) {
      throw new Error(`Realtime speech session not found: ${sessionId}`);
    }
    await session.appendText(stripEmoji(text ?? ''));
  }

  async flushRealtimeSpeech(sessionId: string): Promise<void> {
    const session = this.findRealtimeSession(sessionId);
    if (!session) {
      throw new Error(`Realtime speech session not found: ${sessionId}`);
    }
    await session.flush();
  }

  async finishRealtimeSpeech(sessionId: string): Promise<void> {
    const session = this.findRealtimeSession(sessionId);
    if (!session) {
      return;
    }
    await session.finish();
  }

  async cancelRealtimeSpeech(sessionId: string): Promise<void> {
    const session = this.findRealtimeSession(sessionId);
    if (!session) {
      return;
    }
    await session.cancel('cancelled');
  }

  private findRealtimeSession(sessionId: string): SpriteRealtimeSpeechSession | undefined {
    for (const session of this.activeRealtimeSessions.values()) {
      if (session.sessionId === sessionId) {
        return session;
      }
    }
    return undefined;
  }

  // ============================================================================
  // 核心合成 API
  // ============================================================================

  /**
   * 合成语音并返回结果
   *
   * 流程：
   * 1. 读取配置
   * 2. 生成缓存 ID (MD5 of config + text)
   * 3. 查找缓存 → 命中则直接返回
   * 4. 调用 TTS 服务合成
   * 5. 存入缓存
   * 6. 返回结果
   */
  async synthesize(text: string): Promise<SpeakResult> {
    const originalText = text ?? '';
    return this.synthesizeSanitized(originalText, stripEmoji(originalText));
  }

  private async synthesizeSanitized(originalText: string, sanitizedText: string): Promise<SpeakResult> {
    if (!this.initialized) {
      await this.init();
    }

    const config = this.configStore.getConfig();

    if (!config.enabled) {
      return { success: false, error: 'TTS is disabled' };
    }

    if (!originalText || originalText.trim().length === 0) {
      return { success: false, error: 'Empty text' };
    }

    if (sanitizedText.length === 0) {
      return { success: false, error: 'Empty text after emoji filtering' };
    }

    const cacheId = this.generateCacheId(config, sanitizedText);

    // 查找缓存
    const cachedPath = this.cache.get(cacheId);
    if (cachedPath) {
      console.log(`[SpeakService] Cache hit: ${cacheId}`);
      return {
        success: true,
        cacheId,
        audioPath: cachedPath,
        fromCache: true
      };
    }

    // 合成音频
    try {
      const output = await this.synthesizeWithService(sanitizedText, config);

      if (!output.buffer || output.buffer.length === 0) {
        return { success: false, error: 'Synthesis returned empty audio' };
      }

      // 存入缓存
      const audioPath = await this.cache.put(cacheId, output.buffer, {
        ...output.cacheMeta,
        text: sanitizedText
      });

      console.log(`[SpeakService] Synthesized and cached: ${cacheId}`);

      return {
        success: true,
        cacheId,
        audioPath,
        fromCache: false
      };
    } catch (err: any) {
      console.error('[SpeakService] Synthesis failed:', err);
      return { success: false, error: err?.message || 'Synthesis failed' };
    }
  }

  /**
   * 合成并播放（完整的 speak 流程）
   *
   * 1. 合成语音
   * 2. 通知渲染进程播放
   */
  async speak(text: string, context?: SpriteSpeakPlaybackContext): Promise<SpeakResult> {
    const originalText = text ?? '';
    const sanitizedText = stripEmoji(originalText);
    const result = await this.synthesizeSanitized(originalText, sanitizedText);

    if (result.success && result.audioPath && this.onPlayAudio) {
      const config = this.configStore.getConfig();
      this.onPlayAudio(
        {
          text: sanitizedText,
          audioPath: result.audioPath,
          cacheId: result.cacheId!,
          volume: config.volume
        },
        context
      );
    }

    return result;
  }

  // ============================================================================
  // TTS 服务适配
  // ============================================================================

  /**
   * 根据 serviceType 选择对应的 TTS 服务进行合成
   *
   * 扩展新服务：
   * 1. 在 switch 中添加新的 case
   * 2. 实现对应的合成逻辑
   * 3. 返回 Buffer
   */
  private generateCacheId(config: SpriteSpeakConfig, text: string): string {
    if (normalizeEngine(config) === 'ai-provider') {
      const aiProvider = this.resolveAiProviderConfig(config);
      return SpeakCache.generateCacheId(buildAiProviderCacheKeyConfig(aiProvider), text);
    }

    return SpeakCache.generateCacheId(buildLegacyEdgeCacheKeyConfig(config), text);
  }

  private async synthesizeWithService(text: string, config: SpriteSpeakConfig): Promise<SynthesisOutput> {
    if (normalizeEngine(config) === 'ai-provider') {
      return this.synthesizeWithAIProvider(text, config);
    }

    const result = await this.edgeTTS.textToSpeech({
      text,
      rate: config.rate,
      pitch: config.pitch,
      voiceName: config.voiceName
    });

    if (!Buffer.isBuffer(result)) {
      throw new Error(typeof result === 'string' ? result : 'Edge TTS synthesis failed');
    }

    return {
      buffer: result,
      cacheMeta: {
        config: buildEdgeCacheConfig(config),
        extension: 'mp3',
        mimeType: 'audio/mpeg',
        text
      }
    };
  }

  private resolveAiProviderConfig(config: SpriteSpeakConfig): SpriteSpeakAIProviderConfig {
    const aiProvider = config.aiProvider;
    if (!aiProvider?.providerId) {
      throw new Error('AI Provider speech synthesis requires providerId');
    }
    if (!aiProvider.model) {
      throw new Error('AI Provider speech synthesis requires model');
    }
    if (!aiProvider.voiceId && !aiProvider.voice) {
      throw new Error('AI Provider speech synthesis requires voiceId or voice');
    }
    return aiProvider;
  }

  private async synthesizeWithAIProvider(text: string, config: SpriteSpeakConfig): Promise<SynthesisOutput> {
    const executor = this.speechSynthesisExecutor;
    if (!executor) {
      throw new Error('AI Provider speech synthesis executor is not configured');
    }

    const aiProvider = this.resolveAiProviderConfig(config);
    const mode = aiProvider.mode || 'complete';
    const transportPreference = aiProvider.transportPreference || (mode === 'output-stream' ? 'http-stream' : mode === 'duplex-stream' ? 'websocket' : 'auto');
    const request = {
      audioSetting: aiProvider.audioSetting,
      emotion: aiProvider.emotion,
      extras: {
        ...(aiProvider.extras || {}),
        usage: {
          sourceId: 'sprite-speak',
          sourceLabel: '角色说话',
          sourceType: 'sprite_speech',
          usageFeature: 'sprite_speech'
        }
      },
      language: aiProvider.language,
      mode,
      model: aiProvider.model,
      pitch: aiProvider.pitch,
      pronunciationDict: aiProvider.pronunciationDict,
      providerId: aiProvider.providerId,
      providerPresetId: aiProvider.providerPresetId,
      rate: aiProvider.speed,
      speed: aiProvider.speed,
      subtitle: aiProvider.subtitle,
      text,
      transportPreference,
      voice: aiProvider.voice,
      voiceId: aiProvider.voiceId,
      volume: aiProvider.voiceVolume
    };

    const response =
      mode === 'complete'
        ? await executor.synthesize(request)
        : await this.synthesizeAIProviderStream(request, executor);
    const artifact = response.artifacts?.[0];
    const buffer = await readAudioArtifactToBuffer(artifact);

    if (!buffer) {
      throw new Error('AI Provider speech synthesis returned no local audio payload');
    }

    const format = normalizeFormat(artifact?.format || aiProvider.audioSetting?.format);
    return {
      buffer,
      cacheMeta: {
        config: buildAiProviderCacheConfig(aiProvider),
        durationMs: artifact?.durationMs,
        extension: extensionFromMimeOrFormat(format, artifact?.mimeType),
        mimeType: artifact?.mimeType,
        text
      }
    };
  }

  private async synthesizeAIProviderStream(request: Parameters<SpriteSpeechSynthesisExecutor['synthesize']>[0], executor: SpriteSpeechSynthesisExecutor): Promise<Awaited<ReturnType<SpriteSpeechSynthesisExecutor['synthesize']>>> {
    if (!executor.stream) {
      throw new Error('Selected AI Provider speech synthesis mode requires streaming support');
    }

    if (request.mode === 'duplex-stream') {
      async function* input(): AsyncIterable<{ type: 'text'; text: string } | { type: 'close' }> {
        if (request.text) {
          yield { type: 'text', text: request.text };
        }
        yield { type: 'close' };
      }
      return executor.stream({ ...request, text: undefined }, () => {}, input());
    }

    return executor.stream(request, () => {});
  }
}

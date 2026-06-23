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
  SpriteSpeakAIProviderConfig,
  SpriteSpeakConfig,
  SpriteSpeakEngine,
  SpriteSpeakPayload,
  SpriteSpeakPlaybackContext,
  SpriteSpeechSynthesisExecutor
} from './types';

type SynthesisOutput = {
  buffer: Buffer;
  cacheMeta: SpeakCacheMetadata;
};

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

export class SpeakService {
  private configStore: SpeakConfigStore;
  private cache: SpeakCache;
  private edgeTTS: EdgeTTS;
  private speechSynthesisExecutor?: SpriteSpeechSynthesisExecutor;
  private initialized = false;

  /** 回调：通知渲染进程播放音频 */
  private onPlayAudio: ((payload: SpriteSpeakPayload, context?: SpriteSpeakPlaybackContext) => void) | null = null;

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

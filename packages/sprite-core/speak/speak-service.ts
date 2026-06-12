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
import type { SpeakResult, SpriteSpeakConfig, SpriteSpeakPayload, SpriteSpeakPlaybackContext } from './types';

export class SpeakService {
  private configStore: SpeakConfigStore;
  private cache: SpeakCache;
  private edgeTTS: EdgeTTS;
  private initialized = false;

  /** 回调：通知渲染进程播放音频 */
  private onPlayAudio: ((payload: SpriteSpeakPayload, context?: SpriteSpeakPlaybackContext) => void) | null = null;

  constructor(dataDir: string) {
    this.configStore = new SpeakConfigStore(dataDir);
    this.cache = new SpeakCache(dataDir);
    this.edgeTTS = new EdgeTTS();
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

    // 生成缓存 ID
    const cacheId = SpeakCache.generateCacheId(
      {
        serviceType: config.serviceType,
        voiceName: config.voiceName,
        rate: config.rate,
        pitch: config.pitch
      },
      sanitizedText
    );

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
      const audioBuffer = await this.synthesizeWithService(sanitizedText, config);

      if (!audioBuffer || audioBuffer.length === 0) {
        return { success: false, error: 'Synthesis returned empty audio' };
      }

      // 存入缓存
      const audioPath = await this.cache.put(cacheId, audioBuffer, {
        text: sanitizedText,
        serviceType: config.serviceType,
        voiceName: config.voiceName,
        rate: config.rate,
        pitch: config.pitch
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
  private async synthesizeWithService(text: string, config: SpriteSpeakConfig): Promise<Buffer> {
    switch (config.serviceType) {
      case 'Edge':
      default: {
        const result = await this.edgeTTS.textToSpeech({
          text,
          rate: config.rate,
          pitch: config.pitch,
          voiceName: config.voiceName
        });

        if (Buffer.isBuffer(result)) {
          return result;
        }

        // result 是 string 时表示错误信息
        throw new Error(typeof result === 'string' ? result : 'Edge TTS synthesis failed');
      }
    }
  }
}

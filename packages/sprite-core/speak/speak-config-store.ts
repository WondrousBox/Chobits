/**
 * Sprite Speak Config Store
 *
 * 持久化存储精灵语音合成配置
 * 存储位置: <userData>/data/sprite-speak-config.json
 */

import fs from 'node:fs';
import path from 'node:path';

import { DEFAULT_AI_PROVIDER_SPEAK_CONFIG, DEFAULT_SPEAK_CONFIG, type SpriteSpeakAIProviderConfig, type SpriteSpeakConfig, type SpriteSpeakEngine } from './types';

function isRecord(value: unknown): value is Record<string, any> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeEngine(parsed: Record<string, any>): SpriteSpeakEngine {
    const raw = String(parsed.engine || '').trim();
    if (raw === 'ai-provider') return 'ai-provider';
    if (raw === 'edge') return 'edge';
    return String(parsed.serviceType || DEFAULT_SPEAK_CONFIG.serviceType) === 'Edge' ? 'edge' : 'ai-provider';
}

function normalizeAiProviderConfig(raw: unknown): SpriteSpeakAIProviderConfig {
    const source = isRecord(raw) ? raw : {};
    const audioSetting = isRecord(source.audioSetting) ? source.audioSetting : {};
    const subtitle = isRecord(source.subtitle) ? source.subtitle : undefined;
    const extras = isRecord(source.extras) ? source.extras : undefined;

    return {
        ...DEFAULT_AI_PROVIDER_SPEAK_CONFIG,
        providerId: typeof source.providerId === 'string' && source.providerId.trim() ? source.providerId.trim() : DEFAULT_AI_PROVIDER_SPEAK_CONFIG.providerId,
        providerPresetId: typeof source.providerPresetId === 'string' && source.providerPresetId.trim() ? source.providerPresetId.trim() : undefined,
        model: typeof source.model === 'string' && source.model.trim() ? source.model.trim() : DEFAULT_AI_PROVIDER_SPEAK_CONFIG.model,
        voiceId: typeof source.voiceId === 'string' && source.voiceId.trim() ? source.voiceId.trim() : DEFAULT_AI_PROVIDER_SPEAK_CONFIG.voiceId,
        voice: typeof source.voice === 'string' && source.voice.trim() ? source.voice.trim() : undefined,
        language: typeof source.language === 'string' && source.language.trim() ? source.language.trim() : undefined,
        mode: source.mode === 'output-stream' || source.mode === 'duplex-stream' ? source.mode : 'complete',
        transportPreference:
            source.transportPreference === 'http' || source.transportPreference === 'http-stream' || source.transportPreference === 'websocket' ? source.transportPreference : 'auto',
        audioSetting: {
            ...DEFAULT_AI_PROVIDER_SPEAK_CONFIG.audioSetting,
            ...(audioSetting || {})
        },
        speed: typeof source.speed === 'number' && Number.isFinite(source.speed) ? source.speed : DEFAULT_AI_PROVIDER_SPEAK_CONFIG.speed,
        pitch: typeof source.pitch === 'number' && Number.isFinite(source.pitch) ? source.pitch : DEFAULT_AI_PROVIDER_SPEAK_CONFIG.pitch,
        voiceVolume: typeof source.voiceVolume === 'number' && Number.isFinite(source.voiceVolume) ? source.voiceVolume : DEFAULT_AI_PROVIDER_SPEAK_CONFIG.voiceVolume,
        emotion: typeof source.emotion === 'string' && source.emotion.trim() ? source.emotion.trim() : undefined,
        subtitle: subtitle ? { ...subtitle } : undefined,
        pronunciationDict: isRecord(source.pronunciationDict) ? source.pronunciationDict : undefined,
        extras
    };
}

export class SpeakConfigStore {
    private filePath: string;
    private config: SpriteSpeakConfig;

    constructor(dataDir: string) {
        const settingsDir = path.join(dataDir, 'data');
        this.filePath = path.join(settingsDir, 'sprite-speak-config.json');
        this.config = { ...DEFAULT_SPEAK_CONFIG };
    }

    /** 加载配置 */
    load(): SpriteSpeakConfig {
        try {
            if (fs.existsSync(this.filePath)) {
                const raw = fs.readFileSync(this.filePath, 'utf-8');
                const parsed = JSON.parse(raw);
                this.config = {
                    enabled: parsed.enabled ?? DEFAULT_SPEAK_CONFIG.enabled,
                    engine: normalizeEngine(parsed),
                    serviceType: parsed.serviceType ?? DEFAULT_SPEAK_CONFIG.serviceType,
                    voiceName: parsed.voiceName ?? DEFAULT_SPEAK_CONFIG.voiceName,
                    rate: parsed.rate ?? DEFAULT_SPEAK_CONFIG.rate,
                    pitch: parsed.pitch ?? DEFAULT_SPEAK_CONFIG.pitch,
                    volume: parsed.volume ?? DEFAULT_SPEAK_CONFIG.volume,
                    aiProvider: normalizeAiProviderConfig(parsed.aiProvider)
                };
            }
        } catch (err) {
            console.error('[SpeakConfigStore] Failed to load config:', err);
            this.config = { ...DEFAULT_SPEAK_CONFIG };
        }
        return this.config;
    }

    /** 保存配置 */
    save(): void {
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.filePath, JSON.stringify(this.config, null, 2), 'utf-8');
        } catch (err) {
            console.error('[SpeakConfigStore] Failed to save config:', err);
        }
    }

    /** 获取当前配置 */
    getConfig(): SpriteSpeakConfig {
        return { ...this.config };
    }

    /** 更新配置（部分更新） */
    setConfig(partial: Partial<SpriteSpeakConfig>): SpriteSpeakConfig {
        this.config = {
            ...this.config,
            ...partial,
            engine: partial.engine || this.config.engine,
            aiProvider: partial.aiProvider ? normalizeAiProviderConfig({ ...this.config.aiProvider, ...partial.aiProvider }) : this.config.aiProvider
        };
        this.save();
        return { ...this.config };
    }

    /** 重置为默认配置 */
    reset(): SpriteSpeakConfig {
        this.config = { ...DEFAULT_SPEAK_CONFIG };
        this.save();
        return { ...this.config };
    }
}

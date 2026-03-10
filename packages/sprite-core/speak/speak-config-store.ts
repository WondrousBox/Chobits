/**
 * Sprite Speak Config Store
 *
 * 持久化存储精灵语音合成配置
 * 存储位置: <userData>/data/sprite-speak-config.json
 */

import fs from 'node:fs';
import path from 'node:path';

import { DEFAULT_SPEAK_CONFIG, type SpriteSpeakConfig } from './types';

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
                    serviceType: parsed.serviceType ?? DEFAULT_SPEAK_CONFIG.serviceType,
                    voiceName: parsed.voiceName ?? DEFAULT_SPEAK_CONFIG.voiceName,
                    rate: parsed.rate ?? DEFAULT_SPEAK_CONFIG.rate,
                    pitch: parsed.pitch ?? DEFAULT_SPEAK_CONFIG.pitch,
                    volume: parsed.volume ?? DEFAULT_SPEAK_CONFIG.volume
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
        this.config = { ...this.config, ...partial };
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

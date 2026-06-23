/**
 * Sprite Speak Cache
 *
 * 基于 MD5(config + text) 的音频文件缓存系统
 * 相同配置 + 相同文本 = 相同缓存 ID，避免重复合成
 *
 * 存储位置: <userData>/data/sprite-speak-cache/
 *   ├── cache-index.json
 *   └── <cacheId>.<audio-format>
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import type { SpeakCacheIndex, SpeakCacheMetadata } from './types';

function stableJson(value: unknown): string {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableJson(item)).join(',')}]`;
    }
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
        .sort()
        .filter((key) => record[key] !== undefined)
        .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
        .join(',')}}`;
}

function normalizeExtension(extension?: string): string {
    const raw = String(extension || 'mp3')
        .trim()
        .toLowerCase()
        .replace(/^\./, '');
    if (!raw) return 'mp3';
    if (raw.includes('wav')) return 'wav';
    if (raw.includes('flac')) return 'flac';
    if (raw.includes('aac')) return 'aac';
    if (raw.includes('m4a') || raw.includes('mp4')) return 'm4a';
    if (raw.includes('ogg') || raw.includes('opus')) return 'ogg';
    if (raw.includes('pcm')) return 'pcm';
    if (raw.includes('mpeg') || raw.includes('mp3')) return 'mp3';
    return raw.replace(/[^a-z0-9]/g, '') || 'mp3';
}

export class SpeakCache {
    private cacheDir: string;
    private indexPath: string;
    private index: SpeakCacheIndex;

    constructor(dataDir: string) {
        this.cacheDir = path.join(dataDir, 'data', 'sprite-speak-cache');
        this.indexPath = path.join(this.cacheDir, 'cache-index.json');
        this.index = { version: 1, entries: {} };
    }

    /** 初始化缓存目录并加载索引 */
    async init(): Promise<void> {
        // 确保目录存在
        if (!fs.existsSync(this.cacheDir)) {
            await fsp.mkdir(this.cacheDir, { recursive: true });
        }

        // 加载索引
        try {
            if (fs.existsSync(this.indexPath)) {
                const raw = await fsp.readFile(this.indexPath, 'utf-8');
                const parsed = JSON.parse(raw) as SpeakCacheIndex;
                this.index = {
                    version: parsed.version ?? 1,
                    entries: parsed.entries ?? {}
                };
            }
        } catch (err) {
            console.error('[SpeakCache] Failed to load index:', err);
            this.index = { version: 1, entries: {} };
        }
    }

    /**
     * 生成缓存 ID
     * 根据 TTS 配置 + 文本内容生成唯一 MD5 hash
     */
    static generateCacheId(config: Record<string, unknown>, text: string): string {
        const legacyEdgeShape =
            !('engine' in config) &&
            Object.prototype.hasOwnProperty.call(config, 'serviceType') &&
            Object.prototype.hasOwnProperty.call(config, 'voiceName') &&
            Object.prototype.hasOwnProperty.call(config, 'rate') &&
            Object.prototype.hasOwnProperty.call(config, 'pitch');
        const key = legacyEdgeShape
            ? JSON.stringify({
                  serviceType: config.serviceType,
                  voiceName: config.voiceName,
                  rate: config.rate,
                  pitch: config.pitch,
                  text
              })
            : stableJson({
                  ...config,
                  text
              });
        return createHash('md5').update(key).digest('hex');
    }

    /**
     * 查询缓存
     * @returns 音频文件绝对路径，或 null（未命中）
     */
    get(cacheId: string): string | null {
        const entry = this.index.entries[cacheId];
        if (!entry) return null;

        const audioPath = path.join(this.cacheDir, entry.fileName);
        if (!fs.existsSync(audioPath)) {
            // 文件不存在，移除索引条目
            delete this.index.entries[cacheId];
            this.saveIndex();
            return null;
        }

        // 更新最后使用时间
        entry.lastUsedAt = Date.now();
        this.saveIndexDebounced();

        return audioPath;
    }

    /**
     * 存入缓存
     * @param cacheId 缓存 ID
     * @param audioBuffer 音频二进制数据
     * @param meta 元信息
     * @returns 保存后的音频文件绝对路径
     */
    async put(
        cacheId: string,
        audioBuffer: Buffer,
        meta: SpeakCacheMetadata
    ): Promise<string> {
        const fileName = `${cacheId}.${normalizeExtension(meta.extension)}`;
        const audioPath = path.join(this.cacheDir, fileName);

        // 写入音频文件
        await fsp.writeFile(audioPath, audioBuffer);

        // 更新索引
        const now = Date.now();
        this.index.entries[cacheId] = {
            cacheId,
            text: meta.text,
            config: meta.config,
            durationMs: meta.durationMs,
            fileName,
            mimeType: meta.mimeType,
            createdAt: now,
            lastUsedAt: now
        };

        await this.saveIndex();
        return audioPath;
    }

    /** 删除缓存条目 */
    async remove(cacheId: string): Promise<void> {
        const entry = this.index.entries[cacheId];
        if (entry) {
            const audioPath = path.join(this.cacheDir, entry.fileName);
            try {
                if (fs.existsSync(audioPath)) {
                    await fsp.unlink(audioPath);
                }
            } catch {
                /* ignore */
            }
            delete this.index.entries[cacheId];
            await this.saveIndex();
        }
    }

    /** 清空所有缓存 */
    async clear(): Promise<void> {
        for (const entry of Object.values(this.index.entries)) {
            try {
                const audioPath = path.join(this.cacheDir, entry.fileName);
                if (fs.existsSync(audioPath)) {
                    await fsp.unlink(audioPath);
                }
            } catch {
                /* ignore */
            }
        }
        this.index.entries = {};
        await this.saveIndex();
    }

    /** 获取缓存统计 */
    getStats(): { totalEntries: number; totalSizeBytes: number } {
        let totalSizeBytes = 0;
        for (const entry of Object.values(this.index.entries)) {
            try {
                const audioPath = path.join(this.cacheDir, entry.fileName);
                if (fs.existsSync(audioPath)) {
                    totalSizeBytes += fs.statSync(audioPath).size;
                }
            } catch {
                /* ignore */
            }
        }
        return {
            totalEntries: Object.keys(this.index.entries).length,
            totalSizeBytes
        };
    }

    /** 获取缓存目录路径 */
    getCacheDir(): string {
        return this.cacheDir;
    }

    // ============================================================================
    // 内部方法
    // ============================================================================

    private async saveIndex(): Promise<void> {
        try {
            await fsp.writeFile(this.indexPath, JSON.stringify(this.index, null, 2), 'utf-8');
        } catch (err) {
            console.error('[SpeakCache] Failed to save index:', err);
        }
    }

    private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    private saveIndexDebounced(): void {
        if (this.saveDebounceTimer) clearTimeout(this.saveDebounceTimer);
        this.saveDebounceTimer = setTimeout(() => {
            this.saveIndex();
            this.saveDebounceTimer = null;
        }, 5_000);
    }
}

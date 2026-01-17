/**
 * Simple Memory Provider
 *
 * 简单的内存提供者实现
 * 支持会话记忆和持久化记忆的两层架构
 */

import type { KVStore, MemoryProvider } from '../interfaces/memory-provider';
import type { MemoryItem, MemoryOptions } from '../types';

/**
 * 内存缓存项
 */
interface CacheItem {
  value: unknown;
  expiry: number;
  metadata?: Record<string, unknown>;
}

/**
 * 简单内存提供者
 *
 * @description
 * 实现两层记忆架构：
 * - 会话记忆：存储在内存中，有 TTL
 * - 持久记忆：存储在外部 KVStore（可选）
 *
 * @example
 * ```typescript
 * const memory = new SimpleMemoryProvider();
 *
 * // 设置会话记忆
 * await memory.set('session:123:context', { messages: [] });
 *
 * // 设置持久记忆
 * await memory.set('user:prefs', { theme: 'dark' }, { persist: true });
 * ```
 */
export class SimpleMemoryProvider implements MemoryProvider {
  private cache: Map<string, CacheItem> = new Map();
  private persistent?: KVStore;
  private cleanupInterval?: NodeJS.Timeout;

  /**
   * 构造函数
   *
   * @param persistent - 持久化存储（可选）
   * @param options - 配置选项
   */
  constructor(
    persistent?: KVStore,
    options?: {
      /** 清理间隔（毫秒），默认 60000 */
      cleanupIntervalMs?: number;
      /** 默认 TTL（秒），默认 3600 */
      defaultTtl?: number;
    }
  ) {
    this.persistent = persistent;

    // 启动定期清理
    const intervalMs = options?.cleanupIntervalMs ?? 60000;
    if (intervalMs > 0) {
      this.cleanupInterval = setInterval(() => this.cleanup(), intervalMs);
    }
  }

  /**
   * 获取记忆
   *
   * @param key - 记忆键
   * @returns 记忆值，不存在则返回 undefined
   */
  async get(key: string): Promise<unknown> {
    // 1. 先查会话记忆
    const cached = this.cache.get(key);
    if (cached) {
      // 检查是否过期
      if (cached.expiry > Date.now()) {
        return cached.value;
      }
      // 过期则删除
      this.cache.delete(key);
    }

    // 2. 再查持久记忆
    if (this.persistent) {
      const persistentValue = await this.persistent.get(key);
      if (persistentValue !== undefined) {
        // 提升到会话记忆（1 小时）
        this.cache.set(key, {
          value: persistentValue,
          expiry: Date.now() + 3600000
        });
        return persistentValue;
      }
    }

    return undefined;
  }

  /**
   * 设置记忆
   *
   * @param key - 记忆键
   * @param value - 记忆值
   * @param options - 配置选项
   */
  async set(key: string, value: unknown, options?: MemoryOptions): Promise<void> {
    const ttl = options?.ttl ?? 3600; // 默认 1 小时

    // 1. 写入会话记忆
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttl * 1000,
      metadata: options?.metadata
    });

    // 2. 如果需要持久化
    if (options?.persist && this.persistent) {
      await this.persistent.set(key, value, ttl);
    }
  }

  /**
   * 删除记忆
   *
   * @param key - 记忆键
   */
  async delete(key: string): Promise<void> {
    this.cache.delete(key);
    if (this.persistent) {
      await this.persistent.delete(key);
    }
  }

  /**
   * 清理会话
   *
   * @param sessionId - 会话 ID
   */
  async clear(sessionId: string): Promise<void> {
    const prefix = `session:${sessionId}`;
    const keysToDelete: string[] = [];

    // 收集要删除的键
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }

    // 删除键
    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * 列出所有键
   *
   * @param prefix - 键前缀过滤
   * @returns 匹配的键列表
   */
  async keys(prefix?: string): Promise<string[]> {
    const allKeys: string[] = [];

    for (const key of this.cache.keys()) {
      if (!prefix || key.startsWith(prefix)) {
        // 检查是否过期
        const item = this.cache.get(key);
        if (item && item.expiry > Date.now()) {
          allKeys.push(key);
        }
      }
    }

    return allKeys;
  }

  /**
   * 检查键是否存在
   *
   * @param key - 记忆键
   * @returns 是否存在
   */
  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== undefined;
  }

  /**
   * 获取缓存大小
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * 清理过期记忆
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, item] of this.cache) {
      if (item.expiry <= now) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * 销毁实例
   *
   * @description
   * 清理定时器等资源。
   * 在不再使用时调用。
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.cache.clear();
  }

  /**
   * 获取所有缓存项（仅用于调试）
   */
  getAll(): Map<string, { value: unknown; expiry: number }> {
    const result = new Map<string, { value: unknown; expiry: number }>();
    const now = Date.now();

    for (const [key, item] of this.cache) {
      if (item.expiry > now) {
        result.set(key, { value: item.value, expiry: item.expiry });
      }
    }

    return result;
  }
}

/**
 * 内存 KV 存储
 *
 * @description
 * 简单的内存 KV 存储实现。
 * 用于测试或不需要真正持久化的场景。
 */
export class InMemoryKVStore implements KVStore {
  private store: Map<string, { value: unknown; expiry?: number }> = new Map();

  async get(key: string): Promise<unknown> {
    const item = this.store.get(key);
    if (!item) return undefined;

    // 检查过期
    if (item.expiry && item.expiry <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }

    return item.value;
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiry: ttl ? Date.now() + ttl * 1000 : undefined
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== undefined;
  }

  async keys(prefix?: string): Promise<string[]> {
    const result: string[] = [];
    for (const key of this.store.keys()) {
      if (!prefix || key.startsWith(prefix)) {
        result.push(key);
      }
    }
    return result;
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

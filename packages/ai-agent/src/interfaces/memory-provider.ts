/**
 * Memory Provider 接口
 *
 * 定义记忆系统的标准接口
 * 支持会话记忆和持久化记忆
 */

import type { MemoryItem, MemoryOptions } from '../types';

/**
 * 记忆提供者接口
 *
 * @description
 * 定义 Agent 记忆系统的标准接口。
 * 支持两层记忆架构：
 * - 会话记忆：临时存储，会话结束自动清理
 * - 持久记忆：跨会话存储，用户偏好、学习结果等
 *
 * @example
 * ```typescript
 * class MyMemoryProvider implements MemoryProvider {
 *   async get(key: string): Promise<unknown> {
 *     // 获取记忆
 *   }
 *
 *   async set(key: string, value: unknown, options?: MemoryOptions): Promise<void> {
 *     // 设置记忆
 *   }
 * }
 * ```
 */
export interface MemoryProvider {
  /**
   * 获取记忆
   *
   * @param key - 记忆键
   * @returns 记忆值，不存在则返回 undefined
   *
   * @description
   * 按优先级查找：
   * 1. 先查会话记忆
   * 2. 再查持久记忆（如果配置了）
   */
  get(key: string): Promise<unknown>;

  /**
   * 设置记忆
   *
   * @param key - 记忆键
   * @param value - 记忆值
   * @param options - 配置选项（持久化、TTL 等）
   *
   * @description
   * 默认存储到会话记忆。
   * 如果 options.persist 为 true，则同时存储到持久记忆。
   */
  set(key: string, value: unknown, options?: MemoryOptions): Promise<void>;

  /**
   * 语义搜索（可选）
   *
   * @param query - 搜索查询
   * @param limit - 返回结果数量限制
   * @returns 匹配的记忆项，按相关性排序
   *
   * @description
   * 基于向量相似度的语义搜索。
   * 需要底层存储支持向量索引。
   */
  search?(query: string, limit?: number): Promise<MemoryItem[]>;

  /**
   * 删除记忆（可选）
   *
   * @param key - 记忆键
   */
  delete?(key: string): Promise<void>;

  /**
   * 清理会话（可选）
   *
   * @param sessionId - 会话 ID
   *
   * @description
   * 清理指定会话的所有临时记忆。
   * 通常在会话结束时调用。
   */
  clear?(sessionId: string): Promise<void>;

  /**
   * 列出所有记忆键（可选）
   *
   * @param prefix - 键前缀过滤
   * @returns 匹配的键列表
   */
  keys?(prefix?: string): Promise<string[]>;
}

/**
 * KV 存储接口
 *
 * @description
 * 简单的键值存储接口，用于持久化记忆。
 * 可以用 SQLite、Redis、文件系统等实现。
 */
export interface KVStore {
  /**
   * 获取值
   */
  get(key: string): Promise<unknown>;

  /**
   * 设置值
   *
   * @param key - 键
   * @param value - 值
   * @param ttl - 过期时间（秒），可选
   */
  set(key: string, value: unknown, ttl?: number): Promise<void>;

  /**
   * 删除值
   */
  delete(key: string): Promise<void>;

  /**
   * 检查键是否存在
   */
  has?(key: string): Promise<boolean>;

  /**
   * 列出所有键
   */
  keys?(prefix?: string): Promise<string[]>;
}

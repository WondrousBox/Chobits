/**
 * AnimationRegistry — 动画注册表
 *
 * 统一管理所有精灵动画资源的索引：
 * 1. 按事件类型查找动画
 * 2. 支持优先级（多个动画匹配时选最优）
 * 3. 支持条件动画（根据好感度、心情等选择不同版本）
 * 4. 动画预加载管理
 *
 * 与 SpritePlayerContext 配合：
 * - AnimationRegistry 负责"哪个动画该播放" (逻辑层)
 * - SpritePlayerContext 负责"如何播放" (渲染层)
 */

import type { PersonaState } from './persona-state';
import type { SpriteMovementConfig } from './types';

// ============ 类型定义 ============

/** 动画定义（对应原 SpriteAnimation，精简版） */
export interface AnimationEntry {
  id: string;
  title: string;
  description?: string;

  /** 关联的事件类型（可多个） */
  eventTypes: string[];

  /** 优先级（同事件类型有多个动画时，优先级高的优先选择） */
  priority?: number;

  /** 条件：只有满足条件时才选用此动画 */
  condition?: (personaState: PersonaState) => boolean;

  /** 动画源信息（供渲染器使用） */
  source: {
    src?: string;
    localPath?: string;
    type?: string;
  };

  /** 播放参数 */
  playback: {
    width?: number;
    height?: number;
    padding?: number;
    loop?: boolean;
    loopStartMs?: number;
    loopEndMs?: number;
    durationMs?: number;
    autoIdle?: boolean;
    /** 动画播放时的窗口移动配置 */
    movement?: SpriteMovementConfig;
  };

  /** 元数据 */
  tags?: string[];
  deletable?: boolean;
  coverSrc?: string;
}

/** 查询选项 */
export interface AnimationQuery {
  /** 事件类型 */
  eventType: string;
  /** 人格状态（用于条件匹配） */
  personaState?: PersonaState;
  /** 是否允许 fallback 到默认 */
  allowFallback?: boolean;
}

// ============ AnimationRegistry 实现 ============

export class AnimationRegistry {
  private animations = new Map<string, AnimationEntry>();
  /** 按事件类型索引（一个事件类型可关联多个动画） */
  private eventIndex = new Map<string, Set<string>>();

  // ============ 公共 API ============

  /** 注册动画 */
  register(entry: AnimationEntry): void {
    const existing = this.animations.get(entry.id);
    if (existing) {
      for (const event of existing.eventTypes) {
        const ids = this.eventIndex.get(event);
        if (!ids) continue;
        ids.delete(entry.id);
        if (ids.size === 0) {
          this.eventIndex.delete(event);
        }
      }
    }

    this.animations.set(entry.id, entry);
    for (const event of entry.eventTypes) {
      if (!this.eventIndex.has(event)) {
        this.eventIndex.set(event, new Set());
      }
      this.eventIndex.get(event)!.add(entry.id);
    }
  }

  /** 批量注册 */
  registerAll(entries: AnimationEntry[]): void {
    for (const e of entries) {
      this.register(e);
    }
  }

  /** 注销动画 */
  unregister(id: string): void {
    const entry = this.animations.get(id);
    if (!entry) return;
    for (const event of entry.eventTypes) {
      const ids = this.eventIndex.get(event);
      if (!ids) continue;
      ids.delete(id);
      if (ids.size === 0) {
        this.eventIndex.delete(event);
      }
    }
    this.animations.delete(id);
  }

  /** 按 ID 获取 */
  get(id: string): AnimationEntry | undefined {
    return this.animations.get(id);
  }

  /** 获取所有动画 */
  getAll(): AnimationEntry[] {
    return Array.from(this.animations.values());
  }

  /** 按事件类型查找最佳动画 */
  findByEvent(query: AnimationQuery): AnimationEntry | undefined {
    const { eventType, personaState, allowFallback = true } = query;

    // 获取所有匹配此事件类型的动画
    const ids = this.eventIndex.get(eventType);

    console.log('===========event type', eventType, ids);

    if (!ids || ids.size === 0) {
      // fallback 到 idle
      if (allowFallback && eventType !== 'idle') {
        return this.findByEvent({ ...query, eventType: 'idle', allowFallback: false });
      }
      return undefined;
    }

    // 过滤并排序
    const candidates: AnimationEntry[] = [];
    for (const id of ids) {
      const entry = this.animations.get(id);
      if (!entry) continue;

      // 条件检查
      if (entry.condition && personaState) {
        if (!entry.condition(personaState)) continue;
      }

      candidates.push(entry);
    }

    if (candidates.length === 0) {
      if (allowFallback && eventType !== 'idle') {
        return this.findByEvent({ ...query, eventType: 'idle', allowFallback: false });
      }
      return undefined;
    }

    // 按优先级排序（高优先级在前）
    candidates.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    return candidates[0];
  }

  /** 按事件类型查找所有匹配动画（不只是最佳） */
  findAllByEvent(eventType: string): AnimationEntry[] {
    const ids = this.eventIndex.get(eventType);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.animations.get(id))
      .filter((e): e is AnimationEntry => !!e)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /** 获取所有已注册的事件类型 */
  getEventTypes(): string[] {
    return Array.from(this.eventIndex.keys());
  }

  /** 按标签查找 */
  findByTag(tag: string): AnimationEntry[] {
    return Array.from(this.animations.values()).filter((e) => e.tags?.includes(tag));
  }

  /** 清空注册表 */
  clear(): void {
    this.animations.clear();
    this.eventIndex.clear();
  }

  /** 获取统计信息 */
  getStats(): { totalAnimations: number; totalEventTypes: number; eventCoverage: Record<string, number> } {
    const coverage: Record<string, number> = {};
    for (const [event, ids] of this.eventIndex) {
      coverage[event] = ids.size;
    }
    return {
      totalAnimations: this.animations.size,
      totalEventTypes: this.eventIndex.size,
      eventCoverage: coverage
    };
  }
}

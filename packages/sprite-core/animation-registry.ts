/**
 * AnimationRegistry — 动画注册表
 *
 * 统一管理所有精灵动画资源的索引：
 * 1. 按 trigger 查找动画
 * 2. 支持优先级（多个动画匹配时选最优）
 * 3. 支持条件动画（根据好感度、心情等选择不同版本）
 * 4. 动画预加载管理
 *
 * 与 SpritePlayerContext 配合：
 * - AnimationRegistry 负责"哪个动画该播放" (逻辑层)
 * - SpritePlayerContext 负责"如何播放" (渲染层)
 */

import type { PersonaState } from './persona-state';
import type { SpriteAnimationTrigger, SpriteMovementConfig } from './types';

// ============ 类型定义 ============

/** 动画定义（对应原 SpriteAnimation，精简版） */
export interface AnimationEntry {
  id: string;
  title: string;
  description?: string;

  /** 关联的 trigger（可多个） */
  eventTypes: SpriteAnimationTrigger[];

  /** 优先级（同 trigger 有多个动画时，优先级高的优先选择） */
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
  /** 推荐字段：trigger */
  trigger?: SpriteAnimationTrigger;
  /** 人格状态（用于条件匹配） */
  personaState?: PersonaState;
  /** 是否允许 fallback 到默认 idle（仅状态机驱动的稳定态解析应启用） */
  allowFallback?: boolean;
}

// ============ AnimationRegistry 实现 ============

export class AnimationRegistry {
  private animations = new Map<string, AnimationEntry>();
  /** 按 trigger 索引（一个 trigger 可关联多个动画） */
  private triggerIndex = new Map<string, Set<string>>();

  // ============ 公共 API ============

  /** 注册动画 */
  register(entry: AnimationEntry): void {
    const existing = this.animations.get(entry.id);
    if (existing) {
      for (const trigger of existing.eventTypes) {
        const ids = this.triggerIndex.get(trigger);
        if (!ids) continue;
        ids.delete(entry.id);
        if (ids.size === 0) {
          this.triggerIndex.delete(trigger);
        }
      }
    }

    this.animations.set(entry.id, entry);
    for (const trigger of entry.eventTypes) {
      if (!this.triggerIndex.has(trigger)) {
        this.triggerIndex.set(trigger, new Set());
      }
      this.triggerIndex.get(trigger)!.add(entry.id);
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
    for (const trigger of entry.eventTypes) {
      const ids = this.triggerIndex.get(trigger);
      if (!ids) continue;
      ids.delete(id);
      if (ids.size === 0) {
        this.triggerIndex.delete(trigger);
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

  /** 按 trigger 查找最佳动画 */
  findByTrigger(query: AnimationQuery): AnimationEntry | undefined {
    return this.findCandidatesByTrigger(query)[0];
  }

  /** 按 trigger 查找全部候选动画，按优先级和注册顺序排序 */
  findCandidatesByTrigger(query: AnimationQuery): AnimationEntry[] {
    const trigger = query.trigger;
    if (!trigger) return [];

    const { personaState, allowFallback = false } = query;

    // 获取所有匹配此 trigger 的动画
    const ids = this.triggerIndex.get(trigger);

    if (!ids || ids.size === 0) {
      // fallback 到 idle
      if (allowFallback && trigger !== 'idle') {
        return this.findCandidatesByTrigger({ ...query, trigger: 'idle', allowFallback: false });
      }
      return [];
    }

    // 过滤并排序
    const candidates: Array<{ entry: AnimationEntry; index: number }> = [];
    let index = 0;
    for (const id of ids) {
      const entry = this.animations.get(id);
      if (!entry) continue;

      // 条件检查
      if (entry.condition && personaState) {
        if (!entry.condition(personaState)) continue;
      }

      candidates.push({ entry, index });
      index += 1;
    }

    if (candidates.length === 0) {
      if (allowFallback && trigger !== 'idle') {
        return this.findCandidatesByTrigger({ ...query, trigger: 'idle', allowFallback: false });
      }
      return [];
    }

    // 按优先级排序（高优先级在前）
    candidates.sort((a, b) => (b.entry.priority ?? 0) - (a.entry.priority ?? 0) || a.index - b.index);
    return candidates.map((candidate) => candidate.entry);
  }

  /** 按 trigger 查找所有匹配动画（不只是最佳） */
  findAllByTrigger(trigger: SpriteAnimationTrigger): AnimationEntry[] {
    return this.findCandidatesByTrigger({ trigger });
  }

  /** 获取所有已注册的 trigger */
  getTriggers(): string[] {
    return Array.from(this.triggerIndex.keys());
  }

  /** 按标签查找 */
  findByTag(tag: string): AnimationEntry[] {
    return Array.from(this.animations.values()).filter((e) => e.tags?.includes(tag));
  }

  /** 清空注册表 */
  clear(): void {
    this.animations.clear();
    this.triggerIndex.clear();
  }

  /** 获取统计信息 */
  getStats(): { totalAnimations: number; totalEventTypes: number; eventCoverage: Record<string, number> } {
    const coverage: Record<string, number> = {};
    for (const [trigger, ids] of this.triggerIndex) {
      coverage[trigger] = ids.size;
    }
    return {
      totalAnimations: this.animations.size,
      totalEventTypes: this.triggerIndex.size,
      eventCoverage: coverage
    };
  }
}

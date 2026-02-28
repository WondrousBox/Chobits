/**
 * InteractionTracker — 交互追踪器
 *
 * 职责：
 * 1. 记录所有用户与精灵的交互（点击、拖拽、文件放置、对话等）
 * 2. 计算交互频率、模式、偏好
 * 3. 提供交互统计给 PersonaStateManager 和 BehaviorEngine
 * 4. 支持滑动窗口统计（最近5分钟的交互密度等）
 *
 * 设计：
 * - 订阅 EventBus 中的 interact:* 事件自动记录
 * - 提供查询 API，不主动推送
 * - 内存中维护滑动窗口，定期清理
 */

import { SpriteEventBus, type SpritePersonaEvent } from './event-bus';

// ============ 类型定义 ============

/** 交互类型 */
export type InteractionType = 'click' | 'double-click' | 'drag' | 'hold' | 'hover' | 'file-drag-over' | 'file-drag-leave' | 'file-drop' | 'context-menu' | 'conversation' | 'walk-trigger' | 'custom';

/** 单次交互记录 */
export interface InteractionEvent {
  type: InteractionType;
  timestamp: number;
  /** 附加数据 */
  data?: Record<string, any>;
}

/** 交互统计 */
export interface InteractionStats {
  /** 总交互次数 */
  total: number;
  /** 按类型统计 */
  byType: Record<InteractionType, number>;
  /** 最近 N 分钟的交互次数（滑动窗口） */
  recentCount: number;
  /** 交互频率（次/分钟） */
  frequency: number;
  /** 最活跃的交互类型 */
  mostFrequent: InteractionType | null;
  /** 上次交互时间 */
  lastInteractionAt: number | null;
  /** 空闲时间（ms） */
  idleDuration: number;
  /** 今日交互次数 */
  todayCount: number;
}

/** 事件名到交互类型的映射 */
const EVENT_TO_INTERACTION: Record<string, InteractionType> = {
  'interact:click': 'click',
  'interact:double-click': 'double-click',
  'interact:drag:start': 'drag',
  'interact:drag:end': 'drag',
  'interact:hold:start': 'hold',
  'interact:hold:end': 'hold',
  'interact:hover:enter': 'hover',
  'interact:hover:leave': 'hover',
  'interact:file-drag-over': 'hover',
  'interact:file-drop': 'file-drop',
  'interact:context-menu': 'context-menu'
};

// ============ InteractionTracker 实现 ============

export class InteractionTracker {
  /** 滑动窗口中的交互事件 */
  private window: InteractionEvent[] = [];
  /** 历史统计（按类型累加） */
  private totalByType: Map<InteractionType, number> = new Map();
  /** 总计交互次数 */
  private totalCount = 0;
  /** 今日计数 */
  private todayCount = 0;
  private todayDate = '';
  /** 滑动窗口大小（ms） */
  private windowSize: number;
  /** 最大保留的窗口记录数 */
  private maxWindowSize: number;
  /** 上次交互时间 */
  private lastInteractionAt: number | null = null;

  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribe?: () => void;

  constructor(options?: {
    eventBus?: SpriteEventBus;
    /** 滑动窗口大小，默认 5 分钟 */
    windowSizeMs?: number;
    /** 最大窗口记录数，默认 500 */
    maxWindowSize?: number;
  }) {
    this.windowSize = options?.windowSizeMs ?? 5 * 60 * 1000;
    this.maxWindowSize = options?.maxWindowSize ?? 500;

    // 自动订阅事件
    if (options?.eventBus) {
      this.unsubscribe = options.eventBus.on('*', (event: SpritePersonaEvent) => {
        const interactionType = EVENT_TO_INTERACTION[event.type];
        if (interactionType) {
          this.record(interactionType, event.payload);
        }
      });
    }

    // 定期清理过期记录
    this.cleanupTimer = setInterval(() => this.cleanup(), 30000);
  }

  // ============ 公共 API ============

  /** 手动记录一次交互 */
  record(type: InteractionType, data?: Record<string, any>): void {
    const now = Date.now();
    this.window.push({ type, timestamp: now, data });
    this.lastInteractionAt = now;
    this.totalCount += 1;

    // 累加类型统计
    this.totalByType.set(type, (this.totalByType.get(type) ?? 0) + 1);

    // 今日统计
    const today = new Date().toISOString().slice(0, 10);
    if (this.todayDate !== today) {
      this.todayDate = today;
      this.todayCount = 0;
    }
    this.todayCount += 1;

    // 超过窗口大小时裁剪
    if (this.window.length > this.maxWindowSize) {
      this.window = this.window.slice(-Math.floor(this.maxWindowSize * 0.8));
    }
  }

  /** 获取完整统计 */
  getStats(): InteractionStats {
    this.cleanup();

    const now = Date.now();
    const recentEvents = this.window.filter((e) => now - e.timestamp <= this.windowSize);
    const recentCount = recentEvents.length;
    const windowMinutes = this.windowSize / 60000;
    const frequency = windowMinutes > 0 ? recentCount / windowMinutes : 0;

    // 找最活跃类型
    let mostFrequent: InteractionType | null = null;
    let maxCount = 0;
    for (const [type, count] of this.totalByType) {
      if (count > maxCount) {
        maxCount = count;
        mostFrequent = type;
      }
    }

    const byType: Record<InteractionType, number> = {
      click: 0,
      'double-click': 0,
      drag: 0,
      hold: 0,
      hover: 0,
      'file-drag-over': 0,
      'file-drag-leave': 0,
      'file-drop': 0,
      'context-menu': 0,
      conversation: 0,
      'walk-trigger': 0,
      custom: 0
    };
    for (const [type, count] of this.totalByType) {
      byType[type] = count;
    }

    return {
      total: this.totalCount,
      byType,
      recentCount,
      frequency: Math.round(frequency * 100) / 100,
      mostFrequent,
      lastInteractionAt: this.lastInteractionAt,
      idleDuration: this.lastInteractionAt ? now - this.lastInteractionAt : Infinity,
      todayCount: this.todayCount
    };
  }

  /** 获取空闲时间（ms） */
  getIdleDuration(): number {
    if (!this.lastInteractionAt) return Infinity;
    return Date.now() - this.lastInteractionAt;
  }

  /** 获取最近 N 秒内的交互数 */
  getRecentCount(ms: number): number {
    const cutoff = Date.now() - ms;
    return this.window.filter((e) => e.timestamp >= cutoff).length;
  }

  /** 获取最近 N 条交互记录 */
  getRecent(count: number): InteractionEvent[] {
    return this.window.slice(-count);
  }

  /** 检查用户是否处于活跃状态（最近 N 秒有交互） */
  isActive(thresholdMs?: number): boolean {
    const threshold = thresholdMs ?? 60000; // 默认 1 分钟
    return this.getIdleDuration() < threshold;
  }

  /** 重置统计 */
  reset(): void {
    this.window = [];
    this.totalByType.clear();
    this.totalCount = 0;
    this.todayCount = 0;
    this.lastInteractionAt = null;
  }

  /** 销毁 */
  destroy(): void {
    this.unsubscribe?.();
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.window = [];
  }

  // ============ 内部方法 ============

  /** 清理过期记录 */
  private cleanup(): void {
    const cutoff = Date.now() - this.windowSize;
    this.window = this.window.filter((e) => e.timestamp >= cutoff);
  }
}

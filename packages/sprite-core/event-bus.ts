/**
 * SpriteEventBus — 统一事件总线
 *
 * 替代原有的 spriteEvents.ts 简单 pub/sub，提供：
 * 1. 类型安全的事件定义
 * 2. 支持 priority（高优先级事件优先处理）
 * 3. 事件历史追溯（可选，用于 InteractionTracker）
 * 4. 通配符订阅（'*' 监听所有事件）
 *
 * 设计为纯 TS 类，不依赖 React。
 */

import type { SpriteInteractionEvent } from './interaction-contract';

export type { SpriteInteractionEvent } from './interaction-contract';

// ============ 事件类型定义 ============

/** 精灵状态相关事件 */
export type SpriteStateEvent = 'state:idle' | 'state:walking' | 'state:running' | 'state:dragging' | 'state:sleeping' | 'state:reacting';

/** 动画播放事件 */
export type SpriteAnimationEvent = 'anim:play' | 'anim:stop' | 'anim:complete' | 'anim:phase:intro' | 'anim:phase:loop' | 'anim:phase:outro';

/** 行为/AI 事件 */
export type SpriteBehaviorEvent = 'behavior:walk-triggered' | 'behavior:sleep-triggered' | 'behavior:bored-triggered' | 'behavior:message-triggered' | 'behavior:emotion-triggered' | 'ai:message-sent';

/** 人格成长事件 */
export type SpritePersonaProgressEvent =
  | 'persona:xp-gained'
  | 'persona:level-up'
  | 'persona:favor-changed'
  | 'persona:mood-changed'
  | 'persona:dimension-updated'
  | 'persona:achievement-unlocked'
  | 'persona:character-switched'
  | 'persona:skill-unlocked'
  | 'persona:daily-login'
  | 'persona:streak-bonus';

/** 系统事件 */
export type SpriteSystemEvent = 'system:init' | 'system:config-changed' | 'system:animation-loaded' | 'system:error';

/** 所有事件类型的联合 */
export type SpritePersonaEventType = SpriteStateEvent | SpriteInteractionEvent | SpriteAnimationEvent | SpriteBehaviorEvent | SpritePersonaProgressEvent | SpriteSystemEvent;

/** 事件载荷 */
export interface SpritePersonaEvent<T = any> {
  type: SpritePersonaEventType;
  payload?: T;
  timestamp: number;
  /** 可选的来源标识，用于调试 */
  source?: string;
}

/** 事件监听器 */
export type SpritePersonaEventListener<T = any> = (event: SpritePersonaEvent<T>) => void;

/** 事件监听器配置 */
interface ListenerEntry {
  listener: SpritePersonaEventListener;
  once: boolean;
  priority: number;
}

// ============ 事件总线实现 ============

export class SpriteEventBus {
  private listeners = new Map<string, ListenerEntry[]>();
  private history: SpritePersonaEvent[] = [];
  private maxHistory: number;
  private enabled = true;

  constructor(options?: { maxHistory?: number }) {
    this.maxHistory = options?.maxHistory ?? 200;
  }

  /**
   * 订阅事件
   * @param type 事件类型，或 '*' 监听所有
   * @param listener 回调
   * @param options priority 越大越先执行
   * @returns 取消订阅函数
   */
  on(type: SpritePersonaEventType | '*', listener: SpritePersonaEventListener, options?: { priority?: number }): () => void {
    return this._addListener(type, listener, false, options?.priority ?? 0);
  }

  /**
   * 只监听一次
   */
  once(type: SpritePersonaEventType | '*', listener: SpritePersonaEventListener, options?: { priority?: number }): () => void {
    return this._addListener(type, listener, true, options?.priority ?? 0);
  }

  /**
   * 发射事件
   */
  emit<T = any>(type: SpritePersonaEventType, payload?: T, source?: string): void {
    if (!this.enabled) return;

    const event: SpritePersonaEvent<T> = {
      type,
      payload,
      timestamp: Date.now(),
      source
    };

    // 记录历史
    this.history.push(event);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // 通知具体类型的监听器
    this._notifyListeners(type, event);
    // 通知通配符监听器
    this._notifyListeners('*', event);
  }

  /**
   * 获取事件历史
   */
  getHistory(filter?: { type?: SpritePersonaEventType; since?: number; limit?: number }): SpritePersonaEvent[] {
    let result = this.history;
    if (filter?.type) {
      result = result.filter((e) => e.type === filter.type);
    }
    if (filter?.since) {
      result = result.filter((e) => e.timestamp >= filter.since!);
    }
    if (filter?.limit) {
      result = result.slice(-filter.limit);
    }
    return [...result];
  }

  /**
   * 暂停/恢复事件分发
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * 清除所有监听器
   */
  clear(): void {
    this.listeners.clear();
  }

  /**
   * 清除事件历史
   */
  clearHistory(): void {
    this.history = [];
  }

  // --- 内部方法 ---

  private _addListener(type: string, listener: SpritePersonaEventListener, once: boolean, priority: number): () => void {
    const arr = this.listeners.get(type) ?? [];
    const entry: ListenerEntry = { listener, once, priority };
    arr.push(entry);
    // 按优先级降序排列
    arr.sort((a, b) => b.priority - a.priority);
    this.listeners.set(type, arr);

    return () => {
      const current = this.listeners.get(type);
      if (current) {
        const idx = current.indexOf(entry);
        if (idx >= 0) current.splice(idx, 1);
      }
    };
  }

  private _notifyListeners(type: string, event: SpritePersonaEvent): void {
    const entries = this.listeners.get(type);
    if (!entries || entries.length === 0) return;

    const toRemove: ListenerEntry[] = [];
    for (const entry of entries) {
      try {
        entry.listener(event);
      } catch (err) {
        console.error(`[SpriteEventBus] Error in listener for "${type}":`, err);
      }
      if (entry.once) {
        toRemove.push(entry);
      }
    }

    // 清理 once 监听器
    if (toRemove.length > 0) {
      const filtered = entries.filter((e) => !toRemove.includes(e));
      this.listeners.set(type, filtered);
    }
  }
}

/** 全局单例 - 精灵事件总线 */
export const spriteEventBus = new SpriteEventBus();

/**
 * BehaviorEngine — 行为引擎 v2
 *
 * 替代原有的 useBehaviorScheduler + createBehaviors，提供：
 * 1. 声明式行为定义 —— 条件 + 权重 + 优先级
 * 2. 基于状态的行为选择 —— 考虑当前状态、心情、好感度、时间
 * 3. 行为冲突解决 —— 高优先级行为可打断低优先级
 * 4. 行为冷却 —— 防止同一行为频繁触发
 * 5. 插件式扩展 —— 通过 register() 动态添加新行为
 *
 * 设计：
 * - 纯逻辑层，不依赖 React
 * - 通过 tick() 驱动，可以被 setInterval 或 rAF 调用
 * - 行为执行通过 EventBus 通知 UI 层
 */

import { SpriteEventBus } from './event-bus';
import type { InteractionStats } from './interaction-tracker';
import type { PersonaState } from './persona-state';
import type { SpriteState, SpriteStateMachine } from './state-machine';

// ============ 类型定义 ============

/** 行为优先级 */
export type BehaviorPriority = 'low' | 'normal' | 'high' | 'urgent';

const PRIORITY_VALUES: Record<BehaviorPriority, number> = {
  low: 1,
  normal: 2,
  high: 3,
  urgent: 4
};

/** 行为执行上下文 */
export interface BehaviorContext {
  /** 当前精灵状态 */
  spriteState: SpriteState;
  /** 人格状态快照 */
  personaState: PersonaState;
  /** 交互统计 */
  interactionStats: InteractionStats;
  /** 当前时间 */
  now: Date;
  /** 屏幕尺寸 */
  screenSize: { width: number; height: number };
  /** 精灵位置 */
  position?: [number, number];
  /** 自定义数据 */
  custom?: Record<string, any>;
}

/** 行为条件函数 */
export type BehaviorCondition = (ctx: BehaviorContext) => boolean;

/** 行为动作函数 */
export type BehaviorAction = (ctx: BehaviorContext) => void | Promise<void>;

/** 行为定义 */
export interface BehaviorDefinition {
  /** 唯一标识 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 是否启用 */
  enabled: boolean;
  /** 优先级 */
  priority: BehaviorPriority;

  // --- 触发控制 ---

  /** 调度类型 */
  schedule: {
    type: 'interval' | 'random' | 'cron-like';
    /** 固定间隔（ms），type='interval' 时使用 */
    intervalMs?: number;
    /** 随机间隔范围，type='random' 时使用 */
    minMs?: number;
    maxMs?: number;
    /** 时间窗口限制，如 { startHour: 22, endHour: 6 } 仅在夜间触发 */
    timeWindow?: { startHour: number; endHour: number };
  };

  /** 前置条件（所有必须为 true） */
  conditions: BehaviorCondition[];

  /** 触发概率 (0-1)，条件满足后的最终过滤 */
  probability?: number;

  /** 执行动作 */
  action: BehaviorAction;

  // --- 冷却与限制 ---

  /** 冷却时间（ms） */
  cooldownMs?: number;
  /** 每日执行上限 */
  dailyLimit?: number;

  // --- 状态约束 ---

  /** 仅在这些精灵状态下触发 */
  allowedStates?: SpriteState[];
  /** 在这些精灵状态下禁止触发 */
  blockedStates?: SpriteState[];

  // --- 游戏化约束 ---

  /** 最低好感度要求 */
  minFavor?: number;
  /** 最低等级要求 */
  minLevel?: number;
}

// ============ 行为运行时状态 ============

interface BehaviorRuntime {
  definition: BehaviorDefinition;
  lastRunAt: number;
  nextRunAt: number;
  dailyRunCount: number;
  dailyResetDate: string;
  isRunning: boolean;
}

// ============ 预置行为工厂 ============

/** 创建自动行走行为 */
export function createAutoWalkBehavior(walkAction: (ctx: BehaviorContext) => Promise<void>): BehaviorDefinition {
  return {
    id: 'auto-walk',
    name: '自动行走',
    enabled: true,
    priority: 'low',
    schedule: { type: 'random', minMs: 10000, maxMs: 25000 },
    conditions: [(ctx) => ctx.spriteState === 'idle' || ctx.spriteState === 'bored', (ctx) => ctx.interactionStats.idleDuration > 5000],
    probability: 0.8,
    action: walkAction,
    allowedStates: ['idle', 'bored'],
    blockedStates: ['dragging', 'sleeping', 'reacting']
  };
}

/** 创建夜间困倦行为 */
export function createSleepyBehavior(): BehaviorDefinition {
  return {
    id: 'night-sleepy',
    name: '夜间困倦',
    enabled: true,
    priority: 'normal',
    schedule: {
      type: 'interval',
      intervalMs: 60000, // 每分钟检查
      timeWindow: { startHour: 22, endHour: 6 }
    },
    conditions: [
      (ctx) => {
        const h = ctx.now.getHours();
        return h >= 22 || h < 6;
      }
    ],
    probability: 0.3,
    action: () => {
      // 通过 EventBus 触发，不直接操作状态机
    },
    allowedStates: ['idle'],
    blockedStates: ['dragging', 'walking', 'running']
  };
}

/** 创建长时间闲置困倦行为 */
export function createIdleSleepyBehavior(): BehaviorDefinition {
  return {
    id: 'idle-sleepy',
    name: '长时间闲置困倦',
    enabled: true,
    priority: 'normal',
    schedule: { type: 'interval', intervalMs: 15000 }, // 每15秒检查
    conditions: [
      (ctx) => ctx.interactionStats.idleDuration > 100000 // 100秒无交互
    ],
    probability: 0.5, // 50% 概率触发
    action: () => {
      // 通过 EventBus 触发困倦反应
    },
    allowedStates: ['idle'],
    blockedStates: ['dragging', 'walking', 'running', 'sleeping', 'reacting']
  };
}

/** 创建无聊行为 */
export function createBoredBehavior(): BehaviorDefinition {
  return {
    id: 'long-idle-bored',
    name: '长时间空闲',
    enabled: true,
    priority: 'low',
    schedule: { type: 'interval', intervalMs: 30000 },
    conditions: [
      (ctx) => ctx.interactionStats.idleDuration > 120000 // 2分钟无交互
    ],
    probability: 0.15,
    action: () => { },
    allowedStates: ['idle']
  };
}

/** 创建随机消息行为 */
export function createRandomMessageBehavior(): BehaviorDefinition {
  return {
    id: 'random-message',
    name: '随机消息',
    enabled: true,
    priority: 'low',
    schedule: { type: 'random', minMs: 300000, maxMs: 1800000 }, // 5-30分钟
    conditions: [(ctx) => ctx.spriteState === 'idle', (ctx) => ctx.interactionStats.idleDuration > 60000],
    probability: 1,
    action: () => { },
    allowedStates: ['idle'],
    blockedStates: ['dragging', 'walking', 'sleeping']
  };
}

/** 创建好感度衰减行为（长时间不使用） */
export function createFavorDecayBehavior(): BehaviorDefinition {
  return {
    id: 'favor-decay',
    name: '好感度自然衰减',
    enabled: true,
    priority: 'low',
    schedule: { type: 'interval', intervalMs: 3600000 }, // 每小时
    conditions: [
      (ctx) => ctx.interactionStats.idleDuration > 1800000, // 30 分钟无交互
      (ctx) => ctx.personaState.favor > 20 // 不低于 20
    ],
    probability: 1,
    action: () => { },
    allowedStates: ['idle', 'sleeping', 'bored'],
    dailyLimit: 5
  };
}

// ============ BehaviorEngine 实现 ============

export class BehaviorEngine {
  private behaviors: Map<string, BehaviorRuntime> = new Map();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private tickInterval: number;
  private eventBus?: SpriteEventBus;
  private stateMachine?: SpriteStateMachine;

  /** 上下文提供器：由 UI 层注入，每次 tick 调用获取最新上下文 */
  private contextProvider?: () => BehaviorContext | Promise<BehaviorContext>;

  constructor(options?: { eventBus?: SpriteEventBus; stateMachine?: SpriteStateMachine; tickIntervalMs?: number }) {
    this.eventBus = options?.eventBus;
    this.stateMachine = options?.stateMachine;
    this.tickInterval = options?.tickIntervalMs ?? 1000;
  }

  // ============ 公共 API ============

  /** 注册行为 */
  register(behavior: BehaviorDefinition): void {
    const now = Date.now();
    const nextRunAt = this.computeNextRun(behavior, now);

    this.behaviors.set(behavior.id, {
      definition: behavior,
      lastRunAt: 0,
      nextRunAt,
      dailyRunCount: 0,
      dailyResetDate: new Date().toISOString().slice(0, 10),
      isRunning: false
    });
  }

  /** 批量注册 */
  registerAll(behaviors: BehaviorDefinition[]): void {
    for (const b of behaviors) {
      this.register(b);
    }
  }

  /** 注销行为 */
  unregister(id: string): void {
    this.behaviors.delete(id);
  }

  /** 切换行为启用状态 */
  setEnabled(id: string, enabled: boolean): void {
    const runtime = this.behaviors.get(id);
    if (runtime) {
      runtime.definition.enabled = enabled;
    }
  }

  /** 获取所有已注册行为的状态 */
  getStatus(): Array<{
    id: string;
    name: string;
    enabled: boolean;
    lastRunAt: number;
    nextRunAt: number;
    dailyRunCount: number;
    isRunning: boolean;
  }> {
    return Array.from(this.behaviors.values()).map((r) => ({
      id: r.definition.id,
      name: r.definition.name,
      enabled: r.definition.enabled,
      lastRunAt: r.lastRunAt,
      nextRunAt: r.nextRunAt,
      dailyRunCount: r.dailyRunCount,
      isRunning: r.isRunning
    }));
  }

  /** 设置上下文提供器 */
  setContextProvider(provider: () => BehaviorContext | Promise<BehaviorContext>): void {
    this.contextProvider = provider;
  }

  /** 启动引擎（自动 tick） */
  start(): void {
    this.stop();
    this.tickTimer = setInterval(() => this.tick(), this.tickInterval);
  }

  /** 停止引擎 */
  stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  /** 手动执行一次 tick */
  async tick(): Promise<void> {
    if (!this.contextProvider) return;

    let ctx: BehaviorContext;
    try {
      ctx = await this.contextProvider();
    } catch {
      return;
    }

    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);

    // 按优先级排序，高优先级先评估
    const sorted = Array.from(this.behaviors.values())
      .filter((r) => r.definition.enabled && !r.isRunning)
      .sort((a, b) => PRIORITY_VALUES[b.definition.priority] - PRIORITY_VALUES[a.definition.priority]);

    for (const runtime of sorted) {
      const def = runtime.definition;

      // 检查时间
      if (now < runtime.nextRunAt) continue;

      // 重置每日计数
      if (runtime.dailyResetDate !== today) {
        runtime.dailyRunCount = 0;
        runtime.dailyResetDate = today;
      }

      // 每日上限
      if (def.dailyLimit != null && runtime.dailyRunCount >= def.dailyLimit) continue;

      // 冷却检查
      if (def.cooldownMs && now - runtime.lastRunAt < def.cooldownMs) continue;

      // 状态约束
      if (def.allowedStates && !def.allowedStates.includes(ctx.spriteState)) continue;
      if (def.blockedStates && def.blockedStates.includes(ctx.spriteState)) continue;

      // 游戏化约束
      if (def.minFavor != null && ctx.personaState.favor < def.minFavor) continue;
      if (def.minLevel != null && ctx.personaState.level < def.minLevel) continue;

      // 时间窗口
      if (def.schedule.timeWindow) {
        const h = ctx.now.getHours();
        const { startHour, endHour } = def.schedule.timeWindow;
        const inWindow = startHour < endHour ? h >= startHour && h < endHour : h >= startHour || h < endHour; // 跨午夜
        if (!inWindow) continue;
      }

      // 条件检查
      let conditionsMet = true;
      for (const cond of def.conditions) {
        try {
          if (!cond(ctx)) {
            conditionsMet = false;
            break;
          }
        } catch {
          conditionsMet = false;
          break;
        }
      }
      if (!conditionsMet) {
        // 条件不满足，重新调度
        runtime.nextRunAt = this.computeNextRun(def, now);
        continue;
      }

      // 概率过滤
      if (def.probability != null && Math.random() > def.probability) {
        runtime.nextRunAt = this.computeNextRun(def, now);
        continue;
      }

      // 执行行为
      runtime.isRunning = true;
      runtime.lastRunAt = now;
      runtime.dailyRunCount += 1;

      // 通过事件通知
      this.eventBus?.emit(`behavior:${def.id.replace(/[^a-z0-9-]/g, '-')}-triggered` as any, { behaviorId: def.id, name: def.name }, 'behavior-engine');

      try {
        await def.action(ctx);
      } catch (err) {
        console.error(`[BehaviorEngine] Action failed for ${def.id}:`, err);
      } finally {
        runtime.isRunning = false;
        runtime.nextRunAt = this.computeNextRun(def, now);
      }

      // 高优先级行为执行后，跳过本轮其余低优先级行为
      if (def.priority === 'urgent' || def.priority === 'high') {
        break;
      }
    }
  }

  /** 销毁 */
  destroy(): void {
    this.stop();
    this.behaviors.clear();
  }

  // ============ 内部方法 ============

  private computeNextRun(def: BehaviorDefinition, now: number): number {
    switch (def.schedule.type) {
      case 'interval':
        return now + (def.schedule.intervalMs ?? 1000);
      case 'random': {
        const min = def.schedule.minMs ?? 1000;
        const max = def.schedule.maxMs ?? 5000;
        return now + Math.random() * (max - min) + min;
      }
      case 'cron-like':
        // 简单实现：下一个整分钟
        return now + 60000 - (now % 60000);
      default:
        return now + 1000;
    }
  }
}

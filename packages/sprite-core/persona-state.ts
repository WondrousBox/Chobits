/**
 * PersonaStateManager — 人格化状态管理
 *
 * 管理桌面精灵的 RPG 数值系统：
 * - 经验值（XP）与等级（Level）
 * - 好感度（Favor）—— 0~100，影响精灵行为和对话风格
 * - 心情（Mood）—— 动态变化，影响动画选择和消息语气
 * - 连续登录与日常奖励
 * - 成就系统的钩子
 *
 * 设计原则：
 * - 所有数值变化都通过方法进行，自动做范围校验和事件广播
 * - 通过 EventBus 广播变化，UI 层订阅响应
 * - 状态持久化由外部负责（IPC → main process → DB/文件）
 * - 完全可配置的升级曲线和数值公式
 */

import { SpriteEventBus } from './event-bus';

// ============ 类型定义 ============

/** 心情类型 */
export type MoodType =
  | 'joyful' // 开心
  | 'content' // 满足
  | 'neutral' // 平静
  | 'bored' // 无聊
  | 'sad' // 难过
  | 'sleepy' // 困倦
  | 'excited' // 兴奋
  | 'curious' // 好奇
  | 'annoyed'; // 烦躁

/** 好感度等级 */
export type FavorLevel =
  | 'stranger' // 0-19   陌生人
  | 'acquaintance' // 20-39 认识
  | 'friend' // 40-59 朋友
  | 'close-friend' // 60-79 好友
  | 'bestie' // 80-94 挚友
  | 'soulmate'; // 95-100 灵魂伴侣

/** 等级配置 */
export interface LevelConfig {
  /** 每级所需 XP 的计算公式 */
  xpForLevel: (level: number) => number;
  /** 最大等级 */
  maxLevel: number;
}

/** 人格状态快照 */
export interface PersonaState {
  // 基础信息
  name: string;
  description?: string;

  // 经验系统
  xp: number;
  level: number;
  xpToNextLevel: number;

  // 好感度
  favor: number; // 0-100
  favorLevel: FavorLevel;

  // 心情
  mood: MoodType;
  moodIntensity: number; // 0-100，心情强度

  // 活跃统计
  totalInteractions: number;
  totalSessionTime: number; // 累计会话时间（秒）
  loginStreak: number; // 连续登录天数
  lastLoginDate: string; // YYYY-MM-DD

  // 成就
  achievements: string[]; // 已解锁的成就 ID

  // 时间戳
  createdAt: number;
  updatedAt: number;
}

/** 心情变化规则 */
export interface MoodRule {
  id: string;
  /** 触发条件 */
  trigger: (state: PersonaState, event?: string) => boolean;
  /** 目标心情 */
  targetMood: MoodType;
  /** 心情强度 0-100 */
  intensity: number;
  /** 优先级（越高越优先） */
  priority: number;
}

/** 好感度修改器 */
export interface FavorModifier {
  id: string;
  /** 何时触发此修改器 */
  event: string;
  /** 好感度变化量（可以为负数） */
  delta: number;
  /** 每日触发上限 */
  dailyLimit?: number;
  /** 冷却时间（ms） */
  cooldown?: number;
}

/** XP 来源 */
export interface XPSource {
  id: string;
  event: string;
  baseXP: number;
  /** XP 乘数（基于好感度等级等） */
  multiplier?: (state: PersonaState) => number;
  /** 每日上限 */
  dailyLimit?: number;
}

// ============ 默认配置 ============

/** 默认升级曲线：每级需要 100 * level^1.5 XP */
const DEFAULT_LEVEL_CONFIG: LevelConfig = {
  xpForLevel: (level: number) => Math.floor(100 * Math.pow(level, 1.5)),
  maxLevel: 99
};

const DEFAULT_MOOD_DECAY_INTERVAL = 5 * 60 * 1000; // 5分钟心情衰减一次

const FAVOR_LEVEL_THRESHOLDS: { level: FavorLevel; min: number }[] = [
  { level: 'soulmate', min: 95 },
  { level: 'bestie', min: 80 },
  { level: 'close-friend', min: 60 },
  { level: 'friend', min: 40 },
  { level: 'acquaintance', min: 20 },
  { level: 'stranger', min: 0 }
];

// ============ 默认 XP 来源 ============

const DEFAULT_XP_SOURCES: XPSource[] = [
  { id: 'click', event: 'interact:click', baseXP: 2, dailyLimit: 50 },
  { id: 'drag', event: 'interact:drag:end', baseXP: 3, dailyLimit: 30 },
  { id: 'file-drop', event: 'interact:file-drop', baseXP: 10, dailyLimit: 20 },
  { id: 'conversation', event: 'ai:message-sent', baseXP: 15, dailyLimit: 100 },
  { id: 'daily-login', event: 'persona:daily-login', baseXP: 50 },
  { id: 'streak-bonus', event: 'persona:streak-bonus', baseXP: 25, multiplier: (s) => Math.min(s.loginStreak, 7) }
];

// ============ 默认好感度修改器 ============

const DEFAULT_FAVOR_MODIFIERS: FavorModifier[] = [
  { id: 'click', event: 'interact:click', delta: 0.5, dailyLimit: 10, cooldown: 5000 },
  { id: 'drag-play', event: 'interact:drag:end', delta: 0.3, dailyLimit: 10 },
  { id: 'file-share', event: 'interact:file-drop', delta: 1, dailyLimit: 5 },
  { id: 'conversation', event: 'ai:message-sent', delta: 1.5, dailyLimit: 20 },
  { id: 'daily-login', event: 'persona:daily-login', delta: 2 },
  { id: 'long-absence', event: 'persona:long-absence', delta: -5 },
  { id: 'ignored-reminder', event: 'reminder:dismissed', delta: -0.5, dailyLimit: 5 }
];

// ============ 默认心情规则 ============

const DEFAULT_MOOD_RULES: MoodRule[] = [
  {
    id: 'night-sleepy',
    trigger: () => {
      const h = new Date().getHours();
      return h >= 23 || h < 5;
    },
    targetMood: 'sleepy',
    intensity: 70,
    priority: 5
  },
  {
    id: 'post-interaction-joy',
    trigger: (state) => state.favor >= 60,
    targetMood: 'joyful',
    intensity: 60,
    priority: 3
  },
  {
    id: 'low-favor-sad',
    trigger: (state) => state.favor < 20,
    targetMood: 'sad',
    intensity: 40,
    priority: 4
  },
  {
    id: 'idle-bored',
    trigger: () => false, // 通过外部事件触发
    targetMood: 'bored',
    intensity: 50,
    priority: 2
  }
];

// ============ PersonaStateManager 实现 ============

export class PersonaStateManager {
  private state: PersonaState;
  private levelConfig: LevelConfig;
  private eventBus?: SpriteEventBus;

  // 可扩展的规则集
  private xpSources: XPSource[];
  private favorModifiers: FavorModifier[];
  private moodRules: MoodRule[];

  // 每日追踪
  private dailyCounts: Map<string, { count: number; date: string }> = new Map();
  private lastFavorTrigger: Map<string, number> = new Map();

  // 心情衰减定时器
  private moodDecayTimer: ReturnType<typeof setInterval> | null = null;

  // 回调
  private onStateChange?: (state: PersonaState) => void;

  constructor(options?: {
    initialState?: Partial<PersonaState>;
    levelConfig?: LevelConfig;
    eventBus?: SpriteEventBus;
    xpSources?: XPSource[];
    favorModifiers?: FavorModifier[];
    moodRules?: MoodRule[];
    onStateChange?: (state: PersonaState) => void;
  }) {
    const now = Date.now();
    this.state = {
      name: 'Chobits',
      xp: 0,
      level: 1,
      xpToNextLevel: DEFAULT_LEVEL_CONFIG.xpForLevel(1),
      favor: 50,
      favorLevel: 'friend',
      mood: 'neutral',
      moodIntensity: 50,
      totalInteractions: 0,
      totalSessionTime: 0,
      loginStreak: 0,
      lastLoginDate: '',
      achievements: [],
      createdAt: now,
      updatedAt: now,
      ...options?.initialState
    };

    this.levelConfig = options?.levelConfig ?? DEFAULT_LEVEL_CONFIG;
    this.eventBus = options?.eventBus;
    this.xpSources = options?.xpSources ?? [...DEFAULT_XP_SOURCES];
    this.favorModifiers = options?.favorModifiers ?? [...DEFAULT_FAVOR_MODIFIERS];
    this.moodRules = options?.moodRules ?? [...DEFAULT_MOOD_RULES];
    this.onStateChange = options?.onStateChange;

    // 计算好感度等级
    this.state.favorLevel = this.computeFavorLevel(this.state.favor);
    // 计算下一级所需 XP
    this.state.xpToNextLevel = this.levelConfig.xpForLevel(this.state.level);

    // 订阅事件自动处理
    this.setupEventSubscriptions();
  }

  // ============ 公共 API ============

  /** 获取人格状态快照 */
  getState(): Readonly<PersonaState> {
    return { ...this.state };
  }

  /** 从外部恢复状态（如从 DB 加载） */
  loadState(saved: Partial<PersonaState>): void {
    Object.assign(this.state, saved);
    this.state.favorLevel = this.computeFavorLevel(this.state.favor);
    this.state.xpToNextLevel = this.levelConfig.xpForLevel(this.state.level);
    this.notifyChange();
  }

  // --- 经验值系统 ---

  /** 增加经验值，自动处理升级 */
  addXP(amount: number, source?: string): { xpGained: number; leveledUp: boolean; newLevel?: number } {
    if (amount <= 0) return { xpGained: 0, leveledUp: false };

    const oldLevel = this.state.level;
    this.state.xp += amount;
    this.state.updatedAt = Date.now();

    // 检查升级
    let leveledUp = false;
    while (this.state.level < this.levelConfig.maxLevel && this.state.xp >= this.state.xpToNextLevel) {
      this.state.xp -= this.state.xpToNextLevel;
      this.state.level += 1;
      this.state.xpToNextLevel = this.levelConfig.xpForLevel(this.state.level);
      leveledUp = true;
    }

    // 广播事件
    this.eventBus?.emit('persona:xp-gained', { amount, source, newXP: this.state.xp }, 'persona-state');
    if (leveledUp) {
      this.eventBus?.emit(
        'persona:level-up',
        {
          oldLevel,
          newLevel: this.state.level
        },
        'persona-state'
      );
    }

    this.notifyChange();
    return { xpGained: amount, leveledUp, newLevel: leveledUp ? this.state.level : undefined };
  }

  /** 获取当前经验进度（0~1） */
  getXPProgress(): number {
    if (this.state.xpToNextLevel <= 0) return 1;
    return Math.min(1, this.state.xp / this.state.xpToNextLevel);
  }

  // --- 好感度系统 ---

  /** 修改好感度 */
  changeFavor(delta: number, reason?: string): { oldFavor: number; newFavor: number; levelChanged: boolean } {
    const oldFavor = this.state.favor;
    const oldLevel = this.state.favorLevel;

    this.state.favor = Math.max(0, Math.min(100, this.state.favor + delta));
    this.state.favorLevel = this.computeFavorLevel(this.state.favor);
    this.state.updatedAt = Date.now();

    const levelChanged = this.state.favorLevel !== oldLevel;

    this.eventBus?.emit(
      'persona:favor-changed',
      {
        oldFavor,
        newFavor: this.state.favor,
        delta,
        reason,
        levelChanged,
        newLevel: this.state.favorLevel
      },
      'persona-state'
    );

    this.notifyChange();
    return { oldFavor, newFavor: this.state.favor, levelChanged };
  }

  // --- 心情系统 ---

  /** 设置心情 */
  setMood(mood: MoodType, intensity?: number): void {
    const oldMood = this.state.mood;
    this.state.mood = mood;
    this.state.moodIntensity = Math.max(0, Math.min(100, intensity ?? 50));
    this.state.updatedAt = Date.now();

    if (oldMood !== mood) {
      this.eventBus?.emit(
        'persona:mood-changed',
        {
          oldMood,
          newMood: mood,
          intensity: this.state.moodIntensity
        },
        'persona-state'
      );
    }

    this.notifyChange();
  }

  /** 评估心情规则，自动更新心情 */
  evaluateMood(): void {
    let bestRule: MoodRule | null = null;
    for (const rule of this.moodRules) {
      if (rule.trigger(this.state)) {
        if (!bestRule || rule.priority > bestRule.priority) {
          bestRule = rule;
        }
      }
    }
    if (bestRule) {
      this.setMood(bestRule.targetMood, bestRule.intensity);
    }
  }

  /** 启动心情自动衰减（每隔一段时间心情向 neutral 靠拢） */
  startMoodDecay(intervalMs?: number): void {
    this.stopMoodDecay();
    this.moodDecayTimer = setInterval(() => {
      if (this.state.mood !== 'neutral') {
        // 心情强度递减
        this.state.moodIntensity = Math.max(0, this.state.moodIntensity - 5);
        if (this.state.moodIntensity <= 10) {
          this.setMood('neutral', 50);
        }
        this.evaluateMood();
      }
    }, intervalMs ?? DEFAULT_MOOD_DECAY_INTERVAL);
  }

  stopMoodDecay(): void {
    if (this.moodDecayTimer) {
      clearInterval(this.moodDecayTimer);
      this.moodDecayTimer = null;
    }
  }

  // --- 登录/连续登录 ---

  /** 记录每日登录 */
  recordDailyLogin(): { isNewDay: boolean; streak: number; xpBonus: number } {
    const today = new Date().toISOString().slice(0, 10);
    if (this.state.lastLoginDate === today) {
      return { isNewDay: false, streak: this.state.loginStreak, xpBonus: 0 };
    }

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (this.state.lastLoginDate === yesterday) {
      this.state.loginStreak += 1;
    } else {
      this.state.loginStreak = 1;
    }

    this.state.lastLoginDate = today;
    this.state.updatedAt = Date.now();

    // 发送日常登录事件
    this.eventBus?.emit('persona:daily-login', { streak: this.state.loginStreak }, 'persona-state');

    // 连续登录奖励
    let xpBonus = 0;
    if (this.state.loginStreak > 1) {
      this.eventBus?.emit('persona:streak-bonus', { streak: this.state.loginStreak }, 'persona-state');
      xpBonus = 25 * Math.min(this.state.loginStreak, 7);
    }

    this.notifyChange();
    return { isNewDay: true, streak: this.state.loginStreak, xpBonus };
  }

  // --- 成就系统 ---

  /** 解锁成就 */
  unlockAchievement(achievementId: string): boolean {
    if (this.state.achievements.includes(achievementId)) return false;

    this.state.achievements.push(achievementId);
    this.state.updatedAt = Date.now();

    this.eventBus?.emit('persona:achievement-unlocked', { achievementId }, 'persona-state');
    this.notifyChange();
    return true;
  }

  /** 检查成就是否已解锁 */
  hasAchievement(id: string): boolean {
    return this.state.achievements.includes(id);
  }

  // --- 统计 ---

  /** 增加交互计数 */
  recordInteraction(): void {
    this.state.totalInteractions += 1;
    this.state.updatedAt = Date.now();
  }

  /** 增加会话时间 */
  addSessionTime(seconds: number): void {
    this.state.totalSessionTime += seconds;
    this.state.updatedAt = Date.now();
  }

  // --- 扩展 ---

  /** 注册新的 XP 来源 */
  registerXPSource(source: XPSource): void {
    this.xpSources.push(source);
  }

  /** 注册新的好感度修改器 */
  registerFavorModifier(modifier: FavorModifier): void {
    this.favorModifiers.push(modifier);
  }

  /** 注册新的心情规则 */
  registerMoodRule(rule: MoodRule): void {
    this.moodRules.push(rule);
  }

  /** 销毁 */
  destroy(): void {
    this.stopMoodDecay();
    this.dailyCounts.clear();
    this.lastFavorTrigger.clear();
  }

  // ============ 内部方法 ============

  private computeFavorLevel(favor: number): FavorLevel {
    for (const { level, min } of FAVOR_LEVEL_THRESHOLDS) {
      if (favor >= min) return level;
    }
    return 'stranger';
  }

  private getTodayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private checkDailyLimit(id: string, limit?: number): boolean {
    if (limit == null) return true;
    const today = this.getTodayKey();
    const entry = this.dailyCounts.get(id);
    if (!entry || entry.date !== today) {
      this.dailyCounts.set(id, { count: 0, date: today });
      return true;
    }
    return entry.count < limit;
  }

  private incrementDailyCount(id: string): void {
    const today = this.getTodayKey();
    const entry = this.dailyCounts.get(id);
    if (!entry || entry.date !== today) {
      this.dailyCounts.set(id, { count: 1, date: today });
    } else {
      entry.count += 1;
    }
  }

  private checkCooldown(id: string, cooldownMs?: number): boolean {
    if (!cooldownMs) return true;
    const last = this.lastFavorTrigger.get(id) ?? 0;
    return Date.now() - last >= cooldownMs;
  }

  /** 处理事件触发的 XP 增加 */
  private handleXPEvent(eventName: string): void {
    for (const source of this.xpSources) {
      if (source.event !== eventName) continue;
      if (!this.checkDailyLimit(`xp:${source.id}`, source.dailyLimit)) continue;

      let xp = source.baseXP;
      if (source.multiplier) {
        xp = Math.floor(xp * source.multiplier(this.state));
      }

      this.incrementDailyCount(`xp:${source.id}`);
      this.addXP(xp, source.id);
    }
  }

  /** 处理事件触发的好感度变化 */
  private handleFavorEvent(eventName: string): void {
    for (const mod of this.favorModifiers) {
      if (mod.event !== eventName) continue;
      if (!this.checkDailyLimit(`favor:${mod.id}`, mod.dailyLimit)) continue;
      if (!this.checkCooldown(mod.id, mod.cooldown)) continue;

      this.incrementDailyCount(`favor:${mod.id}`);
      this.lastFavorTrigger.set(mod.id, Date.now());
      this.changeFavor(mod.delta, mod.id);
    }
  }

  /** 设置事件订阅自动处理 XP 和好感度 */
  private setupEventSubscriptions(): void {
    if (!this.eventBus) return;

    // 监听所有事件，自动匹配 XP 来源和好感度修改器
    this.eventBus.on('*', (event) => {
      // 避免自己触发的事件产生递归
      if (event.source === 'persona-state') return;

      this.handleXPEvent(event.type);
      this.handleFavorEvent(event.type);

      // 每次交互更新统计
      if (event.type.startsWith('interact:')) {
        this.recordInteraction();
      }
    });
  }

  private notifyChange(): void {
    this.onStateChange?.(this.getState());
  }
}

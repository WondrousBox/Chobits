/**
 * CharacterStateManager — 角色状态（静态）
 *
 * mini 分支已剥离 RPG 养成数值系统（XP / 等级 / 好感度累积 / 心情衰减 /
 * 每日登录奖励 / 成就解锁事件）。保留的只是一个静态角色状态快照：
 * - name / description：角色身份（随角色包 slot 切换）
 * - mood / favor / favorLevel / level：固定展示值，供人格 prompt 注入、
 *   动画条件匹配与自发行为上下文使用
 * - achievements：持久化标记列表（向导目标用），不再产生解锁事件
 * - dimensions：按角色包 schema 初始化的静态维度值，供动画条件匹配
 *
 * 状态持久化由外部负责（IPC → main process → 文件），读取时忽略旧文件中的死字段。
 */

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

/** 好感度等级（固定展示值，不再有累积逻辑） */
export type FavorLevel =
  | 'stranger' // 0-19   陌生人
  | 'acquaintance' // 20-39 认识
  | 'friend' // 40-59 朋友
  | 'close-friend' // 60-79 好友
  | 'bestie' // 80-94 挚友
  | 'soulmate'; // 95-100 灵魂伴侣

/** 角色状态快照 */
export interface CharacterState {
  // 基础信息
  name: string;
  description?: string;

  // 固定展示值（养成系统已移除，仅为 prompt 注入 / 动画条件保留）
  level: number;
  favor: number; // 0-100
  favorLevel: FavorLevel;

  // 心情
  mood: MoodType;
  moodIntensity: number; // 0-100，心情强度

  // 持久化标记（向导目标完成标记；不再产生解锁事件）
  achievements: string[];

  // 多维度能力值（静态初始值，供动画条件匹配）
  dimensions: Record<string, number>; // dimensionId → value

  // 时间戳
  createdAt: number;
  updatedAt: number;
}

// ============ 默认值 ============

/** 养成系统移除后的固定展示值 */
export const STATIC_CHARACTER_LEVEL = 1;
export const STATIC_CHARACTER_FAVOR = 50;
export const STATIC_CHARACTER_FAVOR_LEVEL: FavorLevel = 'friend';
export const STATIC_CHARACTER_MOOD: MoodType = 'neutral';
export const STATIC_CHARACTER_MOOD_INTENSITY = 50;

const FAVOR_LEVEL_THRESHOLDS: { level: FavorLevel; min: number }[] = [
  { level: 'soulmate', min: 95 },
  { level: 'bestie', min: 80 },
  { level: 'close-friend', min: 60 },
  { level: 'friend', min: 40 },
  { level: 'acquaintance', min: 20 },
  { level: 'stranger', min: 0 }
];

function computeFavorLevel(favor: number): FavorLevel {
  for (const { level, min } of FAVOR_LEVEL_THRESHOLDS) {
    if (favor >= min) return level;
  }
  return 'stranger';
}

// ============ CharacterStateManager 实现 ============

export class CharacterStateManager {
  private state: CharacterState;

  // 回调
  private onStateChange?: (state: CharacterState) => void;

  constructor(options?: { initialState?: Partial<CharacterState>; onStateChange?: (state: CharacterState) => void }) {
    const now = Date.now();
    this.state = {
      name: 'Chobits',
      level: STATIC_CHARACTER_LEVEL,
      favor: STATIC_CHARACTER_FAVOR,
      favorLevel: STATIC_CHARACTER_FAVOR_LEVEL,
      mood: STATIC_CHARACTER_MOOD,
      moodIntensity: STATIC_CHARACTER_MOOD_INTENSITY,
      achievements: [],
      dimensions: {},
      createdAt: now,
      updatedAt: now,
      ...options?.initialState
    };
    this.state.favorLevel = computeFavorLevel(this.state.favor);
    this.onStateChange = options?.onStateChange;
  }

  // ============ 公共 API ============

  /** 获取角色状态快照 */
  getState(): Readonly<CharacterState> {
    return { ...this.state };
  }

  /** 从外部恢复状态（如从持久化文件加载；旧文件中的养成死字段由持久化层忽略） */
  loadState(saved: Partial<CharacterState>): void {
    Object.assign(this.state, saved);
    this.state.favorLevel = computeFavorLevel(this.state.favor);
    this.notifyChange();
  }

  /** 设置心情（纯展示状态，无衰减/规则引擎） */
  setMood(mood: MoodType, intensity?: number): void {
    this.state.mood = mood;
    this.state.moodIntensity = Math.max(0, Math.min(100, intensity ?? STATIC_CHARACTER_MOOD_INTENSITY));
    this.state.updatedAt = Date.now();
    this.notifyChange();
  }

  /** 批量初始化维度（仅对尚未初始化的维度设置初始值，之后不再增长） */
  initDimensions(defs: Array<{ id: string; initialValue: number }>): void {
    let changed = false;
    for (const def of defs) {
      if (this.state.dimensions[def.id] === undefined) {
        this.state.dimensions[def.id] = def.initialValue;
        changed = true;
      }
    }
    if (changed) {
      this.state.updatedAt = Date.now();
      this.notifyChange();
    }
  }

  /** 销毁 */
  destroy(): void {
    // 无定时器/订阅需要清理
  }

  // ============ 内部方法 ============

  private notifyChange(): void {
    this.onStateChange?.(this.getState());
  }
}

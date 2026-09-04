/**
 * User Profile — TypeScript 类型定义
 *
 * 用户画像文档（USER_PROFILE.md）的核心接口：
 * - Frontmatter / 事实 / 解析结果
 * - 校验结果
 */

// ━━ 常量 ━━

/** 正文最大字符数（不含 frontmatter） */
export const USER_PROFILE_CHAR_BUDGET = 1200;
/** 最大信息条目 */
export const USER_PROFILE_ITEM_BUDGET = 30;
/** 画像文件名 */
export const USER_PROFILE_FILENAME = 'USER_PROFILE.md';
/** 旧版画像文件名（仅用于加载时一次性迁移） */
export const LEGACY_USER_PROFILE_FILENAME = 'USER_PERSONA.md';

/** 每个维度最大条目数 */
export const USER_PROFILE_DIMENSION_LIMITS: Record<UserProfileDimension, number> = {
  basic: 3,
  preference: 6,
  goal: 5,
  personality: 5,
  decision: 3,
  activity: 4,
  recent: 2
};

/** 固定 section 顺序与 dimension 映射 */
export const USER_PROFILE_SECTIONS: ReadonlyArray<{ heading: string; dimension: UserProfileDimension | 'snapshot' }> = [
  { heading: 'Snapshot', dimension: 'snapshot' },
  { heading: 'Basic Info', dimension: 'basic' },
  { heading: 'Preferences & Taste', dimension: 'preference' },
  { heading: 'Goals & Motivation', dimension: 'goal' },
  { heading: 'Personality & Communication', dimension: 'personality' },
  { heading: 'Decision Style & Boundaries', dimension: 'decision' },
  { heading: 'Current Activities', dimension: 'activity' },
  { heading: 'Recent Shift', dimension: 'recent' }
] as const;

// ━━ 核心类型 ━━

export type UserProfileDimension = 'basic' | 'preference' | 'goal' | 'personality' | 'decision' | 'activity' | 'recent';

export interface UserProfileFrontmatter {
  version: number;
  workspaceId: string;
  updatedAt: number; // 毫秒时间戳
  charBudget: number;
  itemBudget: number;
  compressionRound: number;
}

export interface UserProfileFact {
  dimension: UserProfileDimension;
  statement: string;
  confidence: number; // 0~1
  stability: number; // 0~1
  recency: number; // 0~1
  evidenceCount: number;
}

export interface ParsedUserProfile {
  frontmatter: UserProfileFrontmatter;
  snapshot: string;
  facts: UserProfileFact[];
  rawMarkdown: string; // 原始内容（回滚用）
}

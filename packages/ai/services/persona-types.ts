/**
 * User Persona Profile — TypeScript 类型定义
 *
 * 空间级用户画像系统的核心接口，包括：
 * - Frontmatter / 事实 / 解析结果
 * - 判定器输入输出
 * - 更新任务参数
 * - IPC 契约
 *
 * @see docs/memory-system/user-persona-profile-design.md §6.1, §9.2
 */

import type { MemoryChatFn } from './memory-types';

// ━━ 常量 ━━

/** 正文最大字符数（不含 frontmatter） */
export const PERSONA_CHAR_BUDGET = 900;
/** 最大信息条目 */
export const PERSONA_ITEM_BUDGET = 24;
/** 判定器信号阈值 */
export const PERSONA_SIGNAL_THRESHOLD = 0.62;
/** Snapshot 最大字数 */
export const PERSONA_SNAPSHOT_MAX_CHARS = 60;
/** 画像文件名 */
export const PERSONA_FILENAME = 'USER_PERSONA.md';
/** 最大历史备份数 */
export const PERSONA_MAX_BACKUPS = 3;
/** Recent Shift 最大条目 */
export const PERSONA_RECENT_SHIFT_MAX = 2;
/** Recent Shift 过期天数 */
export const PERSONA_RECENT_SHIFT_EXPIRE_DAYS = 30;
/** Recent Shift 晋升所需累计确认次数 */
export const PERSONA_RECENT_SHIFT_PROMOTE_COUNT = 3;

/** 每个维度最大条目数 */
export const PERSONA_DIMENSION_LIMITS: Record<PersonaDimension, number> = {
  basic: 3,
  preference: 6,
  goal: 5,
  personality: 5,
  decision: 3,
  recent: 2
};

/** 固定 section 顺序与 dimension 映射 */
export const PERSONA_SECTIONS: ReadonlyArray<{ heading: string; dimension: PersonaDimension | 'snapshot' }> = [
  { heading: 'Snapshot', dimension: 'snapshot' },
  { heading: 'Basic Info', dimension: 'basic' },
  { heading: 'Preferences & Taste', dimension: 'preference' },
  { heading: 'Goals & Motivation', dimension: 'goal' },
  { heading: 'Personality & Communication', dimension: 'personality' },
  { heading: 'Decision Style & Boundaries', dimension: 'decision' },
  { heading: 'Recent Shift', dimension: 'recent' }
] as const;

// ━━ 核心类型 ━━

export type PersonaDimension = 'basic' | 'preference' | 'goal' | 'personality' | 'decision' | 'recent';

export interface PersonaFrontmatter {
  version: number;
  workspaceId: string;
  updatedAt: number; // 毫秒时间戳
  charBudget: number;
  itemBudget: number;
  compressionRound: number;
}

export interface PersonaFact {
  dimension: PersonaDimension;
  statement: string;
  confidence: number; // 0~1
  stability: number; // 0~1
  recency: number; // 0~1
  evidenceCount: number;
}

export interface ParsedPersona {
  frontmatter: PersonaFrontmatter;
  snapshot: string;
  facts: PersonaFact[];
  rawMarkdown: string; // 原始内容（回滚用）
}

// ━━ 判定器类型 ━━

export type PersonaUpdateReason = 'new_stable_preference' | 'new_goal_or_priority' | 'communication_style_shift' | 'conflict_resolution' | 'insufficient_signal';

export interface PersonaEvidenceItem {
  conversationId: string;
  seqStart: number;
  seqEnd: number;
  note: string;
}

export interface PersonaCandidateFact {
  dimension: PersonaDimension;
  statement: string;
  confidence: number; // 0~1
}

export interface PersonaUpdateDecision {
  shouldUpdate: boolean;
  reason: PersonaUpdateReason;
  signalScore: number; // 0~1
  evidence: PersonaEvidenceItem[];
  candidateFacts: PersonaCandidateFact[];
}

export type PersonaCheckSkipGate = 'min_message' | 'min_interval' | 'cooldown' | 'no_user_signal';

// ━━ IPC 参数 ━━

export interface PersonaCheckParams {
  workspaceId: string;
  conversationId: string;
  providerId?: string;
  providerPresetId?: string;
}

export interface PersonaCheckResult {
  decision: PersonaUpdateDecision;
  skippedByGate?: PersonaCheckSkipGate;
}

export interface PersonaUpdateJobParams {
  workspaceId: string;
  evidence: Array<{
    conversationId: string;
    seqStart: number;
    seqEnd: number;
  }>;
  candidateFacts: PersonaCandidateFact[];
  reason: PersonaUpdateReason;
  providerId?: string;
  providerPresetId?: string;
}

export interface PersonaDocumentSummary {
  workspaceId: string;
  exists: boolean;
  updatedAt: number;
  charCount: number;
  itemCount: number;
  compressionRound: number;
  snapshot: string;
  fullMarkdown?: string;
}

export type PersonaJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'skipped';

export interface PersonaUpdateStatus {
  jobId?: string;
  status: PersonaJobStatus;
  lastCheckAt?: number;
  lastUpdateAt?: number;
  lastReason?: PersonaUpdateReason;
  error?: string;
}

// ━━ 验证结果 ━━

export interface PersonaValidationResult {
  valid: boolean;
  errors: string[];
  charCount: number;
  itemCount: number;
}

// ━━ 更新结果 ━━

export interface PersonaUpdateResult {
  action: 'created' | 'updated' | 'skipped';
  charCount: number;
  itemCount: number;
  compressionRound: number;
  filePath: string;
}

// ━━ Chat function re-export ━━

export type PersonaChatFn = MemoryChatFn;

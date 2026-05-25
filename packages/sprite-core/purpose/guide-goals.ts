export type SpriteRoutineGuideGoalKind = 'workspace.exists' | 'ai.chat-provider-configured' | (string & {});

export interface SpriteRoutineGuideGoalDefinition {
  /** Stable goal id used by guide evaluators and tests. */
  id: string;
  /** Declarative evaluator key. Runtime layers bind this kind to an environment-specific predicate. */
  kind: SpriteRoutineGuideGoalKind;
  /** Human readable intent for diagnostics, planner summaries, and docs. */
  description: string;
  /** True when the original user action should wait until this goal is achieved. */
  blocking?: boolean;
}

export const WORKSPACE_EXISTS_GUIDE_GOAL: SpriteRoutineGuideGoalDefinition = {
  id: 'workspace.exists',
  kind: 'workspace.exists',
  description: '至少存在一个未删除的工作空间。',
  blocking: true
};

export const CHAT_API_CONFIGURED_GUIDE_GOAL: SpriteRoutineGuideGoalDefinition = {
  id: 'ai.chat-provider-configured',
  kind: 'ai.chat-provider-configured',
  description: '至少有一个可用于聊天的 AI 服务商预设已经配置 API Key；发送时会收窄到当前服务商和预设。',
  blocking: true
};

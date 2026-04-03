/**
 * User Persona Check Service — 判定是否需要更新画像
 *
 * 职责：
 * 1. 门控检查（消息数、冷却时间等）
 * 2. 构造判定 Prompt 并调用 LLM
 * 3. 解析 JSON 输出为 PersonaUpdateDecision
 *
 * @see docs/memory-system/user-persona-profile-design.md §5.1–§5.5
 */

import { PERSONA_SIGNAL_THRESHOLD, type PersonaChatFn, type PersonaCheckResult, type PersonaCheckSkipGate, type PersonaUpdateDecision } from './persona-types';

function safeParseJson<T>(text: string): T | null {
  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : text;
    return JSON.parse(jsonStr.trim()) as T;
  } catch {
    try {
      return JSON.parse(text.trim()) as T;
    } catch {
      return null;
    }
  }
}

// ━━ 配置 ━━

/** 触发判定所需最少用户消息数 */
const MIN_USER_MESSAGES = 3;
/** 判定冷却间隔（毫秒） */
const CHECK_COOLDOWN_MS = 10 * 60 * 1000; // 10 分钟
/** 应跳过判定的 agent ID */
const SKIP_AGENTS = new Set(['memory-extraction', 'title-generation', 'user-persona-update']);

// ━━ 状态 ━━

const lastCheckTime = new Map<string, number>();

// ━━ Prompt ━━

const CHECK_PROMPT = `你是用户画像更新判定器。你的任务不是更新画像，而是判断"是否值得更新"。

输入：
1) 当前用户画像摘要（可能为空）
2) 本轮新增对话片段（含 conversationId 和 seq）

判定标准：
- 出现"稳定偏好、长期目标、明确沟通风格、决策边界、冲突修正"应更新
- 用户提到**近期正在做的事、当前项目、最近的兴趣或关注点**也应更新（放入 activity 维度）
- 用户透露出的**作息习惯、工作状态、生活近况**也值得记录到 activity 维度
- 纯寒暄（你好/再见）、一次性无上下文的提问不应触发更新
- 若与现有画像完全重复，不应触发更新

维度说明：
- basic: 年龄、职业、技术栈等基本信息
- preference: 稳定的偏好和品味
- goal: 长期目标和动力
- personality: 沟通风格
- decision: 决策偏好
- activity: 近期正在做的事、当前项目与关注点（重要！这是高频更新的维度）
- recent: 近期态度或偏好的转变

输出 JSON：
{
  "shouldUpdate": true/false,
  "reason": "new_stable_preference|new_goal_or_priority|communication_style_shift|conflict_resolution|recent_activity_update|insufficient_signal",
  "signalScore": 0.0~1.0,
  "evidence": [
    {"conversationId":"...","seqStart":1,"seqEnd":8,"note":"简要证据"}
  ],
  "candidateFacts": [
    {"dimension":"preference|goal|personality|decision|basic|activity|recent","statement":"...","confidence":0.0~1.0}
  ]
}

注意：activity 维度的信号分数应适当放宽（0.4+ 即可），因为这类信息时效性强，及时记录比等待确认更重要。

只输出 JSON，不要解释。`;

// ━━ 门控 ━━

export interface GateCheckInput {
  conversationId: string;
  workspaceId: string;
  /** 本轮新增用户消息数 */
  userMessageCount: number;
  /** 是否有工具调用 */
  hasToolCalls: boolean;
  /** agent ID */
  agentId?: string;
  /** 是否已持久化 */
  persisted: boolean;
}

/**
 * 前置门控：快速判断是否需要调用 LLM 判定。
 * 返回 null 表示通过门控，否则返回跳过原因。
 */
export function checkGate(input: GateCheckInput): PersonaCheckSkipGate | null {
  if (!input.conversationId || !input.persisted) {
    return 'no_user_signal';
  }

  if (input.agentId && SKIP_AGENTS.has(input.agentId)) {
    return 'no_user_signal';
  }

  if (input.userMessageCount < MIN_USER_MESSAGES) {
    return 'min_message';
  }

  const lastTime = lastCheckTime.get(input.workspaceId);
  if (lastTime && Date.now() - lastTime < CHECK_COOLDOWN_MS) {
    return 'cooldown';
  }

  return null;
}

// ━━ 核心判定 ━━

export interface CheckPersonaInput {
  conversationId: string;
  workspaceId: string;
  /** 当前画像 Markdown（可能为空字符串） */
  currentPersona: string | null;
  /** 对话片段文本（已格式化） */
  conversationSnippet: string;
}

/**
 * 调用 LLM 判定是否需要更新画像。
 */
export async function checkPersonaUpdateNeeded(input: CheckPersonaInput, chatFn: PersonaChatFn, signal?: AbortSignal): Promise<PersonaCheckResult> {
  const TAG = '[PersonaCheck]';

  // 记录判定时间
  lastCheckTime.set(input.workspaceId, Date.now());

  const personaSummary = input.currentPersona?.trim() ? `当前用户画像：\n${input.currentPersona}` : '当前用户画像：（暂无，首次判定）';

  const prompt = `${CHECK_PROMPT}\n\n---\n\n${personaSummary}\n\n---\n\n本轮对话片段：\n${input.conversationSnippet}`;

  console.log(`${TAG} ⭐ Sending check prompt to LLM (${prompt.length} chars)...`);
  console.log('⭐⭐⭐⭐⭐', prompt, '⭐⭐⭐⭐⭐');

  const response = await chatFn(prompt, signal);
  console.log(`${TAG} ⭐ LLM response: ${response.length} chars`);

  const decision = parseCheckResponse(response);

  // 应用阈值（activity 类更新使用较低门槛）
  const isActivityUpdate = decision.reason === 'recent_activity_update' || decision.candidateFacts.some((f: any) => f.dimension === 'activity');
  const effectiveThreshold = isActivityUpdate ? 0.35 : PERSONA_SIGNAL_THRESHOLD;

  if (decision.shouldUpdate && decision.signalScore < effectiveThreshold) {
    console.log(`${TAG} ⭐ signalScore ${decision.signalScore} < threshold ${effectiveThreshold} (activity=${isActivityUpdate}), overriding to shouldUpdate=false`);
    decision.shouldUpdate = false;
    decision.reason = 'insufficient_signal';
  }

  // 限制 evidence 数量
  if (decision.evidence.length > 3) {
    decision.evidence = decision.evidence.slice(0, 3);
  }

  console.log(decision);

  console.log(
    `${TAG} ⭐ Decision: shouldUpdate=${decision.shouldUpdate}, reason=${decision.reason}, score=${decision.signalScore}, evidence=${decision.evidence.length}, facts=${decision.candidateFacts.length}`
  );

  return { decision };
}

/**
 * 解析 LLM 返回的 JSON。
 */
function parseCheckResponse(raw: string): PersonaUpdateDecision {
  const parsed = safeParseJson<PersonaUpdateDecision>(raw);

  if (!parsed || typeof parsed.shouldUpdate !== 'boolean') {
    console.warn('[PersonaCheck] Failed to parse decision JSON, defaulting to no-update');
    return {
      shouldUpdate: false,
      reason: 'insufficient_signal',
      signalScore: 0,
      evidence: [],
      candidateFacts: []
    };
  }

  return {
    shouldUpdate: parsed.shouldUpdate,
    reason: parsed.reason || 'insufficient_signal',
    signalScore: Math.max(0, Math.min(1, Number(parsed.signalScore) || 0)),
    evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
    candidateFacts: Array.isArray(parsed.candidateFacts) ? parsed.candidateFacts : []
  };
}

/**
 * 格式化对话消息为判定器输入片段。
 */
export function formatConversationSnippet(messages: Array<{ role: string; content: string; seq: number }>, conversationId: string): string {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => `[${m.role}] (conv:${conversationId}, seq:${m.seq}) ${m.content}`)
    .join('\n');
}

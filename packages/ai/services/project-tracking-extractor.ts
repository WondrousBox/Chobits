import { parseJsonMarkdown } from '../json';
import type { ConversationRouteMessage, ConversationRouteSnapshot } from './conversation-route-types';
import { cleanStringList, getDefaultProjectEventQuality, isHighRiskProjectEventType, trimText } from './project-tracking-service';
import type { ProjectDelta, ProjectEventDraft, ProjectEventStatus, ProjectEventType, ProjectMilestonePatch, ProjectMilestoneStatus, ProjectSnapshot, TrackedProject } from './project-tracking-types';

export interface ExtractProjectDeltaInput {
  conversationId: string;
  messages: ConversationRouteMessage[];
  project: TrackedProject;
  routeSnapshot?: ConversationRouteSnapshot | null;
  snapshot?: ProjectSnapshot | null;
}

export interface ProjectDeltaChatFn {
  (prompt: string, signal?: AbortSignal): Promise<string>;
}

const PROJECT_DELTA_PROMPT = `你是 Project Tracking Memory 的项目增量提取器。你的任务是从本轮新增对话中提取“会影响项目长期跟进状态”的增量。

只记录项目事实：
- 待办、进展、完成、里程碑、截止日期、会议、协议、决策、计划变更、阻塞、风险
- 不记录普通解释、寒暄、模型推测、重复旧状态或没有后续价值的临时讨论

质量和安全规则：
- 每个事件必须包含 sourceSeqStart/sourceSeqEnd，落在新增消息范围内
- 高风险事件必须 needsUserConfirmation=true：agreement_reached、decision_made、deadline_changed、status_changed、reminder_scheduled
- 除非用户明确要求记录或事实很低风险，否则 LLM 输出事件默认 quality=draft
- title 不超过 32 个汉字，content 不超过 160 个汉字，events 最多 6 个，milestonePatches 最多 4 个
- 不要把现有项目快照原样复制成新事件
- 只输出 JSON，不要解释

JSON 结构：
{
  "events": [
    {
      "type": "task_added|task_progress|task_done|milestone_added|milestone_reached|deadline_changed|meeting_scheduled|meeting_done|agreement_reached|decision_made|plan_changed|blocker_found|blocker_resolved|risk_identified|reminder_scheduled|status_changed|summary_checkpoint",
      "title": "短标题",
      "content": "证据化描述",
      "status": "active|resolved|superseded|cancelled",
      "importance": 0.7,
      "confidence": 0.8,
      "dueAt": 1780000000000,
      "eventTime": 1780000000000,
      "quality": "draft|accepted",
      "needsUserConfirmation": true,
      "sourceSeqStart": 1,
      "sourceSeqEnd": 2
    }
  ],
  "milestonePatches": [
    {
      "title": "里程碑",
      "description": "可选说明",
      "status": "planned|in_progress|done|missed|cancelled",
      "targetAt": 1780000000000
    }
  ]
}`;

const TASK_TERMS = ['要做', '待办', '下一步', '先做', '实现', '完成', '修复', '检查', '测试', '补齐', '设计', '开发'];
const PROGRESS_TERMS = ['已经', '完成了', '搞定', '通过', '推进到', '现在进展', '继续'];
const DONE_TERMS = ['已完成', '完成了', '搞定了', '通过了', 'done'];
const MEETING_TERMS = ['开会', '会议', '评审', '同步会', '会谈'];
const DEADLINE_TERMS = ['截止', 'deadline', '交付', '上线', '发布', '到期'];
const AGREEMENT_TERMS = ['协议', '约定', '达成', '确认', '合同'];
const DECISION_TERMS = ['决定', '确定', '采用', '选择', '结论'];
const CHANGE_TERMS = ['变更', '调整', '改成', '改为', '延期', '提前', '范围'];
const BLOCKER_TERMS = ['阻塞', '卡住', '问题', '风险', '失败', '报错', '不能'];
const RISK_TERMS = ['风险', '担心', '可能', '不确定'];
const MILESTONE_TERMS = ['里程碑', '阶段', '节点'];

export async function extractProjectDelta(input: ExtractProjectDeltaInput, chatFn?: ProjectDeltaChatFn, signal?: AbortSignal): Promise<ProjectDelta> {
  if (!input.messages.length) return { events: [], milestonePatches: [] };
  if (!chatFn) return extractProjectDeltaByRules(input);

  try {
    const response = await chatFn(buildProjectDeltaPrompt(input), signal);
    const delta = normalizeProjectDelta(parseJsonMarkdown(response), input);
    if (delta.events.length || delta.milestonePatches.length) return delta;
  } catch (error) {
    console.warn('[ProjectTrackingExtractor] LLM extraction failed, falling back to rules:', error instanceof Error ? error.message : error);
  }

  return extractProjectDeltaByRules(input);
}

export function extractProjectDeltaByRules(input: ExtractProjectDeltaInput): ProjectDelta {
  const userMessages = input.messages.filter((message) => message.role === 'user' && message.content.trim());
  if (!userMessages.length) return { events: [], milestonePatches: [] };

  const events: ProjectEventDraft[] = [];
  const milestonePatches: ProjectMilestonePatch[] = [];

  for (const message of userMessages) {
    const text = normalizeContent(message.content);
    if (!text) continue;

    const source = {
      sourceConversationId: input.conversationId,
      sourceSeqEnd: message.seq,
      sourceSeqStart: message.seq
    };

    const dueAt = inferDate(text);
    const title = inferTitle(text, input.project.name);

    if (containsAny(text, MEETING_TERMS)) {
      events.push(createEvent('meeting_scheduled', title || '项目会议', text, source, { dueAt, eventTime: dueAt, importance: 0.74 }));
    }
    if (containsAny(text, DEADLINE_TERMS)) {
      events.push(createEvent('deadline_changed', title || '项目时间点更新', text, source, { dueAt, importance: 0.78 }));
    }
    if (containsAny(text, AGREEMENT_TERMS)) {
      events.push(createEvent('agreement_reached', title || '项目协议确认', text, source, { importance: 0.76 }));
    }
    if (containsAny(text, DECISION_TERMS)) {
      events.push(createEvent('decision_made', title || '项目决策', text, source, { importance: 0.75 }));
    }
    if (containsAny(text, CHANGE_TERMS)) {
      events.push(createEvent('plan_changed', title || '项目计划变更', text, source, { dueAt, importance: 0.72 }));
    }
    if (containsAny(text, BLOCKER_TERMS)) {
      events.push(createEvent('blocker_found', title || '项目阻塞', text, source, { importance: 0.8 }));
    } else if (containsAny(text, RISK_TERMS)) {
      events.push(createEvent('risk_identified', title || '项目风险', text, source, { importance: 0.68 }));
    }
    if (containsAny(text, DONE_TERMS)) {
      events.push(createEvent('task_done', title || '项目事项完成', text, source, { importance: 0.7, status: 'resolved' }));
    } else if (containsAny(text, PROGRESS_TERMS)) {
      events.push(createEvent('task_progress', title || '项目进展', text, source, { importance: 0.65 }));
    } else if (containsAny(text, TASK_TERMS)) {
      events.push(createEvent('task_added', title || '项目待办', text, source, { dueAt, importance: 0.66 }));
    }
    if (containsAny(text, MILESTONE_TERMS)) {
      events.push(createEvent('milestone_added', title || '项目里程碑', text, source, { dueAt, importance: 0.72 }));
      milestonePatches.push({
        description: text,
        status: 'planned',
        targetAt: dueAt ?? null,
        title: title || '项目里程碑'
      });
    }
  }

  addRouteSnapshotEvents(input, events);
  return {
    events: dedupeEvents(events).slice(0, 12),
    milestonePatches: dedupeMilestones(milestonePatches).slice(0, 8)
  };
}

function addRouteSnapshotEvents(input: ExtractProjectDeltaInput, events: ProjectEventDraft[]): void {
  const route = input.routeSnapshot;
  if (!route) return;
  const seqEnd = route.lastProcessedSeq || Math.max(0, ...input.messages.map((message) => message.seq));
  const source = {
    sourceConversationId: input.conversationId,
    sourceSeqEnd: seqEnd || null,
    sourceSeqStart: seqEnd || null
  };

  for (const task of route.openTasks || []) {
    if (!task.title) continue;
    events.push(createEvent(task.status === 'blocked' ? 'blocker_found' : task.status === 'in_progress' ? 'task_progress' : 'task_added', task.title, task.title, source, { importance: 0.58 }));
  }
  for (const task of route.resolvedTasks || []) {
    if (!task.title) continue;
    events.push(createEvent('task_done', task.title, task.title, source, { importance: 0.55, status: 'resolved' }));
  }
  for (const decision of route.decisions || []) {
    events.push(createEvent('decision_made', decision, decision, source, { importance: 0.62 }));
  }
  for (const blocker of route.blockers || []) {
    events.push(createEvent('blocker_found', blocker, blocker, source, { importance: 0.7 }));
  }
}

function createEvent(
  type: ProjectEventDraft['type'],
  title: string,
  content: string,
  source: Pick<ProjectEventDraft, 'sourceConversationId' | 'sourceSeqEnd' | 'sourceSeqStart'>,
  options: Partial<ProjectEventDraft> = {}
): ProjectEventDraft {
  return {
    confidence: options.confidence ?? 0.62,
    content: trimText(content, 500),
    dueAt: options.dueAt ?? null,
    eventTime: options.eventTime ?? null,
    importance: options.importance ?? 0.6,
    metadata: options.metadata ?? null,
    status: options.status ?? 'active',
    title: trimText(title, 80),
    type,
    ...source
  };
}

function dedupeEvents(events: ProjectEventDraft[]): ProjectEventDraft[] {
  const seen = new Set<string>();
  const result: ProjectEventDraft[] = [];
  for (const event of events) {
    const key = `${event.type}:${event.title}:${event.sourceConversationId}:${event.sourceSeqStart}:${event.sourceSeqEnd}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(event);
  }
  return result;
}

function dedupeMilestones(milestones: ProjectMilestonePatch[]): ProjectMilestonePatch[] {
  const titles = cleanStringList(
    milestones.map((milestone) => milestone.title),
    20
  );
  return titles.map((title) => milestones.find((milestone) => milestone.title === title)).filter((milestone): milestone is ProjectMilestonePatch => Boolean(milestone));
}

function inferTitle(text: string, projectName: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/(?:项目|计划|功能|系统|文档)?([^，。！？\n]{4,48})(?:。|，|！|？|$)/);
  return trimText((match?.[1] || cleaned || projectName).replace(/^(我|我们|需要|要|先|接下来)/, '').trim(), 64);
}

function inferDate(text: string): number | null {
  const now = new Date();
  if (text.includes('今天')) return startOfDay(now).getTime();
  if (text.includes('明天')) return addDays(startOfDay(now), 1).getTime();
  if (text.includes('后天')) return addDays(startOfDay(now), 2).getTime();
  if (text.includes('下周')) return addDays(startOfDay(now), 7).getTime();

  const iso = text.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(date.getTime()) ? null : date.getTime();
  }
  const md = text.match(/(\d{1,2})月(\d{1,2})[日号]?/);
  if (md) {
    const date = new Date(now.getFullYear(), Number(md[1]) - 1, Number(md[2]));
    return Number.isNaN(date.getTime()) ? null : date.getTime();
  }
  return null;
}

function normalizeContent(value: string): string {
  return trimText(value.replace(/\s+/g, ' ').trim(), 1200);
}

function containsAny(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function buildProjectDeltaPrompt(input: ExtractProjectDeltaInput): string {
  const lines: string[] = [PROJECT_DELTA_PROMPT, '', `项目: ${input.project.name}`, `目标: ${input.project.goal}`];
  if (input.snapshot) {
    lines.push(
      '',
      '当前可信快照:',
      JSON.stringify(
        {
          agreements: input.snapshot.agreements.slice(0, 5),
          blockers: input.snapshot.blockers.slice(0, 5),
          changes: input.snapshot.changes.slice(0, 5),
          decisions: input.snapshot.decisions.slice(0, 5),
          openTasks: input.snapshot.openTasks.slice(0, 6),
          recentProgress: input.snapshot.recentProgress.slice(0, 5),
          risks: input.snapshot.risks.slice(0, 5),
          upcomingDates: input.snapshot.upcomingDates.slice(0, 5)
        },
        null,
        2
      )
    );
  }
  if (input.routeSnapshot) {
    lines.push(
      '',
      '当前会话线路摘要:',
      JSON.stringify(
        {
          blockers: input.routeSnapshot.blockers.slice(0, 3),
          currentGoal: input.routeSnapshot.currentGoal,
          decisions: input.routeSnapshot.decisions.slice(0, 3),
          openTasks: input.routeSnapshot.openTasks.slice(0, 5),
          resolvedTasks: input.routeSnapshot.resolvedTasks.slice(0, 5),
          summary: input.routeSnapshot.summary
        },
        null,
        2
      )
    );
  }
  lines.push('', '新增消息:', formatMessages(input.messages));
  return lines.join('\n');
}

function formatMessages(messages: ConversationRouteMessage[]): string {
  return messages.map((message) => `[seq=${message.seq} role=${message.role}] ${trimText(message.content.replace(/\s+/g, ' ').trim(), 700)}`).join('\n');
}

export function normalizeProjectDelta(raw: unknown, input?: ExtractProjectDeltaInput): ProjectDelta {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const events = Array.isArray(obj.events)
    ? obj.events
        .map((value) => normalizeDeltaEvent(value, input))
        .filter((event): event is ProjectEventDraft => Boolean(event))
        .slice(0, 12)
    : [];
  const milestonePatches = Array.isArray(obj.milestonePatches)
    ? obj.milestonePatches
        .map(normalizeMilestonePatch)
        .filter((patch): patch is ProjectMilestonePatch => Boolean(patch))
        .slice(0, 8)
    : [];
  return {
    events: dedupeEvents(events),
    milestonePatches: dedupeMilestones(milestonePatches)
  };
}

function normalizeDeltaEvent(value: unknown, input?: ExtractProjectDeltaInput): ProjectEventDraft | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const type = normalizeEventType(item.type);
  const title = typeof item.title === 'string' ? trimText(item.title.trim(), 80) : '';
  const content = typeof item.content === 'string' ? trimText(item.content.trim(), 500) : title;
  if (!type || !title || !content) return null;
  const seqStart = toFiniteNumber(item.sourceSeqStart ?? item.seqStart);
  const seqEnd = toFiniteNumber(item.sourceSeqEnd ?? item.seqEnd);
  const status = normalizeEventStatus(item.status);
  const highRisk = isHighRiskProjectEventType(type);
  const needsUserConfirmation = typeof item.needsUserConfirmation === 'boolean' ? item.needsUserConfirmation : highRisk;
  const quality = item.quality === 'accepted' || item.quality === 'draft' ? item.quality : getDefaultProjectEventQuality({ createdBy: 'system', needsUserConfirmation, type });
  return {
    confidence: clamp01(item.confidence, highRisk ? 0.68 : 0.62),
    content,
    dueAt: toNullableTimestamp(item.dueAt),
    eventTime: toNullableTimestamp(item.eventTime),
    importance: clamp01(item.importance, highRisk ? 0.75 : 0.62),
    metadata: JSON.stringify({ extractor: 'llm-project-delta' }),
    needsUserConfirmation,
    quality,
    sourceConversationId: input?.conversationId ?? null,
    sourceSeqEnd: seqEnd ?? seqStart ?? null,
    sourceSeqStart: seqStart ?? seqEnd ?? null,
    status,
    title,
    type
  };
}

function normalizeMilestonePatch(value: unknown): ProjectMilestonePatch | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const title = typeof item.title === 'string' ? trimText(item.title.trim(), 80) : '';
  if (!title) return null;
  return {
    description: typeof item.description === 'string' ? trimText(item.description.trim(), 500) : null,
    evidenceEventIds: cleanStringList(item.evidenceEventIds, 12),
    status: normalizeMilestoneStatus(item.status),
    targetAt: toNullableTimestamp(item.targetAt),
    title
  };
}

function normalizeEventType(value: unknown): ProjectEventType | null {
  const allowed: ProjectEventType[] = [
    'agreement_reached',
    'blocker_found',
    'blocker_resolved',
    'deadline_changed',
    'decision_made',
    'meeting_done',
    'meeting_scheduled',
    'milestone_added',
    'milestone_reached',
    'plan_changed',
    'reminder_scheduled',
    'risk_identified',
    'status_changed',
    'summary_checkpoint',
    'task_added',
    'task_done',
    'task_progress'
  ];
  return typeof value === 'string' && allowed.includes(value as ProjectEventType) ? (value as ProjectEventType) : null;
}

function normalizeEventStatus(value: unknown): ProjectEventStatus {
  return value === 'resolved' || value === 'superseded' || value === 'cancelled' ? value : 'active';
}

function normalizeMilestoneStatus(value: unknown): ProjectMilestoneStatus {
  return value === 'in_progress' || value === 'done' || value === 'missed' || value === 'cancelled' ? value : 'planned';
}

function toFiniteNumber(value: unknown): number | null {
  const num = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(num) ? Math.round(num) : null;
}

function toNullableTimestamp(value: unknown): number | null {
  const num = toFiniteNumber(value);
  return num && num > 0 ? num : null;
}

function clamp01(value: unknown, fallback: number): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(1, Number(num.toFixed(2))));
}

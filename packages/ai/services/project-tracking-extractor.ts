import type { ConversationRouteMessage, ConversationRouteSnapshot } from './conversation-route-types';
import { cleanStringList, trimText } from './project-tracking-service';
import type { ProjectDelta, ProjectEventDraft, ProjectMilestonePatch, ProjectSnapshot, TrackedProject } from './project-tracking-types';

export interface ExtractProjectDeltaInput {
  conversationId: string;
  messages: ConversationRouteMessage[];
  project: TrackedProject;
  routeSnapshot?: ConversationRouteSnapshot | null;
  snapshot?: ProjectSnapshot | null;
}

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

export function extractProjectDelta(input: ExtractProjectDeltaInput): ProjectDelta {
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

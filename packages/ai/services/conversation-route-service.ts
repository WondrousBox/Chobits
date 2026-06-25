import type {
  ConversationRouteDelta,
  ConversationRouteDeltaEvent,
  ConversationRouteEvent,
  ConversationRouteEventStatus,
  ConversationRouteEventType,
  ConversationRouteMessage,
  ConversationRouteSnapshot,
  ConversationRouteSnapshotPatch,
  ConversationRouteTaskBrief,
  ConversationRouteTaskStatus
} from './conversation-route-types';

export const CONVERSATION_ROUTE_INJECTION_CHAR_LIMIT = 1200;

const MAX_ACTIVE_THREADS = 6;
const MAX_OPEN_TASKS = 8;
const MAX_RESOLVED_TASKS = 6;
const MAX_LIST_ITEMS = 8;
const MAX_CORRECTIONS = 5;
const MAX_DECISIONS = 5;
const MAX_BLOCKERS = 5;
const MAX_DELTA_EVENTS = 4;
const MAX_DELTA_EVENT_TAGS = 3;
const MAX_DELTA_EVENT_TITLE_LENGTH = 48;
const MAX_DELTA_EVENT_CONTENT_LENGTH = 160;
const MAX_DELTA_EVENT_EVIDENCE_LENGTH = 160;
const MAX_DELTA_PATCH_LIST_ITEMS = 3;
const MAX_DELTA_PATCH_LIST_ITEM_LENGTH = 80;
const MAX_DELTA_PATCH_SHORT_TEXT_LENGTH = 120;
const MAX_DELTA_PATCH_SUMMARY_LENGTH = 180;

const EVENT_TYPE_LABELS: Record<ConversationRouteEventType, string> = {
  assumption: '假设',
  blocker: '阻碍',
  constraint: '约束',
  decision: '决策',
  key_clue: '关键线索',
  open_question: '开放问题',
  preference: '偏好',
  summary_checkpoint: '阶段小结',
  task_added: '新增待办',
  task_done: '完成事项',
  task_progress: '任务进展',
  topic_shift: '话题转折',
  user_correction: '用户纠正',
  user_goal: '用户目的'
};

const TASK_EVENT_TYPES = new Set<ConversationRouteEventType>(['task_added', 'task_progress', 'task_done', 'blocker']);

export function createEmptyConversationRouteSnapshot(input: {
  conversationId: string;
  lastProcessedSeq?: number;
  now?: number;
  workspaceId?: string | null;
}): ConversationRouteSnapshot {
  const now = input.now ?? Date.now();
  return {
    activeThreads: [],
    blockers: [],
    conversationId: input.conversationId,
    decisions: [],
    keyClues: [],
    keyConstraints: [],
    lastProcessedSeq: input.lastProcessedSeq ?? 0,
    openTasks: [],
    resolvedTasks: [],
    summary: '',
    updatedAt: now,
    userCorrections: [],
    version: 1,
    workspaceId: input.workspaceId ?? null
  };
}

export function normalizeRouteDelta(raw: unknown): ConversationRouteDelta {
  const source = isRecord(raw) ? raw : {};
  const events = Array.isArray(source.events) ? source.events.map(normalizeDeltaEvent).filter((event): event is ConversationRouteDeltaEvent => !!event).slice(0, MAX_DELTA_EVENTS) : [];
  const snapshotPatch = normalizeSnapshotPatch(source.snapshotPatch);
  return { events, snapshotPatch };
}

export function reduceConversationRouteSnapshot(input: {
  delta: ConversationRouteDelta;
  existingEvents?: ConversationRouteEvent[];
  newEvents: ConversationRouteEvent[];
  now?: number;
  preservePreviousSnapshot?: boolean;
  previous?: ConversationRouteSnapshot | null;
  targetSeq: number;
  workspaceId?: string | null;
  conversationId: string;
}): ConversationRouteSnapshot {
  const now = input.now ?? Date.now();
  const previous =
    input.previous ??
    createEmptyConversationRouteSnapshot({
      conversationId: input.conversationId,
      workspaceId: input.workspaceId,
      now
    });

  const snapshotEvents = [...(input.existingEvents ?? []), ...input.newEvents]
    .sort((a, b) => {
      const byImportance = b.importance - a.importance;
      if (Math.abs(byImportance) > 0.001) return byImportance;
      return b.createdAt - a.createdAt;
    });
  const currentEvents = snapshotEvents.filter((event) => event.status === 'active');
  const taskEvents = snapshotEvents.filter((event) => event.status === 'active' || event.status === 'resolved');

  const patch = input.delta.snapshotPatch ?? {};
  const previousForMerge = input.preservePreviousSnapshot === false ? undefined : previous;
  const openTasks = deriveOpenTasks(previous.openTasks, input.newEvents, snapshotEvents);
  const resolvedTasks = deriveResolvedTasks(previousForMerge?.resolvedTasks ?? [], input.newEvents, taskEvents);

  const next: ConversationRouteSnapshot = {
    activeThreads: limitList(mergeTextLists(patch.activeThreads, collectEventTitles(currentEvents, ['topic_shift', 'user_goal']), previousForMerge?.activeThreads), MAX_ACTIVE_THREADS),
    blockers: limitList(mergeTextLists(patch.blockers, collectEventTitles(currentEvents, ['blocker']), previousForMerge?.blockers), MAX_BLOCKERS),
    conversationId: previous.conversationId || input.conversationId,
    currentGoal: firstNonEmpty(patch.currentGoal, latestEventContent(currentEvents, 'user_goal'), previousForMerge?.currentGoal),
    currentTopic: firstNonEmpty(patch.currentTopic, latestEventContent(currentEvents, 'topic_shift'), previousForMerge?.currentTopic),
    decisions: limitList(mergeTextLists(patch.decisions, collectEventTitles(currentEvents, ['decision']), previousForMerge?.decisions), MAX_DECISIONS),
    keyClues: limitList(mergeTextLists(patch.keyClues, collectEventTitles(currentEvents, ['key_clue', 'open_question']), previousForMerge?.keyClues), MAX_LIST_ITEMS),
    keyConstraints: limitList(mergeTextLists(patch.keyConstraints, collectEventTitles(currentEvents, ['constraint', 'preference']), previousForMerge?.keyConstraints), MAX_LIST_ITEMS),
    lastProcessedSeq: Math.max(previous.lastProcessedSeq ?? 0, input.targetSeq),
    nextSuggestedFocus: firstNonEmpty(patch.nextSuggestedFocus, previousForMerge?.nextSuggestedFocus),
    openTasks,
    resolvedTasks,
    summary: trimText(firstNonEmpty(patch.summary, buildFallbackSummary(patch, currentEvents), previousForMerge?.summary) ?? '', 500),
    updatedAt: now,
    userCorrections: limitList(mergeTextLists(patch.userCorrections, collectEventTitles(currentEvents, ['user_correction']), previousForMerge?.userCorrections), MAX_CORRECTIONS),
    version: (previous.version ?? 0) + 1,
    workspaceId: input.workspaceId ?? previous.workspaceId ?? null
  };

  return next;
}

export function materializeDeltaEvents(input: {
  conversationId: string;
  delta: ConversationRouteDelta;
  maxSeq: number;
  minSeq: number;
  now?: number;
  workspaceId?: string | null;
}): Omit<ConversationRouteEvent, 'id'>[] {
  const now = input.now ?? Date.now();
  const events: Omit<ConversationRouteEvent, 'id'>[] = [];
  for (const event of input.delta.events) {
      const type = event.type;
      if (!type) continue;
      const title = trimText(event.title || event.content || EVENT_TYPE_LABELS[type], 120);
      const content = trimText(event.content || event.title || EVENT_TYPE_LABELS[type], 500);
      if (!title || !content) continue;
      const seqStart = clampInteger(event.seqStart ?? input.minSeq, input.minSeq, input.maxSeq);
      const seqEnd = clampInteger(event.seqEnd ?? seqStart, seqStart, input.maxSeq);

      events.push({
        confidence: clampNumber(event.confidence ?? 0.6),
        content,
        conversationId: input.conversationId,
        createdAt: now,
        evidence: trimText(event.evidence || '', 500) || null,
        importance: clampNumber(event.importance ?? 0.6),
        metadata: null,
        promotedMemoryNoteId: null,
        relatedEventIds: cleanStringList(event.relatedEventIds, 8),
        resolvesEventIds: cleanStringList(event.resolvesEventIds, 8),
        seqEnd,
        seqStart,
        status: normalizeStatus(event.status),
        supersedesEventIds: cleanStringList(event.supersedesEventIds, 8),
        tags: cleanStringList(event.tags, 8),
        title,
        type,
        updatedAt: now,
        workspaceId: input.workspaceId ?? null
      });
  }
  return events;
}

export function formatConversationRouteMessages(messages: ConversationRouteMessage[], charLimit = 7000): string {
  const chunks = messages.map((message) => {
    const text = trimText(message.content.replace(/\s+/g, ' ').trim(), 1200);
    return `[seq:${message.seq} role:${message.role}] ${text}`;
  });

  const output: string[] = [];
  let total = 0;
  for (const chunk of chunks) {
    if (total + chunk.length > charLimit) break;
    output.push(chunk);
    total += chunk.length;
  }
  return output.join('\n');
}

export function formatConversationRouteSnapshotForPrompt(snapshot: ConversationRouteSnapshot, charLimit = CONVERSATION_ROUTE_INJECTION_CHAR_LIMIT): string {
  const lines: string[] = [];
  if (snapshot.currentGoal) lines.push(`当前目标: ${snapshot.currentGoal}`);
  if (snapshot.currentTopic) lines.push(`当前话题: ${snapshot.currentTopic}`);
  pushList(lines, '活跃线路', snapshot.activeThreads, 4);
  pushTaskList(lines, '待办', snapshot.openTasks, 6);
  pushList(lines, '用户纠正', snapshot.userCorrections, 5);
  pushList(lines, '关键线索', snapshot.keyClues, 6);
  pushList(lines, '决策', snapshot.decisions, 4);
  pushList(lines, '约束', snapshot.keyConstraints, 5);
  pushList(lines, '阻碍', snapshot.blockers, 4);
  if (snapshot.nextSuggestedFocus) lines.push(`下一步建议: ${snapshot.nextSuggestedFocus}`);
  if (snapshot.summary) lines.push(`简短总结: ${snapshot.summary}`);

  const body = trimText(lines.join('\n'), charLimit);
  if (!body.trim()) return '';

  return `<conversation_route>\n${body}\n</conversation_route>\n请把它作为当前会话的过程地图使用；如果它与用户最新消息冲突，以用户最新消息为准。`;
}

export function formatConversationRouteSnapshotForDisplay(snapshot: ConversationRouteSnapshot | null | undefined): ConversationRouteSnapshot | null {
  if (!snapshot) return null;
  return {
    ...snapshot,
    activeThreads: [...snapshot.activeThreads],
    blockers: [...snapshot.blockers],
    decisions: [...snapshot.decisions],
    keyClues: [...snapshot.keyClues],
    keyConstraints: [...snapshot.keyConstraints],
    openTasks: snapshot.openTasks.map((task) => ({ ...task })),
    resolvedTasks: snapshot.resolvedTasks.map((task) => ({ ...task })),
    userCorrections: [...snapshot.userCorrections]
  };
}

function normalizeDeltaEvent(value: unknown): ConversationRouteDeltaEvent | null {
  if (!isRecord(value)) return null;
  const type = typeof value.type === 'string' ? value.type : undefined;
  if (!type || !isEventType(type)) return null;
  return {
    confidence: numericOrUndefined(value.confidence),
    content: stringOrUndefined(value.content, MAX_DELTA_EVENT_CONTENT_LENGTH),
    evidence: stringOrUndefined(value.evidence, MAX_DELTA_EVENT_EVIDENCE_LENGTH),
    importance: numericOrUndefined(value.importance),
    relatedEventIds: arrayOfStrings(value.relatedEventIds, 8, 80),
    resolvesEventIds: arrayOfStrings(value.resolvesEventIds),
    seqEnd: integerOrUndefined(value.seqEnd),
    seqStart: integerOrUndefined(value.seqStart),
    status: isStatus(value.status) ? value.status : undefined,
    supersedesEventIds: arrayOfStrings(value.supersedesEventIds),
    tags: arrayOfStrings(value.tags, MAX_DELTA_EVENT_TAGS, 40),
    title: stringOrUndefined(value.title, MAX_DELTA_EVENT_TITLE_LENGTH),
    type
  };
}

function normalizeSnapshotPatch(value: unknown): ConversationRouteSnapshotPatch {
  if (!isRecord(value)) return {};
  return {
    activeThreads: arrayOfStrings(value.activeThreads, MAX_DELTA_PATCH_LIST_ITEMS, MAX_DELTA_PATCH_LIST_ITEM_LENGTH),
    blockers: arrayOfStrings(value.blockers, MAX_DELTA_PATCH_LIST_ITEMS, MAX_DELTA_PATCH_LIST_ITEM_LENGTH),
    currentGoal: stringOrUndefined(value.currentGoal, MAX_DELTA_PATCH_SHORT_TEXT_LENGTH),
    currentTopic: stringOrUndefined(value.currentTopic, MAX_DELTA_PATCH_SHORT_TEXT_LENGTH),
    decisions: arrayOfStrings(value.decisions, MAX_DELTA_PATCH_LIST_ITEMS, MAX_DELTA_PATCH_LIST_ITEM_LENGTH),
    keyClues: arrayOfStrings(value.keyClues, MAX_DELTA_PATCH_LIST_ITEMS, MAX_DELTA_PATCH_LIST_ITEM_LENGTH),
    keyConstraints: arrayOfStrings(value.keyConstraints, MAX_DELTA_PATCH_LIST_ITEMS, MAX_DELTA_PATCH_LIST_ITEM_LENGTH),
    nextSuggestedFocus: stringOrUndefined(value.nextSuggestedFocus, MAX_DELTA_PATCH_SHORT_TEXT_LENGTH),
    summary: stringOrUndefined(value.summary, MAX_DELTA_PATCH_SUMMARY_LENGTH),
    userCorrections: arrayOfStrings(value.userCorrections, MAX_DELTA_PATCH_LIST_ITEMS, MAX_DELTA_PATCH_LIST_ITEM_LENGTH)
  };
}

function deriveOpenTasks(previousTasks: ConversationRouteTaskBrief[], newEvents: ConversationRouteEvent[], events: ConversationRouteEvent[]): ConversationRouteTaskBrief[] {
  const tasks = new Map<string, ConversationRouteTaskBrief>();
  const eventById = new Map(events.map((event) => [event.id, event]));

  for (const task of previousTasks) {
    if (task.status === 'resolved' || task.status === 'abandoned') continue;
    const sourceEvent = eventById.get(task.eventId);
    if (sourceEvent && sourceEvent.status !== 'active') continue;
    tasks.set(task.eventId, { ...task });
  }

  const resolvedIds = new Set(newEvents.flatMap((event) => event.resolvesEventIds));
  for (const eventId of resolvedIds) {
    tasks.delete(eventId);
  }

  for (const event of events) {
    if (event.status !== 'active') continue;
    if (!TASK_EVENT_TYPES.has(event.type)) continue;
    if (event.type === 'task_done') continue;
    const status = event.type === 'blocker' ? 'blocked' : event.type === 'task_progress' ? 'in_progress' : 'active';
    tasks.set(event.id, {
      eventId: event.id,
      status,
      title: event.title
    });
  }

  return Array.from(tasks.values()).slice(0, MAX_OPEN_TASKS);
}

function deriveResolvedTasks(previousTasks: ConversationRouteTaskBrief[], newEvents: ConversationRouteEvent[], activeEvents: ConversationRouteEvent[]): ConversationRouteTaskBrief[] {
  const tasks: ConversationRouteTaskBrief[] = [...previousTasks];
  for (const event of newEvents) {
    if (event.type === 'task_done' || event.status === 'resolved') {
      tasks.unshift({
        eventId: event.id,
        status: 'resolved',
        title: event.title
      });
    }
  }

  for (const event of activeEvents) {
    if (event.status !== 'resolved' || !TASK_EVENT_TYPES.has(event.type)) continue;
    tasks.unshift({
      eventId: event.id,
      status: 'resolved',
      title: event.title
    });
  }

  return dedupeTasks(tasks).slice(0, MAX_RESOLVED_TASKS);
}

function dedupeTasks(tasks: ConversationRouteTaskBrief[]): ConversationRouteTaskBrief[] {
  const seen = new Set<string>();
  const out: ConversationRouteTaskBrief[] = [];
  for (const task of tasks) {
    const key = task.eventId || task.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(task);
  }
  return out;
}

function collectEventTitles(events: ConversationRouteEvent[], types: ConversationRouteEventType[]): string[] {
  const wanted = new Set(types);
  return events.filter((event) => wanted.has(event.type)).map((event) => event.title || event.content);
}

function latestEventContent(events: ConversationRouteEvent[], type: ConversationRouteEventType): string | undefined {
  return events
    .filter((event) => event.type === type)
    .sort((a, b) => b.seqEnd - a.seqEnd || b.updatedAt - a.updatedAt)
    .map((event) => event.content || event.title)
    .find(Boolean);
}

function mergeTextLists(...lists: Array<string[] | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const list of lists) {
    for (const item of list ?? []) {
      const text = trimText(String(item || '').trim(), 180);
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(text);
    }
  }
  return result;
}

function buildFallbackSummary(patch: ConversationRouteSnapshotPatch, events: ConversationRouteEvent[]): string {
  if (patch.currentGoal && patch.currentTopic) return `${patch.currentGoal}；当前聚焦 ${patch.currentTopic}`;
  const top = events.slice(0, 3).map((event) => event.title);
  return top.length ? top.join('；') : '';
}

function pushList(lines: string[], label: string, values: string[], limit: number): void {
  const items = values.slice(0, limit).filter(Boolean);
  if (!items.length) return;
  lines.push(`${label}:`);
  for (const item of items) lines.push(`- ${item}`);
}

function pushTaskList(lines: string[], label: string, tasks: ConversationRouteTaskBrief[], limit: number): void {
  const items = tasks.slice(0, limit).filter((task) => task.title);
  if (!items.length) return;
  lines.push(`${label}:`);
  for (const task of items) lines.push(`- [${task.status}] ${task.title}`);
}

function limitList(values: string[], limit: number): string[] {
  return values.slice(0, limit);
}

function firstNonEmpty(...values: Array<string | undefined | null>): string | undefined {
  for (const value of values) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text) return text;
  }
  return undefined;
}

function cleanStringList(values: unknown, limit: number): string[] {
  return (arrayOfStrings(values) ?? []).map((value) => trimText(value, 100)).filter(Boolean).slice(0, limit);
}

function trimText(value: string, limit: number): string {
  const text = value.trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trim()}…`;
}

function clampInteger(value: number, min: number, max: number): number {
  const n = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.max(min, Math.min(max, n));
}

function clampNumber(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function normalizeStatus(status: ConversationRouteEventStatus | undefined): ConversationRouteEventStatus {
  return isStatus(status) ? status : 'active';
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isEventType(value: string): value is ConversationRouteEventType {
  return value in EVENT_TYPE_LABELS;
}

function isStatus(value: unknown): value is ConversationRouteEventStatus {
  return value === 'active' || value === 'resolved' || value === 'superseded' || value === 'abandoned';
}

function stringOrUndefined(value: unknown, limit?: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text) return undefined;
  return typeof limit === 'number' ? trimText(text, limit) : text;
}

function numericOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function integerOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : undefined;
}

function arrayOfStrings(value: unknown, limit?: number, itemLimit?: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => trimText(entry.trim(), itemLimit ?? 100))
    .filter(Boolean)
    .slice(0, limit);
  return values.length ? values : undefined;
}

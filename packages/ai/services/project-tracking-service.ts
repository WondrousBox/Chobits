import type { ProjectDateBrief, ProjectEvent, ProjectSnapshot, ProjectStatus, ProjectTaskBrief, ProjectTrackingConfig } from './project-tracking-types';

export const PROJECT_TRACKING_INJECTION_CHAR_LIMIT = 1600;

export const DEFAULT_PROJECT_TRACKING_CONFIG: ProjectTrackingConfig = {
  autoDetectEnabled: false,
  autoLinkEnabled: false,
  candidateCooldownMinutes: 60,
  enabled: true,
  promptInjectionEnabled: false,
  reminderSuggestionEnabled: false
};

export function normalizeProjectTrackingConfig(input: Partial<ProjectTrackingConfig> = {}): ProjectTrackingConfig {
  const merged = { ...DEFAULT_PROJECT_TRACKING_CONFIG, ...input };
  return {
    autoDetectEnabled: Boolean(merged.autoDetectEnabled),
    autoLinkEnabled: Boolean(merged.autoLinkEnabled),
    candidateCooldownMinutes: clampInteger(merged.candidateCooldownMinutes, 5, 24 * 60),
    enabled: Boolean(merged.enabled),
    promptInjectionEnabled: Boolean(merged.promptInjectionEnabled),
    reminderSuggestionEnabled: Boolean(merged.reminderSuggestionEnabled)
  };
}

export function createEmptyProjectSnapshot(input: { goal: string; now?: number; projectId: string; status?: ProjectStatus; summary?: string; workspaceId: string }): ProjectSnapshot {
  const now = input.now ?? Date.now();
  return {
    agreements: [],
    blockers: [],
    changes: [],
    completedMilestones: [],
    decisions: [],
    goal: input.goal,
    openTasks: [],
    projectId: input.projectId,
    recentProgress: [],
    risks: [],
    status: input.status ?? 'active',
    summary: input.summary ?? input.goal,
    upcomingDates: [],
    updatedAt: now,
    version: 1,
    workspaceId: input.workspaceId
  };
}

export function formatProjectSnapshotForPrompt(snapshot: ProjectSnapshot, charLimit = PROJECT_TRACKING_INJECTION_CHAR_LIMIT): string {
  if (!snapshot || snapshot.status === 'archived' || snapshot.status === 'rejected') return '';

  const lines: string[] = [];
  lines.push(`项目状态: ${snapshot.status}`);
  if (snapshot.goal) lines.push(`目标: ${snapshot.goal}`);
  if (snapshot.currentFocus) lines.push(`当前重点: ${snapshot.currentFocus}`);
  pushDateList(lines, '临近时间点', snapshot.upcomingDates, 5);
  pushTaskList(lines, '开放事项', snapshot.openTasks, 6);
  pushList(lines, '最近进展', snapshot.recentProgress, 5);
  pushList(lines, '决策', snapshot.decisions, 5);
  pushList(lines, '协议', snapshot.agreements, 4);
  pushList(lines, '阻塞', snapshot.blockers, 4);
  pushList(lines, '风险', snapshot.risks, 4);
  pushList(lines, '变更', snapshot.changes, 4);
  pushList(lines, '已完成里程碑', snapshot.completedMilestones, 4);
  if (snapshot.nextSuggestedAction) lines.push(`下一步建议: ${snapshot.nextSuggestedAction}`);
  if (snapshot.summary) lines.push(`摘要: ${snapshot.summary}`);

  const body = trimText(lines.join('\n'), charLimit);
  if (!body.trim()) return '';

  return `<active_project project_id="${escapeXmlAttribute(snapshot.projectId)}">\n${body}\n</active_project>\n请把它作为当前项目状态使用；如果它与用户最新消息冲突，以用户最新消息为准。`;
}

export function reduceProjectSnapshotFromEvents(input: {
  events: ProjectEvent[];
  goal: string;
  now?: number;
  previous?: ProjectSnapshot | null;
  projectId: string;
  status: ProjectStatus;
  summary: string;
  workspaceId: string;
}): ProjectSnapshot {
  const now = input.now ?? Date.now();
  const activeEvents = input.events.filter((event) => event.status === 'active');
  const resolvedEvents = input.events.filter((event) => event.status === 'resolved');

  return {
    agreements: collectTitles(activeEvents, ['agreement_reached'], 6),
    blockers: collectTitles(activeEvents, ['blocker_found'], 6),
    changes: collectTitles(activeEvents, ['plan_changed', 'deadline_changed', 'scope_defined'], 6),
    completedMilestones: collectTitles([...activeEvents, ...resolvedEvents], ['milestone_reached'], 6),
    currentFocus: firstTitle(activeEvents, ['task_progress', 'task_added', 'milestone_added']) ?? input.previous?.currentFocus,
    decisions: collectTitles(activeEvents, ['decision_made', 'goal_defined'], 6),
    goal: input.goal,
    nextSuggestedAction: input.previous?.nextSuggestedAction,
    openTasks: deriveOpenTasks(activeEvents, resolvedEvents),
    projectId: input.projectId,
    recentProgress: collectTitles([...activeEvents, ...resolvedEvents], ['task_progress', 'task_done', 'meeting_done', 'summary_checkpoint'], 6),
    risks: collectTitles(activeEvents, ['risk_identified'], 6),
    status: input.status,
    summary: input.summary,
    upcomingDates: deriveUpcomingDates(activeEvents),
    updatedAt: now,
    version: (input.previous?.version ?? 0) + 1,
    workspaceId: input.workspaceId
  };
}

export function cleanStringList(value: unknown, limit = 20): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const text = item.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
    if (output.length >= limit) break;
  }
  return output;
}

export function trimText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function pushList(lines: string[], label: string, values: string[], limit: number): void {
  const items = values.filter(Boolean).slice(0, limit);
  if (!items.length) return;
  lines.push(`${label}:`);
  for (const item of items) lines.push(`- ${item}`);
}

function pushTaskList(lines: string[], label: string, values: ProjectTaskBrief[], limit: number): void {
  const items = values.filter((item) => item.title).slice(0, limit);
  if (!items.length) return;
  lines.push(`${label}:`);
  for (const item of items) lines.push(`- [${item.status}] ${item.title}`);
}

function pushDateList(lines: string[], label: string, values: ProjectSnapshot['upcomingDates'], limit: number): void {
  const items = values.filter((item) => item.title && item.at).slice(0, limit);
  if (!items.length) return;
  lines.push(`${label}:`);
  for (const item of items) lines.push(`- ${new Date(item.at).toISOString().slice(0, 10)} [${item.kind}/${item.status}] ${item.title}`);
}

function collectTitles(events: ProjectEvent[], types: ProjectEvent['type'][], limit: number): string[] {
  return cleanStringList(
    events
      .filter((event) => types.includes(event.type))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((event) => event.title),
    limit
  );
}

function firstTitle(events: ProjectEvent[], types: ProjectEvent['type'][]): string | undefined {
  return events
    .filter((event) => types.includes(event.type))
    .sort((a, b) => b.importance - a.importance || b.createdAt - a.createdAt)
    .map((event) => event.title)
    .find(Boolean);
}

function deriveOpenTasks(events: ProjectEvent[], resolvedEvents: ProjectEvent[] = []): ProjectTaskBrief[] {
  const doneTitles = new Set(resolvedEvents.filter((event) => event.type === 'task_done' || event.type === 'milestone_reached').map((event) => normalizeTaskTitle(event.title)));
  return events
    .filter((event) => event.type === 'task_added' || event.type === 'task_progress' || event.type === 'blocker_found')
    .filter((event) => !doneTitles.has(normalizeTaskTitle(event.title)))
    .sort((a, b) => b.importance - a.importance || b.createdAt - a.createdAt)
    .slice(0, 8)
    .map((event) => ({
      dueAt: event.dueAt ?? undefined,
      eventId: event.id,
      status: event.type === 'blocker_found' ? 'blocked' : event.type === 'task_progress' ? 'in_progress' : 'active',
      title: event.title
    }));
}

function normalizeTaskTitle(value: string): string {
  return value
    .replace(/\s+/g, '')
    .replace(/[，。！？、；：,.!?;:()[\]{}"'`]/g, '')
    .toLowerCase();
}

function deriveUpcomingDates(events: ProjectEvent[]): ProjectDateBrief[] {
  return events
    .filter((event) => event.dueAt || event.eventTime)
    .sort((a, b) => (a.dueAt ?? a.eventTime ?? 0) - (b.dueAt ?? b.eventTime ?? 0))
    .slice(0, 8)
    .map((event) => ({
      at: event.dueAt ?? event.eventTime ?? Date.now(),
      kind: event.type === 'meeting_scheduled' ? 'meeting' : event.type === 'milestone_added' ? 'milestone' : 'deadline',
      status: 'upcoming',
      title: event.title
    }));
}

function clampInteger(value: unknown, min: number, max: number): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : min;
  return Math.min(max, Math.max(min, num));
}

function escapeXmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

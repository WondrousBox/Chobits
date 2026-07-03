import type {
  ProjectDateBrief,
  ProjectEvent,
  ProjectEventQuality,
  ProjectEventType,
  ProjectMilestone,
  ProjectPrivacySettings,
  ProjectReminderSuggestion,
  ProjectSnapshot,
  ProjectStatus,
  ProjectTaskBrief,
  ProjectTrackingConfig,
  TrackedProject
} from './project-tracking-types';

export const PROJECT_TRACKING_INJECTION_CHAR_LIMIT = 1600;

export const DEFAULT_PROJECT_TRACKING_CONFIG: ProjectTrackingConfig = {
  autoDetectEnabled: false,
  autoLinkEnabled: false,
  candidateCooldownMinutes: 60,
  enabled: true,
  llmProjectDelta: {
    enabled: false,
    maxTokens: 1200,
    minMessageChars: 600,
    minMessages: 4,
    temperature: 0.1
  },
  promptInjectionEnabled: false,
  reminderSuggestionEnabled: false
};

export const DEFAULT_PROJECT_PRIVACY_SETTINGS: ProjectPrivacySettings = {
  allowAutoLinking: true,
  allowLongTermMemoryPromotion: true,
  allowPromptInjection: true,
  allowReminderSuggestions: true,
  sensitive: false
};

export function normalizeProjectPrivacySettings(input: Partial<ProjectPrivacySettings> = {}): ProjectPrivacySettings {
  return {
    allowAutoLinking: input.allowAutoLinking ?? DEFAULT_PROJECT_PRIVACY_SETTINGS.allowAutoLinking,
    allowLongTermMemoryPromotion: input.allowLongTermMemoryPromotion ?? DEFAULT_PROJECT_PRIVACY_SETTINGS.allowLongTermMemoryPromotion,
    allowPromptInjection: input.allowPromptInjection ?? DEFAULT_PROJECT_PRIVACY_SETTINGS.allowPromptInjection,
    allowReminderSuggestions: input.allowReminderSuggestions ?? DEFAULT_PROJECT_PRIVACY_SETTINGS.allowReminderSuggestions,
    sensitive: input.sensitive ?? DEFAULT_PROJECT_PRIVACY_SETTINGS.sensitive
  };
}

export const HIGH_RISK_PROJECT_EVENT_TYPES: ProjectEventType[] = ['agreement_reached', 'decision_made', 'deadline_changed', 'reminder_scheduled', 'status_changed'];

export function isHighRiskProjectEventType(type: ProjectEventType): boolean {
  return HIGH_RISK_PROJECT_EVENT_TYPES.includes(type);
}

export function getDefaultProjectEventQuality(input: { createdBy?: 'agent' | 'system' | 'user'; needsUserConfirmation?: boolean; type: ProjectEventType }): ProjectEventQuality {
  if (input.needsUserConfirmation || isHighRiskProjectEventType(input.type)) return 'draft';
  return input.createdBy === 'user' || input.createdBy === 'agent' ? 'accepted' : 'draft';
}

export function normalizeProjectTrackingConfig(input: Partial<ProjectTrackingConfig> = {}): ProjectTrackingConfig {
  const merged = { ...DEFAULT_PROJECT_TRACKING_CONFIG, ...input };
  const llmProjectDelta = { ...DEFAULT_PROJECT_TRACKING_CONFIG.llmProjectDelta, ...(merged.llmProjectDelta || {}) };
  return {
    autoDetectEnabled: Boolean(merged.autoDetectEnabled),
    autoLinkEnabled: Boolean(merged.autoLinkEnabled),
    candidateCooldownMinutes: clampInteger(merged.candidateCooldownMinutes, 5, 24 * 60),
    enabled: Boolean(merged.enabled),
    llmProjectDelta: {
      enabled: Boolean(llmProjectDelta.enabled),
      maxTokens: clampInteger(llmProjectDelta.maxTokens, 256, 4000),
      minMessageChars: clampInteger(llmProjectDelta.minMessageChars, 120, 5000),
      minMessages: clampInteger(llmProjectDelta.minMessages, 1, 20),
      model: llmProjectDelta.model?.trim() || undefined,
      providerId: llmProjectDelta.providerId?.trim() || undefined,
      providerPresetId: llmProjectDelta.providerPresetId?.trim() || undefined,
      temperature: clampNumber(llmProjectDelta.temperature, 0, 1)
    },
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
  const acceptedEvents = input.events.filter((event) => event.quality === 'accepted');
  const activeEvents = acceptedEvents.filter((event) => event.status === 'active');
  const resolvedEvents = acceptedEvents.filter((event) => event.status === 'resolved');

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

export function buildProjectReminderSuggestions(input: { events: ProjectEvent[]; now?: number; project: TrackedProject; snapshot?: ProjectSnapshot | null }): ProjectReminderSuggestion[] {
  if (!input.project.privacySettings.allowReminderSuggestions || input.project.status !== 'active') return [];
  const now = input.now ?? Date.now();
  const suggestions: ProjectReminderSuggestion[] = [];
  const accepted = input.events.filter((event) => event.quality === 'accepted' && event.status === 'active');
  for (const event of accepted) {
    const dueAt = event.dueAt ?? event.eventTime ?? null;
    if (!dueAt || dueAt < now - 24 * 60 * 60 * 1000) continue;
    if (event.type === 'deadline_changed') {
      suggestions.push({
        confidence: event.confidence,
        dueAt,
        kind: 'deadline',
        needsConfirmation: true,
        projectId: event.projectId,
        reason: `项目时间点来自事件：${event.title}`,
        sourceEventId: event.id,
        sourceType: 'event',
        title: event.title
      });
    } else if (event.type === 'meeting_scheduled') {
      suggestions.push({
        confidence: event.confidence,
        dueAt,
        kind: 'meeting',
        needsConfirmation: true,
        projectId: event.projectId,
        reason: `项目会议来自事件：${event.title}`,
        sourceEventId: event.id,
        sourceType: 'event',
        title: event.title
      });
    }
  }
  if (input.snapshot?.openTasks.length) {
    suggestions.push({
      confidence: 0.6,
      dueAt: now + 3 * 24 * 60 * 60 * 1000,
      kind: 'stale_project_check',
      needsConfirmation: true,
      projectId: input.project.id,
      reason: '项目仍有开放事项，建议设置阶段性跟进提醒',
      sourceType: 'snapshot',
      title: `跟进项目：${input.project.name}`
    });
  }
  return dedupeReminderSuggestions(suggestions).slice(0, 8);
}

export function generateProjectCompletionSummary(input: { events: ProjectEvent[]; milestones: ProjectMilestone[]; project: TrackedProject; snapshot?: ProjectSnapshot | null }): string {
  const accepted = input.events.filter((event) => event.quality === 'accepted');
  const completedMilestones = input.milestones.filter((milestone) => milestone.status === 'done').map((milestone) => milestone.title);
  const progress = collectTitles(accepted, ['task_done', 'milestone_reached', 'summary_checkpoint'], 8);
  const decisions = collectTitles(accepted, ['decision_made'], 6);
  const agreements = collectTitles(accepted, ['agreement_reached'], 6);
  const openTasks = input.snapshot?.openTasks.map((task) => task.title).slice(0, 6) ?? [];
  const lines = [`项目：${input.project.name}`, `目标：${input.project.goal}`];
  pushList(lines, '已完成里程碑', completedMilestones, 8);
  pushList(lines, '主要进展', progress, 8);
  pushList(lines, '关键决策', decisions, 6);
  pushList(lines, '关键协议', agreements, 6);
  pushList(lines, '遗留事项', openTasks, 6);
  return lines.join('\n');
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

function dedupeReminderSuggestions(suggestions: ProjectReminderSuggestion[]): ProjectReminderSuggestion[] {
  const seen = new Set<string>();
  const output: ProjectReminderSuggestion[] = [];
  for (const suggestion of suggestions) {
    const key = `${suggestion.kind}:${suggestion.sourceEventId ?? suggestion.title}:${suggestion.dueAt ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(suggestion);
  }
  return output;
}

function clampInteger(value: unknown, min: number, max: number): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : min;
  return Math.min(max, Math.max(min, num));
}

function clampNumber(value: unknown, min: number, max: number): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, num));
}

function escapeXmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

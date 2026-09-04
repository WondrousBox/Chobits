import type { SpritePurposeDailyRetrospective, SpritePurposeHistoryEntry, SpritePurposeRetrospectiveItem, SpritePurposeRetrospectiveQuery } from './types';

type PurposeHistoryGroup = {
  purposeId: string;
  entries: SpritePurposeHistoryEntry[];
};

const TERMINAL_PURPOSE_EVENTS = new Set<SpritePurposeHistoryEntry['eventType']>(['purpose:completed', 'purpose:cancelled', 'purpose:failed', 'purpose:superseded']);
const MEMORY_KIND_HINTS = ['daily.', 'ai.'];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function formatLocalDateStamp(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function truncateText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function groupByPurpose(entries: SpritePurposeHistoryEntry[]): PurposeHistoryGroup[] {
  const groups = new Map<string, SpritePurposeHistoryEntry[]>();
  for (const entry of entries) {
    const current = groups.get(entry.purposeId) ?? [];
    current.push(entry);
    groups.set(entry.purposeId, current);
  }
  return Array.from(groups.entries()).map(([purposeId, groupEntries]) => ({
    purposeId,
    entries: groupEntries.sort((a, b) => a.timestamp - b.timestamp)
  }));
}

function findTerminalEntry(entries: SpritePurposeHistoryEntry[]): SpritePurposeHistoryEntry | undefined {
  return [...entries].reverse().find((entry) => TERMINAL_PURPOSE_EVENTS.has(entry.eventType));
}

function inferMemoryWorthiness(input: { purposeKind: string; status: string; source?: string; priority?: number; summary?: string; failedStepIds: string[]; plannerFallbackReason?: string }): number {
  if (input.purposeKind === 'idle.presence') {
    return 0;
  }

  let score = 0.12;
  if (input.source === 'user-event') score += 0.24;
  if (input.source === 'app-event' || input.source === 'system-event') score += 0.16;
  if (input.source === 'ai' || input.source === 'manual') score += 0.2;

  if ((input.priority ?? 0) >= 100) score += 0.22;
  else if ((input.priority ?? 0) >= 80) score += 0.18;
  else if ((input.priority ?? 0) >= 60) score += 0.1;

  if (input.status === 'failed' || input.status === 'cancelled') score += 0.18;
  if (input.status === 'completed') score += 0.08;
  if (MEMORY_KIND_HINTS.some((hint) => input.purposeKind.startsWith(hint))) score += 0.16;
  if (input.failedStepIds.length > 0) score += 0.14;
  if (input.plannerFallbackReason) score += 0.18;
  if ((input.summary ?? '').length > 0) score += 0.04;

  return clamp01(score);
}

function createOutcome(status: string, durationMs: number | undefined, stepCount: number, plannerFallbackReason?: string): string {
  const parts = [status];
  if (typeof durationMs === 'number') {
    parts.push(`after ${durationMs}ms`);
  }
  if (stepCount > 0) {
    parts.push(`with ${stepCount} steps`);
  }
  if (plannerFallbackReason) {
    parts.push(`planner fallback: ${plannerFallbackReason}`);
  }
  return parts.join(' ');
}

function createRecallCue(item: Omit<SpritePurposeRetrospectiveItem, 'memoryCandidate' | 'recallCue'>): string | undefined {
  if (item.memoryWorthiness < 0.55) {
    return undefined;
  }

  const summary = item.summary ? `: ${truncateText(item.summary, 96)}` : '';
  return `- [event] Sprite purpose ${item.purposeKind} ${item.status}${summary} (${item.outcome})`;
}

function buildItem(group: PurposeHistoryGroup): SpritePurposeRetrospectiveItem | null {
  const terminal = findTerminalEntry(group.entries);
  if (!terminal) {
    return null;
  }

  const started = group.entries.find((entry) => entry.eventType === 'purpose:started') ?? group.entries.find((entry) => entry.eventType === 'purpose:created');
  const routineTerminal = [...group.entries].reverse().find((entry) => entry.eventType === 'routine:completed' || entry.eventType === 'routine:failed' || entry.eventType === 'routine:cancelled');
  const plannerFallback = [...group.entries].reverse().find((entry) => entry.eventType === 'planner:fallback');
  const completedStepIds = group.entries.filter((entry) => entry.eventType === 'step:completed' && entry.stepId).map((entry) => entry.stepId!);
  const failedStepIds = group.entries.filter((entry) => (entry.eventType === 'step:failed' || entry.eventType === 'step:timed-out') && entry.stepId).map((entry) => entry.stepId!);
  const summary = terminal.summary ?? started?.summary;
  const status = terminal.status ?? 'completed';
  const durationMs = started ? terminal.timestamp - started.timestamp : undefined;
  const stepCount = typeof routineTerminal?.result?.stepCount === 'number' ? routineTerminal.result.stepCount : completedStepIds.length + failedStepIds.length;
  const plannerFallbackReason = typeof plannerFallback?.result?.reason === 'string' ? plannerFallback.result.reason : plannerFallback?.summary;
  const purposeKind = terminal.purposeKind ?? started?.purposeKind ?? 'unknown';

  const base = {
    purposeId: group.purposeId,
    purposeKind,
    status,
    source: terminal.source ?? started?.source,
    priority: terminal.priority ?? started?.priority,
    startedAt: started?.timestamp,
    endedAt: terminal.timestamp,
    durationMs,
    summary,
    outcome: createOutcome(status, durationMs, stepCount, plannerFallbackReason),
    stepCount,
    completedStepIds,
    failedStepIds,
    plannerFallbackReason,
    memoryWorthiness: inferMemoryWorthiness({
      purposeKind,
      status,
      source: terminal.source ?? started?.source,
      priority: terminal.priority ?? started?.priority,
      summary,
      failedStepIds,
      plannerFallbackReason
    })
  };
  const recallCue = createRecallCue(base);

  return {
    ...base,
    memoryCandidate: !!recallCue,
    recallCue
  };
}

export function buildSpritePurposeDailyRetrospective(entries: SpritePurposeHistoryEntry[], query: SpritePurposeRetrospectiveQuery & { generatedAt?: number } = {}): SpritePurposeDailyRetrospective {
  const generatedAt = query.generatedAt ?? Date.now();
  const date = query.date ?? (entries.length ? formatLocalDateStamp(entries[entries.length - 1].timestamp) : formatLocalDateStamp(generatedAt));
  const allItems = groupByPurpose(entries)
    .map(buildItem)
    .filter((item): item is SpritePurposeRetrospectiveItem => !!item)
    .sort((a, b) => b.endedAt - a.endedAt);
  const visibleItems = allItems
    .filter((item) => (query.includeIdle ? true : item.purposeKind !== 'idle.presence'))
    .filter((item) => item.memoryWorthiness >= (query.minMemoryWorthiness ?? 0))
    .slice(0, Math.max(1, query.limit ?? 50));
  const kindCounts: Record<string, number> = {};
  for (const item of allItems) {
    kindCounts[item.purposeKind] = (kindCounts[item.purposeKind] ?? 0) + 1;
  }
  const memoryCandidates = allItems.filter((item) => item.memoryCandidate);

  return {
    date,
    generatedAt,
    totalPurposeCount: new Set(entries.map((entry) => entry.purposeId)).size,
    terminalPurposeCount: allItems.length,
    completedCount: allItems.filter((item) => item.status === 'completed').length,
    cancelledCount: allItems.filter((item) => item.status === 'cancelled').length,
    failedCount: allItems.filter((item) => item.status === 'failed').length,
    kindCounts,
    memoryCandidateCount: memoryCandidates.length,
    recallCues: memoryCandidates.map((item) => item.recallCue).filter((cue): cue is string => !!cue),
    items: visibleItems
  };
}

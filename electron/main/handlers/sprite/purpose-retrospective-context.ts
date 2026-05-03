export const SPONTANEOUS_PURPOSE_RETROSPECTIVE_LIMIT = 4;
export const SPONTANEOUS_PURPOSE_RETROSPECTIVE_MIN_WORTHINESS = 0.55;

export interface SpontaneousPurposeRetrospectiveQuery {
  date?: string;
  limit?: number;
  includeIdle?: boolean;
  minMemoryWorthiness?: number;
}

export interface SpontaneousPurposeRetrospectiveItem {
  purposeId: string;
  purposeKind: string;
  status: string;
  source?: string;
  priority?: number;
  startedAt?: number;
  endedAt: number;
  durationMs?: number;
  summary?: string;
  outcome: string;
  stepCount: number;
  completedStepIds: string[];
  failedStepIds: string[];
  plannerFallbackReason?: string;
  memoryWorthiness: number;
  memoryCandidate: boolean;
  recallCue?: string;
}

export interface SpontaneousPurposeDailyRetrospective {
  date: string;
  generatedAt: number;
  totalPurposeCount: number;
  terminalPurposeCount: number;
  completedCount: number;
  cancelledCount: number;
  failedCount: number;
  kindCounts: Record<string, number>;
  memoryCandidateCount: number;
  recallCues: string[];
  items: SpontaneousPurposeRetrospectiveItem[];
}

export type SpontaneousPurposeRetrospectiveProvider = (query?: SpontaneousPurposeRetrospectiveQuery) => Promise<SpontaneousPurposeDailyRetrospective>;

export interface SpontaneousPurposeRetrospectiveContext {
  cancelledCount: number;
  completedCount: number;
  date: string;
  failedCount: number;
  items: Array<{
    purposeKind: string;
    status: string;
    summary?: string;
    outcome: string;
  }>;
  memoryCandidateCount: number;
  recallCues: string[];
  terminalPurposeCount: number;
}

export function buildSpontaneousPurposeRetrospectiveContext(retrospective: SpontaneousPurposeDailyRetrospective): SpontaneousPurposeRetrospectiveContext | null {
  const items = retrospective.items
    .filter((item) => item.purposeKind !== 'idle.presence')
    .slice(0, SPONTANEOUS_PURPOSE_RETROSPECTIVE_LIMIT)
    .map(toPromptItem);
  const recallCues = retrospective.recallCues.slice(0, SPONTANEOUS_PURPOSE_RETROSPECTIVE_LIMIT);

  if (!items.length && !recallCues.length) {
    return null;
  }

  return {
    cancelledCount: retrospective.cancelledCount,
    completedCount: retrospective.completedCount,
    date: retrospective.date,
    failedCount: retrospective.failedCount,
    items,
    memoryCandidateCount: retrospective.memoryCandidateCount,
    recallCues,
    terminalPurposeCount: retrospective.terminalPurposeCount
  };
}

export function formatSpontaneousPurposeRetrospectiveContext(context: SpontaneousPurposeRetrospectiveContext | null): string {
  if (!context) {
    return 'No sprite purpose retrospective is available yet.';
  }

  const lines = [
    `- Date: ${context.date}`,
    `- Purpose outcomes: ${context.completedCount} completed, ${context.cancelledCount} cancelled, ${context.failedCount} failed.`,
    `- Memory candidates: ${context.memoryCandidateCount}.`
  ];

  if (context.recallCues.length) {
    lines.push('- Recall cues:');
    for (const cue of context.recallCues) {
      lines.push(`  ${cue}`);
    }
  }

  if (context.items.length) {
    lines.push('- Recent meaningful purposes:');
    for (const item of context.items) {
      const detail = item.summary || item.outcome;
      lines.push(`  - ${item.purposeKind} ${item.status}: ${detail}`);
    }
  }

  return lines.join('\n');
}

function toPromptItem(item: SpontaneousPurposeRetrospectiveItem): SpontaneousPurposeRetrospectiveContext['items'][number] {
  return {
    purposeKind: item.purposeKind,
    status: item.status,
    ...(item.summary ? { summary: truncateText(item.summary, 120) } : {}),
    outcome: truncateText(item.outcome, 160)
  };
}

function truncateText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

import { writeMemory as defaultWriteMemory, type WriteDbOps } from '../../../../packages/ai/services/memory-extraction-service';
import { buildNotePath, generateNoteId as defaultGenerateNoteId } from '../../../../packages/ai/services/memory-note-writer';
import { normalizeRecallCueSection } from '../../../../packages/ai/services/memory-recall-cue-utils';
import type { MemoryNoteFrontmatter, MergedNote, WriteStats } from '../../../../packages/ai/services/memory-types';

const TOPIC_LABEL = 'Sprite Purpose Retrospective';
const TOPIC_SLUG = 'sprite-purpose-retrospective';
const DEFAULT_MIN_MEMORY_WORTHINESS = 0.55;
const DEFAULT_LIMIT = 20;
const MAX_RECALL_CUES = 6;
const MAX_KEY_ITEMS = 8;

export interface PurposeRetrospectiveWorkspace {
  id: string;
  rootPath: string;
}

export interface PurposeRetrospectiveExistingNote {
  id: string;
  createdAt?: number | null;
  deletedAt?: number | null;
}

export interface PurposeRetrospectiveQuery {
  date?: string;
  limit?: number;
  includeIdle?: boolean;
  minMemoryWorthiness?: number;
}

export interface PurposeRetrospectiveItem {
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

export interface PurposeDailyRetrospective {
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
  items: PurposeRetrospectiveItem[];
}

export type PurposeRetrospectiveProvider = (query?: PurposeRetrospectiveQuery) => Promise<PurposeDailyRetrospective>;

export interface PurposeRetrospectiveMemorySyncDeps {
  dbOps: WriteDbOps;
  generateNoteId?: (date: string, topicSlug: string) => string;
  getExistingNoteByFilePath: (filePath: string, workspaceId: string) => Promise<PurposeRetrospectiveExistingNote | undefined>;
  getRetrospective?: PurposeRetrospectiveProvider;
  now?: () => number;
  resolveWorkspace: (workspaceId?: string) => Promise<PurposeRetrospectiveWorkspace | undefined>;
  writeMemory?: typeof defaultWriteMemory;
}

export interface PurposeRetrospectiveMemorySyncOptions {
  date?: string;
  limit?: number;
  minMemoryWorthiness?: number;
  workspaceId?: string;
}

export interface PurposeRetrospectiveMemorySyncResult {
  ok: boolean;
  action?: 'create' | 'update';
  date?: string;
  filePath?: string;
  memoryCandidateCount?: number;
  noteId?: string;
  reason?: string;
  recallCueCount?: number;
  skipped?: boolean;
  workspaceId?: string;
  writeStats?: WriteStats;
}

let registeredPurposeRetrospectiveProvider: PurposeRetrospectiveProvider | undefined;

export function registerPurposeRetrospectiveMemoryProvider(provider: PurposeRetrospectiveProvider): void {
  registeredPurposeRetrospectiveProvider = provider;
}

export function unregisterPurposeRetrospectiveMemoryProvider(): void {
  registeredPurposeRetrospectiveProvider = undefined;
}

export async function syncSpritePurposeRetrospectiveToMemory(
  options: PurposeRetrospectiveMemorySyncOptions = {},
  injectedDeps?: PurposeRetrospectiveMemorySyncDeps
): Promise<PurposeRetrospectiveMemorySyncResult> {
  const deps = injectedDeps ?? (await createDefaultDeps());
  const workspace = await deps.resolveWorkspace(options.workspaceId);
  if (!workspace?.id || !workspace.rootPath) {
    return { ok: false, reason: 'workspace_root_missing', skipped: true, workspaceId: options.workspaceId };
  }

  if (!deps.getRetrospective) {
    return { ok: true, reason: 'purpose-retrospective-provider-missing', skipped: true, workspaceId: workspace.id };
  }

  const retrospective = await deps.getRetrospective({
    date: options.date,
    limit: options.limit ?? DEFAULT_LIMIT,
    minMemoryWorthiness: options.minMemoryWorthiness ?? DEFAULT_MIN_MEMORY_WORTHINESS
  });
  const recallCues = normalizeRecallCueSection(retrospective.recallCues.join('\n'), MAX_RECALL_CUES);
  if (!recallCues) {
    return {
      ok: true,
      date: retrospective.date,
      memoryCandidateCount: retrospective.memoryCandidateCount,
      reason: 'no-memory-candidates',
      recallCueCount: 0,
      skipped: true,
      workspaceId: workspace.id
    };
  }

  const now = deps.now?.() ?? Date.now();
  const filePath = buildNotePath(retrospective.date, TOPIC_SLUG);
  const existing = await deps.getExistingNoteByFilePath(filePath, workspace.id);
  const action = existing && !existing.deletedAt ? 'update' : 'create';
  const noteId = action === 'update' ? existing!.id : (deps.generateNoteId ?? defaultGenerateNoteId)(retrospective.date, TOPIC_SLUG);
  const createdAt = action === 'update' && typeof existing?.createdAt === 'number' ? existing.createdAt : now;
  const sections = buildRetrospectiveSections(retrospective, recallCues);
  const frontmatter: MemoryNoteFrontmatter = {
    id: noteId,
    version: 1,
    workspaceId: workspace.id,
    date: retrospective.date,
    timeRange: createTimeRange(retrospective),
    topics: [TOPIC_LABEL],
    domain: 'project:chobits',
    keywords: ['sprite', 'purpose', 'routine', 'retrospective', 'assistant'],
    summary: createSummary(retrospective),
    sourceConversationIds: [],
    importance: clamp01(0.58 + Math.min(0.22, retrospective.memoryCandidateCount * 0.04)),
    stability: 0.7,
    createdAt,
    updatedAt: now
  };
  const merged: MergedNote = {
    action,
    filePath,
    frontmatter,
    noteId,
    sections
  };
  const writeStats = await (deps.writeMemory ?? defaultWriteMemory)(merged, { workspaceRoot: workspace.rootPath }, deps.dbOps);

  return {
    ok: true,
    action,
    date: retrospective.date,
    filePath,
    memoryCandidateCount: retrospective.memoryCandidateCount,
    noteId: merged.noteId,
    recallCueCount: recallCues.split(/\r?\n/).filter((line) => line.trim().startsWith('- ')).length,
    workspaceId: workspace.id,
    writeStats
  };
}

async function createDefaultDeps(): Promise<PurposeRetrospectiveMemorySyncDeps> {
  const [{ buildWriteDbOps }, { MemoryNoteRepo }, { WorkspacesRepo }] = await Promise.all([
    import('../../../../packages/ai/runtime/pi/tools/memory-db-deps'),
    import('../../db/memory-repositories'),
    import('../../db/repositories')
  ]);

  return {
    dbOps: buildWriteDbOps(),
    getExistingNoteByFilePath: (filePath, workspaceId) => MemoryNoteRepo.getByFilePath(filePath, workspaceId),
    getRetrospective: registeredPurposeRetrospectiveProvider,
    resolveWorkspace: async (workspaceId) => {
      const workspace = workspaceId ? await WorkspacesRepo.getById(workspaceId) : await WorkspacesRepo.getDefault();
      return workspace?.rootPath ? { id: workspace.id, rootPath: workspace.rootPath } : undefined;
    }
  };
}

function buildRetrospectiveSections(retrospective: PurposeDailyRetrospective, recallCues: string): Map<string, string> {
  const sections = new Map<string, string>();
  sections.set('Key Points', createKeyPoints(retrospective));
  if (retrospective.failedCount > 0 || retrospective.cancelledCount > 0) {
    sections.set('Open Items', '- Review repeated failed or cancelled sprite purposes if the same purpose kind keeps appearing.');
  }
  sections.set('Recall Cues', recallCues);
  return sections;
}

function createKeyPoints(retrospective: PurposeDailyRetrospective): string {
  const lines = [
    `- Date: ${retrospective.date}`,
    `- Outcomes: ${retrospective.completedCount} completed, ${retrospective.cancelledCount} cancelled, ${retrospective.failedCount} failed.`,
    `- Purpose volume: ${retrospective.terminalPurposeCount} terminal purposes from ${retrospective.totalPurposeCount} total tracked purposes.`,
    `- Memory candidates: ${retrospective.memoryCandidateCount}; recall cues written: ${retrospective.recallCues.length}.`
  ];
  const kinds = Object.entries(retrospective.kindCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6);
  if (kinds.length) {
    lines.push(`- Purpose kinds: ${kinds.map(([kind, count]) => `${kind} x ${count}`).join(', ')}.`);
  }
  for (const item of retrospective.items.slice(0, MAX_KEY_ITEMS)) {
    const detail = item.summary || item.outcome;
    lines.push(`- ${item.purposeKind} ${item.status}: ${truncateText(detail, 150)}`);
  }
  return lines.join('\n');
}

function createSummary(retrospective: PurposeDailyRetrospective): string {
  return `Sprite purpose retrospective for ${retrospective.date}: ${retrospective.completedCount} completed, ${retrospective.cancelledCount} cancelled, ${retrospective.failedCount} failed; ${retrospective.memoryCandidateCount} memory candidate(s).`;
}

function createTimeRange(retrospective: PurposeDailyRetrospective): MemoryNoteFrontmatter['timeRange'] {
  const timestamps = retrospective.items.flatMap((item) => [item.startedAt, item.endedAt]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!timestamps.length) {
    return undefined;
  }
  return {
    start: Math.min(...timestamps),
    end: Math.max(...timestamps)
  };
}

function truncateText(value: string | undefined, maxLength: number): string {
  const normalized = (value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

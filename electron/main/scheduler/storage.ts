import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import type {
  SchedulerAuditLogCleanupOptions,
  SchedulerAuditLogCleanupResult,
  SchedulerAuditLogEntry,
  SchedulerAuditLogQuery,
  SchedulerAuditLogStore,
  SchedulerOwnerPauseState,
  SchedulerRuntimeState,
  SchedulerStateStore
} from './types';

const STORE_DIR = path.join(app.getPath('userData'), 'data');
const STORE_FILE = path.join(STORE_DIR, 'scheduler-state.json');
const AUDIT_FILE_PREFIX = 'scheduler-audit-';
const AUDIT_FILE_SUFFIX = '.jsonl';
const DEFAULT_AUDIT_RETENTION_DAYS = 30;
const DEFAULT_AUDIT_MAX_FILES = 60;

interface SchedulerStoreDocument {
  jobs: Record<string, unknown>;
  ownerPauseState: Record<string, unknown>;
}

function ensureDir(): void {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }
}

function normalizeRuntimeState(jobId: string, value: unknown): SchedulerRuntimeState | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<SchedulerRuntimeState>;
  const owner = typeof raw.owner === 'string' ? raw.owner : '';
  if (!owner) return null;

  return {
    jobId,
    owner,
    enabled: raw.enabled !== false,
    paused: raw.paused === true,
    pausedAt: typeof raw.pausedAt === 'number' ? raw.pausedAt : undefined,
    pauseReason: typeof raw.pauseReason === 'string' ? raw.pauseReason : undefined,
    lastRunAt: typeof raw.lastRunAt === 'number' ? raw.lastRunAt : undefined,
    lastFinishedAt: typeof raw.lastFinishedAt === 'number' ? raw.lastFinishedAt : undefined,
    nextRunAt: typeof raw.nextRunAt === 'number' ? raw.nextRunAt : undefined,
    lastStatus: raw.lastStatus,
    lastSkipReason: typeof raw.lastSkipReason === 'string' ? raw.lastSkipReason : undefined,
    lastError: typeof raw.lastError === 'string' ? raw.lastError : undefined,
    dailyRunCount: typeof raw.dailyRunCount === 'number' ? raw.dailyRunCount : undefined,
    dailyResetDate: typeof raw.dailyResetDate === 'string' ? raw.dailyResetDate : undefined,
    consecutiveFailures: typeof raw.consecutiveFailures === 'number' ? raw.consecutiveFailures : undefined,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()
  };
}

function normalizeOwnerPauseState(owner: string, value: unknown): SchedulerOwnerPauseState | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<SchedulerOwnerPauseState>;
  const resolvedOwner = typeof raw.owner === 'string' && raw.owner.trim() ? raw.owner : owner;
  if (!resolvedOwner) return null;

  return {
    owner: resolvedOwner,
    paused: raw.paused === true,
    pausedAt: typeof raw.pausedAt === 'number' ? raw.pausedAt : Date.now(),
    pauseReason: typeof raw.pauseReason === 'string' ? raw.pauseReason : undefined,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()
  };
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function isAuditFile(fileName: string): boolean {
  return fileName.startsWith(AUDIT_FILE_PREFIX) && fileName.endsWith(AUDIT_FILE_SUFFIX);
}

function getAuditFileDate(fileName: string): string | null {
  if (!isAuditFile(fileName)) return null;
  const date = fileName.slice(AUDIT_FILE_PREFIX.length, -AUDIT_FILE_SUFFIX.length);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function getAuditFileTimestamp(fileName: string): number | null {
  const date = getAuditFileDate(fileName);
  if (!date) return null;
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizeAuditEntry(value: unknown): SchedulerAuditLogEntry | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<SchedulerAuditLogEntry>;
  if (typeof raw.id !== 'string' || typeof raw.owner !== 'string') return null;
  if (raw.eventType !== 'run' && raw.eventType !== 'control') return null;
  if (!raw.status) return null;
  if (typeof raw.startedAt !== 'number' || typeof raw.finishedAt !== 'number') return null;

  return {
    id: raw.id,
    eventType: raw.eventType,
    owner: raw.owner,
    jobId: typeof raw.jobId === 'string' ? raw.jobId : undefined,
    jobName: typeof raw.jobName === 'string' ? raw.jobName : undefined,
    action: raw.action,
    trigger: raw.trigger,
    scheduledFor: typeof raw.scheduledFor === 'number' ? raw.scheduledFor : undefined,
    startedAt: raw.startedAt,
    finishedAt: raw.finishedAt,
    status: raw.status,
    reason: typeof raw.reason === 'string' ? raw.reason : undefined,
    error: typeof raw.error === 'string' ? raw.error : undefined
  };
}

function matchesAuditQuery(entry: SchedulerAuditLogEntry, query: SchedulerAuditLogQuery): boolean {
  if (query.jobId && entry.jobId !== query.jobId) return false;
  if (query.owner && entry.owner !== query.owner) return false;
  if (query.eventType && entry.eventType !== query.eventType) return false;
  if (query.status && entry.status !== query.status) return false;
  if (query.since != null && entry.finishedAt < query.since) return false;
  if (query.until != null && entry.startedAt > query.until) return false;
  return true;
}

function readStoreDocument(): SchedulerStoreDocument {
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { jobs: {}, ownerPauseState: {} };
    }

    const record = parsed as Record<string, unknown>;
    const jobs = record.jobs && typeof record.jobs === 'object' ? (record.jobs as Record<string, unknown>) : record;
    const ownerPauseState = record.ownerPauseState && typeof record.ownerPauseState === 'object' ? (record.ownerPauseState as Record<string, unknown>) : {};
    return { jobs, ownerPauseState };
  } catch {
    return { jobs: {}, ownerPauseState: {} };
  }
}

function writeStoreDocument(document: SchedulerStoreDocument): void {
  ensureDir();
  fs.writeFileSync(
    STORE_FILE,
    JSON.stringify(
      {
        jobs: document.jobs,
        ownerPauseState: document.ownerPauseState
      },
      null,
      2
    ),
    'utf-8'
  );
}

export class FileSchedulerStateStore implements SchedulerStateStore {
  load(): Record<string, SchedulerRuntimeState> {
    try {
      const { jobs } = readStoreDocument();
      if (!jobs || typeof jobs !== 'object') return {};

      const state: Record<string, SchedulerRuntimeState> = {};
      for (const [jobId, value] of Object.entries(jobs)) {
        const normalized = normalizeRuntimeState(jobId, value);
        if (normalized) {
          state[jobId] = normalized;
        }
      }
      return state;
    } catch {
      return {};
    }
  }

  loadOwnerPauseState(): Record<string, SchedulerOwnerPauseState> {
    try {
      const { ownerPauseState } = readStoreDocument();
      const state: Record<string, SchedulerOwnerPauseState> = {};
      for (const [owner, value] of Object.entries(ownerPauseState)) {
        const normalized = normalizeOwnerPauseState(owner, value);
        if (normalized?.paused) {
          state[normalized.owner] = normalized;
        }
      }
      return state;
    } catch {
      return {};
    }
  }

  save(state: Record<string, SchedulerRuntimeState>): void {
    try {
      const document = readStoreDocument();
      writeStoreDocument({ ...document, jobs: state });
    } catch (error) {
      console.warn('[scheduler] Failed to persist state', error);
    }
  }

  saveOwnerPauseState(state: Record<string, SchedulerOwnerPauseState>): void {
    try {
      const document = readStoreDocument();
      writeStoreDocument({ ...document, ownerPauseState: state });
    } catch (error) {
      console.warn('[scheduler] Failed to persist owner pause state', error);
    }
  }
}

export function getSchedulerStateFilePath(): string {
  return STORE_FILE;
}

export class FileSchedulerAuditLogStore implements SchedulerAuditLogStore {
  append(entry: SchedulerAuditLogEntry): void {
    try {
      ensureDir();
      const filePath = this.resolveFilePath(entry.finishedAt);
      fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, 'utf-8');
      this.cleanup();
    } catch (error) {
      console.warn('[scheduler] Failed to append audit log', error);
    }
  }

  list(query: SchedulerAuditLogQuery = {}): SchedulerAuditLogEntry[] {
    try {
      ensureDir();
      const limit = normalizeLimit(query.limit);
      const entries: SchedulerAuditLogEntry[] = [];
      const fileNames = fs.readdirSync(STORE_DIR).filter(isAuditFile).sort().reverse();

      for (const fileName of fileNames) {
        const filePath = path.join(STORE_DIR, fileName);
        const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean).reverse();
        for (const line of lines) {
          try {
            const entry = normalizeAuditEntry(JSON.parse(line));
            if (!entry || !matchesAuditQuery(entry, query)) continue;
            entries.push(entry);
            if (entries.length >= limit) {
              return entries;
            }
          } catch {
            // Ignore corrupt audit lines so one bad write does not hide the rest of the log.
          }
        }
      }

      return entries;
    } catch {
      return [];
    }
  }

  cleanup(options: SchedulerAuditLogCleanupOptions = {}): SchedulerAuditLogCleanupResult {
    const retentionDays = normalizeRetentionDays(options.retentionDays);
    const maxFiles = normalizeMaxFiles(options.maxFiles);
    const now = typeof options.now === 'number' && Number.isFinite(options.now) ? options.now : Date.now();
    const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
    const deletedFiles: string[] = [];

    try {
      ensureDir();
      const candidates = fs
        .readdirSync(STORE_DIR)
        .filter(isAuditFile)
        .map((fileName) => ({
          fileName,
          timestamp: getAuditFileTimestamp(fileName)
        }))
        .filter((item): item is { fileName: string; timestamp: number } => item.timestamp != null)
        .sort((a, b) => b.timestamp - a.timestamp);

      const keepByMaxFiles = new Set(candidates.slice(0, maxFiles).map((item) => item.fileName));
      for (const candidate of candidates) {
        if (candidate.timestamp >= cutoff && keepByMaxFiles.has(candidate.fileName)) {
          continue;
        }

        const filePath = path.join(STORE_DIR, candidate.fileName);
        fs.unlinkSync(filePath);
        deletedFiles.push(filePath);
      }
    } catch (error) {
      console.warn('[scheduler] Failed to cleanup audit log', error);
    }

    return { deletedFiles };
  }

  private resolveFilePath(timestamp: number): string {
    return path.join(STORE_DIR, `${AUDIT_FILE_PREFIX}${formatDate(timestamp)}${AUDIT_FILE_SUFFIX}`);
  }
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 100;
  return Math.max(1, Math.min(Math.floor(limit as number), 500));
}

function normalizeRetentionDays(retentionDays: number | undefined): number {
  if (!Number.isFinite(retentionDays)) return DEFAULT_AUDIT_RETENTION_DAYS;
  return Math.max(1, Math.min(Math.floor(retentionDays as number), 365));
}

function normalizeMaxFiles(maxFiles: number | undefined): number {
  if (!Number.isFinite(maxFiles)) return DEFAULT_AUDIT_MAX_FILES;
  return Math.max(1, Math.min(Math.floor(maxFiles as number), 730));
}

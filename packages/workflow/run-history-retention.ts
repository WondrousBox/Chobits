import type { WorkflowRunRecord } from './types';

export const DEFAULT_WORKFLOW_RUN_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
export const DEFAULT_WORKFLOW_RUN_MAX_PER_WORKSPACE = 1000;
export const DEFAULT_WORKFLOW_RUN_PRUNE_BATCH_SIZE = 250;
export const DEFAULT_WORKFLOW_RUN_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export interface WorkflowRunRetentionPolicy {
  asOf: number;
  batchSize: number;
  maxAgeMs: number;
  maxRunsPerWorkspace: number;
}

export interface WorkflowRunHistoryRetentionOptions {
  batchSize?: number;
  cleanupIntervalMs?: number;
  maxAgeMs?: number;
  maxRunsPerWorkspace?: number;
  now?: () => number;
}

export type WorkflowRunHistoryPrune = (workspaceId: string, policy: WorkflowRunRetentionPolicy) => Promise<number>;

export interface WorkflowRunHistoryRetention {
  afterPersisted(record: WorkflowRunRecord): Promise<number>;
}

const TERMINAL_RUN_STATUSES = new Set<WorkflowRunRecord['status']>(['completed', 'failed', 'canceled']);

function normalizeInteger(value: number | undefined, fallback: number, minimum: number): number {
  return Number.isFinite(value) ? Math.max(minimum, Math.trunc(value!)) : fallback;
}

export function normalizeWorkflowRunRetentionPolicy(options: WorkflowRunHistoryRetentionOptions = {}, asOf = Date.now()): WorkflowRunRetentionPolicy {
  return {
    asOf: Number.isFinite(asOf) ? asOf : Date.now(),
    batchSize: normalizeInteger(options.batchSize, DEFAULT_WORKFLOW_RUN_PRUNE_BATCH_SIZE, 1),
    maxAgeMs: normalizeInteger(options.maxAgeMs, DEFAULT_WORKFLOW_RUN_MAX_AGE_MS, 1),
    maxRunsPerWorkspace: normalizeInteger(options.maxRunsPerWorkspace, DEFAULT_WORKFLOW_RUN_MAX_PER_WORKSPACE, 1)
  };
}

export function createWorkflowRunHistoryRetention(prune: WorkflowRunHistoryPrune, options: WorkflowRunHistoryRetentionOptions = {}): WorkflowRunHistoryRetention {
  const now = options.now || Date.now;
  const cleanupIntervalMs = normalizeInteger(options.cleanupIntervalMs, DEFAULT_WORKFLOW_RUN_CLEANUP_INTERVAL_MS, 0);
  const nextCleanupAtByWorkspace = new Map<string, number>();
  const inFlightByWorkspace = new Map<string, Promise<number>>();

  return {
    async afterPersisted(record: WorkflowRunRecord): Promise<number> {
      const workspaceId = record.workspaceId ?? record.metadata?.workspaceId;
      if (!workspaceId || !TERMINAL_RUN_STATUSES.has(record.status)) return 0;

      const existing = inFlightByWorkspace.get(workspaceId);
      if (existing) return existing;

      const asOf = now();
      if (asOf < (nextCleanupAtByWorkspace.get(workspaceId) ?? 0)) return 0;
      nextCleanupAtByWorkspace.set(workspaceId, asOf + cleanupIntervalMs);

      const pending = Promise.resolve().then(() => prune(workspaceId, normalizeWorkflowRunRetentionPolicy(options, asOf)));
      inFlightByWorkspace.set(workspaceId, pending);
      try {
        return await pending;
      } catch (error) {
        nextCleanupAtByWorkspace.delete(workspaceId);
        throw error;
      } finally {
        if (inFlightByWorkspace.get(workspaceId) === pending) inFlightByWorkspace.delete(workspaceId);
      }
    }
  };
}

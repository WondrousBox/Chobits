import { sanitizeWorkflowRunRecord } from './sanitize';
import type { WorkflowRunRecord } from './types';

export type RunPersistenceQueue = ((record: WorkflowRunRecord) => Promise<void>) & {
  schedule: (record: WorkflowRunRecord, delayMs?: number) => void;
  flush: () => Promise<void>;
};

type ScheduledWrite = {
  snapshot: WorkflowRunRecord;
  timer: ReturnType<typeof setTimeout>;
};

function snapshotRun(record: WorkflowRunRecord): WorkflowRunRecord {
  return sanitizeWorkflowRunRecord(record);
}

export function createRunPersistenceQueue(write: (record: WorkflowRunRecord) => Promise<void>): RunPersistenceQueue {
  const pendingByRun = new Map<string, Promise<void>>();
  const scheduledByRun = new Map<string, ScheduledWrite>();
  let latestWriteError: unknown;

  const enqueueSnapshot = (snapshot: WorkflowRunRecord): Promise<void> => {
    const previous = pendingByRun.get(snapshot.runId) || Promise.resolve();
    const pending = previous.catch(() => undefined).then(() => write(snapshot));
    pendingByRun.set(snapshot.runId, pending);
    const cleanup = (): void => {
      if (pendingByRun.get(snapshot.runId) === pending) pendingByRun.delete(snapshot.runId);
    };
    void pending.then(cleanup, (error) => {
      latestWriteError = error;
      cleanup();
    });
    return pending;
  };

  const cancelScheduled = (runId: string): void => {
    const scheduled = scheduledByRun.get(runId);
    if (!scheduled) return;
    clearTimeout(scheduled.timer);
    scheduledByRun.delete(runId);
  };

  const enqueue = ((record: WorkflowRunRecord): Promise<void> => {
    cancelScheduled(record.runId);
    return enqueueSnapshot(snapshotRun(record));
  }) as RunPersistenceQueue;

  enqueue.schedule = (record: WorkflowRunRecord, delayMs = 250): void => {
    const snapshot = snapshotRun(record);
    const existing = scheduledByRun.get(record.runId);
    if (existing) {
      existing.snapshot = snapshot;
      return;
    }

    const scheduled: ScheduledWrite = {
      snapshot,
      timer: setTimeout(
        () => {
          scheduledByRun.delete(record.runId);
          void enqueueSnapshot(scheduled.snapshot).catch(() => undefined);
        },
        Math.max(0, delayMs)
      )
    };
    scheduledByRun.set(record.runId, scheduled);
  };

  enqueue.flush = async (): Promise<void> => {
    for (const [runId, scheduled] of scheduledByRun) {
      clearTimeout(scheduled.timer);
      scheduledByRun.delete(runId);
      void enqueueSnapshot(scheduled.snapshot).catch(() => undefined);
    }
    while (pendingByRun.size > 0 || scheduledByRun.size > 0) {
      await Promise.allSettled([...pendingByRun.values()]);
    }
    if (latestWriteError !== undefined) {
      const error = latestWriteError;
      latestWriteError = undefined;
      throw new AggregateError([error], 'Workflow run persistence failed');
    }
  };

  return enqueue;
}

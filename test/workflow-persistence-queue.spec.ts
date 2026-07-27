import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRunPersistenceQueue } from '../packages/workflow/run-persistence-queue';
import type { WorkflowRunRecord } from '../packages/workflow/types';

function record(status: WorkflowRunRecord['status']): WorkflowRunRecord {
  return {
    runId: 'run-1',
    workflowId: 'workflow-1',
    workspaceId: 'workspace-1',
    createdAt: 1,
    status,
    nodes: { node: { nodeId: 'node', status: status === 'completed' ? 'completed' : 'pending' } }
  };
}

describe('workflow run persistence queue', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('serializes writes per run and snapshots mutable records', async () => {
    let releaseFirst!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const writes: WorkflowRunRecord[] = [];
    const enqueue = createRunPersistenceQueue(async (value) => {
      writes.push(value);
      if (writes.length === 1) await firstWrite;
    });
    const value = record('queued');

    const queuedWrite = enqueue(value);
    value.status = 'completed';
    value.nodes.node.status = 'completed';
    const completedWrite = enqueue(value);
    await Promise.resolve();
    await Promise.resolve();

    expect(writes).toHaveLength(1);
    expect(writes[0].status).toBe('queued');
    expect(writes[0].nodes.node.status).toBe('pending');

    releaseFirst();
    await Promise.all([queuedWrite, completedWrite]);
    expect(writes.map((write) => write.status)).toEqual(['queued', 'completed']);
  });

  it('flushes all writes that are still pending', async () => {
    let releaseWrite!: () => void;
    const writeBlocked = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const enqueue = createRunPersistenceQueue(async () => writeBlocked);
    const write = enqueue(record('running'));
    let flushed = false;
    const flush = enqueue.flush().then(() => {
      flushed = true;
    });

    await Promise.resolve();
    expect(flushed).toBe(false);

    releaseWrite();
    await Promise.all([write, flush]);
    expect(flushed).toBe(true);
  });

  it('reports failed writes when flushed', async () => {
    const enqueue = createRunPersistenceQueue(async () => {
      throw new Error('database unavailable');
    });

    await expect(enqueue(record('completed'))).rejects.toThrow('database unavailable');
    await expect(enqueue.flush()).rejects.toThrow('Workflow run persistence failed');
  });

  it('coalesces scheduled progress snapshots per run', async () => {
    vi.useFakeTimers();
    const writes: WorkflowRunRecord[] = [];
    const enqueue = createRunPersistenceQueue(async (value) => {
      writes.push(value);
    });
    const value = record('running');

    value.progress = 10;
    enqueue.schedule(value);
    value.progress = 40;
    enqueue.schedule(value);

    await vi.advanceTimersByTimeAsync(249);
    expect(writes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(writes.map((write) => write.progress)).toEqual([40]);
  });

  it('replaces a scheduled progress write with an immediate state transition', async () => {
    vi.useFakeTimers();
    const writes: WorkflowRunRecord[] = [];
    const enqueue = createRunPersistenceQueue(async (value) => {
      writes.push(value);
    });
    const value = record('running');

    value.progress = 50;
    enqueue.schedule(value);
    value.status = 'completed';
    value.progress = 100;
    await enqueue(value);
    await vi.runAllTimersAsync();

    expect(writes.map((write) => [write.status, write.progress])).toEqual([['completed', 100]]);
  });

  it('flushes the latest scheduled snapshot without waiting for its timer', async () => {
    vi.useFakeTimers();
    const writes: WorkflowRunRecord[] = [];
    const enqueue = createRunPersistenceQueue(async (value) => {
      writes.push(value);
    });
    const value = record('running');

    value.progress = 75;
    enqueue.schedule(value, 60_000);
    await enqueue.flush();

    expect(writes.map((write) => write.progress)).toEqual([75]);
  });
});

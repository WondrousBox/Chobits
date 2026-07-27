import { describe, expect, it, vi } from 'vitest';

import { createWorkflowRunHistoryRetention } from '../packages/workflow/run-history-retention';
import type { WorkflowRunRecord } from '../packages/workflow/types';

function record(status: WorkflowRunRecord['status'], workspaceId = 'workspace-1'): WorkflowRunRecord {
  return {
    runId: `run-${status}`,
    workflowId: 'workflow-1',
    workspaceId,
    createdAt: 1,
    status,
    nodes: {}
  };
}

describe('workflow run history retention', () => {
  it('prunes only terminal workspace-scoped runs and applies normalized policy', async () => {
    const prune = vi.fn().mockResolvedValue(3);
    const retention = createWorkflowRunHistoryRetention(prune, {
      batchSize: 0,
      cleanupIntervalMs: 0,
      maxAgeMs: 0,
      maxRunsPerWorkspace: 0,
      now: () => 10_000
    });

    await expect(retention.afterPersisted(record('running'))).resolves.toBe(0);
    await expect(retention.afterPersisted({ ...record('completed'), workspaceId: undefined, metadata: undefined })).resolves.toBe(0);
    await expect(retention.afterPersisted(record('completed'))).resolves.toBe(3);

    expect(prune).toHaveBeenCalledWith('workspace-1', {
      asOf: 10_000,
      batchSize: 1,
      maxAgeMs: 1,
      maxRunsPerWorkspace: 1
    });
  });

  it('throttles cleanup independently per workspace', async () => {
    let currentTime = 1_000;
    const prune = vi.fn().mockResolvedValue(0);
    const retention = createWorkflowRunHistoryRetention(prune, {
      cleanupIntervalMs: 500,
      now: () => currentTime
    });

    await retention.afterPersisted(record('failed', 'workspace-1'));
    currentTime = 1_200;
    await retention.afterPersisted(record('canceled', 'workspace-1'));
    await retention.afterPersisted(record('completed', 'workspace-2'));
    currentTime = 1_500;
    await retention.afterPersisted(record('completed', 'workspace-1'));

    expect(prune.mock.calls.map(([workspaceId]) => workspaceId)).toEqual(['workspace-1', 'workspace-2', 'workspace-1']);
  });

  it('shares an in-flight cleanup and retries immediately after a failure', async () => {
    let rejectFirst!: (error: Error) => void;
    const first = new Promise<number>((_resolve, reject) => {
      rejectFirst = reject;
    });
    const prune = vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce(2);
    const retention = createWorkflowRunHistoryRetention(prune, {
      cleanupIntervalMs: 10_000,
      now: () => 1_000
    });

    const pendingA = retention.afterPersisted(record('completed'));
    const pendingB = retention.afterPersisted(record('failed'));
    rejectFirst(new Error('database busy'));
    await expect(pendingA).rejects.toThrow('database busy');
    await expect(pendingB).rejects.toThrow('database busy');
    await expect(retention.afterPersisted(record('completed'))).resolves.toBe(2);

    expect(prune).toHaveBeenCalledTimes(2);
  });
});

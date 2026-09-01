import { describe, expect, it } from 'vitest';

import { createWorkflowRegistry } from '../packages/workflow/core/registry';
import type { WorkflowDefinition } from '../packages/workflow/src/contracts/definition';
import type { WorkflowRunRecord } from '../packages/workflow/src/contracts/run';
import type { WorkflowApplicationStore } from '../packages/workflow/src/ports/store';
import { createWorkflowCapabilities } from '../packages/workflow/src/runtime/capabilities';
import { createWorkflowExecutionLimiter } from '../packages/workflow/src/runtime/limiter';
import { createWorkflowRuntime } from '../packages/workflow/src/runtime/runtime';
import { defineCapability } from '../packages/workflow/src/sdk/capability';
import { defineNode } from '../packages/workflow/src/sdk/node';
import { FakeWorkflowClock } from '../packages/workflow/src/testing/fake-clock';
import { FakeWorkflowIdFactory } from '../packages/workflow/src/testing/fake-id-factory';
import { InMemoryWorkflowApplicationStore } from '../packages/workflow/src/testing/memory-store';

async function waitFor(predicate: () => boolean, message: string): Promise<void> {
  for (let index = 0; index < 100; index += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(message);
}

function definition(id: string, nodeType: string, config?: Record<string, unknown>): WorkflowDefinition {
  return {
    id,
    name: id,
    nodes: [{ id: 'task', type: nodeType, ...(config ? { config } : {}) }],
    edges: []
  };
}

function runtimeStore(base: InMemoryWorkflowApplicationStore, saveRun: (run: WorkflowRunRecord) => void | Promise<void>): WorkflowApplicationStore {
  return {
    listPresets: () => base.listPresets(),
    listDefinitions: (workspaceId) => base.listDefinitions(workspaceId),
    getDefinition: (id, workspaceId) => base.getDefinition(id, workspaceId),
    saveDefinition: (value) => base.saveDefinition(value),
    deleteDefinition: (id, workspaceId) => base.deleteDefinition(id, workspaceId),
    saveRun,
    listRuns: (workspaceId, workflowId, limit, resourceId) => base.listRuns(workspaceId, workflowId, limit, resourceId),
    getRun: (runId, workspaceId) => base.getRun(runId, workspaceId),
    deleteRun: (runId, workspaceId) => base.deleteRun(runId, workspaceId)
  };
}

describe('WorkflowRuntime Phase 7 contract', () => {
  it('reports missing capabilities before execution and injects typed capabilities', async () => {
    const reader = defineCapability<{ read(id: string): string }>('fixture.reader');
    const capabilityNode = defineNode({
      spec: { id: 'fixture/capability', label: 'Capability', inputs: [], outputs: [{ key: 'value', type: 'string' as const }] },
      requiredCapabilities: [reader],
      async run({ capabilities, config }) {
        return { value: capabilities.require(reader).read(String(config?.key)) };
      }
    });
    const registry = createWorkflowRegistry({ nodes: [capabilityNode] });
    const missingRuntime = createWorkflowRuntime({
      store: new InMemoryWorkflowApplicationStore(),
      registry,
      engineOptions: { completedRunTempTtlMs: 0 }
    });

    const request = {
      definition: definition('fixture:capability', capabilityNode.spec.id, { key: 'original' }),
      configOverrides: { task: { key: 'overridden' } }
    };
    const validation = await missingRuntime.validate(request);
    expect(validation).toMatchObject({
      ok: false,
      missingCapabilities: [{ id: reader.id, nodeIds: ['task'] }],
      issues: [{ code: 'missing-capability', nodeId: 'task', capabilityId: reader.id }]
    });
    await missingRuntime.dispose();

    const capabilities = createWorkflowCapabilities([[reader, { read: (id: string) => `read:${id}` }]]);
    const runtime = createWorkflowRuntime({
      store: new InMemoryWorkflowApplicationStore(),
      registry,
      capabilities,
      engineOptions: { completedRunTempTtlMs: 0 }
    });
    const record = await runtime.run(request);

    expect(record.status).toBe('completed');
    expect(record.output).toEqual({ value: 'read:overridden' });
    expect(record.input).not.toHaveProperty('__configOverrides__');
    await runtime.dispose();
  });

  it('maps canonical scope, trigger, actor, and context into the run and node context', async () => {
    const contexts: Array<Record<string, unknown>> = [];
    const contextNode = defineNode({
      spec: { id: 'fixture/context', label: 'Context', inputs: [], outputs: [{ key: 'resourceId', type: 'string' as const }] },
      async run({ ctx }) {
        contexts.push({ workspaceId: ctx.workspaceId, resourceId: ctx.resourceId, folderId: ctx.folderId });
        return { resourceId: ctx.resourceId };
      }
    });
    const runtime = createWorkflowRuntime({
      store: new InMemoryWorkflowApplicationStore(),
      registry: createWorkflowRegistry({ nodes: [contextNode] }),
      idFactory: new FakeWorkflowIdFactory(['canonical-run']),
      clock: new FakeWorkflowClock(0),
      engineOptions: { completedRunTempTtlMs: 0 }
    });

    const record = await runtime.run({
      definition: definition('fixture:canonical', contextNode.spec.id),
      scope: { kind: 'workspace', id: 'workspace-canonical' },
      trigger: { type: 'agent', id: 'tool-call' },
      actor: { type: 'user', id: 'actor-1' },
      context: { resourceId: 'resource-1', folderId: 'folder-1', traceId: 'trace-1' }
    });

    expect(record).toMatchObject({
      runId: 'canonical-run',
      workspaceId: 'workspace-canonical',
      createdAt: 0,
      startedAt: 0,
      completedAt: 0,
      duration: 0,
      metadata: {
        workspaceId: 'workspace-canonical',
        scope: { kind: 'workspace', id: 'workspace-canonical' },
        trigger: { type: 'agent', id: 'tool-call' },
        actor: { type: 'user', id: 'actor-1' },
        context: { resourceId: 'resource-1', folderId: 'folder-1', traceId: 'trace-1' }
      }
    });
    expect(contexts).toEqual([{ workspaceId: 'workspace-canonical', resourceId: 'resource-1', folderId: 'folder-1' }]);
    await runtime.dispose();
  });

  it('keeps legacy defId, input, and metadata requests compatible', async () => {
    const contexts: Array<Record<string, unknown>> = [];
    const legacyNode = defineNode({
      spec: { id: 'fixture/legacy', label: 'Legacy', inputs: [], outputs: [{ key: 'ok', type: 'boolean' as const }] },
      async run({ ctx }) {
        contexts.push({ workspaceId: ctx.workspaceId, resourceId: ctx.resourceId, folderId: ctx.folderId });
        return { ok: true };
      }
    });
    const store = new InMemoryWorkflowApplicationStore({
      definitions: [{ ...definition('fixture:legacy-definition', legacyNode.spec.id), workspaceId: 'workspace-legacy' }]
    });
    const runtime = createWorkflowRuntime({
      store,
      registry: createWorkflowRegistry({ nodes: [legacyNode] }),
      engineOptions: { completedRunTempTtlMs: 0 }
    });

    const record = await runtime.run({
      defId: 'fixture:legacy-definition',
      input: { resource: { id: 'resource-legacy', folderId: 'folder-legacy' } },
      metadata: { workspaceId: 'workspace-legacy', source: 'scheduler' }
    });

    expect(record.metadata).toMatchObject({
      workspaceId: 'workspace-legacy',
      resourceId: 'resource-legacy',
      folderId: 'folder-legacy',
      trigger: { type: 'schedule' }
    });
    expect(contexts).toEqual([{ workspaceId: 'workspace-legacy', resourceId: 'resource-legacy', folderId: 'folder-legacy' }]);
    await runtime.dispose();
  });

  it('times out an attempt using the injected clock', async () => {
    const clock = new FakeWorkflowClock(500);
    const timeoutNode = defineNode({
      spec: { id: 'fixture/timeout', label: 'Timeout', inputs: [], outputs: [] },
      execution: { timeoutMs: 50 },
      async run({ ctx }) {
        await new Promise<void>((_resolve, reject) => {
          ctx.signal?.addEventListener('abort', () => reject(new Error('handler aborted')), { once: true });
        });
        return {};
      }
    });
    const runtime = createWorkflowRuntime({
      store: new InMemoryWorkflowApplicationStore(),
      registry: createWorkflowRegistry({ nodes: [timeoutNode] }),
      clock,
      engineOptions: { completedRunTempTtlMs: 0 }
    });

    const handle = await runtime.start({ definition: definition('fixture:timeout', timeoutNode.spec.id) });
    await waitFor(() => clock.pendingSleeps === 1, 'timeout sleep was not registered');
    clock.advanceBy(50);
    const record = await handle.completionPromise;

    expect(record.status).toBe('failed');
    expect(record.nodes.task).toMatchObject({ status: 'failed', attempt: 1, errorReason: 'timeout' });
    expect(record.nodes.task.attempts).toEqual([expect.objectContaining({ attempt: 1, status: 'failed', errorReason: 'timeout', duration: 50 })]);
    await runtime.dispose();
  });

  it('retries only idempotent nodes and keeps a stable idempotency key', async () => {
    const clock = new FakeWorkflowClock(2_000);
    const idempotencyKeys: Array<string | undefined> = [];
    const attempts: number[] = [];
    const retryNode = defineNode({
      spec: { id: 'fixture/retry', label: 'Retry', inputs: [], outputs: [{ key: 'attempt', type: 'number' as const }] },
      execution: { idempotent: true, retry: { maxAttempts: 2, delayMs: 25 } },
      run({ ctx }) {
        attempts.push(ctx.workflowAttempt || 0);
        idempotencyKeys.push(ctx.workflowIdempotencyKey);
        if (attempts.length === 1) throw new Error('try again');
        return Promise.resolve({ attempt: ctx.workflowAttempt });
      }
    });
    const runtime = createWorkflowRuntime({
      store: new InMemoryWorkflowApplicationStore(),
      registry: createWorkflowRegistry({ nodes: [retryNode] }),
      clock,
      idFactory: new FakeWorkflowIdFactory(['retry-run']),
      engineOptions: { completedRunTempTtlMs: 0 }
    });

    const handle = await runtime.start({ definition: definition('fixture:retry', retryNode.spec.id) });
    await waitFor(() => clock.pendingSleeps === 1, 'retry delay was not registered');
    clock.advanceBy(25);
    const record = await handle.completionPromise;

    expect(record.status).toBe('completed');
    expect(record.output).toEqual({ attempt: 2 });
    expect(attempts).toEqual([1, 2]);
    expect(idempotencyKeys).toEqual(['retry-run:task', 'retry-run:task']);
    expect(record.nodes.task.attempts).toEqual([expect.objectContaining({ attempt: 1, status: 'failed', error: 'try again' }), expect.objectContaining({ attempt: 2, status: 'completed' })]);
    await runtime.dispose();

    expect(() =>
      createWorkflowRegistry({
        nodes: [
          defineNode({
            spec: { id: 'fixture/non-idempotent', label: 'Non-idempotent', inputs: [], outputs: [] },
            execution: { retry: { maxAttempts: 2 } },
            async run() {
              return {};
            }
          })
        ]
      })
    ).toThrow('retries require idempotent');
  });

  it('serializes named execution groups across runs and removes canceled waiters', async () => {
    let active = 0;
    let maximumActive = 0;
    const releases: Array<() => void> = [];
    const groupedNode = defineNode({
      spec: { id: 'fixture/grouped', label: 'Grouped', inputs: [], outputs: [] },
      execution: { group: 'gpu' },
      async run() {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active -= 1;
        return {};
      }
    });
    const limiter = createWorkflowExecutionLimiter({ groups: { gpu: 1 } });
    const runtime = createWorkflowRuntime({
      store: new InMemoryWorkflowApplicationStore(),
      registry: createWorkflowRegistry({ nodes: [groupedNode] }),
      limiter,
      idFactory: new FakeWorkflowIdFactory(['group-run-1', 'group-run-2', 'group-run-3']),
      engineOptions: { completedRunTempTtlMs: 0 }
    });

    const first = await runtime.start({ definition: definition('fixture:group-1', groupedNode.spec.id), scope: { kind: 'workspace', id: 'workspace-group' } });
    const second = await runtime.start({ definition: definition('fixture:group-2', groupedNode.spec.id), scope: { kind: 'workspace', id: 'workspace-group' } });
    const canceled = await runtime.start({ definition: definition('fixture:group-3', groupedNode.spec.id), scope: { kind: 'workspace', id: 'workspace-group' } });
    await waitFor(() => limiter.getActiveCount('gpu') === 1 && limiter.getWaitingCount('gpu') === 2, 'execution group was not queued');

    await expect(runtime.cancel(canceled.runId)).resolves.toBe(true);
    await expect(canceled.completionPromise).resolves.toMatchObject({ status: 'canceled' });
    expect(limiter.getWaitingCount('gpu')).toBe(1);

    releases.shift()?.();
    await waitFor(() => releases.length === 1, 'second execution did not acquire the released group');
    releases.shift()?.();
    const [firstRecord, secondRecord] = await Promise.all([first.completionPromise, second.completionPromise]);

    expect([firstRecord.status, secondRecord.status]).toEqual(['completed', 'completed']);
    expect(maximumActive).toBe(1);
    expect(limiter.getActiveCount('gpu')).toBe(0);
    expect(limiter.getWaitingCount('gpu')).toBe(0);
    await runtime.dispose();
  });

  it('persists ordered run snapshots, flushes writes, and disposes active work', async () => {
    const persistedStatuses: string[] = [];
    const baseStore = new InMemoryWorkflowApplicationStore();
    const store = runtimeStore(baseStore, async (record) => {
      await new Promise<void>((resolve) => setImmediate(resolve));
      persistedStatuses.push(record.status);
      baseStore.saveRun(record);
    });
    let started = false;
    const waitingNode = defineNode({
      spec: { id: 'fixture/dispose', label: 'Dispose', inputs: [], outputs: [] },
      async run({ ctx }) {
        started = true;
        await new Promise<void>((_resolve, reject) => {
          ctx.signal?.addEventListener('abort', () => reject(new Error('disposed')), { once: true });
        });
        return {};
      }
    });
    const runtime = createWorkflowRuntime({
      store,
      registry: createWorkflowRegistry({ nodes: [waitingNode] }),
      idFactory: new FakeWorkflowIdFactory(['dispose-run']),
      engineOptions: { completedRunTempTtlMs: 0 }
    });
    const handle = await runtime.start({
      definition: definition('fixture:dispose', waitingNode.spec.id),
      scope: { kind: 'workspace', id: 'workspace-dispose' }
    });
    await waitFor(() => started, 'active node did not start');

    await runtime.dispose();
    const record = await handle.completionPromise;

    expect(record.status).toBe('canceled');
    expect(persistedStatuses).toEqual(['queued', 'running', 'canceled']);
    await expect(baseStore.getRun(handle.runId, 'workspace-dispose')).resolves.toMatchObject({ status: 'canceled' });
    await expect(runtime.start({ definition: definition('fixture:disposed', waitingNode.spec.id) })).rejects.toMatchObject({ code: 'runtime-disposed' });
  });

  it('reports snapshot failures through flush without failing execution', async () => {
    const passNode = defineNode({
      spec: { id: 'fixture/persistence-failure', label: 'Persistence failure', inputs: [], outputs: [] },
      async run() {
        return {};
      }
    });
    const runtime = createWorkflowRuntime({
      store: new InMemoryWorkflowApplicationStore(),
      registry: createWorkflowRegistry({ nodes: [passNode] }),
      engineOptions: { completedRunTempTtlMs: 0 }
    });

    const record = await runtime.run({
      definition: definition('fixture:persistence-failure', passNode.spec.id),
      input: { nonSerializable: () => 'host callback' }
    });

    expect(record.status).toBe('completed');
    await expect(runtime.flush()).rejects.toBeInstanceOf(Error);
    await expect(runtime.dispose()).rejects.toBeInstanceOf(Error);
  });
});

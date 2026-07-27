import { describe, expect, it, vi } from 'vitest';

import type { WorkflowApplicationStore } from '../packages/workflow/application-service';
import { WorkflowApplicationService } from '../packages/workflow/application-service';
import type { WorkflowEngine } from '../packages/workflow/engine';
import type { IEngineEvents, WorkflowDefinition, WorkflowRunRecord } from '../packages/workflow/types';

function definition(patch: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    id: 'workflow-1',
    name: 'Workflow One',
    nodes: [{ id: 'node-1', type: 'test/node', config: { original: true } }],
    edges: [],
    ...patch
  };
}

function runRecord(patch: Partial<WorkflowRunRecord> = {}): WorkflowRunRecord {
  return {
    runId: 'run-1',
    workflowId: 'workflow-1',
    workspaceId: 'workspace-1',
    createdAt: 1,
    status: 'completed',
    nodes: { 'node-1': { nodeId: 'node-1', status: 'completed' } },
    ...patch
  };
}

function createStore(): WorkflowApplicationStore {
  return {
    listPresets: vi.fn().mockResolvedValue([]),
    listDefinitions: vi.fn().mockResolvedValue([]),
    getDefinition: vi.fn().mockResolvedValue(undefined),
    saveDefinition: vi.fn().mockResolvedValue(undefined),
    deleteDefinition: vi.fn().mockResolvedValue(undefined),
    listRuns: vi.fn().mockResolvedValue([]),
    getRun: vi.fn().mockResolvedValue(undefined),
    deleteRun: vi.fn().mockResolvedValue(undefined)
  };
}

function createEngine(): { engine: WorkflowEngine; emit<K extends keyof IEngineEvents>(event: K, ...args: Parameters<IEngineEvents[K]>): void } {
  const listeners = new Map<keyof IEngineEvents, Set<(...args: any[]) => void>>();
  const engine = {
    validate: vi.fn().mockResolvedValue({ ok: true, errors: [], issues: [] }),
    checkMissingConfigs: vi.fn().mockResolvedValue([]),
    run: vi.fn().mockResolvedValue(runRecord()),
    start: vi.fn().mockReturnValue({ runId: 'run-1', completionPromise: Promise.resolve(runRecord()) }),
    onTyped: vi.fn((event: keyof IEngineEvents, listener: (...args: any[]) => void) => {
      const eventListeners = listeners.get(event) || new Set();
      eventListeners.add(listener);
      listeners.set(event, eventListeners);
      return engine;
    }),
    off: vi.fn((event: keyof IEngineEvents, listener: (...args: any[]) => void) => {
      listeners.get(event)?.delete(listener);
      return engine;
    }),
    getRun: vi.fn().mockReturnValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    getRunLogs: vi.fn().mockReturnValue([])
  };

  return {
    engine: engine as unknown as WorkflowEngine,
    emit<K extends keyof IEngineEvents>(event: K, ...args: Parameters<IEngineEvents[K]>): void {
      listeners.get(event)?.forEach((listener) => listener(...args));
    }
  };
}

describe('WorkflowApplicationService', () => {
  it('resolves workspace, prefers presets, and applies per-run config overrides without mutating the definition', async () => {
    const fake = createEngine();
    const store = createStore();
    const preset = definition();
    vi.mocked(store.listPresets).mockResolvedValue([preset]);
    const resolveWorkspaceId = vi.fn().mockResolvedValue('workspace-1');
    const service = new WorkflowApplicationService(fake.engine, store, resolveWorkspaceId);

    const result = await service.executeById(preset.id, { resource: { workspaceId: 'workspace-1' }, __configOverrides__: { 'node-1': { original: false, runtime: true } } }, { source: 'test' });

    expect(result.ok).toBe(true);
    expect(resolveWorkspaceId).toHaveBeenCalledWith('workspace-1');
    expect(store.getDefinition).not.toHaveBeenCalled();
    expect(fake.engine.validate).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        nodes: [expect.objectContaining({ config: { original: false, runtime: true } })]
      })
    );
    expect(fake.engine.run).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), { source: 'test', workspaceId: 'workspace-1' });
    expect(preset.nodes[0].config).toEqual({ original: true });
  });

  it('validates workspace-scoped definitions before saving', async () => {
    const fake = createEngine();
    const store = createStore();
    const service = new WorkflowApplicationService(fake.engine, store, vi.fn().mockResolvedValue('workspace-1'));
    vi.mocked(fake.engine.validate).mockResolvedValueOnce({ ok: false, errors: ['invalid'], issues: [] });

    await expect(service.saveDefinition(definition())).resolves.toMatchObject({ ok: false, error: 'Workflow definition is invalid' });
    expect(store.saveDefinition).not.toHaveBeenCalled();

    vi.mocked(fake.engine.validate).mockResolvedValueOnce({ ok: true, errors: [], issues: [] });
    await expect(service.saveDefinition(definition())).resolves.toMatchObject({ ok: true });
    expect(store.saveDefinition).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'workspace-1' }));
    expect(fake.engine.validate).toHaveBeenLastCalledWith(expect.objectContaining({ workspaceId: 'workspace-1' }), { checkRuntimeDependencies: false });
  });

  it('reports aggregate progress for its run and removes the listener on completion', async () => {
    const fake = createEngine();
    const store = createStore();
    let complete!: (record: WorkflowRunRecord) => void;
    const completionPromise = new Promise<WorkflowRunRecord>((resolve) => {
      complete = resolve;
    });
    vi.mocked(fake.engine.start).mockReturnValue({ runId: 'run-1', completionPromise });
    const service = new WorkflowApplicationService(fake.engine, store, vi.fn().mockResolvedValue('workspace-1'));
    const onProgress = vi.fn();

    const handle = service.startDefinition(definition(), {}, undefined, onProgress);
    const record = runRecord({
      status: 'running',
      nodes: {
        done: { nodeId: 'done', status: 'completed' },
        active: { nodeId: 'active', status: 'running', progress: 50, progressMessage: 'halfway' }
      }
    });
    fake.emit('node:status', record, record.nodes.active);

    expect(onProgress).toHaveBeenCalledWith(75, 'halfway');
    complete(runRecord());
    await handle.completionPromise;
    expect(fake.engine.off).toHaveBeenCalledWith('node:status', expect.any(Function));
  });

  it('keeps run lookup and cancellation scoped to the resolved workspace', async () => {
    const fake = createEngine();
    const store = createStore();
    const service = new WorkflowApplicationService(fake.engine, store, vi.fn().mockResolvedValue('workspace-1'));
    vi.mocked(fake.engine.getRun).mockReturnValue(runRecord({ workspaceId: 'workspace-2', status: 'running' }));
    vi.mocked(store.getRun).mockResolvedValue(runRecord());

    await expect(service.getRun('run-1')).resolves.toMatchObject({ workspaceId: 'workspace-1' });
    await expect(service.cancelRun('run-1')).resolves.toBe(false);
    expect(fake.engine.cancel).not.toHaveBeenCalled();
    expect(store.getRun).toHaveBeenCalledWith('run-1', 'workspace-1');
  });
});

import { describe, expect, it } from 'vitest';

import type { WorkflowDefinition, WorkflowRunRecord } from '../packages/workflow/src/contracts';
import { InMemoryWorkflowApplicationStore } from '../packages/workflow/src/testing';

function definition(patch: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    id: 'workflow-1',
    name: 'Workflow One',
    nodes: [{ id: 'start', type: 'core/start' }],
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
    nodes: {},
    ...patch
  };
}

describe('InMemoryWorkflowApplicationStore', () => {
  it('normalizes the default workspace and keeps returned definitions isolated', async () => {
    const source = definition();
    const store = new InMemoryWorkflowApplicationStore({
      defaultWorkspaceId: 'workspace-default',
      definitions: [source]
    });

    source.name = 'mutated source';
    const listed = await store.listDefinitions('workspace-default');
    expect(listed).toEqual([expect.objectContaining({ name: 'Workflow One', workspaceId: 'workspace-default' })]);

    listed[0].name = 'mutated result';
    await expect(store.getDefinition('workflow-1', 'workspace-default')).resolves.toMatchObject({ name: 'Workflow One' });
    await expect(store.getDefinition('workflow-1', 'workspace-other')).resolves.toBeUndefined();
  });

  it('saves and deletes definitions within their workspace', async () => {
    const store = new InMemoryWorkflowApplicationStore({ defaultWorkspaceId: 'workspace-default' });
    await store.saveDefinition(definition());
    await store.saveDefinition(definition({ name: 'Other workspace', workspaceId: 'workspace-other' }));

    await expect(store.listDefinitions('workspace-default')).resolves.toHaveLength(1);
    await expect(store.listDefinitions('workspace-other')).resolves.toHaveLength(1);

    await store.deleteDefinition('workflow-1', 'workspace-default');
    await expect(store.getDefinition('workflow-1', 'workspace-default')).resolves.toBeUndefined();
    await expect(store.getDefinition('workflow-1', 'workspace-other')).resolves.toMatchObject({ name: 'Other workspace' });
  });

  it('filters, orders, limits, and deletes workspace-scoped runs', async () => {
    const store = new InMemoryWorkflowApplicationStore({
      runs: [
        runRecord({ runId: 'older', createdAt: 1, metadata: { resourceId: 'resource-1' } }),
        runRecord({ runId: 'newer', createdAt: 3, input: { resource: { id: 'resource-1' } } }),
        runRecord({ runId: 'other-resource', createdAt: 2, input: { resourceId: 'resource-2' } }),
        runRecord({ runId: 'other-workflow', workflowId: 'workflow-2', createdAt: 4 }),
        runRecord({ runId: 'other-workspace', workspaceId: 'workspace-2', createdAt: 5 })
      ]
    });

    await expect(store.listRuns('workspace-1', 'workflow-1', 1, 'resource-1')).resolves.toEqual([expect.objectContaining({ runId: 'newer' })]);
    await expect(store.getRun('other-workspace', 'workspace-1')).resolves.toBeUndefined();

    await store.deleteRun('newer', 'workspace-2');
    await expect(store.getRun('newer', 'workspace-1')).resolves.toBeDefined();
    await store.deleteRun('newer', 'workspace-1');
    await expect(store.getRun('newer', 'workspace-1')).resolves.toBeUndefined();
  });

  it('clones presets and saved runs and clears all data', async () => {
    const preset = definition({ id: 'preset-1', isPreset: true });
    const run = runRecord();
    const store = new InMemoryWorkflowApplicationStore({ presets: [preset] });

    store.saveRun(run);
    preset.name = 'mutated preset';
    run.status = 'failed';

    await expect(store.listPresets()).resolves.toEqual([expect.objectContaining({ name: 'Workflow One' })]);
    await expect(store.getRun('run-1', 'workspace-1')).resolves.toMatchObject({ status: 'completed' });

    store.clear();
    await expect(store.listPresets()).resolves.toEqual([]);
    await expect(store.listRuns('workspace-1')).resolves.toEqual([]);
  });
});

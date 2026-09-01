import { describe, expect, it } from 'vitest';

import { createWorkflowRegistry } from '../packages/workflow/src/core';
import { createEngine } from '../packages/workflow/src/node';
import type { WorkflowNodeHandler, WorkflowPlugin } from '../packages/workflow/src/sdk';
import { defineNode, definePlugin } from '../packages/workflow/src/sdk';

const definition = {
  id: 'registry-isolation',
  name: 'Registry isolation',
  nodes: [{ id: 'shared', type: 'fixture/shared' }],
  edges: []
};

function isolatedNode(result: string): WorkflowNodeHandler {
  return defineNode({
    spec: {
      id: 'fixture/shared',
      label: 'Shared fixture',
      inputs: [],
      outputs: [
        { key: 'result', type: 'string' as const },
        { key: 'plugin', type: 'string' as const }
      ]
    },
    async run({ getPlugin }) {
      return { result, plugin: getPlugin('fixture/plugin')?.label };
    }
  });
}

function isolatedPlugin(label: string): WorkflowPlugin {
  return definePlugin({
    id: 'fixture/plugin',
    label,
    async isInstalled() {
      return true;
    }
  });
}

describe('workflow registry isolation', () => {
  it('keeps nodes and plugins isolated across engines in the same process', async () => {
    const firstRegistry = createWorkflowRegistry({
      nodes: [isolatedNode('first')],
      plugins: [isolatedPlugin('First plugin')]
    });
    const secondRegistry = createWorkflowRegistry({
      nodes: [isolatedNode('second')],
      plugins: [isolatedPlugin('Second plugin')]
    });
    const firstEngine = createEngine({}, { completedRunTempTtlMs: 0, registry: firstRegistry });
    const secondEngine = createEngine({}, { completedRunTempTtlMs: 0, registry: secondRegistry });

    const [first, second] = await Promise.all([firstEngine.run(definition), secondEngine.run(definition)]);

    expect(first.output).toEqual({ result: 'first', plugin: 'First plugin' });
    expect(second.output).toEqual({ result: 'second', plugin: 'Second plugin' });
    expect(firstEngine.registry).toBe(firstRegistry);
    expect(secondEngine.registry).toBe(secondRegistry);
  });

  it('allows the same node id in different registries but rejects local duplicates', () => {
    const firstRegistry = createWorkflowRegistry({ nodes: [isolatedNode('first')] });
    const secondRegistry = createWorkflowRegistry({ nodes: [isolatedNode('second')] });

    expect(firstRegistry.getNode('fixture/shared')).toBeDefined();
    expect(secondRegistry.getNode('fixture/shared')).toBeDefined();
    expect(() => firstRegistry.registerNode(isolatedNode('duplicate'))).toThrow('Node already registered: fixture/shared');
  });

  it('does not resolve nodes from another engine registry', async () => {
    const registeredEngine = createEngine({}, { registry: createWorkflowRegistry({ nodes: [isolatedNode('registered')] }) });
    const emptyEngine = createEngine({}, { registry: createWorkflowRegistry() });

    await expect(registeredEngine.validate(definition, { checkRuntimeDependencies: false })).resolves.toEqual({ ok: true });
    await expect(emptyEngine.validate(definition, { checkRuntimeDependencies: false })).resolves.toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'invalid-definition', nodeId: 'shared' })]
    });
  });
});

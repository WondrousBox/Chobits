import assert from 'node:assert/strict';

import { createWorkflowRegistry } from '@chobits/workflow/core';
import { EndNode } from '@chobits/workflow/nodes';
import { createWorkflowCapabilities, createWorkflowRuntime } from '@chobits/workflow/runtime';
import { parseWorkflowDefinition } from '@chobits/workflow/schema';
import { defineCapability, defineNode } from '@chobits/workflow/sdk';
import { FakeWorkflowIdFactory, InMemoryWorkflowApplicationStore } from '@chobits/workflow/testing';

const formatter = defineCapability('fixture.formatter');

const startNode = defineNode({
  spec: {
    id: 'core/start',
    label: 'Start',
    inputs: [],
    outputs: [{ key: 'value', type: 'string' }]
  },
  async run({ input }) {
    return input;
  }
});

const capabilityNode = defineNode({
  spec: {
    id: 'fixture/capability',
    label: 'Capability',
    inputs: [{ key: 'value', type: 'string', required: true }],
    outputs: [{ key: 'result', type: 'string' }]
  },
  requiredCapabilities: [formatter],
  async run({ capabilities, input, ctx }) {
    return {
      result: capabilities.require(formatter).format(input.value, ctx.workspaceId)
    };
  }
});

const waitNode = defineNode({
  spec: {
    id: 'fixture/wait',
    label: 'Wait',
    inputs: [],
    outputs: []
  },
  execution: { group: 'fixture-worker' },
  async run({ ctx }) {
    return new Promise((resolve, reject) => {
      ctx.signal?.addEventListener('abort', () => reject(new Error('fixture aborted')), { once: true });
    });
  }
});

const completedDefinition = {
  id: 'fixture:completed',
  name: 'Completed fixture',
  nodes: [
    { id: 'start', type: startNode.spec.id },
    { id: 'capability', type: capabilityNode.spec.id }
  ],
  edges: [
    {
      id: 'start-to-capability',
      from: { nodeId: 'start', port: 'value' },
      to: { nodeId: 'capability', port: 'value' }
    }
  ]
};
assert.equal(parseWorkflowDefinition(completedDefinition).ok, true);

const registry = createWorkflowRegistry({ nodes: [startNode, capabilityNode, waitNode, EndNode] });
const capabilities = createWorkflowCapabilities([
  [
    formatter,
    {
      format(value, workspaceId) {
        return `${workspaceId}:${value}`;
      }
    }
  ]
]);
const store = new InMemoryWorkflowApplicationStore({ defaultWorkspaceId: 'workspace-fixture' });
const runtime = createWorkflowRuntime({
  store,
  registry,
  capabilities,
  idFactory: new FakeWorkflowIdFactory(['consumer-completed', 'consumer-canceled']),
  executionGroups: { groups: { 'fixture-worker': 1 } },
  engineOptions: { completedRunTempTtlMs: 0 }
});

const statuses = [];
const unsubscribe = runtime.events.subscribe('run:status', (record) => statuses.push(`${record.runId}:${record.status}`));
const completed = await runtime.run({
  definition: completedDefinition,
  input: { value: 'consumer-ok' },
  scope: { kind: 'workspace', id: 'workspace-fixture' },
  trigger: { type: 'manual' },
  actor: { type: 'consumer', id: 'fixture' },
  context: { traceId: 'tarball-consumer' }
});
await runtime.flush();

assert.equal(completed.status, 'completed');
assert.equal(completed.runId, 'consumer-completed');
assert.deepEqual(completed.output, { result: 'workspace-fixture:consumer-ok' });
assert.equal(statuses.includes('consumer-completed:completed'), true);
assert.equal((await store.getRun('consumer-completed', 'workspace-fixture')).status, 'completed');

const saved = await runtime.application.saveDefinition(completedDefinition, 'workspace-fixture');
assert.equal(saved.ok, true);
assert.equal((await runtime.application.listDefinitions('workspace-fixture')).length, 1);

const cancelHandle = await runtime.start({
  definition: {
    id: 'fixture:canceled',
    name: 'Canceled fixture',
    nodes: [{ id: 'wait', type: waitNode.spec.id }],
    edges: []
  },
  scope: { kind: 'workspace', id: 'workspace-fixture' }
});
await runtime.cancel(cancelHandle.runId);
const canceled = await cancelHandle.completionPromise;
assert.equal(canceled.status, 'canceled');

unsubscribe();
await runtime.dispose();
await assert.rejects(runtime.start({ definition: completedDefinition }), (error) => error && error.code === 'runtime-disposed');
await assert.rejects(import('@chobits/workflow/dist/src/index.js'), (error) => error && error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED');
await assert.rejects(import('@chobits/workflow/src/index.js'), (error) => error && error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED');

for (const subpath of ['application', 'contracts', 'core', 'node', 'nodes', 'ports', 'runtime', 'schema', 'sdk', 'testing']) {
  const entry = await import(`@chobits/workflow/${subpath}`);
  assert.equal(typeof entry, 'object');
}

console.log('workflow tarball consumer passed');

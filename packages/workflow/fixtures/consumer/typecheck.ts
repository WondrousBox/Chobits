import type { WorkflowDefinition, WorkflowExecutionResult } from '@chobits/workflow';
import type { WorkflowRuntimeFacade } from '@chobits/workflow/application';
import type { WorkflowRunRequest } from '@chobits/workflow/contracts';
import { createWorkflowRegistry, planWorkflowDag } from '@chobits/workflow/core';
import { createEngine } from '@chobits/workflow/node';
import { EndNode } from '@chobits/workflow/nodes';
import type { WorkflowApplicationStore } from '@chobits/workflow/ports';
import { createWorkflowCapabilities, createWorkflowRuntime } from '@chobits/workflow/runtime';
import { parseWorkflowDefinition } from '@chobits/workflow/schema';
import { defineCapability, defineNode } from '@chobits/workflow/sdk';
import { FakeWorkflowClock, FakeWorkflowIdFactory, InMemoryWorkflowApplicationStore } from '@chobits/workflow/testing';

const formatter = defineCapability<{ format(value: string): string }>('consumer.formatter');
const node = defineNode({
  spec: {
    id: 'consumer/node',
    label: 'Consumer node',
    inputs: [{ key: 'value', type: 'string', required: true }],
    outputs: [{ key: 'result', type: 'string' }]
  },
  requiredCapabilities: [formatter],
  async run({ capabilities, input }) {
    return { result: capabilities.require(formatter).format(String(input.value)) };
  }
});
const definition = {
  id: 'consumer:typecheck',
  name: 'Consumer typecheck',
  nodes: [{ id: 'node', type: node.spec.id }],
  edges: []
} satisfies WorkflowDefinition;
const request = {
  definition,
  input: { value: 'typed' },
  scope: { kind: 'workspace', id: 'workspace-1' }
} satisfies WorkflowRunRequest;
const registry = createWorkflowRegistry({ nodes: [node, EndNode] });
const capabilities = createWorkflowCapabilities([[formatter, { format: (value: string) => value.toUpperCase() }]]);
const store: WorkflowApplicationStore = new InMemoryWorkflowApplicationStore();
const runtime = createWorkflowRuntime({
  store,
  registry,
  capabilities,
  clock: new FakeWorkflowClock(),
  idFactory: new FakeWorkflowIdFactory()
});
const engine = createEngine({}, { registry, capabilities });

void parseWorkflowDefinition(definition);
void planWorkflowDag(definition);
const execution: Promise<WorkflowExecutionResult> = runtime.execute(request);
void execution;
void engine;
void ({} as WorkflowRuntimeFacade);

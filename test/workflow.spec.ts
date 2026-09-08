import { describe, expect, it } from 'vitest';

import { createWorkflowRegistry } from '@chobits/workflow/core';

import { createEngine } from '../packages/workflow/engine';
import type { NodeHandler } from '../packages/workflow/types';

const basicPassThroughNode: NodeHandler = {
  spec: {
    id: 'test/basic-pass-through',
    label: 'Basic pass through',
    inputs: [],
    outputs: [{ key: 'result', type: 'string' }]
  },
  async run({ input }) {
    return { result: input.value };
  }
};

describe('WorkflowEngine basic', () => {
  it('runs without Electron or database infrastructure', async () => {
    const engine = createEngine({}, { registry: createWorkflowRegistry({ nodes: [basicPassThroughNode] }) });
    const rec = await engine.run({
      id: 'test:basic',
      name: 'Basic',
      nodes: [{ id: 'pass', type: 'test/basic-pass-through', inputDefaults: { value: 'hello world' } }],
      edges: []
    });

    expect(rec.status).toBe('completed');
    expect(rec.output).toEqual({ result: 'hello world' });
  });
});

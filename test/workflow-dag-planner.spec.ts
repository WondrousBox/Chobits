import { describe, expect, it } from 'vitest';

import { planWorkflowDag } from '../packages/workflow/core/dag-planner';
import type { WorkflowDefinition } from '../packages/workflow/types';

function graph(nodes: string[], edges: Array<[string, string]>): WorkflowDefinition {
  return {
    id: 'test:dag-plan',
    name: 'DAG Plan',
    nodes: nodes.map((id) => ({ id, type: 'test/node' })),
    edges: edges.map(([from, to], index) => ({
      id: `edge-${index}`,
      from: { nodeId: from, port: 'output' },
      to: { nodeId: to, port: 'input' }
    }))
  };
}

describe('workflow DAG planner', () => {
  it('builds stable topological order, parallel levels, and terminal nodes', () => {
    const plan = planWorkflowDag(
      graph(
        ['start', 'left', 'right', 'join', 'isolated'],
        [
          ['start', 'left'],
          ['start', 'right'],
          ['left', 'join'],
          ['right', 'join']
        ]
      )
    );

    expect(plan.order).toEqual(['start', 'isolated', 'left', 'right', 'join']);
    expect(plan.levels).toEqual([['start', 'isolated'], ['left', 'right'], ['join']]);
    expect(plan.terminalNodeIds).toEqual(['join', 'isolated']);
  });

  it('rejects cyclic graphs', () => {
    expect(() =>
      planWorkflowDag(
        graph(
          ['a', 'b'],
          [
            ['a', 'b'],
            ['b', 'a']
          ]
        )
      )
    ).toThrow('Workflow has cycles or disconnected nodes');
  });

  it('rejects edges that reference nodes outside the graph', () => {
    expect(() => planWorkflowDag(graph(['a'], [['a', 'missing']]))).toThrow('Workflow has cycles or disconnected nodes');
  });
});

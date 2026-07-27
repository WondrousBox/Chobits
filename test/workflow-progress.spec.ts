import { describe, expect, it } from 'vitest';

import { calculateWorkflowProgress } from '../packages/workflow/progress';
import type { NodeRunState } from '../packages/workflow/types';

function nodes(states: Array<Pick<NodeRunState, 'status' | 'progress'>>): Record<string, NodeRunState> {
  return Object.fromEntries(states.map((state, index) => [`node-${index}`, { nodeId: `node-${index}`, ...state }]));
}

describe('workflow progress aggregation', () => {
  it('aggregates every concurrently running node', () => {
    expect(calculateWorkflowProgress(nodes([{ status: 'completed' }, { status: 'running', progress: 20 }, { status: 'running', progress: 80 }, { status: 'pending' }]))).toBe(50);
  });

  it('clamps node progress and treats every terminal node as complete', () => {
    expect(calculateWorkflowProgress(nodes([{ status: 'completed' }, { status: 'failed' }, { status: 'skipped' }, { status: 'running', progress: 140 }]))).toBe(100);
    expect(calculateWorkflowProgress(nodes([{ status: 'running', progress: -20 }, { status: 'pending' }]))).toBe(0);
  });
});

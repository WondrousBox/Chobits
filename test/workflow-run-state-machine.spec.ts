import { describe, expect, it } from 'vitest';

import {
  applyTerminalWorkflowOutput,
  cancelWorkflowRun,
  collectTerminalWorkflowOutput,
  createWorkflowRunRecord,
  finalizeWorkflowRunStatus,
  MAX_WORKFLOW_NODE_ATTEMPTS,
  skipWorkflowNodes,
  transitionWorkflowNode,
  updateWorkflowNode
} from '../packages/workflow/core/run-state-machine';
import type { WorkflowRunRecord } from '../packages/workflow/types';

function record(): WorkflowRunRecord {
  return createWorkflowRunRecord({
    definition: {
      id: 'workflow-1',
      name: 'Workflow One',
      workspaceId: 'definition-workspace',
      nodes: [
        { id: 'a', type: 'test/a' },
        { id: 'b', type: 'test/b' }
      ],
      edges: []
    },
    runId: 'run-1',
    input: { resource: { workspaceId: 'resource-workspace' } },
    metadata: { workspaceId: 'metadata-workspace' },
    createdAt: 10,
    startedAt: 12
  });
}

describe('workflow run state machine', () => {
  it('initializes and transitions node state while preserving workflow scope', () => {
    const run = record();
    expect(run).toMatchObject({ status: 'queued', workspaceId: 'metadata-workspace', createdAt: 10, startedAt: 12 });
    expect(run.nodes).toEqual({
      a: { nodeId: 'a', status: 'pending', attempt: 0, attempts: [] },
      b: { nodeId: 'b', status: 'pending', attempt: 0, attempts: [] }
    });

    transitionWorkflowNode(run, 'a', 'running', { startedAt: 20, input: { value: 1 } });
    updateWorkflowNode(run, 'a', { progress: 50 });
    expect(run.nodes.a).toMatchObject({ status: 'running', startedAt: 20, input: { value: 1 }, progress: 50 });

    transitionWorkflowNode(run, 'a', 'completed', { finishedAt: 30, output: { result: 'a' } });
    skipWorkflowNodes(run, ['pending'], 'not scheduled after fail-fast', 31);
    expect(run.nodes.b).toMatchObject({ status: 'skipped', finishedAt: 31, error: 'not scheduled after fail-fast' });
    expect(run.nodes.a.attempts).toEqual([{ attempt: 1, status: 'completed', startedAt: 20, finishedAt: 30, duration: 10 }]);
    finalizeWorkflowRunStatus(run, false, 32);
    expect(run.status).toBe('completed');
  });

  it('preserves attempt summaries across a later retry', () => {
    const run = record();
    transitionWorkflowNode(run, 'a', 'running', { startedAt: 20 });
    transitionWorkflowNode(run, 'a', 'failed', { finishedAt: 25, error: 'temporary', errorReason: 'execution-error' });
    transitionWorkflowNode(run, 'a', 'running', { startedAt: 30 });
    expect(run.nodes.a).toMatchObject({ attempt: 2, status: 'running' });
    expect(run.nodes.a).not.toHaveProperty('error');
    expect(run.nodes.a).not.toHaveProperty('errorReason');
    expect(run.nodes.a).not.toHaveProperty('finishedAt');
    transitionWorkflowNode(run, 'a', 'completed', { finishedAt: 40 });

    expect(run.nodes.a).toMatchObject({ attempt: 2, status: 'completed' });
    expect(run.nodes.a.attempts).toEqual([
      { attempt: 1, status: 'failed', startedAt: 20, finishedAt: 25, duration: 5, error: 'temporary', errorReason: 'execution-error' },
      { attempt: 2, status: 'completed', startedAt: 30, finishedAt: 40, duration: 10 }
    ]);
  });

  it('bounds retained attempt summaries without reusing attempt numbers', () => {
    const run = record();
    for (let attempt = 1; attempt <= MAX_WORKFLOW_NODE_ATTEMPTS + 2; attempt += 1) {
      transitionWorkflowNode(run, 'a', 'running', { startedAt: attempt * 10 });
      transitionWorkflowNode(run, 'a', 'failed', { finishedAt: attempt * 10 + 1, error: `failure-${attempt}`, errorReason: 'execution-error' });
    }

    expect(run.nodes.a.attempt).toBe(MAX_WORKFLOW_NODE_ATTEMPTS + 2);
    expect(run.nodes.a.attempts).toHaveLength(MAX_WORKFLOW_NODE_ATTEMPTS);
    expect(run.nodes.a.attempts?.[0].attempt).toBe(3);
    expect(run.nodes.a.attempts?.at(-1)?.attempt).toBe(MAX_WORKFLOW_NODE_ATTEMPTS + 2);
  });

  it('cancels only active runs and finalizes pending or running nodes', () => {
    const run = record();
    transitionWorkflowNode(run, 'a', 'running');
    expect(cancelWorkflowRun(run, 40).map((state) => state.nodeId)).toEqual(['a', 'b']);
    expect(run).toMatchObject({ status: 'canceled', completedAt: 40, duration: 28 });
    expect(Object.values(run.nodes).every((state) => state.status === 'skipped' && state.error === 'canceled')).toBe(true);
    expect(cancelWorkflowRun(run, 50)).toEqual([]);
    expect(run.completedAt).toBe(40);
  });

  it('merges terminal output and fails non-canceled runs on key collisions', () => {
    const run = record();
    finalizeWorkflowRunStatus(run, false, 30);
    const result = collectTerminalWorkflowOutput(
      ['a', 'b'],
      new Map([
        ['a', { result: 'first', left: 1 }],
        ['b', { result: 'second', right: 2 }]
      ])
    );
    expect(result).toEqual({ output: { result: 'first', left: 1, right: 2 }, collisionError: 'Terminal output key collision: result (a, b)' });
    applyTerminalWorkflowOutput(run, result);
    expect(run).toMatchObject({ status: 'failed', error: 'Terminal output key collision: result (a, b)', output: result.output });
  });
});

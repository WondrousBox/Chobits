import { describe, expect, it } from 'vitest';

import { executeWorkflowSchedule, type WorkflowNodeExecutionResult } from '../packages/workflow/core/execution-scheduler';

describe('workflow execution scheduler', () => {
  it('waits for each level and respects the batch concurrency', async () => {
    const events: string[] = [];
    let active = 0;
    let maxActive = 0;

    const result = await executeWorkflowSchedule({
      levels: [['a', 'b'], ['c']],
      concurrency: 2,
      shouldStop: () => false,
      async executeNode(nodeId) {
        events.push(`${nodeId}:start`);
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active -= 1;
        events.push(`${nodeId}:end`);
        return 'completed';
      }
    });

    expect(result).toEqual({ canceled: false, failedFast: false });
    expect(maxActive).toBe(2);
    expect(events.indexOf('c:start')).toBeGreaterThan(events.indexOf('b:end'));
  });

  it('stops after a failed batch while allowing every node in that batch to finish', async () => {
    const events: string[] = [];

    const result = await executeWorkflowSchedule({
      levels: [['failed', 'sibling', 'late']],
      concurrency: 2,
      errorStrategy: 'fail-fast',
      shouldStop: () => false,
      async executeNode(nodeId): Promise<WorkflowNodeExecutionResult> {
        events.push(`${nodeId}:start`);
        await Promise.resolve();
        events.push(`${nodeId}:end`);
        return nodeId === 'failed' ? 'failed' : 'completed';
      }
    });

    expect(result).toEqual({ canceled: false, failedFast: true });
    expect(events).toEqual(['failed:start', 'sibling:start', 'failed:end', 'sibling:end']);
  });

  it('continues scheduling after failures when configured to continue', async () => {
    const executed: string[] = [];

    const result = await executeWorkflowSchedule({
      levels: [['failed', 'later']],
      concurrency: 1,
      errorStrategy: 'continue',
      shouldStop: () => false,
      async executeNode(nodeId) {
        executed.push(nodeId);
        return nodeId === 'failed' ? 'failed' : 'completed';
      }
    });

    expect(result).toEqual({ canceled: false, failedFast: false });
    expect(executed).toEqual(['failed', 'later']);
  });

  it('does not schedule another batch after cancellation', async () => {
    const executed: string[] = [];

    const result = await executeWorkflowSchedule({
      levels: [['active', 'later']],
      concurrency: 1,
      shouldStop: () => false,
      async executeNode(nodeId) {
        executed.push(nodeId);
        return 'canceled';
      }
    });

    expect(result).toEqual({ canceled: true, failedFast: false });
    expect(executed).toEqual(['active']);
  });

  it('falls back to serial batches for a non-finite concurrency value', async () => {
    const executed: string[] = [];

    await executeWorkflowSchedule({
      levels: [['first', 'second']],
      concurrency: Number.NaN,
      shouldStop: () => false,
      async executeNode(nodeId) {
        executed.push(nodeId);
        return 'completed';
      }
    });

    expect(executed).toEqual(['first', 'second']);
  });
});

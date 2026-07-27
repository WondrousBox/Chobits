import fsPromises from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import type { WorkflowEngine } from '../packages/workflow/engine';
import { createEngine } from '../packages/workflow/engine';
import { ConditionNode } from '../packages/workflow/nodes/condition';
import { EndNode } from '../packages/workflow/nodes/end';
import { registerNode, registerPlugin } from '../packages/workflow/registry';
import type { NodeHandler, WorkflowRunRecord } from '../packages/workflow/types';

function node(id: string, run: NodeHandler['run'], inputs: NodeHandler['spec']['inputs'] = [], outputs: NodeHandler['spec']['outputs'] = []): NodeHandler {
  return {
    spec: { id, label: id, inputs, outputs },
    run
  };
}

registerNode(node('test/source', async ({ input }) => ({ value: input.value })));
registerNode(node('test/left', async ({ input }) => ({ left: input.value })));
registerNode(node('test/right', async ({ input }) => ({ right: input.value })));
registerNode(node('test/terminal-a', async ({ input }) => ({ a: input.value })));
registerNode(node('test/terminal-b', async ({ input }) => ({ b: input.value })));
registerNode(node('test/terminal-result-a', async () => ({ result: 'a' })));
registerNode(node('test/terminal-result-b', async () => ({ result: 'b' })));
registerNode(
  node('test/join', async ({ input }) => ({ joined: `${input.left}:${input.right}` }), [
    { key: 'left', type: 'string', required: true },
    { key: 'right', type: 'string', required: true }
  ])
);
registerNode(node('test/tmp-dir', async ({ ctx }) => ({ tmpDir: ctx.tmpDir })));
registerNode(node('test/workspace-context', async ({ ctx }) => ({ workspaceId: ctx.workspaceId })));
registerNode(
  node('test/fail', async () => {
    throw new Error('expected failure');
  })
);
registerNode(
  node('test/slow', async ({ ctx }) => {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 1000);
      ctx.signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new Error('aborted'));
        },
        { once: true }
      );
    });
    return { done: true };
  })
);
registerNode(ConditionNode);
registerNode(EndNode);

function engine(): WorkflowEngine {
  return createEngine({});
}

describe('WorkflowEngine execution contract', () => {
  it('returns output from terminal nodes instead of source nodes', async () => {
    const rec = await engine().run({
      id: 'test:linear',
      name: 'linear',
      nodes: [
        { id: 'source', type: 'test/source', inputDefaults: { value: 'terminal-value' } },
        { id: 'terminal', type: 'test/terminal-a' }
      ],
      edges: [{ id: 'edge', from: { nodeId: 'source', port: 'value' }, to: { nodeId: 'terminal', port: 'value' } }]
    });

    expect(rec.status).toBe('completed');
    expect(rec.output).toEqual({ a: 'terminal-value' });
  });

  it('runs only the selected condition branch and marks the other branch skipped', async () => {
    const rec = await engine().run({
      id: 'test:condition',
      name: 'condition',
      nodes: [
        { id: 'source', type: 'test/source', inputDefaults: { value: 'yes' } },
        {
          id: 'condition',
          type: 'logic/condition',
          config: {
            inputs: [{ key: 'value', label: 'value' }],
            conditions: [{ id: 'yes', targetInput: 'value', operator: 'eq', value: 'yes' }]
          }
        },
        { id: 'left', type: 'test/left' },
        { id: 'right', type: 'test/right' }
      ],
      edges: [
        { id: 'source-condition', from: { nodeId: 'source', port: 'value' }, to: { nodeId: 'condition', port: 'value' } },
        { id: 'condition-left', from: { nodeId: 'condition', port: 'yes' }, to: { nodeId: 'left', port: 'value' } },
        { id: 'condition-right', from: { nodeId: 'condition', port: 'else' }, to: { nodeId: 'right', port: 'value' } }
      ]
    });

    expect(rec.status).toBe('completed');
    expect(rec.nodes.left.status).toBe('completed');
    expect(rec.nodes.right.status).toBe('skipped');
    expect(rec.output).toEqual({ left: 'yes' });
  });

  it('does not run a join until every required branch input is available', async () => {
    const rec = await engine().run({
      id: 'test:required-join',
      name: 'required-join',
      nodes: [
        { id: 'source', type: 'test/source', inputDefaults: { value: 'yes' } },
        {
          id: 'condition',
          type: 'logic/condition',
          config: {
            inputs: [{ key: 'value', label: 'value' }],
            conditions: [{ id: 'yes', targetInput: 'value', operator: 'eq', value: 'yes' }]
          }
        },
        { id: 'join', type: 'test/join' }
      ],
      edges: [
        { id: 'source-condition', from: { nodeId: 'source', port: 'value' }, to: { nodeId: 'condition', port: 'value' } },
        { id: 'condition-yes', from: { nodeId: 'condition', port: 'yes' }, to: { nodeId: 'join', port: 'left' } },
        { id: 'condition-else', from: { nodeId: 'condition', port: 'else' }, to: { nodeId: 'join', port: 'right' } }
      ]
    });

    expect(rec.status).toBe('completed');
    expect(rec.nodes.join).toEqual(expect.objectContaining({ status: 'skipped', error: expect.stringContaining('right') }));
    expect(rec.output).toEqual({});
  });

  it('reports node failures as failed runs and cleans the execution context', async () => {
    const workflowEngine = engine();
    const rec = await workflowEngine.run({
      id: 'test:failure',
      name: 'failure',
      nodes: [{ id: 'fail', type: 'test/fail' }],
      edges: []
    });

    expect(rec.status).toBe('failed');
    expect(rec.nodes.fail.status).toBe('failed');
    expect(rec.nodes.fail).toMatchObject({ attempt: 1, errorReason: 'execution-error' });
    expect(rec.nodes.fail.attempts).toEqual([expect.objectContaining({ attempt: 1, status: 'failed', error: 'expected failure', errorReason: 'execution-error' })]);
    expect(rec.error).toContain('expected failure');
    expect(workflowEngine.getRunLogs(rec.runId)).toEqual(expect.arrayContaining([expect.objectContaining({ nodeId: 'fail', attempt: 1, level: 'error', errorReason: 'execution-error' })]));
    expect(workflowEngine.getRunContext(rec.runId)).toBeUndefined();
  });

  it('keeps workspace identity on the run record and execution context', async () => {
    const rec = await engine().run(
      {
        id: 'test:workspace-context',
        name: 'workspace-context',
        workspaceId: 'workspace-a',
        nodes: [{ id: 'context', type: 'test/workspace-context' }],
        edges: []
      },
      {},
      { workspaceId: 'workspace-a' }
    );

    expect(rec.status).toBe('completed');
    expect(rec.workspaceId).toBe('workspace-a');
    expect(rec.output).toEqual({ workspaceId: 'workspace-a' });
  });

  it('cancels a running node without changing a completed run', async () => {
    const workflowEngine = engine();
    const running = new Promise<string>((resolve) => {
      workflowEngine.onTyped('node:status', (rec, state) => {
        if (state.status === 'running') resolve(rec.runId);
      });
    });
    const execution = workflowEngine.run({
      id: 'test:cancel',
      name: 'cancel',
      nodes: [{ id: 'slow', type: 'test/slow' }],
      edges: []
    });

    await workflowEngine.cancel(await running);
    const rec = await execution;

    expect(rec.status).toBe('canceled');
    expect(rec.nodes.slow).toMatchObject({ attempt: 1, errorReason: 'canceled' });
    expect(rec.nodes.slow.attempts).toEqual([expect.objectContaining({ attempt: 1, status: 'canceled', errorReason: 'canceled' })]);
    expect(workflowEngine.getRunLogs(rec.runId)).toEqual(expect.arrayContaining([expect.objectContaining({ nodeId: 'slow', attempt: 1, level: 'warn', errorReason: 'canceled' })]));
    expect(workflowEngine.getRunContext(rec.runId)).toBeUndefined();
    await workflowEngine.cancel(rec.runId);
    expect(workflowEngine.getRun(rec.runId)?.status).toBe('canceled');

    const completed = await workflowEngine.run({
      id: 'test:already-completed',
      name: 'already-completed',
      nodes: [{ id: 'source', type: 'test/source', inputDefaults: { value: 'done' } }],
      edges: []
    });
    await workflowEngine.cancel(completed.runId);
    expect(workflowEngine.getRun(completed.runId)?.status).toBe('completed');
  });

  it('returns a stable run handle before asynchronous setup completes', async () => {
    const workflowEngine = engine();
    const handle = workflowEngine.start({
      id: 'test:start-handle',
      name: 'start-handle',
      nodes: [{ id: 'source', type: 'test/source', inputDefaults: { value: 'done' } }],
      edges: []
    });

    expect(handle.runId).toBeTypeOf('string');
    expect(workflowEngine.getRun(handle.runId)?.status).toBe('queued');
    const rec = await handle.completionPromise;
    expect(rec.runId).toBe(handle.runId);
    expect(rec.status).toBe('completed');
  });

  it('can cancel a run immediately after receiving its handle', async () => {
    const workflowEngine = engine();
    let canceledNodeStatus: string | undefined;
    const canceledNodeEvents: string[] = [];
    workflowEngine.onTyped('run:status', (record) => {
      if (record.status === 'canceled') canceledNodeStatus = record.nodes.slow?.status;
    });
    workflowEngine.onTyped('node:status', (_record, state) => {
      if (state.status === 'skipped') canceledNodeEvents.push(state.nodeId);
    });
    const handle = workflowEngine.start({
      id: 'test:immediate-cancel',
      name: 'immediate-cancel',
      nodes: [{ id: 'slow', type: 'test/slow' }],
      edges: []
    });

    await workflowEngine.cancel(handle.runId);
    const rec = await handle.completionPromise;
    expect(rec.status).toBe('canceled');
    expect(rec.nodes.slow.status).toBe('skipped');
    expect(canceledNodeStatus).toBe('skipped');
    expect(canceledNodeEvents).toContain('slow');
    expect(workflowEngine.getRunContext(rec.runId)).toBeUndefined();
  });

  it('merges outputs from multiple terminal nodes', async () => {
    const rec = await engine().run({
      id: 'test:multi-terminal',
      name: 'multi-terminal',
      nodes: [
        { id: 'source', type: 'test/source', inputDefaults: { value: 'shared' } },
        { id: 'a', type: 'test/terminal-a' },
        { id: 'b', type: 'test/terminal-b' }
      ],
      edges: [
        { id: 'source-a', from: { nodeId: 'source', port: 'value' }, to: { nodeId: 'a', port: 'value' } },
        { id: 'source-b', from: { nodeId: 'source', port: 'value' }, to: { nodeId: 'b', port: 'value' } }
      ]
    });

    expect(rec.output).toEqual({ a: 'shared', b: 'shared' });
  });

  it('fails instead of silently overwriting colliding terminal output keys', async () => {
    const rec = await engine().run({
      id: 'test:terminal-output-collision',
      name: 'terminal-output-collision',
      nodes: [
        { id: 'a', type: 'test/terminal-result-a' },
        { id: 'b', type: 'test/terminal-result-b' }
      ],
      edges: []
    });

    expect(rec.status).toBe('failed');
    expect(rec.error).toContain('Terminal output key collision: result (a, b)');
    expect(rec.output).toEqual({ result: 'a' });
  });

  it('collects multiple results through explicitly named end ports', async () => {
    const rec = await engine().run({
      id: 'test:explicit-end-inputs',
      name: 'explicit-end-inputs',
      nodes: [
        { id: 'first', type: 'test/source', inputDefaults: { value: 'first-value' } },
        { id: 'second', type: 'test/source', inputDefaults: { value: 'second-value' } },
        {
          id: 'end',
          type: 'core/end',
          config: { inputs: [{ key: 'firstResult' }, { key: 'secondResult' }] }
        }
      ],
      edges: [
        { id: 'first-end', from: { nodeId: 'first', port: 'value' }, to: { nodeId: 'end', port: 'firstResult' } },
        { id: 'second-end', from: { nodeId: 'second', port: 'value' }, to: { nodeId: 'end', port: 'secondResult' } }
      ]
    });

    expect(rec.status).toBe('completed');
    expect(rec.output).toEqual({ firstResult: 'first-value', secondResult: 'second-value' });
  });

  it('fails cyclic definitions and removes temporary run directories', async () => {
    const workflowEngine = engine();
    const successful = await workflowEngine.run({
      id: 'test:tmp-cleanup',
      name: 'tmp-cleanup',
      nodes: [{ id: 'tmp', type: 'test/tmp-dir' }],
      edges: []
    });

    await expect(fsPromises.access(String(successful.output?.tmpDir))).resolves.toBeUndefined();

    const cyclic = await workflowEngine.run({
      id: 'test:cyclic',
      name: 'cyclic',
      nodes: [
        { id: 'a', type: 'test/source' },
        { id: 'b', type: 'test/source' }
      ],
      edges: [
        { id: 'a-b', from: { nodeId: 'a', port: 'value' }, to: { nodeId: 'b', port: 'value' } },
        { id: 'b-a', from: { nodeId: 'b', port: 'value' }, to: { nodeId: 'a', port: 'value' } }
      ]
    });

    expect(cyclic.status).toBe('failed');
    expect(cyclic.completedAt).toBeTypeOf('number');
    expect(workflowEngine.getRunContext(cyclic.runId)).toBeUndefined();
  });

  it('cleans successful temporary directories when retention is disabled', async () => {
    const workflowEngine = createEngine({}, { completedRunTempTtlMs: 0 });
    const rec = await workflowEngine.run({
      id: 'test:no-temp-retention',
      name: 'no-temp-retention',
      nodes: [{ id: 'tmp', type: 'test/tmp-dir' }],
      edges: []
    });

    await expect(fsPromises.access(String(rec.output?.tmpDir))).rejects.toThrow();
  });

  it('evicts old terminal runs and their logs from the in-memory cache', async () => {
    const workflowEngine = createEngine({}, { completedRunTempTtlMs: 0, maxCachedRuns: 2 });
    const records: WorkflowRunRecord[] = [];
    for (const value of ['first', 'second', 'third']) {
      records.push(
        await workflowEngine.run({
          id: `test:cache-${value}`,
          name: `cache-${value}`,
          nodes: [{ id: 'source', type: 'test/source', inputDefaults: { value } }],
          edges: []
        })
      );
    }

    expect(workflowEngine.getRun(records[0].runId)).toBeUndefined();
    expect(workflowEngine.getRunLogs(records[0].runId)).toEqual([]);
    expect(workflowEngine.getRun(records[1].runId)).toBeDefined();
    expect(workflowEngine.getRun(records[2].runId)).toBeDefined();
  });

  it('limits parallel nodes using the workflow concurrency option', async () => {
    let active = 0;
    let maxActive = 0;
    registerNode(
      node('test/concurrency-probe', async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 20));
        active -= 1;
        return {};
      })
    );
    const definition = {
      id: 'test:concurrency',
      name: 'concurrency',
      nodes: [
        { id: 'first', type: 'test/concurrency-probe' },
        { id: 'second', type: 'test/concurrency-probe' },
        { id: 'third', type: 'test/concurrency-probe' }
      ],
      edges: []
    };

    const parallel = await engine().run({ ...definition, options: { concurrency: 2 } });
    expect(parallel.status).toBe('completed');
    expect(maxActive).toBe(2);

    active = 0;
    maxActive = 0;
    const serial = await engine().run({ ...definition, id: 'test:concurrency-serial', options: { concurrency: 1 } });
    expect(serial.status).toBe('completed');
    expect(maxActive).toBe(1);
  });

  it('waits for an upstream execution level before running dependent nodes', async () => {
    const events: string[] = [];
    registerNode(
      node(
        'test/level-source',
        async () => {
          events.push('source:start');
          await new Promise((resolve) => setTimeout(resolve, 20));
          events.push('source:end');
          return { value: 'ready' };
        },
        [],
        [{ key: 'value', type: 'string' }]
      )
    );
    registerNode(
      node(
        'test/level-dependent',
        async ({ input }) => {
          events.push(`dependent:start:${input.value}`);
          return {};
        },
        [{ key: 'value', type: 'string', required: true }]
      )
    );

    const rec = await engine().run({
      id: 'test:execution-levels',
      name: 'execution-levels',
      nodes: [
        { id: 'source', type: 'test/level-source' },
        { id: 'dependent', type: 'test/level-dependent' }
      ],
      edges: [{ id: 'source-dependent', from: { nodeId: 'source', port: 'value' }, to: { nodeId: 'dependent', port: 'value' } }],
      options: { concurrency: 2 }
    });

    expect(rec.status).toBe('completed');
    expect(events).toEqual(['source:start', 'source:end', 'dependent:start:ready']);
  });

  it('stops scheduling new batches after fail-fast while allowing started nodes to finish', async () => {
    const executed: string[] = [];
    registerNode(
      node('test/fail-fast-error', async () => {
        executed.push('failed');
        throw new Error('fail-fast');
      })
    );
    registerNode(
      node('test/fail-fast-sibling', async () => {
        executed.push('sibling:start');
        await new Promise((resolve) => setTimeout(resolve, 20));
        executed.push('sibling:end');
        return {};
      })
    );
    registerNode(
      node('test/fail-fast-late', async () => {
        executed.push('late');
        return {};
      })
    );

    const rec = await engine().run({
      id: 'test:fail-fast-batches',
      name: 'fail-fast-batches',
      nodes: [
        { id: 'failed', type: 'test/fail-fast-error' },
        { id: 'sibling', type: 'test/fail-fast-sibling' },
        { id: 'late', type: 'test/fail-fast-late' }
      ],
      edges: [],
      options: { concurrency: 2, errorStrategy: 'fail-fast' }
    });

    expect(rec.status).toBe('failed');
    expect(executed).toEqual(['failed', 'sibling:start', 'sibling:end']);
    expect(rec.nodes.sibling.status).toBe('completed');
    expect(rec.nodes.late).toEqual(expect.objectContaining({ status: 'skipped', error: 'not scheduled after fail-fast' }));
  });

  it('shares plugin preparation across concurrent nodes', async () => {
    let installChecks = 0;
    let preparations = 0;
    registerPlugin({
      id: 'test/concurrent-plugin',
      label: 'concurrent-plugin',
      async isInstalled() {
        installChecks += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return true;
      },
      async prepare() {
        preparations += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    });
    registerNode({
      ...node('test/plugin-consumer', async () => ({})),
      spec: { id: 'test/plugin-consumer', label: 'plugin-consumer', inputs: [], outputs: [], requires: ['test/concurrent-plugin'] }
    });

    const rec = await engine().run({
      id: 'test:concurrent-plugin-preparation',
      name: 'concurrent-plugin-preparation',
      nodes: [
        { id: 'first', type: 'test/plugin-consumer' },
        { id: 'second', type: 'test/plugin-consumer' }
      ],
      edges: [],
      options: { concurrency: 2 }
    });

    expect(rec.status).toBe('completed');
    expect(installChecks).toBe(1);
    expect(preparations).toBe(1);
  });
});

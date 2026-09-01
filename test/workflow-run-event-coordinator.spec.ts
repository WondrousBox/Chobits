import { describe, expect, it, vi } from 'vitest';

import type { WorkflowEngine } from '../packages/workflow/engine';
import type { WorkflowRunEventCoordinatorPorts } from '../packages/workflow/run-event-coordinator';
import { attachWorkflowRunEventCoordinator } from '../packages/workflow/run-event-coordinator';
import type { RunPersistenceQueue } from '../packages/workflow/run-persistence-queue';
import type { WorkflowRunRecord } from '../packages/workflow/types';
import { EngineEmitter } from '../packages/workflow/types';

function runningRecord(): WorkflowRunRecord {
  return {
    runId: 'run-1',
    workflowId: 'workflow-1',
    workspaceId: 'workspace-1',
    createdAt: 1,
    status: 'running',
    metadata: { resourceId: 'resource-1' },
    nodes: {
      first: { nodeId: 'first', status: 'running', progress: 20 },
      second: { nodeId: 'second', status: 'running', progress: 80, progressMessage: 'second halfway' }
    }
  };
}

function persistence(): RunPersistenceQueue {
  return Object.assign(vi.fn().mockResolvedValue(undefined), {
    schedule: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined)
  }) as unknown as RunPersistenceQueue;
}

describe('workflow run event coordinator', () => {
  it('coordinates persistence, aggregate progress, lifecycle events, and display definition loading', async () => {
    const emitter = new EngineEmitter();
    let current = runningRecord();
    const engine = Object.assign(emitter, { getRun: vi.fn(() => current) }) as unknown as WorkflowEngine;
    const persist = persistence();
    const broadcast = {
      runStatus: vi.fn<WorkflowRunEventCoordinatorPorts['broadcast']['runStatus']>(),
      nodeStatus: vi.fn<WorkflowRunEventCoordinatorPorts['broadcast']['nodeStatus']>(),
      runLog: vi.fn<WorkflowRunEventCoordinatorPorts['broadcast']['runLog']>()
    };
    const emitLifecycle = vi.fn<WorkflowRunEventCoordinatorPorts['emitLifecycle']>();
    const busy = {
      start: vi.fn(),
      progress: vi.fn(),
      end: vi.fn()
    };
    const loadDefinition = vi.fn().mockResolvedValue({
      id: 'workflow-1',
      name: 'Friendly Workflow',
      nodes: [
        { id: 'first', type: 'test/first', name: 'First Node' },
        { id: 'second', type: 'test/second', name: 'Second Node' }
      ],
      edges: []
    });
    const dispose = attachWorkflowRunEventCoordinator({ engine, persistence: persist, loadDefinition, broadcast, emitLifecycle, busy });

    emitter.emitTyped('run:status', current);
    await Promise.resolve();
    await Promise.resolve();

    expect(persist).toHaveBeenCalledTimes(1);
    expect(current.progress).toBe(50);
    expect(busy.start).toHaveBeenCalledWith(50, '执行工作流: workflow-1');
    expect(loadDefinition).toHaveBeenCalledOnce();
    expect(emitLifecycle).toHaveBeenCalledWith('start', expect.objectContaining({ runId: 'run-1', resourceId: 'resource-1' }));

    emitter.emitTyped('node:status', current, current.nodes.second);
    expect(persist.schedule).toHaveBeenCalledWith(current);
    expect(current.progress).toBe(50);
    expect(current.progressMessage).toBe('second halfway');
    expect(busy.progress).toHaveBeenCalledWith(50, '执行工作流: Friendly Workflow - second halfway');
    expect(emitLifecycle).toHaveBeenCalledWith('progress', expect.objectContaining({ workflowName: 'Friendly Workflow', progress: 50 }));

    current = {
      ...current,
      status: 'completed',
      nodes: {
        first: { ...current.nodes.first, status: 'completed' },
        second: { ...current.nodes.second, status: 'completed' }
      }
    };
    emitter.emitTyped('run:status', current);

    expect(persist).toHaveBeenCalledTimes(2);
    expect(emitLifecycle).toHaveBeenCalledWith('complete', expect.objectContaining({ workflowName: 'Friendly Workflow' }));
    expect(busy.end).toHaveBeenCalledOnce();
    expect(broadcast.runStatus).toHaveBeenCalledWith(expect.objectContaining({ runId: 'run-1' }));

    dispose();
    expect(emitter.listenerCount('run:status')).toBe(0);
    expect(emitter.listenerCount('node:status')).toBe(0);
    expect(emitter.listenerCount('run:log')).toBe(0);
  });

  it('persists node state transitions immediately', () => {
    const emitter = new EngineEmitter();
    const current = runningRecord();
    current.nodes.first = { nodeId: 'first', status: 'completed' };
    const engine = Object.assign(emitter, { getRun: vi.fn(() => current) }) as unknown as WorkflowEngine;
    const persist = persistence();
    attachWorkflowRunEventCoordinator({
      engine,
      persistence: persist,
      loadDefinition: vi.fn().mockResolvedValue(undefined),
      broadcast: { runStatus: vi.fn(), nodeStatus: vi.fn(), runLog: vi.fn() },
      emitLifecycle: vi.fn(),
      busy: { start: vi.fn(), progress: vi.fn(), end: vi.fn() }
    });

    emitter.emitTyped('node:status', current, current.nodes.first);

    expect(persist).toHaveBeenCalledWith(current);
    expect(persist.schedule).not.toHaveBeenCalled();
  });
});

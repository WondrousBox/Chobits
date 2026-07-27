import { describe, expect, it } from 'vitest';

import { classifyWorkflowRunEvent } from '../src/pages/WorkflowBuilderPage/workflow-run-events';

describe('workflow builder run event isolation', () => {
  it('tracks the first matching run and updates only that run', () => {
    const running = { runId: 'run-1', workflowId: 'workflow-1', workspaceId: 'workspace-1', status: 'running' as const };

    expect(classifyWorkflowRunEvent(running, 'workflow-1', 'workspace-1', null)).toBe('start');
    expect(classifyWorkflowRunEvent(running, 'workflow-1', 'workspace-1', 'run-1')).toBe('update');
    expect(classifyWorkflowRunEvent({ ...running, runId: 'run-2' }, 'workflow-1', 'workspace-1', 'run-1')).toBe('ignore');
  });

  it('ignores another workspace and stale terminal events', () => {
    expect(classifyWorkflowRunEvent({ runId: 'run-1', workflowId: 'workflow-1', workspaceId: 'workspace-2', status: 'running' }, 'workflow-1', 'workspace-1', null)).toBe('ignore');
    expect(classifyWorkflowRunEvent({ runId: 'run-old', workflowId: 'workflow-1', workspaceId: 'workspace-1', status: 'completed' }, 'workflow-1', 'workspace-1', 'run-new')).toBe('ignore');
    expect(classifyWorkflowRunEvent({ runId: 'run-new', workflowId: 'workflow-1', metadata: { workspaceId: 'workspace-1' }, status: 'failed' }, 'workflow-1', 'workspace-1', 'run-new')).toBe('finish');
  });
});

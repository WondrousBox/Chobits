import { createWorkflowClient, WORKFLOW_IPC_CHANNELS, WORKFLOW_IPC_EVENT_CHANNELS } from '@workflow/integrations/client';
import { describe, expect, it, vi } from 'vitest';

describe('workflow renderer client contract', () => {
  it('routes requests through the shared channel map', async () => {
    const invoke = vi.fn().mockResolvedValue([{ id: 'workflow-1', name: 'Workflow One', nodes: [], edges: [] }]);
    const client = createWorkflowClient({ invoke, subscribe: vi.fn() });

    await expect(client.listDefinitions({ workspaceId: 'workspace-1' })).resolves.toHaveLength(1);
    expect(invoke).toHaveBeenCalledWith(WORKFLOW_IPC_CHANNELS.listDefinitions, { workspaceId: 'workspace-1' });
  });

  it('delivers typed event payloads and disposes the transport subscription', () => {
    let deliver: ((payload: unknown) => void) | undefined;
    const dispose = vi.fn();
    const subscribe = vi.fn((_channel: string, listener: (payload: unknown) => void) => {
      deliver = listener;
      return dispose;
    });
    const client = createWorkflowClient({ invoke: vi.fn(), subscribe });
    const listener = vi.fn();

    const unsubscribe = client.onRunStatus(listener);
    deliver?.({ runId: 'run-1', workflowId: 'workflow-1', workspaceId: 'workspace-1', createdAt: 1, status: 'running', nodes: {} });

    expect(subscribe).toHaveBeenCalledWith(WORKFLOW_IPC_EVENT_CHANNELS.runStatus, expect.any(Function));
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ runId: 'run-1', status: 'running' }));
    unsubscribe();
    expect(dispose).toHaveBeenCalledOnce();
  });
});

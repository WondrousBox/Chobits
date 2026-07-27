import { describe, expect, it, vi } from 'vitest';

import type { WorkflowApplicationService } from '../packages/workflow/application-service';
import type { WorkflowIpcRegistrar } from '../packages/workflow/ipc-adapter';
import { registerWorkflowIpcHandlers } from '../packages/workflow/ipc-adapter';

type IpcHandler = (event: unknown, payload?: any) => unknown;

type IpcTestContext = {
  application: WorkflowApplicationService;
  handlers: Map<string, IpcHandler>;
  invoke(channel: string, payload?: any): Promise<any>;
};

function setup(): IpcTestContext {
  const handlers = new Map<string, IpcHandler>();
  const ipc: WorkflowIpcRegistrar = {
    handle: vi.fn((channel: string, listener: IpcHandler) => {
      handlers.set(channel, listener);
    })
  };
  const application = {
    listDefinitions: vi.fn().mockResolvedValue([]),
    listPresetDefinitions: vi.fn().mockResolvedValue([]),
    isPresetDefinition: vi.fn().mockResolvedValue(false),
    getDefinition: vi.fn().mockResolvedValue(undefined),
    saveDefinition: vi.fn().mockResolvedValue({ ok: true }),
    deleteDefinition: vi.fn().mockResolvedValue(undefined),
    validateDefinition: vi.fn().mockResolvedValue({ ok: true, errors: [], issues: [] }),
    executeById: vi.fn().mockResolvedValue({ ok: true, runId: 'run-1', status: 'completed' }),
    getRun: vi.fn().mockResolvedValue(undefined),
    listRuns: vi.fn().mockResolvedValue([]),
    deleteRun: vi.fn().mockResolvedValue(undefined),
    cancelRun: vi.fn().mockResolvedValue(true),
    getRunLogs: vi.fn().mockResolvedValue([])
  } as unknown as WorkflowApplicationService;
  registerWorkflowIpcHandlers(ipc, application);

  return {
    application,
    handlers,
    invoke(channel: string, payload?: any): Promise<any> {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`Missing IPC handler: ${channel}`);
      return Promise.resolve(handler(undefined, payload));
    }
  };
}

describe('workflow IPC adapter', () => {
  it('rejects malformed run requests before reaching the application service', async () => {
    const context = setup();

    await expect(context.invoke('wf:run', { defId: '' })).resolves.toMatchObject({ ok: false, error: 'invalid-run-request' });
    expect(context.application.executeById).not.toHaveBeenCalled();
  });

  it('forwards valid run requests and preserves the IPC result contract', async () => {
    const context = setup();

    await expect(context.invoke('wf:run', { defId: 'workflow-1', input: { text: 'hello' }, metadata: { workspaceId: 'workspace-1' } })).resolves.toEqual({
      ok: true,
      runId: 'run-1',
      status: 'completed'
    });
    expect(context.application.executeById).toHaveBeenCalledWith('workflow-1', { text: 'hello' }, { workspaceId: 'workspace-1' });

    vi.mocked(context.application.executeById).mockResolvedValueOnce({ ok: false, runId: 'run-2', status: 'failed', error: 'node failed' });
    await expect(context.invoke('wf:run', { defId: 'workflow-1' })).resolves.toMatchObject({ ok: false, runId: 'run-2', status: 'failed', error: 'node failed' });
  });

  it('keeps save request parsing at the IPC boundary', async () => {
    const context = setup();

    await expect(context.invoke('wf:saveDefinition', {})).resolves.toMatchObject({ ok: false, error: 'Workflow save request is invalid' });
    expect(context.application.saveDefinition).not.toHaveBeenCalled();

    const workflow = { id: 'workflow-1', name: 'Workflow One', nodes: [{ id: 'node-1', type: 'test/node' }], edges: [] };
    await expect(context.invoke('wf:saveDefinition', { def: workflow, workspaceId: 'workspace-1' })).resolves.toEqual({ ok: true });
    expect(context.application.saveDefinition).toHaveBeenCalledWith(workflow, 'workspace-1');
  });
});

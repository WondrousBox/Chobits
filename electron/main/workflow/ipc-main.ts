import { sanitizeWorkflowRunLogEntry, sanitizeWorkflowRunRecord, type WorkflowDefinition } from '@chobits/workflow';
import type { WorkflowRuntimeFacade } from '@chobits/workflow/application';
import { workflowRunRequestSchema, workflowSaveRequestSchema, zodIssuesToWorkflowIssues } from '@chobits/workflow/schema';
import { WORKFLOW_IPC_CHANNELS, type WorkflowIpcRegistrar, type WorkflowNodeFieldResult, type WorkflowSaveIpcResult } from '@workflow/integrations/client';

export interface WorkflowIpcMainPorts {
  scanTaskResults(filePath: string): Promise<unknown>;
}

export function registerWorkflowIpcHandlers(ipc: WorkflowIpcRegistrar, runtime: WorkflowRuntimeFacade, ports: WorkflowIpcMainPorts): void {
  ipc.handle(WORKFLOW_IPC_CHANNELS.listNodes, () => runtime.listNodes());
  ipc.handle(WORKFLOW_IPC_CHANNELS.getNodeConfig, async (_event, payload) => nodeFieldResult('config', await runtime.getNodeConfig(payload.nodeId, payload.config)));
  ipc.handle(WORKFLOW_IPC_CHANNELS.getNodeInputs, async (_event, payload) => nodeFieldResult('inputs', await runtime.getNodeInputs(payload.nodeId, payload.config)));
  ipc.handle(WORKFLOW_IPC_CHANNELS.getNodeOutputs, async (_event, payload) => nodeFieldResult('outputs', await runtime.getNodeOutputs(payload.nodeId, payload.config)));
  ipc.handle(WORKFLOW_IPC_CHANNELS.listPlugins, () => runtime.listPlugins());
  ipc.handle(WORKFLOW_IPC_CHANNELS.listDefinitions, (_event, payload) => runtime.listDefinitions(payload?.workspaceId));
  ipc.handle(WORKFLOW_IPC_CHANNELS.listPresets, () => runtime.listPresetDefinitions());
  ipc.handle(WORKFLOW_IPC_CHANNELS.isPreset, (_event, payload) => runtime.isPresetDefinition(payload.id));
  ipc.handle(WORKFLOW_IPC_CHANNELS.getDefinition, (_event, payload) => runtime.getDefinition(payload.id, payload.workspaceId));
  ipc.handle(WORKFLOW_IPC_CHANNELS.saveDefinition, async (_event, payload): Promise<WorkflowSaveIpcResult> => {
    try {
      const request = workflowSaveRequestSchema.safeParse(payload);
      if (!request.success) {
        const issues = zodIssuesToWorkflowIssues(request.error.issues);
        return { ok: false, error: 'Workflow save request is invalid', validation: { ok: false, issues, errors: issues.map((issue) => issue.message) } };
      }
      const result = await runtime.saveDefinition(request.data.def as WorkflowDefinition, request.data.workspaceId);
      return result.ok ? { ok: true } : result;
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipc.handle(WORKFLOW_IPC_CHANNELS.deleteDefinition, async (_event, payload) => {
    try {
      await runtime.deleteDefinition(payload.id, payload.workspaceId);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipc.handle(WORKFLOW_IPC_CHANNELS.validate, (_event, payload) => runtime.validateDefinition(payload.def));
  ipc.handle(WORKFLOW_IPC_CHANNELS.run, async (_event, payload) => {
    const request = workflowRunRequestSchema.safeParse(payload);
    if (!request.success) {
      const issues = zodIssuesToWorkflowIssues(request.error.issues, 'invalid-run-request');
      return {
        ok: false,
        error: 'invalid-run-request',
        validation: { ok: false, issues, errors: issues.map((issue) => issue.message) }
      };
    }

    const result = await runtime.executeById(request.data.defId, request.data.input || {}, request.data.metadata);
    if (!result.ok) {
      return {
        ok: false,
        runId: result.runId,
        status: result.status,
        error: result.error,
        validation: result.validation,
        missingConfigs: result.missingConfigs
      };
    }
    if (!result.runId) return { ok: false, error: 'workflow-run-id-missing' };
    return { ok: true, runId: result.runId, status: result.status };
  });
  ipc.handle(WORKFLOW_IPC_CHANNELS.getRun, async (_event, payload) => {
    const run = await runtime.getRun(payload.runId, payload.workspaceId);
    return run ? sanitizeWorkflowRunRecord(run) : undefined;
  });
  ipc.handle(WORKFLOW_IPC_CHANNELS.listRuns, async (_event, payload) =>
    (await runtime.listRuns(payload?.workspaceId, payload?.defId, payload?.limit, payload?.resourceId)).map(sanitizeWorkflowRunRecord)
  );
  ipc.handle(WORKFLOW_IPC_CHANNELS.deleteRun, async (_event, payload) => {
    await runtime.deleteRun(payload.runId, payload.workspaceId);
    return { ok: true };
  });
  ipc.handle(WORKFLOW_IPC_CHANNELS.cancelRun, async (_event, payload) =>
    (await runtime.cancelRun(payload.runId, payload.workspaceId)) ? { ok: true } : { ok: false, error: 'Workflow run not found' }
  );
  ipc.handle(WORKFLOW_IPC_CHANNELS.getRunLogs, async (_event, payload) => (await runtime.getRunLogs(payload.runId, payload.workspaceId)).map(sanitizeWorkflowRunLogEntry));
  ipc.handle(WORKFLOW_IPC_CHANNELS.getTaskResults, async (_event, payload) => {
    try {
      if (!payload.filePath) return { ok: false, error: '缺少文件路径' };
      return { ok: true, data: await ports.scanTaskResults(payload.filePath) };
    } catch (error) {
      console.warn('[wf:getTaskResults] 获取任务结果失败', error);
      return { ok: false, error: error instanceof Error ? error.message : 'unknown-error' };
    }
  });
}

function nodeFieldResult<K extends 'config' | 'inputs' | 'outputs'>(key: K, value: Awaited<ReturnType<WorkflowRuntimeFacade[`getNode${Capitalize<K>}`]>>): WorkflowNodeFieldResult<K> {
  return value === null ? { ok: false, error: 'Node not found' } : ({ ok: true, [key]: value } as WorkflowNodeFieldResult<K>);
}

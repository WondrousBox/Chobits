import type { WorkflowApplicationService } from './application-service';
import { getNode, listNodes, listPlugins } from './core/registry';
import { sanitizeWorkflowRunLogEntry, sanitizeWorkflowRunRecord } from './sanitize';
import { workflowRunRequestSchema, workflowSaveRequestSchema, zodIssuesToWorkflowIssues } from './schema';
import type { NodeConfig, WorkflowDefinition } from './types';

export interface WorkflowIpcRegistrar {
  handle(channel: string, listener: (event: unknown, payload?: any) => unknown): unknown;
}

export function registerWorkflowIpcHandlers(ipc: WorkflowIpcRegistrar, application: WorkflowApplicationService): void {
  ipc.handle('wf:listNodes', () =>
    listNodes().map((node) => {
      const spec = { ...node.spec };
      if (node.getConfig) spec.hasDynamicConfig = true;
      if (node.getInputs) spec.hasDynamicInputs = true;
      if (node.getOutputs) spec.hasDynamicOutputs = true;
      return spec;
    })
  );
  ipc.handle('wf:getNodeConfig', async (_event, payload: { nodeId: string; config?: NodeConfig }) => {
    const handler = getNode(payload.nodeId);
    if (!handler) return { ok: false, error: 'Node not found' };
    const config = handler.getConfig ? await Promise.resolve(handler.getConfig(payload.config)) : handler.spec.config;
    return { ok: true, config };
  });
  ipc.handle('wf:getNodeInputs', (_event, payload: { nodeId: string; config?: NodeConfig }) => {
    const handler = getNode(payload.nodeId);
    if (!handler) return { ok: false, error: 'Node not found' };
    const inputs = handler.getInputs ? handler.getInputs(payload.config) : handler.spec.inputs;
    return { ok: true, inputs };
  });
  ipc.handle('wf:getNodeOutputs', (_event, payload: { nodeId: string; config?: NodeConfig }) => {
    const handler = getNode(payload.nodeId);
    if (!handler) return { ok: false, error: 'Node not found' };
    const outputs = handler.getOutputs ? handler.getOutputs(payload.config) : handler.spec.outputs;
    return { ok: true, outputs };
  });
  ipc.handle('wf:listPlugins', () => listPlugins().map((plugin) => ({ id: plugin.id, label: plugin.label, installed: false })));
  ipc.handle('wf:listDefinitions', (_event, payload?: { workspaceId?: string }) => application.listDefinitions(payload?.workspaceId));
  ipc.handle('wf:listPresets', () => application.listPresetDefinitions());
  ipc.handle('wf:isPreset', (_event, payload: { id: string }) => application.isPresetDefinition(payload.id));
  ipc.handle('wf:getDefinition', (_event, payload: { id: string; workspaceId?: string }) => application.getDefinition(payload.id, payload.workspaceId));
  ipc.handle('wf:saveDefinition', async (_event, payload: { def: WorkflowDefinition; workspaceId?: string }) => {
    try {
      const request = workflowSaveRequestSchema.safeParse(payload);
      if (!request.success) {
        const issues = zodIssuesToWorkflowIssues(request.error.issues);
        return { ok: false, error: 'Workflow save request is invalid', validation: { ok: false, issues, errors: issues.map((issue) => issue.message) } };
      }
      const result = await application.saveDefinition(request.data.def as WorkflowDefinition, request.data.workspaceId);
      return result.ok ? { ok: true } : result;
    } catch (error: any) {
      return { ok: false, error: error?.message || String(error) };
    }
  });
  ipc.handle('wf:deleteDefinition', async (_event, payload: { id: string; workspaceId?: string }) => {
    try {
      await application.deleteDefinition(payload.id, payload.workspaceId);
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error?.message || String(error) };
    }
  });
  ipc.handle('wf:validate', (_event, payload: { def: WorkflowDefinition }) => application.validateDefinition(payload?.def as WorkflowDefinition));
  ipc.handle('wf:run', async (_event, payload: { defId: string; input?: Record<string, any>; metadata?: Record<string, any> }) => {
    const request = workflowRunRequestSchema.safeParse(payload);
    if (!request.success) {
      const issues = zodIssuesToWorkflowIssues(request.error.issues, 'invalid-run-request');
      return {
        ok: false,
        error: 'invalid-run-request',
        validation: { ok: false, issues, errors: issues.map((issue) => issue.message) }
      };
    }

    const result = await application.executeById(request.data.defId, request.data.input || {}, request.data.metadata);
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
    return { ok: true, runId: result.runId, status: result.status };
  });
  ipc.handle('wf:getRun', async (_event, payload: { runId: string; workspaceId?: string }) => {
    const run = await application.getRun(payload.runId, payload.workspaceId);
    return run ? sanitizeWorkflowRunRecord(run) : undefined;
  });
  ipc.handle('wf:listRuns', async (_event, payload?: { defId?: string; limit?: number; resourceId?: string; workspaceId?: string }) => {
    const runs = await application.listRuns(payload?.workspaceId, payload?.defId, payload?.limit, payload?.resourceId);
    return runs.map(sanitizeWorkflowRunRecord);
  });
  ipc.handle('wf:deleteRun', async (_event, payload: { runId: string; workspaceId?: string }) => {
    await application.deleteRun(payload.runId, payload.workspaceId);
    return { ok: true };
  });
  ipc.handle('wf:cancelRun', async (_event, payload: { runId: string; workspaceId?: string }) => {
    return (await application.cancelRun(payload.runId, payload.workspaceId)) ? { ok: true } : { ok: false, error: 'Workflow run not found' };
  });
  ipc.handle('wf:getRunLogs', async (_event, payload: { runId: string; workspaceId?: string }) => {
    return (await application.getRunLogs(payload.runId, payload.workspaceId)).map(sanitizeWorkflowRunLogEntry);
  });
  ipc.handle('wf:getTaskResults', async (_event, payload: { filePath: string }) => {
    try {
      if (!payload.filePath) return { ok: false, error: '缺少文件路径' };
      const { scanTaskResults } = await import('./task-results');
      return { ok: true, data: await scanTaskResults(payload.filePath) };
    } catch (error: any) {
      console.warn('[wf:getTaskResults] 获取任务结果失败', error);
      return { ok: false, error: error?.message || 'unknown-error' };
    }
  });
}

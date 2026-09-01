import type { WorkflowEngine } from '@chobits/workflow';

import { type WorkflowIntegrationResourceWritePorts, createWorkflowIntegrationResourceWriteCapability } from './resource-write';

export interface WorkflowResourceEventAdapterPorts extends WorkflowIntegrationResourceWritePorts {
  engine: WorkflowEngine;
}

export function attachWorkflowResourceEventAdapter(ports: WorkflowResourceEventAdapterPorts): () => void {
  const { engine } = ports;
  const writer = createWorkflowIntegrationResourceWriteCapability({
    ...ports,
    updateRunContext: (runId, context) => engine.updateRunContext(runId, context)
  });

  const handleContextUpdate = (payload: any): void => {
    const runId = String(payload?.__runId || '');
    const workspaceId = payload?.workspaceId ? String(payload.workspaceId) : undefined;
    const folderId = payload?.folderId ? String(payload.folderId) : undefined;
    if (!runId || !workspaceId || !folderId) return;
    writer.updateContext(runId, { workspaceId, folderId });
    console.log('[workflow][wf:update-context] Updated workflow context', { runId, workspaceId, folderId });
  };

  const handleResourceCreate = async (payload: any): Promise<void> => {
    try {
      payload?.callback?.(await writer.create(payload?.resourceData || {}));
    } catch (error) {
      console.warn('[workflow][resource:create-request] failed:', error);
      payload?.callback?.(null);
    }
  };

  const handleResourceUpdate = async (payload: any): Promise<void> => {
    try {
      payload?.callback?.(await writer.update(String(payload?.resourceId || '').trim(), { ...(payload?.patch || {}) }));
    } catch (error) {
      console.warn('[workflow][resource:update-request] failed:', error);
      payload?.callback?.(null);
    }
  };

  const handleResourceDownload = async (payload: any): Promise<void> => {
    try {
      const runId = payload?.__runId ? String(payload.__runId) : undefined;
      const result = await writer.download({
        url: String(payload?.url || ''),
        workspaceId: payload?.workspaceId ? String(payload.workspaceId) : undefined,
        folderId: payload?.folderId ? String(payload.folderId) : undefined,
        runId,
        signal: runId ? engine.getRunContext(runId)?.signal : undefined
      });
      payload?.callback?.(result.filePath);
    } catch (error) {
      console.warn('[workflow][resource:download-request] failed:', error);
      payload?.callback?.(null, error instanceof Error ? error.message : String(error));
    }
  };

  engine.on('wf:update-context', handleContextUpdate);
  engine.on('resource:create-request', handleResourceCreate);
  engine.on('resource:update-request', handleResourceUpdate);
  engine.on('resource:download-request', handleResourceDownload);

  return () => {
    engine.off('wf:update-context', handleContextUpdate);
    engine.off('resource:create-request', handleResourceCreate);
    engine.off('resource:update-request', handleResourceUpdate);
    engine.off('resource:download-request', handleResourceDownload);
  };
}

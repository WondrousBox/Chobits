import type { WorkflowLegacyRunRequest, WorkflowRunRequest, WorkflowRunTrigger } from '../contracts/request.js';

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function legacyTrigger(metadata: Record<string, unknown>): WorkflowRunTrigger | undefined {
  const trigger = recordValue(metadata.trigger);
  const triggerType = stringValue(trigger?.type);
  if (triggerType) return { type: triggerType, ...(stringValue(trigger?.id) ? { id: stringValue(trigger?.id) } : {}) };

  const source = stringValue(metadata.source);
  if (!source) return undefined;
  if (source === 'scheduler' || source === 'schedule') return { type: 'schedule' };
  if (source === 'agent' || source === 'ai-tool' || source === 'workflow-run-tool') return { type: 'agent' };
  if (source === 'event' || source.endsWith('-event')) return { type: 'event' };
  return { type: 'manual', id: source };
}

export function normalizeWorkflowRunRequest(request: WorkflowRunRequest | WorkflowLegacyRunRequest): WorkflowRunRequest {
  if ('definitionId' in request || 'definition' in request) return request as WorkflowRunRequest;

  const legacy = request as WorkflowLegacyRunRequest;
  const input = legacy.input || {};
  const metadata = legacy.metadata || {};
  const resource = recordValue(input.resource);
  const workspaceId = stringValue(metadata.workspaceId) || stringValue(input.workspaceId) || stringValue(resource?.workspaceId);
  const resourceId = stringValue(metadata.resourceId) || stringValue(input.resourceId) || stringValue(resource?.id) || stringValue(resource?.resourceId);
  const folderId = stringValue(metadata.folderId) || stringValue(input.folderId) || stringValue(resource?.folderId);
  const trigger = legacyTrigger(metadata);
  const context = {
    ...metadata,
    ...(resourceId ? { resourceId } : {}),
    ...(folderId ? { folderId } : {})
  };

  return {
    ...(legacy.defId ? { definitionId: legacy.defId } : {}),
    ...(legacy.def ? { definition: legacy.def } : {}),
    input,
    ...(workspaceId ? { scope: { kind: 'workspace', id: workspaceId } } : {}),
    ...(trigger ? { trigger } : {}),
    ...(Object.keys(context).length > 0 ? { context } : {})
  };
}

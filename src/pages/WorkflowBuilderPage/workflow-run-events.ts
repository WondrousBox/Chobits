import type { ExecutionStatus } from '@chobits/workflow';

import { matchesWorkflowWorkspace } from '@/utils/broadcastChannels';

export type WorkflowRunStatusEvent = {
  runId: string;
  workflowId: string;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
  status: ExecutionStatus;
};

export type WorkflowRunEventAction = 'ignore' | 'start' | 'update' | 'finish';

export function classifyWorkflowRunEvent(record: WorkflowRunStatusEvent, workflowId: string | undefined, workspaceId: string | undefined, currentRunId: string | null): WorkflowRunEventAction {
  const eventWorkspaceId = record.workspaceId ?? (typeof record.metadata?.workspaceId === 'string' ? record.metadata.workspaceId : undefined);
  if (record.workflowId !== workflowId || !matchesWorkflowWorkspace(workspaceId, eventWorkspaceId)) return 'ignore';

  if (record.status === 'queued' || record.status === 'running') {
    if (!currentRunId) return 'start';
    return currentRunId === record.runId ? 'update' : 'ignore';
  }

  return currentRunId === record.runId ? 'finish' : 'ignore';
}

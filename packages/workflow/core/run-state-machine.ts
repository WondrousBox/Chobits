import type { ExecutionStatus, NodeRunState, NodeRunStatus, WorkflowDefinition, WorkflowNodeAttempt, WorkflowNodeAttemptStatus, WorkflowRunRecord } from '../types.js';

type NodeStatePatch = Omit<Partial<NodeRunState>, 'attempt' | 'attempts' | 'nodeId' | 'status'>;

export const MAX_WORKFLOW_NODE_ATTEMPTS = 50;

export interface CreateWorkflowRunRecordOptions {
  definition: WorkflowDefinition;
  runId: string;
  input: Record<string, any>;
  metadata?: Record<string, any>;
  createdAt: number;
  startedAt: number;
}

export interface TerminalOutputResult {
  output: Record<string, any>;
  collisionError?: string;
}

export function createWorkflowRunRecord({ definition, runId, input, metadata, createdAt, startedAt }: CreateWorkflowRunRecordOptions): WorkflowRunRecord {
  return {
    runId,
    workflowId: definition.id,
    workspaceId: metadata?.workspaceId ?? input.workspaceId ?? input.resource?.workspaceId ?? definition.workspaceId,
    createdAt,
    status: 'queued',
    nodes: Object.fromEntries(definition.nodes.map((node) => [node.id, { nodeId: node.id, status: 'pending' as const, attempt: 0, attempts: [] }])),
    metadata,
    input,
    startedAt
  };
}

export function setWorkflowRunStatus(record: WorkflowRunRecord, status: ExecutionStatus, error?: string): WorkflowRunRecord {
  record.status = status;
  if (error !== undefined) record.error = error;
  return record;
}

export function transitionWorkflowNode(record: WorkflowRunRecord, nodeId: string, status: NodeRunStatus, patch: NodeStatePatch = {}): NodeRunState {
  const current = record.nodes[nodeId];
  if (!current) throw new Error(`Workflow node state not found: ${nodeId}`);
  const attempts = (current.attempts || []).map((attempt) => ({ ...attempt }));
  let attemptNumber = current.attempt ?? attempts.length;

  if (status === 'running') {
    attemptNumber += 1;
    attempts.push({
      attempt: attemptNumber,
      status: 'running',
      startedAt: patch.startedAt ?? Date.now()
    });
    if (attempts.length > MAX_WORKFLOW_NODE_ATTEMPTS) attempts.splice(0, attempts.length - MAX_WORKFLOW_NODE_ATTEMPTS);
  } else {
    let activeAttempt = attempts.at(-1);
    if (status === 'failed' && activeAttempt?.status !== 'running') {
      attemptNumber += 1;
      activeAttempt = {
        attempt: attemptNumber,
        status: 'running',
        startedAt: patch.startedAt ?? patch.finishedAt ?? Date.now()
      };
      attempts.push(activeAttempt);
    }

    if (activeAttempt?.status === 'running' && (status === 'completed' || status === 'failed' || status === 'skipped')) {
      const finishedAt = patch.finishedAt ?? Date.now();
      const attemptStatus: WorkflowNodeAttemptStatus = status === 'skipped' ? 'canceled' : status;
      const finishedAttempt: WorkflowNodeAttempt = {
        ...activeAttempt,
        status: attemptStatus,
        finishedAt,
        duration: Math.max(0, finishedAt - activeAttempt.startedAt),
        ...(patch.error !== undefined ? { error: patch.error } : {}),
        ...(patch.errorReason !== undefined ? { errorReason: patch.errorReason } : {})
      };
      attempts[attempts.length - 1] = finishedAttempt;
    }
  }

  const next = { ...current, ...patch, nodeId, status, attempt: attemptNumber, attempts };
  if (status === 'running') {
    delete next.error;
    delete next.errorReason;
    delete next.finishedAt;
    delete next.output;
    delete next.progress;
    delete next.progressDetail;
    delete next.progressMessage;
  }
  record.nodes[nodeId] = next;
  return next;
}

export function updateWorkflowNode(record: WorkflowRunRecord, nodeId: string, patch: NodeStatePatch): NodeRunState {
  const current = record.nodes[nodeId];
  if (!current) throw new Error(`Workflow node state not found: ${nodeId}`);
  const next = { ...current, ...patch, nodeId };
  record.nodes[nodeId] = next;
  return next;
}

export function skipWorkflowNodes(record: WorkflowRunRecord, statuses: NodeRunStatus[], reason: string, finishedAt: number, errorReason = 'not-scheduled'): NodeRunState[] {
  const changed: NodeRunState[] = [];
  for (const state of Object.values(record.nodes)) {
    if (!statuses.includes(state.status)) continue;
    changed.push(transitionWorkflowNode(record, state.nodeId, 'skipped', { finishedAt, error: reason, errorReason }));
  }
  return changed;
}

export function cancelWorkflowRun(record: WorkflowRunRecord, completedAt: number): NodeRunState[] {
  if (record.status !== 'queued' && record.status !== 'running') return [];
  setWorkflowRunStatus(record, 'canceled');
  const changed = skipWorkflowNodes(record, ['pending', 'running'], 'canceled', completedAt, 'canceled');
  finishWorkflowRun(record, completedAt);
  return changed;
}

export function finalizeWorkflowRunStatus(record: WorkflowRunRecord, canceled: boolean, finishedAt: number): NodeRunState[] {
  if (canceled || record.status === 'canceled') {
    setWorkflowRunStatus(record, 'canceled');
    return skipWorkflowNodes(record, ['pending', 'running'], 'canceled', finishedAt, 'canceled');
  }
  setWorkflowRunStatus(record, Object.values(record.nodes).some((state) => state.status === 'failed') ? 'failed' : 'completed');
  return [];
}

export function collectTerminalWorkflowOutput(terminalNodeIds: string[], nodeOutput: ReadonlyMap<string, Record<string, any>>): TerminalOutputResult {
  const output: Record<string, any> = {};
  const outputOwners = new Map<string, string>();
  const collisions: string[] = [];
  for (const nodeId of terminalNodeIds) {
    for (const [key, value] of Object.entries(nodeOutput.get(nodeId) || {})) {
      const previousOwner = outputOwners.get(key);
      if (previousOwner) {
        collisions.push(`${key} (${previousOwner}, ${nodeId})`);
        continue;
      }
      outputOwners.set(key, nodeId);
      output[key] = value;
    }
  }
  return {
    output,
    ...(collisions.length > 0 ? { collisionError: `Terminal output key collision: ${collisions.join(', ')}` } : {})
  };
}

export function applyTerminalWorkflowOutput(record: WorkflowRunRecord, result: TerminalOutputResult): void {
  record.output = result.output;
  if (!result.collisionError || record.status === 'canceled') return;
  setWorkflowRunStatus(record, 'failed', record.error ? `${record.error}; ${result.collisionError}` : result.collisionError);
}

export function finishWorkflowRun(record: WorkflowRunRecord, completedAt: number): void {
  record.completedAt = completedAt;
  if (record.startedAt !== undefined) record.duration = completedAt - record.startedAt;
}

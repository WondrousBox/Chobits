import type { WorkflowEngine } from './engine';
import { calculateWorkflowProgress } from './progress';
import type { RunPersistenceQueue } from './run-persistence-queue';
import { sanitizeWorkflowNodeState, sanitizeWorkflowRunLogEntry, sanitizeWorkflowRunRecord } from './sanitize';
import type { NodeRunState, WorkflowDefinition, WorkflowRunLogEntry, WorkflowRunRecord } from './types';

export type WorkflowRunLifecycleEvent = 'start' | 'progress' | 'complete' | 'fail' | 'cancel';

export interface WorkflowRunEventCoordinatorPorts {
  engine: WorkflowEngine;
  persistence: RunPersistenceQueue;
  loadDefinition(id: string, workspaceId?: string): Promise<WorkflowDefinition | undefined>;
  broadcast(channel: 'wf:run-status' | 'wf:node-status' | 'wf:run-log', payload: unknown): void;
  emitLifecycle(event: WorkflowRunLifecycleEvent, payload: Record<string, any>): void;
  busy: {
    start(progress: number, message: string): void;
    progress(progress: number, message: string): void;
    end(): void;
  };
}

type WorkflowProgressState = {
  workflowName: string;
  nodeLabels: Map<string, string>;
};

export function attachWorkflowRunEventCoordinator(ports: WorkflowRunEventCoordinatorPorts): () => void {
  const { engine, persistence, busy } = ports;
  const workflowProgress = new Map<string, WorkflowProgressState>();

  const loadWorkflowProgressLabels = async (record: WorkflowRunRecord, state: WorkflowProgressState): Promise<void> => {
    const definition = await ports.loadDefinition(record.workflowId, record.workspaceId).catch(() => undefined);
    if (!definition || workflowProgress.get(record.runId) !== state) return;

    state.workflowName = definition.name || state.workflowName;
    state.nodeLabels = new Map(definition.nodes.map((node) => [node.id, node.name || node.type || node.id]));

    const current = engine.getRun(record.runId);
    if (current?.status === 'running') {
      busy.progress(calculateWorkflowProgress(current.nodes), `执行工作流: ${state.workflowName}`);
    }
  };

  const buildLifecyclePayload = (record: WorkflowRunRecord): Record<string, any> => {
    const resource = record.input?.resource;
    return {
      runId: record.runId,
      workflowRunId: record.runId,
      workflowId: record.workflowId,
      workflowName: workflowProgress.get(record.runId)?.workflowName || record.metadata?.workflowName || record.workflowId,
      status: record.status,
      progress: record.progress,
      message: record.progressMessage,
      resourceId: record.metadata?.resourceId ?? record.input?.resourceId ?? resource?.id ?? resource?.resourceId,
      workspaceId: record.metadata?.workspaceId ?? record.input?.workspaceId ?? resource?.workspaceId,
      folderId: record.metadata?.folderId ?? record.input?.folderId ?? resource?.folderId
    };
  };

  const handleRunStatus = (record: WorkflowRunRecord): void => {
    const isFirstRunningStatus = record.status === 'running' && !workflowProgress.has(record.runId);
    if (isFirstRunningStatus) {
      const state: WorkflowProgressState = {
        workflowName: record.metadata?.workflowName || record.workflowId,
        nodeLabels: new Map()
      };
      workflowProgress.set(record.runId, state);
      record.progress = calculateWorkflowProgress(record.nodes);
      record.progressMessage = record.progressMessage || '执行中';
      busy.start(record.progress, `执行工作流: ${state.workflowName}`);
      void loadWorkflowProgressLabels(record, state);
    }

    void persistence(record).catch(() => {});
    ports.broadcast('wf:run-status', sanitizeWorkflowRunRecord(record));

    if (isFirstRunningStatus) {
      ports.emitLifecycle('start', buildLifecyclePayload(record));
    } else if (record.status === 'completed') {
      ports.emitLifecycle('complete', buildLifecyclePayload(record));
    } else if (record.status === 'failed') {
      ports.emitLifecycle('fail', buildLifecyclePayload(record));
    } else if (record.status === 'canceled') {
      ports.emitLifecycle('cancel', buildLifecyclePayload(record));
    }

    if ((record.status === 'completed' || record.status === 'failed' || record.status === 'canceled') && workflowProgress.has(record.runId)) {
      const progress = workflowProgress.get(record.runId);
      if (progress) {
        const statusText = record.status === 'completed' ? '完成' : record.status === 'failed' ? '失败' : '已取消';
        busy.progress(100, `工作流${statusText}: ${progress.workflowName}`);
        busy.end();
      }
      workflowProgress.delete(record.runId);
    }
  };

  const handleNodeStatus = (record: WorkflowRunRecord, node: NodeRunState): void => {
    const progressState = workflowProgress.get(record.runId);
    if (progressState) {
      record.progress = calculateWorkflowProgress(record.nodes);

      const runningNode = node.status === 'running' ? node : Object.values(record.nodes).find((candidate) => candidate.status === 'running');
      if (runningNode) {
        const nodeLabel = progressState.nodeLabels.get(runningNode.nodeId) || runningNode.nodeId;
        record.progressMessage = runningNode.progressMessage || `${nodeLabel} 执行中`;
        busy.progress(record.progress, `执行工作流: ${progressState.workflowName} - ${record.progressMessage}`);
      } else {
        record.progressMessage = '执行中';
        busy.progress(record.progress, `执行工作流: ${progressState.workflowName}`);
      }
    }

    if (node.status === 'running' && node.progress !== undefined) {
      persistence.schedule(record);
    } else {
      void persistence(record).catch(() => {});
    }

    ports.broadcast('wf:node-status', { runId: record.runId, workflowId: record.workflowId, node: sanitizeWorkflowNodeState(node) });
    if (progressState) {
      ports.broadcast('wf:run-status', sanitizeWorkflowRunRecord(record));
      ports.emitLifecycle('progress', buildLifecyclePayload(record));
    }
  };

  const handleRunLog = (runId: string, entry: WorkflowRunLogEntry): void => {
    ports.broadcast('wf:run-log', { runId, entry: sanitizeWorkflowRunLogEntry(entry) });
  };

  engine.onTyped('run:status', handleRunStatus);
  engine.onTyped('node:status', handleNodeStatus);
  engine.onTyped('run:log', handleRunLog);

  return () => {
    engine.off('run:status', handleRunStatus);
    engine.off('node:status', handleNodeStatus);
    engine.off('run:log', handleRunLog);
    workflowProgress.clear();
  };
}

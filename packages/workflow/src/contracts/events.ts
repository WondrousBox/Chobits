import type { WorkflowNodeRunState, WorkflowRunLogEntry, WorkflowRunRecord } from './run.js';

export interface WorkflowEngineEvents {
  'run:status': (record: WorkflowRunRecord) => void;
  'node:status': (record: WorkflowRunRecord, node: WorkflowNodeRunState) => void;
  'node:progress': (runId: string, nodeId: string, progress: number, message?: string, detail?: any) => void;
  'run:log': (runId: string, entry: WorkflowRunLogEntry) => void;
}

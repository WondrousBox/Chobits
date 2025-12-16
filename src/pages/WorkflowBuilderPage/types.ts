import type { NodeRunState, NodeSpec } from '../../../packages/workflow/types';
export type { ExecutionStatus, NodeRunState, NodeSpec, WorkflowDraft, WorkflowRunLogEntry, WorkflowRunRecord } from '../../../packages/workflow/types';

export type NodeData = {
  label: string;
  specId: string;
  spec: NodeSpec;
  config: Record<string, any>;
  inputDefaults: Record<string, any>;
  runtime?: NodeRunState;
};

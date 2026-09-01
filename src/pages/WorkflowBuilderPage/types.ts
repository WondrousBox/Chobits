import type { NodeRunState, NodeSpec } from '@chobits/workflow';
export type { ExecutionStatus, NodeRunState, NodeSpec, WorkflowDraft, WorkflowRunLogEntry, WorkflowRunRecord } from '@chobits/workflow';

export type NodeData = {
  label: string;
  specId: string;
  spec: NodeSpec;
  config: Record<string, any>;
  inputDefaults: Record<string, any>;
  runtime?: NodeRunState;
};

// Front-end mirror of workflow types (subset)
export type WorkflowNodeDraft = {
  id: string;
  type: string;
  x: number;
  y: number;
  config?: Record<string, any>;
  inputDefaults?: Record<string, any>;
};

export type WorkflowEdgeDraft = {
  id: string;
  from: { nodeId: string; port: string };
  to: { nodeId: string; port: string };
};

export type WorkflowDraft = {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNodeDraft[];
  edges: WorkflowEdgeDraft[];
};

export type ExecutionStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';

export type ValidateResult = {
  ok: boolean;
  errors?: string[];
  missingPlugins?: { id: string; hint?: string }[];
};

export type NodeRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export type NodeRunState = {
  nodeId: string;
  status: NodeRunStatus;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  output?: Record<string, any>;
};

export type WorkflowRunLogLevel = 'info' | 'warn' | 'error';

export type WorkflowRunLogEntry = {
  runId: string;
  level: WorkflowRunLogLevel;
  message: string;
  nodeId?: string;
  timestamp: number;
};

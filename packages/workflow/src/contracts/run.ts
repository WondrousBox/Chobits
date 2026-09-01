export type WorkflowExecutionStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
export type WorkflowNodeRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type WorkflowNodeAttemptStatus = 'running' | 'completed' | 'failed' | 'canceled';

export type WorkflowNodeAttempt = {
  attempt: number;
  status: WorkflowNodeAttemptStatus;
  startedAt: number;
  finishedAt?: number;
  duration?: number;
  error?: string;
  errorReason?: string;
};

export type WorkflowNodeRunState = {
  nodeId: string;
  status: WorkflowNodeRunStatus;
  attempt?: number;
  attempts?: WorkflowNodeAttempt[];
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  errorReason?: string;
  input?: Record<string, any>;
  output?: Record<string, any>;
  progress?: number;
  progressMessage?: string;
  progressDetail?: any;
};

export type WorkflowRunRecord = {
  runId: string;
  workflowId: string;
  workspaceId?: string;
  createdAt: number;
  status: WorkflowExecutionStatus;
  nodes: Record<string, WorkflowNodeRunState>;
  input?: Record<string, any>;
  output?: Record<string, any>;
  error?: string;
  metadata?: Record<string, any>;
  progress?: number;
  progressMessage?: string;
  startedAt?: number;
  completedAt?: number;
  duration?: number;
};

export type WorkflowRunLogLevel = 'info' | 'warn' | 'error';

export type WorkflowRunLogEntry = {
  runId: string;
  level: WorkflowRunLogLevel;
  message: string;
  nodeId?: string;
  attempt?: number;
  errorReason?: string;
  timestamp: number;
};

export type ExecutionStatus = WorkflowExecutionStatus;
export type NodeRunStatus = WorkflowNodeRunStatus;
export type NodeRunState = WorkflowNodeRunState;

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

export type NodeSpec = {
  id: string;
  label: string;
  category?: string;
  description?: string;
  // Visual design fields
  backgroundColor?: string; // CSS color value, e.g. '#3b82f6', 'rgb(59, 130, 246)', 'blue-500'
  icon?: string; // Icon name from react-icons/tb (must be imported in SpecNode.tsx iconMap)
  // Available icons: TbEdit, TbFolderOpen, TbPhoto, TbPlayerPlay, TbRobot, TbScan, TbSquare, TbText
  // Add more icons by importing them in SpecNode.tsx and adding to iconMap
  inputs: {
    key: string;
    type: string | string[];
    required?: boolean;
    description?: string;
    label?: string;
    default?: any;
    inputType?: 'text' | 'select' | 'select-multiple' | 'number' | 'textarea';
    options?: Array<{ value: string; label: string } | { group: string; options: Array<{ value: string; label: string }> }>;
  }[];
  outputs: { key: string; type: string | string[]; description?: string }[];
  requires?: string[];
  config?: {
    key: string;
    label?: string;
    type: string | string[];
    description?: string;
    default?: any;
    inputType?: 'text' | 'select' | 'select-multiple' | 'number' | 'textarea';
    options?: Array<{ value: string; label: string } | { group: string; options: Array<{ value: string; label: string }> }>;
    group?: string;
  }[];
  configGroups?: Record<string, { label: string; defaultExpanded?: boolean }>;
  hasDynamicConfig?: boolean;
};

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

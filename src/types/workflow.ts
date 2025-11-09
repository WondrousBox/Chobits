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

export type NodeSpec = {
  id: string;
  label: string;
  category?: string;
  description?: string;
  inputs: { key: string; type: string | string[]; required?: boolean; description?: string }[];
  outputs: { key: string; type: string | string[]; description?: string }[];
  requires?: string[];
  config?: { key: string; type: string | string[]; description?: string; default?: any }[];
};

export type ValidateResult = {
  ok: boolean;
  errors?: string[];
  missingPlugins?: { id: string; hint?: string }[];
};

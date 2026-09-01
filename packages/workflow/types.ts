import type { WorkflowDefinition } from './src/contracts/definition.js';

export type * from './src/contracts/index.js';
export type * from './src/ports/index.js';
export type * from './src/sdk/index.js';

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
  schemaVersion?: number;
  workspaceId?: string;
  description?: string;
  icon?: string;
  nodes: WorkflowNodeDraft[];
  edges: WorkflowEdgeDraft[];
  options?: WorkflowDefinition['options'];
};

export { EngineEmitter, type WorkflowEngineEvents as IEngineEvents, type WorkflowEngineEvents } from './core/events.js';

import type { WorkflowDefinition } from './definition.js';

export interface WorkflowRunScope {
  kind: string;
  id: string;
}

export interface WorkflowRunTrigger {
  type: 'manual' | 'schedule' | 'event' | 'agent' | string;
  id?: string;
}

export interface WorkflowRunActor {
  type: string;
  id?: string;
}

export interface WorkflowRunRequest {
  definitionId?: string;
  definition?: WorkflowDefinition;
  input?: Record<string, unknown>;
  scope?: WorkflowRunScope;
  trigger?: WorkflowRunTrigger;
  actor?: WorkflowRunActor;
  context?: Record<string, unknown>;
  configOverrides?: Record<string, Record<string, unknown>>;
}

export interface WorkflowLegacyRunRequest {
  defId?: string;
  def?: WorkflowDefinition;
  input?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

import type { WorkflowDefinition } from '../contracts/definition.js';
import type { WorkflowRunRecord } from '../contracts/run.js';

export interface WorkflowDefinitionStore {
  listPresets(): Promise<WorkflowDefinition[]>;
  listDefinitions(workspaceId: string): Promise<WorkflowDefinition[]>;
  getDefinition(id: string, workspaceId: string): Promise<WorkflowDefinition | undefined>;
  saveDefinition(definition: WorkflowDefinition): Promise<void>;
  deleteDefinition(id: string, workspaceId: string): Promise<void>;
}

export interface WorkflowRunStore {
  saveRun?(run: WorkflowRunRecord): void | Promise<void>;
  listRuns(workspaceId: string, workflowId?: string, limit?: number, resourceId?: string): Promise<WorkflowRunRecord[]>;
  getRun(runId: string, workspaceId: string): Promise<WorkflowRunRecord | undefined>;
  deleteRun(runId: string, workspaceId: string): Promise<void>;
}

export interface WorkflowApplicationStore extends WorkflowDefinitionStore, WorkflowRunStore {}

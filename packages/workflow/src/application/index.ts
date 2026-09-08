import type { WorkflowDefinitionSaveResult, WorkflowExecutionResult, WorkflowRunHandle } from '../../application-service.js';
import type { NodeConfig, NodeSpec, PortSchema, ValidateResult, WorkflowDefinition, WorkflowRunLogEntry, WorkflowRunRecord, WorkflowRunRequest } from '../../types.js';

export * from '../../application-service.js';

export interface WorkflowPluginManifest {
  id: string;
  installed: boolean;
  label: string;
}

export interface WorkflowRuntimeFacade {
  cancelRun(runId: string, workspaceId?: string): Promise<boolean>;
  deleteDefinition(id: string, workspaceId?: string): Promise<void>;
  deleteRun(runId: string, workspaceId?: string): Promise<void>;
  dispose(): Promise<void>;
  execute(request: WorkflowRunRequest): Promise<WorkflowExecutionResult>;
  flushPersistence(): Promise<void>;
  getDefinition(id: string, workspaceId?: string): Promise<WorkflowDefinition | undefined>;
  getNodeConfig(nodeId: string, config?: NodeConfig): Promise<PortSchema[] | null | undefined>;
  getNodeInputs(nodeId: string, config?: NodeConfig): Promise<PortSchema[] | null | undefined>;
  getNodeOutputs(nodeId: string, config?: NodeConfig): Promise<PortSchema[] | null | undefined>;
  getRun(runId: string, workspaceId?: string): Promise<WorkflowRunRecord | undefined>;
  getRunLogs(runId: string, workspaceId?: string): Promise<WorkflowRunLogEntry[]>;
  isPresetDefinition(id: string): Promise<boolean>;
  listDefinitions(workspaceId?: string): Promise<WorkflowDefinition[]>;
  listNodes(): Promise<NodeSpec[]>;
  listPlugins(): Promise<WorkflowPluginManifest[]>;
  listPresetDefinitions(): Promise<WorkflowDefinition[]>;
  listRuns(workspaceId?: string, workflowId?: string, limit?: number, resourceId?: string): Promise<WorkflowRunRecord[]>;
  run(request: WorkflowRunRequest, onProgress?: (progress: number, message?: string) => void): Promise<WorkflowRunRecord>;
  saveDefinition(definition: WorkflowDefinition, workspaceId?: string): Promise<WorkflowDefinitionSaveResult>;
  start(request: WorkflowRunRequest, onProgress?: (progress: number, message?: string) => void): Promise<WorkflowRunHandle>;
  validateDefinition(definition: WorkflowDefinition): Promise<ValidateResult>;
}

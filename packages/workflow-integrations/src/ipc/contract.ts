import type {
  ExecutionStatus,
  NodeConfig,
  NodeRunState,
  NodeSpec,
  PortSchema,
  ValidateResult,
  WorkflowDefinition,
  WorkflowExecutionResult,
  WorkflowRunLogEntry,
  WorkflowRunRecord
} from '@chobits/workflow';
import type { WorkflowPluginManifest } from '@chobits/workflow/application';

export const WORKFLOW_IPC_CHANNELS = {
  cancelRun: 'wf:cancelRun',
  deleteDefinition: 'wf:deleteDefinition',
  deleteRun: 'wf:deleteRun',
  getDefinition: 'wf:getDefinition',
  getNodeConfig: 'wf:getNodeConfig',
  getNodeInputs: 'wf:getNodeInputs',
  getNodeOutputs: 'wf:getNodeOutputs',
  getRun: 'wf:getRun',
  getRunLogs: 'wf:getRunLogs',
  getTaskResults: 'wf:getTaskResults',
  isPreset: 'wf:isPreset',
  listDefinitions: 'wf:listDefinitions',
  listNodes: 'wf:listNodes',
  listPlugins: 'wf:listPlugins',
  listPresets: 'wf:listPresets',
  listRuns: 'wf:listRuns',
  run: 'wf:run',
  saveDefinition: 'wf:saveDefinition',
  validate: 'wf:validate'
} as const;

export const WORKFLOW_IPC_EVENT_CHANNELS = {
  aiMissingProvider: 'wf:ai-missing-provider',
  nodeStatus: 'wf:node-status',
  runLog: 'wf:run-log',
  runStatus: 'wf:run-status'
} as const;

export type WorkflowIpcChannel = (typeof WORKFLOW_IPC_CHANNELS)[keyof typeof WORKFLOW_IPC_CHANNELS];
export type WorkflowIpcEventChannel = (typeof WORKFLOW_IPC_EVENT_CHANNELS)[keyof typeof WORKFLOW_IPC_EVENT_CHANNELS];

export type WorkflowNodeFieldResult<K extends 'config' | 'inputs' | 'outputs'> = ({ ok: true } & Record<K, PortSchema[] | undefined>) | { ok: false; error: string };
export type WorkflowMutationResult = { ok: true } | { ok: false; error: string };
export type WorkflowSaveIpcResult = { ok: true } | { ok: false; error: string; validation?: ValidateResult };
export type WorkflowRunIpcResult = { ok: true; runId: string; status?: ExecutionStatus } | ({ ok: false } & Omit<WorkflowExecutionResult, 'ok' | 'record'>);
export type WorkflowTaskResultsResult = { ok: true; data: unknown } | { ok: false; error: string };

export interface WorkflowIpcRequestMap {
  [WORKFLOW_IPC_CHANNELS.cancelRun]: { runId: string; workspaceId?: string };
  [WORKFLOW_IPC_CHANNELS.deleteDefinition]: { id: string; workspaceId?: string };
  [WORKFLOW_IPC_CHANNELS.deleteRun]: { runId: string; workspaceId?: string };
  [WORKFLOW_IPC_CHANNELS.getDefinition]: { id: string; workspaceId?: string };
  [WORKFLOW_IPC_CHANNELS.getNodeConfig]: { config?: NodeConfig; nodeId: string };
  [WORKFLOW_IPC_CHANNELS.getNodeInputs]: { config?: NodeConfig; nodeId: string };
  [WORKFLOW_IPC_CHANNELS.getNodeOutputs]: { config?: NodeConfig; nodeId: string };
  [WORKFLOW_IPC_CHANNELS.getRun]: { runId: string; workspaceId?: string };
  [WORKFLOW_IPC_CHANNELS.getRunLogs]: { runId: string; workspaceId?: string };
  [WORKFLOW_IPC_CHANNELS.getTaskResults]: { filePath: string };
  [WORKFLOW_IPC_CHANNELS.isPreset]: { id: string };
  [WORKFLOW_IPC_CHANNELS.listDefinitions]: { workspaceId?: string } | undefined;
  [WORKFLOW_IPC_CHANNELS.listNodes]: undefined;
  [WORKFLOW_IPC_CHANNELS.listPlugins]: undefined;
  [WORKFLOW_IPC_CHANNELS.listPresets]: undefined;
  [WORKFLOW_IPC_CHANNELS.listRuns]: { defId?: string; limit?: number; resourceId?: string; workspaceId?: string } | undefined;
  [WORKFLOW_IPC_CHANNELS.run]: { defId: string; input?: Record<string, unknown>; metadata?: Record<string, unknown> };
  [WORKFLOW_IPC_CHANNELS.saveDefinition]: { def: WorkflowDefinition; workspaceId?: string };
  [WORKFLOW_IPC_CHANNELS.validate]: { def: WorkflowDefinition };
}

export interface WorkflowIpcResultMap {
  [WORKFLOW_IPC_CHANNELS.cancelRun]: WorkflowMutationResult;
  [WORKFLOW_IPC_CHANNELS.deleteDefinition]: WorkflowMutationResult;
  [WORKFLOW_IPC_CHANNELS.deleteRun]: { ok: true };
  [WORKFLOW_IPC_CHANNELS.getDefinition]: WorkflowDefinition | undefined;
  [WORKFLOW_IPC_CHANNELS.getNodeConfig]: WorkflowNodeFieldResult<'config'>;
  [WORKFLOW_IPC_CHANNELS.getNodeInputs]: WorkflowNodeFieldResult<'inputs'>;
  [WORKFLOW_IPC_CHANNELS.getNodeOutputs]: WorkflowNodeFieldResult<'outputs'>;
  [WORKFLOW_IPC_CHANNELS.getRun]: WorkflowRunRecord | undefined;
  [WORKFLOW_IPC_CHANNELS.getRunLogs]: WorkflowRunLogEntry[];
  [WORKFLOW_IPC_CHANNELS.getTaskResults]: WorkflowTaskResultsResult;
  [WORKFLOW_IPC_CHANNELS.isPreset]: boolean;
  [WORKFLOW_IPC_CHANNELS.listDefinitions]: WorkflowDefinition[];
  [WORKFLOW_IPC_CHANNELS.listNodes]: NodeSpec[];
  [WORKFLOW_IPC_CHANNELS.listPlugins]: WorkflowPluginManifest[];
  [WORKFLOW_IPC_CHANNELS.listPresets]: WorkflowDefinition[];
  [WORKFLOW_IPC_CHANNELS.listRuns]: WorkflowRunRecord[];
  [WORKFLOW_IPC_CHANNELS.run]: WorkflowRunIpcResult;
  [WORKFLOW_IPC_CHANNELS.saveDefinition]: WorkflowSaveIpcResult;
  [WORKFLOW_IPC_CHANNELS.validate]: ValidateResult;
}

export interface WorkflowIpcEventMap {
  [WORKFLOW_IPC_EVENT_CHANNELS.aiMissingProvider]: { fields?: string[]; providerId: string };
  [WORKFLOW_IPC_EVENT_CHANNELS.nodeStatus]: { node: NodeRunState; runId: string; workflowId: string };
  [WORKFLOW_IPC_EVENT_CHANNELS.runLog]: { entry: WorkflowRunLogEntry; runId: string };
  [WORKFLOW_IPC_EVENT_CHANNELS.runStatus]: WorkflowRunRecord;
}

export type WorkflowAiMissingProviderEvent = WorkflowIpcEventMap[typeof WORKFLOW_IPC_EVENT_CHANNELS.aiMissingProvider];
export type WorkflowNodeStatusEvent = WorkflowIpcEventMap[typeof WORKFLOW_IPC_EVENT_CHANNELS.nodeStatus];
export type WorkflowRunLogEvent = WorkflowIpcEventMap[typeof WORKFLOW_IPC_EVENT_CHANNELS.runLog];
export type WorkflowRunStatusEvent = WorkflowIpcEventMap[typeof WORKFLOW_IPC_EVENT_CHANNELS.runStatus];

export type WorkflowIpcHandler<C extends WorkflowIpcChannel> = (event: unknown, payload: WorkflowIpcRequestMap[C]) => Promise<WorkflowIpcResultMap[C]> | WorkflowIpcResultMap[C];

export interface WorkflowIpcRegistrar {
  handle<C extends WorkflowIpcChannel>(channel: C, listener: WorkflowIpcHandler<C>): unknown;
}

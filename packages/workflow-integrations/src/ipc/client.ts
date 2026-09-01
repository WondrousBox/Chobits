import {
  WORKFLOW_IPC_CHANNELS,
  WORKFLOW_IPC_EVENT_CHANNELS,
  type WorkflowIpcChannel,
  type WorkflowIpcEventChannel,
  type WorkflowIpcEventMap,
  type WorkflowIpcRequestMap,
  type WorkflowIpcResultMap
} from './contract';

export interface WorkflowClientTransport {
  invoke(channel: string, payload?: unknown): Promise<unknown>;
  subscribe(channel: string, listener: (payload: unknown) => void): () => void;
}

type InvokeMethod<C extends WorkflowIpcChannel> = (payload: WorkflowIpcRequestMap[C]) => Promise<WorkflowIpcResultMap[C]>;
type EventMethod<C extends WorkflowIpcEventChannel> = (listener: (payload: WorkflowIpcEventMap[C]) => void) => () => void;

export interface WorkflowClient {
  cancelRun: InvokeMethod<typeof WORKFLOW_IPC_CHANNELS.cancelRun>;
  deleteDefinition: InvokeMethod<typeof WORKFLOW_IPC_CHANNELS.deleteDefinition>;
  deleteRun: InvokeMethod<typeof WORKFLOW_IPC_CHANNELS.deleteRun>;
  getDefinition: InvokeMethod<typeof WORKFLOW_IPC_CHANNELS.getDefinition>;
  getNodeConfig: InvokeMethod<typeof WORKFLOW_IPC_CHANNELS.getNodeConfig>;
  getNodeInputs: InvokeMethod<typeof WORKFLOW_IPC_CHANNELS.getNodeInputs>;
  getNodeOutputs: InvokeMethod<typeof WORKFLOW_IPC_CHANNELS.getNodeOutputs>;
  getRun: InvokeMethod<typeof WORKFLOW_IPC_CHANNELS.getRun>;
  getRunLogs: InvokeMethod<typeof WORKFLOW_IPC_CHANNELS.getRunLogs>;
  getTaskResults: InvokeMethod<typeof WORKFLOW_IPC_CHANNELS.getTaskResults>;
  isPreset: InvokeMethod<typeof WORKFLOW_IPC_CHANNELS.isPreset>;
  listDefinitions(payload?: WorkflowIpcRequestMap[typeof WORKFLOW_IPC_CHANNELS.listDefinitions]): Promise<WorkflowIpcResultMap[typeof WORKFLOW_IPC_CHANNELS.listDefinitions]>;
  listNodes(): Promise<WorkflowIpcResultMap[typeof WORKFLOW_IPC_CHANNELS.listNodes]>;
  listPlugins(): Promise<WorkflowIpcResultMap[typeof WORKFLOW_IPC_CHANNELS.listPlugins]>;
  listPresets(): Promise<WorkflowIpcResultMap[typeof WORKFLOW_IPC_CHANNELS.listPresets]>;
  listRuns(payload?: WorkflowIpcRequestMap[typeof WORKFLOW_IPC_CHANNELS.listRuns]): Promise<WorkflowIpcResultMap[typeof WORKFLOW_IPC_CHANNELS.listRuns]>;
  onAiMissingProvider: EventMethod<typeof WORKFLOW_IPC_EVENT_CHANNELS.aiMissingProvider>;
  onNodeStatus: EventMethod<typeof WORKFLOW_IPC_EVENT_CHANNELS.nodeStatus>;
  onRunLog: EventMethod<typeof WORKFLOW_IPC_EVENT_CHANNELS.runLog>;
  onRunStatus: EventMethod<typeof WORKFLOW_IPC_EVENT_CHANNELS.runStatus>;
  run: InvokeMethod<typeof WORKFLOW_IPC_CHANNELS.run>;
  saveDefinition: InvokeMethod<typeof WORKFLOW_IPC_CHANNELS.saveDefinition>;
  validate: InvokeMethod<typeof WORKFLOW_IPC_CHANNELS.validate>;
}

export function createWorkflowClient(transport: WorkflowClientTransport): WorkflowClient {
  const invoke = <C extends WorkflowIpcChannel>(channel: C, payload: WorkflowIpcRequestMap[C]): Promise<WorkflowIpcResultMap[C]> =>
    transport.invoke(channel, payload) as Promise<WorkflowIpcResultMap[C]>;
  const subscribe = <C extends WorkflowIpcEventChannel>(channel: C, listener: (payload: WorkflowIpcEventMap[C]) => void): (() => void) =>
    transport.subscribe(channel, (payload) => listener(payload as WorkflowIpcEventMap[C]));

  return {
    cancelRun: (payload: WorkflowIpcRequestMap[typeof WORKFLOW_IPC_CHANNELS.cancelRun]) => invoke(WORKFLOW_IPC_CHANNELS.cancelRun, payload),
    deleteDefinition: (payload: WorkflowIpcRequestMap[typeof WORKFLOW_IPC_CHANNELS.deleteDefinition]) => invoke(WORKFLOW_IPC_CHANNELS.deleteDefinition, payload),
    deleteRun: (payload: WorkflowIpcRequestMap[typeof WORKFLOW_IPC_CHANNELS.deleteRun]) => invoke(WORKFLOW_IPC_CHANNELS.deleteRun, payload),
    getDefinition: (payload: WorkflowIpcRequestMap[typeof WORKFLOW_IPC_CHANNELS.getDefinition]) => invoke(WORKFLOW_IPC_CHANNELS.getDefinition, payload),
    getNodeConfig: (payload: WorkflowIpcRequestMap[typeof WORKFLOW_IPC_CHANNELS.getNodeConfig]) => invoke(WORKFLOW_IPC_CHANNELS.getNodeConfig, payload),
    getNodeInputs: (payload: WorkflowIpcRequestMap[typeof WORKFLOW_IPC_CHANNELS.getNodeInputs]) => invoke(WORKFLOW_IPC_CHANNELS.getNodeInputs, payload),
    getNodeOutputs: (payload: WorkflowIpcRequestMap[typeof WORKFLOW_IPC_CHANNELS.getNodeOutputs]) => invoke(WORKFLOW_IPC_CHANNELS.getNodeOutputs, payload),
    getRun: (payload: WorkflowIpcRequestMap[typeof WORKFLOW_IPC_CHANNELS.getRun]) => invoke(WORKFLOW_IPC_CHANNELS.getRun, payload),
    getRunLogs: (payload: WorkflowIpcRequestMap[typeof WORKFLOW_IPC_CHANNELS.getRunLogs]) => invoke(WORKFLOW_IPC_CHANNELS.getRunLogs, payload),
    getTaskResults: (payload: WorkflowIpcRequestMap[typeof WORKFLOW_IPC_CHANNELS.getTaskResults]) => invoke(WORKFLOW_IPC_CHANNELS.getTaskResults, payload),
    isPreset: (payload: WorkflowIpcRequestMap[typeof WORKFLOW_IPC_CHANNELS.isPreset]) => invoke(WORKFLOW_IPC_CHANNELS.isPreset, payload),
    listDefinitions: (payload?: WorkflowIpcRequestMap[typeof WORKFLOW_IPC_CHANNELS.listDefinitions]) => invoke(WORKFLOW_IPC_CHANNELS.listDefinitions, payload),
    listNodes: () => invoke(WORKFLOW_IPC_CHANNELS.listNodes, undefined),
    listPlugins: () => invoke(WORKFLOW_IPC_CHANNELS.listPlugins, undefined),
    listPresets: () => invoke(WORKFLOW_IPC_CHANNELS.listPresets, undefined),
    listRuns: (payload?: WorkflowIpcRequestMap[typeof WORKFLOW_IPC_CHANNELS.listRuns]) => invoke(WORKFLOW_IPC_CHANNELS.listRuns, payload),
    onAiMissingProvider: (listener: (payload: WorkflowIpcEventMap[typeof WORKFLOW_IPC_EVENT_CHANNELS.aiMissingProvider]) => void) => subscribe(WORKFLOW_IPC_EVENT_CHANNELS.aiMissingProvider, listener),
    onNodeStatus: (listener: (payload: WorkflowIpcEventMap[typeof WORKFLOW_IPC_EVENT_CHANNELS.nodeStatus]) => void) => subscribe(WORKFLOW_IPC_EVENT_CHANNELS.nodeStatus, listener),
    onRunLog: (listener: (payload: WorkflowIpcEventMap[typeof WORKFLOW_IPC_EVENT_CHANNELS.runLog]) => void) => subscribe(WORKFLOW_IPC_EVENT_CHANNELS.runLog, listener),
    onRunStatus: (listener: (payload: WorkflowIpcEventMap[typeof WORKFLOW_IPC_EVENT_CHANNELS.runStatus]) => void) => subscribe(WORKFLOW_IPC_EVENT_CHANNELS.runStatus, listener),
    run: (payload: WorkflowIpcRequestMap[typeof WORKFLOW_IPC_CHANNELS.run]) => invoke(WORKFLOW_IPC_CHANNELS.run, payload),
    saveDefinition: (payload: WorkflowIpcRequestMap[typeof WORKFLOW_IPC_CHANNELS.saveDefinition]) => invoke(WORKFLOW_IPC_CHANNELS.saveDefinition, payload),
    validate: (payload: WorkflowIpcRequestMap[typeof WORKFLOW_IPC_CHANNELS.validate]) => invoke(WORKFLOW_IPC_CHANNELS.validate, payload)
  };
}

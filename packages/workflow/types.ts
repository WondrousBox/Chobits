import { EventEmitter } from 'node:events';

// Basic value types supported across nodes
export type ValueType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'file' | 'resource' | 'any';

export type PortSchema = {
  key: string;
  label?: string;
  type: ValueType | ValueType[]; // allow union types
  required?: boolean;
  description?: string;
  // default value for inputs
  default?: any;
};

export type NodeSpec = {
  id: string; // stable node type id, e.g. 'core/start', 'media/transcode'
  label: string;
  category?: string;
  description?: string;
  // Ports
  inputs: PortSchema[]; // for start node, typically empty
  outputs: PortSchema[]; // for end node, could be empty
  // Required plugin ids
  requires?: string[]; // e.g. ['plugin:ffmpeg']
  // Config schema (static per node type)
  config?: PortSchema[]; // config items distinct from dynamic inputs
};

export type NodeConfig = Record<string, any>;

export type NodeInstance = {
  // unique id in a workflow graph
  id: string;
  type: string; // refers to NodeSpec.id
  name?: string;
  config?: NodeConfig;
  // optional inline defaults for inputs
  inputDefaults?: Record<string, any>;
};

export type Edge = {
  id: string;
  from: { nodeId: string; port: string };
  to: { nodeId: string; port: string };
};

export type WorkflowDefinition = {
  id: string;
  name: string;
  description?: string;
  nodes: NodeInstance[];
  edges: Edge[];
  // execution options
  options?: {
    concurrency?: number; // default 2
    errorStrategy?: 'fail-fast' | 'continue';
  };
};

export type ExecutionStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';

export type NodeRunState = {
  nodeId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  output?: Record<string, any>;
};

export type WorkflowRunRecord = {
  runId: string;
  workflowId: string;
  createdAt: number;
  status: ExecutionStatus;
  nodes: Record<string, NodeRunState>;
  output?: Record<string, any>;
  error?: string;
};

export type ExecutionContext = {
  // root temp directory to generate files
  tmpDir: string;
  // application resources root for binaries like ffmpeg
  resourcesDir: string;
  // workspace root for relative paths (optional)
  workspaceDir?: string;
  // userData directory for persistent caches
  userDataDir: string;
};

export type NodeHandler = {
  spec: NodeSpec;
  // validate config at registration time if needed
  validateConfig?: (config?: NodeConfig) => void | never;
  // runtime execution logic
  run: (args: {
    input: Record<string, any>;
    config?: NodeConfig;
    ctx: ExecutionContext;
    emit: (event: string, payload?: any) => void;
    getPlugin: (id: string) => Plugin | undefined;
  }) => Promise<Record<string, any>>;
};

export type Plugin = {
  id: string; // 'plugin:ffmpeg'
  label: string;
  description?: string;
  // Check if plugin is installed and usable on current platform
  isInstalled: (ctx: ExecutionContext) => Promise<boolean>;
  // Optional installer hint (URL or command); engine does not execute it automatically
  installHint?: string;
  // Optional prepare step before run (e.g., set ffmpeg binary path)
  prepare?: (ctx: ExecutionContext) => Promise<void>;
  // Capabilities declaration, e.g., ['transcode', 'probe', 'ocr']
  capabilities?: string[];
};

export type ValidateResult = {
  ok: boolean;
  errors?: string[];
  missingPlugins?: { id: string; hint?: string }[];
};

export interface IEngineEvents {
  'run:status': (rec: WorkflowRunRecord) => void;
  'node:status': (rec: WorkflowRunRecord, node: NodeRunState) => void;
}

export class EngineEmitter extends EventEmitter {
  emitTyped<K extends keyof IEngineEvents>(event: K, ...args: Parameters<IEngineEvents[K]>): boolean {
    return super.emit(event as unknown as string, ...(args as unknown as any[]));
  }
  onTyped<K extends keyof IEngineEvents>(event: K, listener: IEngineEvents[K]): this {
    super.on(event as unknown as string, listener as unknown as (...args: any[]) => void);
    return this;
  }
}

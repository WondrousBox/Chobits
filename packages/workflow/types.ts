import { EventEmitter } from 'node:events';

import type { PluginResourceManager } from '../plugins';

// Basic value types supported across nodes
export type ValueType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'file' | 'resource' | 'any';

// Select option types
export type SelectOption = { value: string; label: string };
export type SelectOptionGroup = { group: string; options: SelectOption[] };
export type SelectOptions = Array<SelectOption | SelectOptionGroup>;

export type PortSchema = {
  key: string;
  label?: string;
  type: ValueType | ValueType[]; // allow union types
  required?: boolean;
  description?: string;
  // default value for inputs
  default?: any;
  // UI input type (for config fields)
  inputType?: 'file' | 'url' | 'folder' | 'text' | 'select' | 'select-multiple' | 'number' | 'textarea' | 'condition-list' | 'port-list';
  // Options for select input type
  // Can be flat array of options or grouped options
  options?: SelectOptions;
  // Group for organizing config fields (e.g., 'basic', 'advanced')
  // Fields without group are shown by default, fields with group can be collapsed
  group?: string;
  // Whether this config field should be rendered inline on node card
  // e.g. start node 的文本输入展示在节点渲染器上
  showInNode?: boolean;
};

export type NodeSpec = {
  id: string; // stable node type id, e.g. 'core/start', 'media/transcode'
  label: string;
  category?: string;
  description?: string;
  // Visual design fields
  backgroundColor?: string; // CSS color value, e.g. '#3b82f6', 'rgb(59, 130, 246)', 'blue-500'
  icon?: string; // Icon name from react-icons/tb (must be imported in SpecNode.tsx iconMap)
  // Available icons: TbEdit, TbFolderOpen, TbPhoto, TbPlayerPlay, TbRobot, TbScan, TbSquare, TbText
  // Add more icons by importing them in SpecNode.tsx and adding to iconMap
  // Ports
  inputs: PortSchema[]; // for start node, typically empty
  outputs: PortSchema[]; // for end node, could be empty
  // Required plugin ids
  requires?: string[]; // e.g. ['plugin:ffmpeg']
  // Config schema (static per node type)
  config?: PortSchema[]; // config items distinct from dynamic inputs
  // Config groups definition: maps group name to label and default expanded state
  configGroups?: Record<string, { label: string; defaultExpanded?: boolean }>;
  // Whether this node supports dynamic configuration (has getConfig method)
  hasDynamicConfig?: boolean;
  // Whether this node supports dynamic inputs (has getInputs method)
  hasDynamicInputs?: boolean;
  // Whether this node supports dynamic outputs (has getOutputs method)
  hasDynamicOutputs?: boolean;
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
  // optional position for UI layout
  x?: number;
  y?: number;
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
  icon?: string; // SVG 图标字符串
  nodes: NodeInstance[];
  edges: Edge[];
  // execution options
  options?: {
    concurrency?: number; // default 2
    errorStrategy?: 'fail-fast' | 'continue';
  };
  // 是否为预设工作流
  isPreset?: boolean;
};

export type ExecutionStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';

export type NodeRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export type NodeRunState = {
  nodeId: string;
  status: NodeRunStatus;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  input?: Record<string, any>;
  output?: Record<string, any>;
  progress?: number;
  progressMessage?: string;
  progressDetail?: any;
};

export type WorkflowRunRecord = {
  runId: string;
  workflowId: string;
  createdAt: number;
  status: ExecutionStatus;
  nodes: Record<string, NodeRunState>;
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
  timestamp: number;
};

export type ExecutionContext = {
  // root temp directory to generate files
  tmpDir: string;
  // workspace ID for resource operations (required)
  workspaceId?: string;
  // folder ID for resource operations (optional)
  folderId?: string;
  // 可选：应用级注入的插件资源管理器，用于查找插件相关的 engine/model 路径
  pluginResourceManager?: PluginResourceManager;
  // 可选：应用级注入的 FFmpeg/FFprobe 路径，避免在 workflow 层直接依赖 Electron 资源工具
  ffmpegPath?: string;
  ffprobePath?: string;
};

export type NodeHandler = {
  spec: NodeSpec;
  // validate config at registration time if needed
  validateConfig?: (config?: NodeConfig) => void | never;
  // compute dynamic config schema based on current config (optional)
  // if not provided, uses spec.config
  getConfig?: (config?: NodeConfig) => Promise<PortSchema[]> | PortSchema[];
  // compute dynamic inputs based on config (optional)
  // if not provided, uses spec.inputs
  getInputs?: (config?: NodeConfig) => PortSchema[];
  // compute dynamic outputs based on config (optional)
  // if not provided, uses spec.outputs
  getOutputs?: (config?: NodeConfig) => PortSchema[];
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
  icon?: string; // SVG 图标字符串
  nodes: WorkflowNodeDraft[];
  edges: WorkflowEdgeDraft[];
};

export interface IEngineEvents {
  'run:status': (rec: WorkflowRunRecord) => void;
  'node:status': (rec: WorkflowRunRecord, node: NodeRunState) => void;
  'node:progress': (runId: string, nodeId: string, progress: number, message?: string, detail?: any) => void;
  'run:log': (runId: string, entry: WorkflowRunLogEntry) => void;
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

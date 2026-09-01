import type { NodeConfig, NodeSpec, PortSchema } from '../contracts/definition.js';
import type { MissingModel } from '../contracts/validation.js';
import type { ExecutionContext } from '../ports/runtime.js';
import type { WorkflowCapabilityResolver, WorkflowCapabilityToken } from './capability.js';

export interface WorkflowNodeRetryPolicy {
  maxAttempts: number;
  delayMs?: number;
  backoffMultiplier?: number;
  maxDelayMs?: number;
}

export interface WorkflowNodeExecutionPolicy {
  timeoutMs?: number;
  retry?: WorkflowNodeRetryPolicy;
  idempotent?: boolean;
  group?: string;
}

export type WorkflowNodeHandler = {
  spec: NodeSpec;
  requiredCapabilities?: readonly WorkflowCapabilityToken<unknown>[];
  execution?: WorkflowNodeExecutionPolicy;
  validateConfig?: (config?: NodeConfig) => void | never;
  getConfig?: (config?: NodeConfig) => Promise<PortSchema[]> | PortSchema[];
  getInputs?: (config?: NodeConfig) => PortSchema[];
  getOutputs?: (config?: NodeConfig) => PortSchema[];
  run: (args: {
    input: Record<string, any>;
    config?: NodeConfig;
    ctx: ExecutionContext;
    capabilities: WorkflowCapabilityResolver;
    emit: (event: string, payload?: any) => void;
    getPlugin: (id: string) => WorkflowPlugin | undefined;
  }) => Promise<Record<string, any>>;
};

export type WorkflowPlugin = {
  id: string;
  label: string;
  description?: string;
  isInstalled: (ctx: ExecutionContext) => Promise<boolean>;
  installHint?: string;
  prepare?: (ctx: ExecutionContext) => Promise<void>;
  capabilities?: string[];
  checkRequiredModels?: (ctx: ExecutionContext, nodeConfig: Record<string, any>) => Promise<MissingModel[]>;
};

export type NodeHandler = WorkflowNodeHandler;
export type Plugin = WorkflowPlugin;

export function defineNode<const T extends WorkflowNodeHandler>(handler: T): T {
  return handler;
}

export function definePlugin<const T extends WorkflowPlugin>(plugin: T): T {
  return plugin;
}

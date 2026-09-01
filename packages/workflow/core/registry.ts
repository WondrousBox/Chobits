import type { NodeHandler, Plugin } from '../types.js';

export interface WorkflowRegistryOptions {
  nodes?: Iterable<NodeHandler>;
  plugins?: Iterable<Plugin>;
}

export class WorkflowRegistry {
  private readonly nodeHandlers = new Map<string, NodeHandler>();
  private readonly plugins = new Map<string, Plugin>();

  constructor(options: WorkflowRegistryOptions = {}) {
    for (const plugin of options.plugins || []) this.registerPlugin(plugin);
    for (const handler of options.nodes || []) this.registerNode(handler);
  }

  registerNode(handler: NodeHandler): void {
    if (this.nodeHandlers.has(handler.spec.id)) throw new Error(`Node already registered: ${handler.spec.id}`);
    handler.validateConfig?.(handler.spec.config?.reduce((config, field) => ({ ...config, [field.key]: field.default }), {}));
    validateExecutionPolicy(handler);
    this.nodeHandlers.set(handler.spec.id, handler);
  }

  getNode(id: string): NodeHandler | undefined {
    return this.nodeHandlers.get(id);
  }

  listNodes(): NodeHandler[] {
    return [...this.nodeHandlers.values()];
  }

  registerPlugin(plugin: Plugin): void {
    if (this.plugins.has(plugin.id)) return;
    this.plugins.set(plugin.id, plugin);
  }

  getPlugin(id: string): Plugin | undefined {
    return this.plugins.get(id);
  }

  listPlugins(): Plugin[] {
    return [...this.plugins.values()];
  }
}

function validateExecutionPolicy(handler: NodeHandler): void {
  const policy = handler.execution;
  if (!policy) return;
  if (policy.timeoutMs !== undefined && (!Number.isFinite(policy.timeoutMs) || policy.timeoutMs <= 0)) {
    throw new Error(`Node timeout must be positive: ${handler.spec.id}`);
  }
  if (policy.group !== undefined && !policy.group.trim()) {
    throw new Error(`Node execution group is required: ${handler.spec.id}`);
  }
  if (!policy.retry) return;
  if (!Number.isInteger(policy.retry.maxAttempts) || policy.retry.maxAttempts < 1 || policy.retry.maxAttempts > 50) {
    throw new Error(`Node retry maxAttempts must be between 1 and 50: ${handler.spec.id}`);
  }
  if (policy.retry.maxAttempts > 1 && policy.idempotent !== true) {
    throw new Error(`Node retries require idempotent: ${handler.spec.id}`);
  }
  for (const value of [policy.retry.delayMs, policy.retry.maxDelayMs]) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new Error(`Node retry delay must be non-negative: ${handler.spec.id}`);
  }
  if (policy.retry.backoffMultiplier !== undefined && (!Number.isFinite(policy.retry.backoffMultiplier) || policy.retry.backoffMultiplier < 1)) {
    throw new Error(`Node retry backoffMultiplier must be at least 1: ${handler.spec.id}`);
  }
}

export function createWorkflowRegistry(options?: WorkflowRegistryOptions): WorkflowRegistry {
  return new WorkflowRegistry(options);
}

export const defaultWorkflowRegistry = createWorkflowRegistry();

export function registerNode(handler: NodeHandler): void {
  defaultWorkflowRegistry.registerNode(handler);
}

export function getNode(id: string): NodeHandler | undefined {
  return defaultWorkflowRegistry.getNode(id);
}

export function listNodes(): NodeHandler[] {
  return defaultWorkflowRegistry.listNodes();
}

export function registerPlugin(plugin: Plugin): void {
  defaultWorkflowRegistry.registerPlugin(plugin);
}

export function getPlugin(id: string): Plugin | undefined {
  return defaultWorkflowRegistry.getPlugin(id);
}

export function listPlugins(): Plugin[] {
  return defaultWorkflowRegistry.listPlugins();
}

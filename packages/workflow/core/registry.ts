import type { NodeHandler, Plugin } from '../types';

const nodeHandlers = new Map<string, NodeHandler>();
const plugins = new Map<string, Plugin>();

export function registerNode(handler: NodeHandler): void {
  if (nodeHandlers.has(handler.spec.id)) throw new Error(`Node already registered: ${handler.spec.id}`);
  handler.validateConfig?.(handler.spec.config?.reduce((config, field) => ({ ...config, [field.key]: field.default }), {}));
  nodeHandlers.set(handler.spec.id, handler);
}

export function getNode(id: string): NodeHandler | undefined {
  return nodeHandlers.get(id);
}

export function listNodes(): NodeHandler[] {
  return [...nodeHandlers.values()];
}

export function registerPlugin(plugin: Plugin): void {
  if (plugins.has(plugin.id)) return;
  plugins.set(plugin.id, plugin);
}

export function getPlugin(id: string): Plugin | undefined {
  return plugins.get(id);
}

export function listPlugins(): Plugin[] {
  return [...plugins.values()];
}

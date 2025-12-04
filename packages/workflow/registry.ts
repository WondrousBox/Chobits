// 节点和插件的注册器，负责在主进程中统一注册 / 获取节点和插件
// 不依赖任何其他模块

import { NodeHandler, Plugin } from './types';

const nodeHandlers = new Map<string, NodeHandler>();
const plugins = new Map<string, Plugin>();

export function registerNode(handler: NodeHandler): void {
  if (nodeHandlers.has(handler.spec.id)) throw new Error(`Node already registered: ${handler.spec.id}`);
  handler.validateConfig?.(handler.spec.config?.reduce((a, c) => ({ ...a, [c.key]: c.default }), {}));
  nodeHandlers.set(handler.spec.id, handler);
}

export function getNode(id: string): NodeHandler | undefined {
  return nodeHandlers.get(id);
}

export function listNodes(): NodeHandler[] {
  return [...nodeHandlers.values()];
}

export function registerPlugin(p: Plugin): void {
  if (plugins.has(p.id)) return; // idempotent
  plugins.set(p.id, p);
}

export function getPlugin(id: string): Plugin | undefined {
  return plugins.get(id);
}

export function listPlugins(): Plugin[] {
  return [...plugins.values()];
}

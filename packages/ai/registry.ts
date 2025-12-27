/**
 * AI 提供者和代理注册表
 *
 * 此模块提供了一个全局注册表，用于管理 AI 提供者适配器（ProviderAdapter）和代理定义（AgentDefinition）。
 * 提供者和代理可以通过注册函数添加到注册表中，并通过查询函数进行检索。
 */
import { AgentDefinition, ProviderAdapter } from './types';

/** 提供者适配器注册表，键为提供者 ID，值为提供者适配器实例 */
const providers = new Map<string, ProviderAdapter>();

/** 代理定义注册表，键为代理 ID，值为代理定义 */
const agents = new Map<string, AgentDefinition>();

/**
 * 注册一个提供者适配器
 * @param adapter - 要注册的提供者适配器实例
 */
export function registerProvider(adapter: ProviderAdapter): void {
  providers.set(adapter.id, adapter);
}

/**
 * 根据 ID 获取提供者适配器
 * @param id - 提供者 ID（可选）
 * @returns 如果提供了 ID 且存在对应的提供者，则返回该提供者适配器；否则返回 undefined
 */
export function getProvider(id?: string): ProviderAdapter | undefined {
  if (id) return providers.get(id);
  return undefined;
}

/**
 * 获取所有已注册的提供者适配器列表
 * @returns 所有已注册的提供者适配器数组
 */
export function listProviders(): ProviderAdapter[] {
  return Array.from(providers.values());
}

/**
 * 注册一个代理定义
 * @param agent - 要注册的代理定义
 */
export function registerAgent(agent: AgentDefinition): void {
  agents.set(agent.id, agent);
}

/**
 * 根据 ID 获取代理定义
 * @param id - 代理 ID（可选）
 * @returns 如果提供了 ID 且存在对应的代理，则返回该代理定义；否则返回 undefined
 */
export function getAgent(id?: string): AgentDefinition | undefined {
  if (id) return agents.get(id);
  return undefined;
}

/**
 * 获取所有已注册的代理定义列表
 * @returns 所有已注册的代理定义数组
 */
export function listAgents(): AgentDefinition[] {
  return Array.from(agents.values());
}

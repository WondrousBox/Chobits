/**
 * AI 提供者和代理注册表
 *
 * 此模块提供了一个全局注册表，用于管理 AI 提供者适配器（ProviderAdapter）和 Mastra Agent。
 * 提供者和代理可以通过注册函数添加到注册表中，并通过查询函数进行检索。
 */
import { Agent } from '@mastra/core/agent';

import { ProviderAdapter } from './types';

/** 提供者适配器注册表，键为提供者 ID，值为提供者适配器实例 */
const providers = new Map<string, ProviderAdapter>();

/** Mastra Agent 注册表，键为 Agent 名称，值为 Agent 实例 */
const agents = new Map<string, Agent>();

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
 * 注册一个 Mastra Agent
 * @param agent - 要注册的 Mastra Agent 实例
 */
export function registerAgent(agent: Agent): void {
  agents.set(agent.name, agent);
}

/**
 * 根据名称获取 Mastra Agent
 * @param id - Agent 名称（可选，默认返回 'assistant'）
 * @returns 如果存在对应的 Agent，则返回该 Agent 实例；否则返回 undefined
 */
export function getAgent(id?: string): Agent | undefined {
  if (id) return agents.get(id);
  return agents.get('assistant');
}

/**
 * 获取所有已注册的 Agent 列表
 * @returns 所有已注册的 Agent 信息数组
 */
export function listAgents(): Array<{ id: string; name: string; description?: string }> {
  return Array.from(agents.entries()).map(([id, agent]) => ({
    id,
    name: agent.name,
    description: (agent as any).instructions?.slice(0, 100),
  }));
}

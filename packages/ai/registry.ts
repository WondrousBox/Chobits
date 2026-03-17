/**
 * AI provider/profile registry
 *
 * This registry keeps:
 * - provider adapter instances
 * - lightweight agent/profile metadata for UI and routing
 */

import type { PiExecutionMode } from './runtime/pi/contracts';
import { listPiAgentProfiles } from './runtime/pi/profile-registry';
import { toCanonicalProviderId } from './providers/service';
import { ProviderAdapter } from './types';

/** 提供者适配器注册表，键为提供者 ID，值为提供者适配器实例 */
const providers = new Map<string, ProviderAdapter>();

export interface AgentProfileDescriptor {
  id: string;
  label: string;
  description?: string;
  executionMode?: PiExecutionMode;
  supportsToolCalls?: boolean;
}

/** Agent/profile 注册表，键为 profile ID，值为轻量描述信息 */
const agentProfiles = new Map<string, AgentProfileDescriptor>();

function ensureDefaultAgentProfiles(): void {
  if (agentProfiles.size > 0) return;

  for (const profile of listPiAgentProfiles()) {
    agentProfiles.set(profile.id, {
      id: profile.id,
      label: profile.label,
      description: profile.description,
      executionMode: profile.executionMode,
      supportsToolCalls: profile.supportsToolCalls
    });
  }
}

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
  if (id) {
    const exact = providers.get(id);
    if (exact) return exact;
    return providers.get(toCanonicalProviderId(id));
  }
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
 * 注册一个 Agent/Profile 元数据
 */
export function registerAgentProfile(profile: AgentProfileDescriptor): void {
  ensureDefaultAgentProfiles();
  agentProfiles.set(profile.id, profile);
}

/**
 * 根据 ID 获取 Agent/Profile 描述信息
 */
export function getAgentProfile(id?: string): AgentProfileDescriptor | undefined {
  ensureDefaultAgentProfiles();
  if (id) return agentProfiles.get(id);
  return agentProfiles.get('assistant');
}

/**
 * 获取所有可见 Agent/Profile 列表
 */
export function listAgents(): AgentProfileDescriptor[] {
  ensureDefaultAgentProfiles();
  return Array.from(agentProfiles.values());
}

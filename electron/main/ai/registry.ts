import { ProviderAdapter, AgentDefinition } from './types';

const providers = new Map<string, ProviderAdapter>();
const agents = new Map<string, AgentDefinition>();

export function registerProvider(adapter: ProviderAdapter) {
  providers.set(adapter.id, adapter);
}

export function getProvider(id?: string): ProviderAdapter | undefined {
  if (id) return providers.get(id);
  // return first
  for (const p of providers.values()) return p;
  return undefined;
}

export function listProviders(): ProviderAdapter[] {
  return Array.from(providers.values());
}

export function registerAgent(agent: AgentDefinition) {
  agents.set(agent.id, agent);
}

export function getAgent(id?: string): AgentDefinition | undefined {
  if (id) return agents.get(id);
  for (const a of agents.values()) return a;
  return undefined;
}

export function listAgents(): AgentDefinition[] {
  return Array.from(agents.values());
}

import { DEFAULT_SPRITE_CAPABILITY_REGISTRY, type SpriteCapabilityResolutionContext, type SpriteCapabilitySnapshot, type SpriteCapabilityState } from './capability-registry';

export interface SpriteCapabilityRuntimeResolver {
  resolveContext: () => SpriteCapabilityResolutionContext;
}

let runtimeResolver: SpriteCapabilityRuntimeResolver | null = null;

export function initSpriteCapabilityRuntime(resolver: SpriteCapabilityRuntimeResolver): void {
  runtimeResolver = resolver;
}

export function resetSpriteCapabilityRuntime(): void {
  runtimeResolver = null;
}

export function hasSpriteCapabilityRuntime(): boolean {
  return runtimeResolver !== null;
}

export function getSpriteCapabilitySnapshot(): SpriteCapabilitySnapshot | null {
  if (!runtimeResolver) return null;
  return DEFAULT_SPRITE_CAPABILITY_REGISTRY.resolveSnapshot(runtimeResolver.resolveContext());
}

export function getSpriteCapabilityRuntimeState(capabilityId: string): SpriteCapabilityState | null {
  return getSpriteCapabilitySnapshot()?.capabilities[capabilityId] ?? null;
}

function requireSpriteCapabilityState(capabilityId: string): SpriteCapabilityState {
  if (!runtimeResolver) {
    throw new Error(`Sprite capability runtime unavailable: ${capabilityId}`);
  }

  const capability = DEFAULT_SPRITE_CAPABILITY_REGISTRY.resolveSnapshot(runtimeResolver.resolveContext()).capabilities[capabilityId];
  if (!capability) {
    throw new Error(`Unknown sprite capability: ${capabilityId}`);
  }

  return capability;
}

export function assertSpriteCapabilityUnlocked(capabilityId: string): SpriteCapabilityState {
  const capability = requireSpriteCapabilityState(capabilityId);

  if (capability.status === 'locked') {
    throw new Error(`Sprite capability locked: ${capabilityId}`);
  }

  return capability;
}

export function assertSpriteCapabilityActive(capabilityId: string): SpriteCapabilityState {
  const capability = assertSpriteCapabilityUnlocked(capabilityId);

  if (!capability.active) {
    throw new Error(`Sprite capability inactive: ${capabilityId}`);
  }

  return capability;
}

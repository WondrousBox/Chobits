import type { SpriteCapabilitySnapshot, SpriteCapabilityState } from '@packages/sprite-core/capability-registry';
import { DEFAULT_SPRITE_CAPABILITY_DEFINITIONS } from '@packages/sprite-core/capability-registry';

const capabilityNameMap = new Map(DEFAULT_SPRITE_CAPABILITY_DEFINITIONS.map((definition) => [definition.id, definition.name]));

export interface SpriteCapabilityGuardOptions {
  capability?: SpriteCapabilityState | null;
  onBlocked?: (capability: SpriteCapabilityState) => void;
  afterChange?: () => unknown | Promise<unknown>;
}

export function getSpriteCapabilityState(snapshot: SpriteCapabilitySnapshot | null | undefined, capabilityId: string): SpriteCapabilityState | null {
  return snapshot?.capabilities[capabilityId] ?? null;
}

export function getFirstLockedSpriteCapability(snapshot: SpriteCapabilitySnapshot | null | undefined, capabilityIds: string[]): SpriteCapabilityState | null {
  for (const capabilityId of capabilityIds) {
    const capability = getSpriteCapabilityState(snapshot, capabilityId);
    if (capability?.status === 'locked') {
      return capability;
    }
  }
  return null;
}

export function getSpriteCapabilityLockedReason(capability?: SpriteCapabilityState | null): string {
  if (!capability || capability.status !== 'locked') return '';

  if (capability.inactivePrerequisites.length > 0) {
    const prerequisiteNames = capability.inactivePrerequisites.map((id) => capabilityNameMap.get(id) ?? id);
    return `需要先启用前置能力：${prerequisiteNames.join('、')}`;
  }

  if (capability.missingPrerequisites.length > 0) {
    const prerequisiteNames = capability.missingPrerequisites.map((id) => capabilityNameMap.get(id) ?? id);
    return `需要先解锁前置能力：${prerequisiteNames.join('、')}`;
  }

  if (capability.missingFeatureFlags.length > 0) {
    return '当前版本尚未开放此能力';
  }

  return '当前尚未解锁此能力';
}

export function ensureSpriteCapabilityAccessible(
  capability: SpriteCapabilityState | null | undefined,
  onBlocked?: (capability: SpriteCapabilityState) => void
): capability is SpriteCapabilityState | null {
  if (capability?.status === 'locked') {
    onBlocked?.(capability);
    return false;
  }

  return true;
}

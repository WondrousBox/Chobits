import type { SpriteCapabilitySnapshot, SpriteCapabilityState } from '@packages/sprite-core/capability-registry';
import { DEFAULT_SPRITE_CAPABILITY_DEFINITIONS } from '@packages/sprite-core/capability-registry';
import { TbLock } from 'react-icons/tb';

import { cn } from '@/lib/utils';

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

  if (!capability.meetsLevelRequirement && capability.requiredLevel) {
    return `需要精灵达到 Lv.${capability.requiredLevel}`;
  }

  if (capability.inactivePrerequisites.length > 0) {
    const prerequisiteNames = capability.inactivePrerequisites.map((id) => capabilityNameMap.get(id) ?? id);
    return `需要先启用前置能力：${prerequisiteNames.join('、')}`;
  }

  if (capability.missingPrerequisites.length > 0) {
    const prerequisiteNames = capability.missingPrerequisites.map((id) => capabilityNameMap.get(id) ?? id);
    return `需要先解锁前置能力：${prerequisiteNames.join('、')}`;
  }

  if (capability.missingAchievements.length > 0) {
    return `需要先完成成就：${capability.missingAchievements.join('、')}`;
  }

  if (capability.missingFeatureFlags.length > 0) {
    return '当前版本尚未开放此能力';
  }

  if (capability.missingPersonaFlags.length > 0) {
    return '当前人格条件尚未满足';
  }

  return '当前尚未解锁此能力';
}

export function ensureSpriteCapabilityAccessible(capability: SpriteCapabilityState | null | undefined, onBlocked?: (capability: SpriteCapabilityState) => void): capability is SpriteCapabilityState | null {
  if (capability?.status === 'locked') {
    onBlocked?.(capability);
    return false;
  }

  return true;
}

export const SpriteCapabilityLockedNotice: React.FC<{
  capability?: SpriteCapabilityState | null;
  hint?: string;
  className?: string;
}> = ({ capability, hint = '请先在技能树中解锁该能力后再使用。', className }) => {
  if (!capability || capability.status !== 'locked') return null;

  return (
    <div className={cn('rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-4 text-amber-100', className)}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20 text-amber-300">
          <TbLock className="h-4 w-4" />
        </div>
        <div className="space-y-1">
          <div className="text-sm font-medium text-amber-200">{capability.name} 尚未解锁</div>
          <div className="text-xs text-amber-100/90">{getSpriteCapabilityLockedReason(capability)}</div>
          <div className="text-xs text-amber-100/70">{hint}</div>
        </div>
      </div>
    </div>
  );
};

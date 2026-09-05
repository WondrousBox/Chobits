import type { SpriteCapabilitySnapshot, SpriteCapabilityState } from '@packages/sprite-core/capability-registry';
import { DEFAULT_SPRITE_CAPABILITY_DEFINITIONS } from '@packages/sprite-core/capability-registry';
import type { TFunction } from 'i18next';

const capabilityNameMap = new Map(DEFAULT_SPRITE_CAPABILITY_DEFINITIONS.map((definition) => [definition.id, definition.name]));

export interface SpriteCapabilityGuardOptions {
  capability?: SpriteCapabilityState | null;
  onBlocked?: (capability: SpriteCapabilityState) => void;
  afterChange?: () => unknown | Promise<unknown>;
}

export function getSpriteCapabilityState(snapshot: SpriteCapabilitySnapshot | null | undefined, capabilityId: string): SpriteCapabilityState | null {
  return snapshot?.capabilities[capabilityId] ?? null;
}

/**
 * 生成能力锁定原因文案。传入 t 时按界面语言输出（speech:capability.*），
 * 否则回退内置中文（供测试与非渲染场景使用）。
 */
export function getSpriteCapabilityLockedReason(capability?: SpriteCapabilityState | null, t?: TFunction): string {
  if (!capability || capability.status !== 'locked') return '';

  const resolveNames = (ids: string[]): string => {
    const separator = t ? t('speech:capability.nameListSeparator') : '、';
    return ids.map((id) => (t ? t(`speech:capability.${id}`, { defaultValue: capabilityNameMap.get(id) ?? id }) : (capabilityNameMap.get(id) ?? id))).join(separator);
  };

  if (capability.inactivePrerequisites.length > 0) {
    const names = resolveNames(capability.inactivePrerequisites);
    return t ? t('speech:capability.lockedEnablePrerequisites', { names }) : `需要先启用前置能力：${names}`;
  }

  if (capability.missingPrerequisites.length > 0) {
    const names = resolveNames(capability.missingPrerequisites);
    return t ? t('speech:capability.lockedUnlockPrerequisites', { names }) : `需要先解锁前置能力：${names}`;
  }

  if (capability.missingFeatureFlags.length > 0) {
    return t ? t('speech:capability.lockedNotOpen') : '当前版本尚未开放此能力';
  }

  return t ? t('speech:capability.lockedGeneric') : '当前尚未解锁此能力';
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

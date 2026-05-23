import { useEffect, useState } from 'react';

import type { SpriteCapabilityState } from '@packages/sprite-core/capability-registry';

import { ensureSpriteCapabilityAccessible, type SpriteCapabilityGuardOptions } from '@/features/sprite-assistant/capability-ui';

import { getSpriteAutoWalkEnabled, setSpriteAutoWalkEnabled, subscribeSpriteAutoWalkEnabled } from './auto-walk-bridge';

export function useMovementSettings(options?: SpriteCapabilityGuardOptions): {
  enabled: boolean;
  loading: boolean;
  capability: SpriteCapabilityState | null;
  handleToggle: (checked: boolean) => Promise<void>;
} {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const isEnabled = await getSpriteAutoWalkEnabled();
        if (!cancelled) {
          setEnabled(isEnabled);
          setLoading(false);
        }
      } catch (error) {
        console.warn('加载自动移动开关失败:', error);
        setLoading(false);
      }
    })();

    const unsubscribe = subscribeSpriteAutoWalkEnabled((isEnabled) => {
      if (!cancelled) {
        setEnabled(isEnabled);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const handleToggle = async (checked: boolean): Promise<void> => {
    if (checked && !ensureSpriteCapabilityAccessible(options?.capability, options?.onBlocked)) {
      return;
    }
    try {
      await setSpriteAutoWalkEnabled(checked);
      setEnabled(checked);
      await options?.afterChange?.();
    } catch (error) {
      console.error('设置自动移动开关失败:', error);
    }
  };

  return { enabled, loading, capability: options?.capability ?? null, handleToggle };
}

export type MovementSettingsState = ReturnType<typeof useMovementSettings>;

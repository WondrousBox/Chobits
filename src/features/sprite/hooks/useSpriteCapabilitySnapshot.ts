import type { SpriteCapabilitySnapshot } from '@packages/sprite-core/capability-registry';
import { useCallback, useEffect, useState } from 'react';

export function useSpriteCapabilitySnapshot(options?: { enabled?: boolean }): {
  snapshot: SpriteCapabilitySnapshot | null;
  isLoading: boolean;
  refresh: () => Promise<SpriteCapabilitySnapshot | null>;
} {
  const enabled = options?.enabled ?? true;
  const [snapshot, setSnapshot] = useState<SpriteCapabilitySnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);

  const refresh = useCallback(async (): Promise<SpriteCapabilitySnapshot | null> => {
    if (!enabled) return null;

    try {
      const nextSnapshot = await window.chobits.character.getCapabilitySnapshot();
      setSnapshot(nextSnapshot);
      return nextSnapshot;
    } catch (error) {
      console.warn('加载 capability snapshot 失败:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 能力快照关闭时重置 loading 状态,有意为之
      setIsLoading(false);
      return;
    }

    void refresh();

    const unsubscribeCharacterState = window.chobits.character.onStateChanged(() => {
      void refresh();
    });
    const unsubscribeCapability = window.chobits.character.onCapabilityChanged(() => {
      void refresh();
    });

    const handleWindowFocus = (): void => {
      void refresh();
    };

    window.addEventListener('focus', handleWindowFocus);

    return () => {
      unsubscribeCharacterState();
      unsubscribeCapability();
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [enabled, refresh]);

  return { snapshot, isLoading, refresh };
}

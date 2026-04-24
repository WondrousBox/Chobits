import type { SpriteCapabilitySnapshot } from '@packages/sprite-core/capability-registry';
import { useCallback, useEffect, useState } from 'react';

export function useSpriteCapabilitySnapshot(options?: { enabled?: boolean }): {
  snapshot: SpriteCapabilitySnapshot | null;
  loading: boolean;
  refresh: () => Promise<SpriteCapabilitySnapshot | null>;
} {
  const enabled = options?.enabled ?? true;
  const [snapshot, setSnapshot] = useState<SpriteCapabilitySnapshot | null>(null);
  const [loading, setLoading] = useState(enabled);

  const refresh = useCallback(async (): Promise<SpriteCapabilitySnapshot | null> => {
    if (!enabled) return null;

    try {
      const nextSnapshot = await window.YUA.persona.getCapabilitySnapshot();
      setSnapshot(nextSnapshot);
      return nextSnapshot;
    } catch (error) {
      console.warn('加载 capability snapshot 失败:', error);
      return null;
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    void refresh();

    const unsubscribePersona = window.YUA.persona.onStateChanged(() => {
      void refresh();
    });
    const unsubscribeCapability = window.YUA.persona.onCapabilityChanged(() => {
      void refresh();
    });

    const handleWindowFocus = (): void => {
      void refresh();
    };

    window.addEventListener('focus', handleWindowFocus);

    return () => {
      unsubscribePersona();
      unsubscribeCapability();
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [enabled, refresh]);

  return { snapshot, loading, refresh };
}

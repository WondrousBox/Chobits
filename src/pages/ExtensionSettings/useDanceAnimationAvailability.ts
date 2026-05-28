import { useCallback, useEffect, useState } from 'react';

export const DEFAULT_DANCE_TRIGGER = 'music:dance';
export const FALLBACK_DANCE_TRIGGER = 'dance';

export interface DanceAnimationAvailability {
  fallbackCount: number;
  primaryCount: number;
}

export function getDanceAnimationFallbackTrigger(danceTrigger: string): string | null {
  return danceTrigger === DEFAULT_DANCE_TRIGGER ? FALLBACK_DANCE_TRIGGER : null;
}

export function useDanceAnimationAvailability(danceTrigger: string): {
  availability: DanceAnimationAvailability | null;
  loading: boolean;
  refresh: (trigger?: string) => Promise<void>;
} {
  const [availability, setAvailability] = useState<DanceAnimationAvailability | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(
    async (trigger = danceTrigger): Promise<void> => {
      const normalizedTrigger = trigger.trim();
      if (!normalizedTrigger) {
        setAvailability({ primaryCount: 0, fallbackCount: 0 });
        return;
      }
      setLoading(true);
      try {
        const [primaryItems, fallbackItems] = await Promise.all([
          window.YUA.sprite.listByTrigger(normalizedTrigger),
          normalizedTrigger === DEFAULT_DANCE_TRIGGER ? window.YUA.sprite.listByTrigger(FALLBACK_DANCE_TRIGGER) : Promise.resolve([])
        ]);
        setAvailability({
          primaryCount: primaryItems.length,
          fallbackCount: fallbackItems.length
        });
      } catch (error) {
        console.warn('[DanceAnimationSettings] failed to load dance trigger animations:', error);
        setAvailability(null);
      } finally {
        setLoading(false);
      }
    },
    [danceTrigger]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh(danceTrigger);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [danceTrigger, refresh]);

  return { availability, loading, refresh };
}

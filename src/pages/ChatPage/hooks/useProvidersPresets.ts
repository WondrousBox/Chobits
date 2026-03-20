import { useCallback, useEffect, useMemo, useState } from 'react';

export type ProviderRow = {
  id: string;
  aliases?: string[];
  label: string;
  configured?: boolean;
  capabilities?: Record<string, boolean>;
  defaultModels?: Record<string, string | undefined>;
  schema?: { icon?: string; locales?: Record<string, any> };
};

export type PresetRow = {
  id: string;
  providerId: string;
  name?: string;
};

export interface UseProvidersPresetsResult {
  providers: ProviderRow[];
  presetsMap: Record<string, PresetRow[]>;
  loading: boolean;
  error?: string;
  refresh: () => Promise<void>;
  getPresets: (providerId: string) => PresetRow[];
}

/**
 * Generic hook to load AI providers and their presets.
 * - Fetches providers on mount
 * - Fetches presets for each provider when providers change
 * - Provides a simple alphabetical ordering by preset name/id
 */
export function useProvidersPresets(): UseProvidersPresetsResult {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [presetsMap, setPresetsMap] = useState<Record<string, PresetRow[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const provs = await window.YUA?.ai?.getProviders?.();
      setProviders(Array.isArray(provs) ? provs : []);
    } catch (e: any) {
      setError(e?.message || '加载服务商失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleFocus = (): void => {
      void refresh();
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;

    const loadPresets = async (): Promise<void> => {
      if (!providers.length) {
        setPresetsMap({});
        return;
      }

      const listPresets = window.YUA?.ai?.listPresets;
      if (!listPresets) {
        setPresetsMap({});
        return;
      }

      try {
        const entries = await Promise.all(
          providers.map(async (p) => {
            try {
              const list = await listPresets(p.id);
              return [p.id, Array.isArray(list) ? list : []] as const;
            } catch {
              return [p.id, []] as const;
            }
          })
        );

        if (!cancelled) {
          setPresetsMap(Object.fromEntries(entries));
        }
      } catch {
        // ignore
      }
    };

    void loadPresets();

    return () => {
      cancelled = true;
    };
  }, [providers]);

  const getPresets = useCallback(
    (providerId: string) => {
      const list = (presetsMap[providerId] || []).slice();
      return list.sort((a, b) => {
        const an = (a.name || a.id || '').toString();
        const bn = (b.name || b.id || '').toString();
        return an.localeCompare(bn);
      });
    },
    [presetsMap]
  );

  return useMemo(() => ({ providers, presetsMap, loading, error, refresh, getPresets }), [providers, presetsMap, loading, error, refresh, getPresets]);
}
export default useProvidersPresets;

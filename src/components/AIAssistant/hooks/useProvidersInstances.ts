import { useEffect, useMemo, useState } from 'react';

export type ProviderRow = {
  id: string;
  label: string;
  configured?: boolean;
  schema?: { icon?: string; locales?: Record<string, any> };
};

export type InstanceRow = {
  id: string;
  providerId: string;
  name?: string;
  model?: string;
};

export interface UseProvidersInstancesResult {
  providers: ProviderRow[];
  instancesMap: Record<string, InstanceRow[]>;
  loading: boolean;
  error?: string;
  refresh: () => Promise<void>;
  getInstances: (providerId: string) => InstanceRow[];
}

/**
 * Generic hook to load AI providers and their instances.
 * - Fetches providers on mount
 * - Fetches instances for each provider when providers change
 * - Provides a simple alphabetical ordering by instance name/id
 */
export function useProvidersInstances(): UseProvidersInstancesResult {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [instancesMap, setInstancesMap] = useState<Record<string, InstanceRow[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const refresh = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const provs = await (window as any).YUA?.ai?.getProviders?.();
      setProviders(Array.isArray(provs) ? provs : []);
    } catch (e: any) {
      setError(e?.message || '加载服务商失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    (async () => {
      if (!providers.length) {
        setInstancesMap({});
        return;
      }
      try {
        const entries = await Promise.all(
          providers.map(async (p) => {
            try {
              const list = await (window as any).YUA?.ai?.listInstances?.(p.id);
              return [p.id, Array.isArray(list) ? list : []] as const;
            } catch {
              return [p.id, []] as const;
            }
          })
        );
        setInstancesMap(Object.fromEntries(entries));
      } catch {
        // ignore
      }
    })();
  }, [providers]);

  const getInstances = (providerId: string) => {
    const list = (instancesMap[providerId] || []).slice();
    return list.sort((a, b) => {
      const an = (a.name || a.id || '').toString();
      const bn = (b.name || b.id || '').toString();
      return an.localeCompare(bn);
    });
  };

  return useMemo(() => ({ providers, instancesMap, loading, error, refresh, getInstances }), [providers, instancesMap, loading, error]);
}

export default useProvidersInstances;

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useProvidersPresets } from '../hooks/useProvidersPresets';

type Provider = any;
type Agent = any;
type Preset = any;

export interface ChatSelectionContextValue {
  providers: Provider[];
  agents: Agent[];
  presetsMap: Record<string, Preset[]>;
  providerId: string;
  presetId: string;
  agentId: string;
  setProviderId: (id: string) => void;
  setPresetId: (id: string) => void;
  setAgentId: (id: string) => void;
  refresh: () => Promise<void>;
  getOrderedPresets: (providerId: string) => Preset[];
}

const ChatSelectionContext = createContext<ChatSelectionContextValue | null>(null);

const LS_KEYS = {
  providerId: 'chat.sel.providerId',
  presetId: 'chat.sel.presetId',
  agentId: 'chat.sel.agentId',
  recents: 'chat.sel.recents'
};

export function ChatSelectionProvider({ children }: { children: React.ReactNode }): JSX.Element {
  // Providers & presets come from the shared hook
  const { providers, presetsMap, refresh: refreshProviders } = useProvidersPresets();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [providerId, setProviderId] = useState<string>(() => localStorage.getItem(LS_KEYS.providerId) || 'openai');
  const [presetId, setPresetId] = useState<string>(() => localStorage.getItem(LS_KEYS.presetId) || '');
  const [agentId, setAgentId] = useState<string>(() => localStorage.getItem(LS_KEYS.agentId) || 'basic');
  const [recents, setRecents] = useState<Record<string, string[]>>(() => {
    try {
      const raw = localStorage.getItem(LS_KEYS.recents);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  // Persist selections
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEYS.providerId, providerId);
    } catch {
      /* noop */
    }
  }, [providerId]);
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEYS.presetId, presetId);
    } catch {
      /* noop */
    }
  }, [presetId]);
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEYS.agentId, agentId);
    } catch {
      /* noop */
    }
  }, [agentId]);
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEYS.recents, JSON.stringify(recents));
    } catch {
      /* noop */
    }
  }, [recents]);

  const refresh = useCallback(async () => {
    try {
      await refreshProviders();
    } catch {
      /* noop */
    }
    try {
      setAgents(await window.YUA.ai.getAgents());
    } catch {
      /* noop */
    }
  }, [refreshProviders]);

  // Initial fetch
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [refresh]);

  // Ensure current providerId exists; fall back to first provider
  useEffect(() => {
    if (!providers?.length) return;
    if (providers.some((p: any) => p.id === providerId)) return;

    const nextProviderId = providers[0].id;
    const timer = window.setTimeout(() => {
      setProviderId(nextProviderId);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [providers, providerId]);

  // Order presets by recent usage per provider
  const getOrderedPresets = useCallback(
    (pid: string): Preset[] => {
      const list = (presetsMap[pid] || []).slice();
      const rec = recents[pid] || [];
      if (!list.length) return list;
      const recIndex: Record<string, number> = {};
      rec.forEach((id, i) => {
        recIndex[id] = i;
      });
      return list.sort((a: any, b: any) => {
        const ai = recIndex[a.id];
        const bi = recIndex[b.id];
        const aIn = ai !== undefined;
        const bIn = bi !== undefined;
        if (aIn && bIn) return ai - bi;
        if (aIn) return -1;
        if (bIn) return 1;
        const an = (a.name || a.id || '').toString();
        const bn = (b.name || b.id || '').toString();
        return an.localeCompare(bn);
      });
    },
    [presetsMap, recents]
  );

  // Keep preset selection valid for the current provider and auto-pick the first available one.
  useEffect(() => {
    if (!providerId) return;
    const ordered = getOrderedPresets(providerId);
    if (!ordered.length) {
      if (!presetId) return;
      const timer = window.setTimeout(() => {
        setPresetId('');
      }, 0);
      return () => window.clearTimeout(timer);
    }

    if (presetId && ordered.some((item: any) => item.id === presetId)) {
      return;
    }

    const nextPresetId = (ordered[0] as any).id;
    const timer = window.setTimeout(() => {
      setPresetId(nextPresetId);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [getOrderedPresets, providerId, presetId]);

  // Ensure agentId is valid; if not, pick first
  useEffect(() => {
    if (!agents?.length) return;
    if (agents.some((a: any) => a.id === agentId)) return;

    const nextAgentId = (agents[0] as any).id;
    const timer = window.setTimeout(() => {
      setAgentId(nextAgentId);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [agents, agentId]);

  // Track recents when user selects a preset
  useEffect(() => {
    if (!providerId || !presetId) return;
    const timer = window.setTimeout(() => {
      setRecents((prev) => {
        const cur = prev[providerId] || [];
        const next = [presetId, ...cur.filter((id) => id !== presetId)].slice(0, 10);
        if (cur.length === next.length && cur.every((v, i) => v === next[i])) return prev;
        return { ...prev, [providerId]: next };
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [providerId, presetId]);

  const value = useMemo<ChatSelectionContextValue>(
    () => ({
      providers,
      agents,
      presetsMap,
      providerId,
      presetId,
      agentId,
      setProviderId,
      setPresetId,
      setAgentId,
      refresh,
      getOrderedPresets
    }),
    [providers, agents, presetsMap, providerId, presetId, agentId, refresh, getOrderedPresets]
  );

  return <ChatSelectionContext.Provider value={value}>{children}</ChatSelectionContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useChatSelection(): ChatSelectionContextValue {
  const ctx = useContext(ChatSelectionContext);
  if (!ctx) throw new Error('useChatSelection must be used within ChatSelectionProvider');
  return ctx;
}

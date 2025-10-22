import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useProvidersInstances } from '@/components/AIAssistant/hooks/useProvidersInstances';

type Provider = any;
type Agent = any;
type Instance = any;

export interface ChatSelectionContextValue {
  providers: Provider[];
  agents: Agent[];
  instancesMap: Record<string, Instance[]>;
  providerId: string;
  instanceId: string;
  agentId: string;
  setProviderId: (id: string) => void;
  setInstanceId: (id: string) => void;
  setAgentId: (id: string) => void;
  refresh: () => Promise<void>;
  getOrderedInstances: (providerId: string) => Instance[];
}

const ChatSelectionContext = createContext<ChatSelectionContextValue | null>(null);

const LS_KEYS = {
  providerId: 'chat.sel.providerId',
  instanceId: 'chat.sel.instanceId',
  agentId: 'chat.sel.agentId',
  recents: 'chat.sel.recents',
};

export function ChatSelectionProvider({ children }: { children: React.ReactNode }) {
  // Providers & instances come from shared hook
  const { providers, instancesMap, refresh: refreshProviders } = useProvidersInstances();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [providerId, setProviderId] = useState<string>(() => localStorage.getItem(LS_KEYS.providerId) || 'openai');
  const [instanceId, setInstanceId] = useState<string>(() => localStorage.getItem(LS_KEYS.instanceId) || '');
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
  useEffect(() => { try { localStorage.setItem(LS_KEYS.providerId, providerId); } catch {/* noop */} }, [providerId]);
  useEffect(() => { try { localStorage.setItem(LS_KEYS.instanceId, instanceId); } catch {/* noop */} }, [instanceId]);
  useEffect(() => { try { localStorage.setItem(LS_KEYS.agentId, agentId); } catch {/* noop */} }, [agentId]);
  useEffect(() => { try { localStorage.setItem(LS_KEYS.recents, JSON.stringify(recents)); } catch {/* noop */} }, [recents]);

  const refresh = async () => {
    try { await refreshProviders(); } catch { /* noop */ }
    try { setAgents(await (window as any).YUA.ai.getAgents()); } catch { /* noop */ }
  };

  // Initial fetch
  useEffect(() => { refresh(); }, []);

  // instancesMap is now provided by useProvidersInstances

  // Ensure current providerId exists; fall back to first provider
  useEffect(() => {
    if (!providers?.length) return;
    if (!providers.some((p: any) => p.id === providerId)) {
      setProviderId(providers[0].id);
    }
  }, [providers]);

  // Order instances by recent usage per provider
  const getOrderedInstances = (pid: string): Instance[] => {
    const list = (instancesMap[pid] || []).slice();
    const rec = recents[pid] || [];
    if (!list.length) return list;
    const recIndex: Record<string, number> = {};
    rec.forEach((id, i) => { recIndex[id] = i; });
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
  };

  // If no instance selected for current provider, auto-select first available (ordered)
  useEffect(() => {
    if (!providerId) return;
    if (instanceId) return;
    const ordered = getOrderedInstances(providerId);
    if (ordered.length) setInstanceId((ordered[0] as any).id);
  }, [instancesMap, providerId]);

  // Ensure agentId is valid; if not, pick first
  useEffect(() => {
    if (!agents?.length) return;
    if (!agents.some((a: any) => a.id === agentId)) {
      setAgentId((agents[0] as any).id);
    }
  }, [agents]);

  // Track recents when user selects an instance
  useEffect(() => {
    if (!providerId || !instanceId) return;
    setRecents(prev => {
      const cur = prev[providerId] || [];
      const next = [instanceId, ...cur.filter(id => id !== instanceId)].slice(0, 10);
      if (cur.length === next.length && cur.every((v, i) => v === next[i])) return prev;
      return { ...prev, [providerId]: next };
    });
  }, [providerId, instanceId]);

  const value = useMemo<ChatSelectionContextValue>(() => ({
    providers,
    agents,
    instancesMap,
    providerId,
    instanceId,
    agentId,
    setProviderId,
    setInstanceId,
    setAgentId,
    refresh,
    getOrderedInstances,
  }), [providers, agents, instancesMap, providerId, instanceId, agentId, recents]);

  return (
    <ChatSelectionContext.Provider value={value}>
      {children}
    </ChatSelectionContext.Provider>
  );
}

export function useChatSelection(): ChatSelectionContextValue {
  const ctx = useContext(ChatSelectionContext);
  if (!ctx) throw new Error('useChatSelection must be used within ChatSelectionProvider');
  return ctx;
}

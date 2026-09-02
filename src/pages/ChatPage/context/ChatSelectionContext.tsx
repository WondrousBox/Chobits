import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type Provider = any;
type Agent = any;

export interface ChatSelectionContextValue {
  agents: Agent[];
  providerId: string;
  modelId: string;
  presetId: string;
  agentId: string;
  codingWorkspaceRoot: string;
  codingWorkspaceLabel: string;
  webSearchEnabled: boolean;
  characterPromptEnabled: boolean;
  setProviderId: (id: string) => void;
  setModelId: (id: string) => void;
  setPresetId: (id: string) => void;
  setAgentId: (id: string) => void;
  setCodingWorkspace: (workspace: { root: string; label?: string } | null) => void;
  setWebSearchEnabled: (enabled: boolean) => void;
  setCharacterPromptEnabled: (enabled: boolean) => void;
  refresh: () => Promise<void>;
}

const ChatSelectionContext = createContext<ChatSelectionContextValue | null>(null);

const LS_KEYS = {
  providerId: 'chat.sel.providerId',
  modelId: 'chat.sel.modelId',
  presetId: 'chat.sel.presetId',
  agentId: 'chat.sel.agentId',
  codingWorkspaceRoot: 'chat.sel.codingWorkspaceRoot',
  codingWorkspaceLabel: 'chat.sel.codingWorkspaceLabel',
  webSearchEnabled: 'chat.sel.webSearchEnabled',
  characterPromptEnabled: 'chat.sel.characterPromptEnabled'
};

// 对话默认使用自托管 vLLM（无本地存储记录时的兜底，以及历史默认值迁移目标）
const DEFAULT_CHAT_PROVIDER_ID = 'vllm';
const LS_MIGRATION_SELF_HOSTED_KEY = 'chat.sel.migratedSelfHosted';

export function ChatSelectionProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [providerId, setProviderIdState] = useState<string>(() => localStorage.getItem(LS_KEYS.providerId) || DEFAULT_CHAT_PROVIDER_ID);
  const [modelId, setModelId] = useState<string>(() => localStorage.getItem(LS_KEYS.modelId) || '');
  const [presetId, setPresetIdState] = useState<string>(() => localStorage.getItem(LS_KEYS.presetId) || '');
  const [agentId, setAgentId] = useState<string>(() => localStorage.getItem(LS_KEYS.agentId) || 'assistant');
  const [codingWorkspaceRoot, setCodingWorkspaceRootState] = useState<string>(() => localStorage.getItem(LS_KEYS.codingWorkspaceRoot) || '');
  const [codingWorkspaceLabel, setCodingWorkspaceLabelState] = useState<string>(() => localStorage.getItem(LS_KEYS.codingWorkspaceLabel) || '');
  const [webSearchEnabled, setWebSearchEnabledState] = useState<boolean>(() => localStorage.getItem(LS_KEYS.webSearchEnabled) === 'true');
  const [characterPromptEnabled, setCharacterPromptEnabledState] = useState<boolean>(() => localStorage.getItem(LS_KEYS.characterPromptEnabled) === 'true');

  // Persist selections
  useEffect(() => {
    try {
      if (providerId) {
        localStorage.setItem(LS_KEYS.providerId, providerId);
      } else {
        localStorage.removeItem(LS_KEYS.providerId);
      }
    } catch {
      /* noop */
    }
  }, [providerId]);
  useEffect(() => {
    try {
      if (modelId) {
        localStorage.setItem(LS_KEYS.modelId, modelId);
      } else {
        localStorage.removeItem(LS_KEYS.modelId);
      }
    } catch {
      /* noop */
    }
  }, [modelId]);
  useEffect(() => {
    try {
      if (presetId) {
        localStorage.setItem(LS_KEYS.presetId, presetId);
      } else {
        localStorage.removeItem(LS_KEYS.presetId);
      }
    } catch {
      /* noop */
    }
  }, [presetId]);
  useEffect(() => {
    try {
      if (agentId) {
        localStorage.setItem(LS_KEYS.agentId, agentId);
      } else {
        localStorage.removeItem(LS_KEYS.agentId);
      }
    } catch {
      /* noop */
    }
  }, [agentId]);
  useEffect(() => {
    try {
      if (codingWorkspaceRoot) {
        localStorage.setItem(LS_KEYS.codingWorkspaceRoot, codingWorkspaceRoot);
      } else {
        localStorage.removeItem(LS_KEYS.codingWorkspaceRoot);
      }
    } catch {
      /* noop */
    }
  }, [codingWorkspaceRoot]);
  useEffect(() => {
    try {
      if (codingWorkspaceLabel) {
        localStorage.setItem(LS_KEYS.codingWorkspaceLabel, codingWorkspaceLabel);
      } else {
        localStorage.removeItem(LS_KEYS.codingWorkspaceLabel);
      }
    } catch {
      /* noop */
    }
  }, [codingWorkspaceLabel]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEYS.webSearchEnabled, webSearchEnabled ? 'true' : 'false');
    } catch {
      /* noop */
    }
  }, [webSearchEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEYS.characterPromptEnabled, characterPromptEnabled ? 'true' : 'false');
    } catch {
      /* noop */
    }
  }, [characterPromptEnabled]);

  // One-time cleanup for the removed preset-ordering compatibility state.
  useEffect(() => {
    try {
      localStorage.removeItem('chat.sel.recents');
    } catch {
      /* noop */
    }
  }, []);

  // 一次性迁移：仍停留在历史默认 openai（即从未显式改选过）时，切到自托管 vLLM
  useEffect(() => {
    try {
      if (localStorage.getItem(LS_MIGRATION_SELF_HOSTED_KEY) === 'true') return;
      localStorage.setItem(LS_MIGRATION_SELF_HOSTED_KEY, 'true');
      if ((localStorage.getItem(LS_KEYS.providerId) || 'openai') !== 'openai') return;
      const timer = window.setTimeout(() => {
        setProviderIdState(DEFAULT_CHAT_PROVIDER_ID);
        setPresetIdState('');
        setModelId('');
      }, 0);
      return () => window.clearTimeout(timer);
    } catch {
      /* noop */
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      setProviders((await window.chobits.ai.getProviders()) || []);
    } catch {
      /* noop */
    }
    try {
      setAgents((await window.chobits.ai.getAgents()) || []);
    } catch {
      /* noop */
    }
  }, []);

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
      setProviderIdState(nextProviderId);
      setPresetIdState('');
    }, 0);

    return () => window.clearTimeout(timer);
  }, [providers, providerId]);

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

  const setProviderId = useCallback(
    (id: string) => {
      if (id !== providerId) {
        setPresetIdState('');
      }
      setProviderIdState(id);
    },
    [providerId]
  );

  const setPresetId = useCallback((id: string) => {
    setPresetIdState(id);
  }, []);

  const setCodingWorkspace = useCallback((workspace: { root: string; label?: string } | null) => {
    if (!workspace?.root?.trim()) {
      setCodingWorkspaceRootState('');
      setCodingWorkspaceLabelState('');
      return;
    }

    setCodingWorkspaceRootState(workspace.root.trim());
    setCodingWorkspaceLabelState(workspace.label?.trim() || '');
  }, []);

  const setWebSearchEnabled = useCallback((enabled: boolean) => {
    setWebSearchEnabledState(enabled);
  }, []);

  const setCharacterPromptEnabled = useCallback((enabled: boolean) => {
    setCharacterPromptEnabledState(enabled);
  }, []);

  const value = useMemo<ChatSelectionContextValue>(
    () => ({
      agents,
      providerId,
      modelId,
      presetId,
      agentId,
      codingWorkspaceRoot,
      codingWorkspaceLabel,
      webSearchEnabled,
      characterPromptEnabled,
      setProviderId,
      setModelId,
      setPresetId,
      setAgentId,
      setCodingWorkspace,
      setWebSearchEnabled,
      setCharacterPromptEnabled,
      refresh
    }),
    [
      agents,
      providerId,
      modelId,
      presetId,
      agentId,
      codingWorkspaceRoot,
      codingWorkspaceLabel,
      webSearchEnabled,
      characterPromptEnabled,
      setProviderId,
      setPresetId,
      setCodingWorkspace,
      setWebSearchEnabled,
      setCharacterPromptEnabled,
      refresh
    ]
  );

  return <ChatSelectionContext.Provider value={value}>{children}</ChatSelectionContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useChatSelection(): ChatSelectionContextValue {
  const ctx = useContext(ChatSelectionContext);
  if (!ctx) throw new Error('useChatSelection must be used within ChatSelectionProvider');
  return ctx;
}

import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useState } from 'react';

export type IntentCategory = 'philosophy' | 'encouragement' | 'playful' | 'reminder' | 'planning' | 'empathy' | 'reflection';
export type TonePreference = 'auto' | 'gentle' | 'playful' | 'calm' | 'firm' | 'curious' | 'tender';
export type HistoryStatus = 'spoken' | 'generated' | 'skipped' | 'failed';

export type SpontaneousUtterancePreferences = {
  enabled: boolean;
  cooldownMinutes: number;
  dailyLimit: number;
  preferredTone: TonePreference;
  allowedIntentCategories: IntentCategory[];
};

export type SpontaneousUtteranceHistoryItem = {
  utteranceId?: string;
  timestamp: number;
  status: HistoryStatus;
  text?: string;
  intentCategory?: IntentCategory;
  tone?: string;
  emotion?: string;
  whyThisFits?: string;
  executedAction?: string;
  fallbackAction?: string;
  spoken?: boolean;
  fallbackUsed?: boolean;
  reason?: string;
};

type HistoryFilterState = {
  query: string;
  status: HistoryStatus | 'all';
  intentCategory: IntentCategory | 'all';
};

export type SpontaneousUtteranceSettingsState = {
  preferences: SpontaneousUtterancePreferences;
  loading: boolean;
  history: SpontaneousUtteranceHistoryItem[];
  historyLoading: boolean;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  statusFilter: HistoryStatus | 'all';
  setStatusFilter: Dispatch<SetStateAction<HistoryStatus | 'all'>>;
  intentFilter: IntentCategory | 'all';
  setIntentFilter: Dispatch<SetStateAction<IntentCategory | 'all'>>;
  loadHistory: (nextQuery?: Partial<HistoryFilterState>) => Promise<void>;
  updatePreferences: (patch: Partial<SpontaneousUtterancePreferences>) => Promise<void>;
};

const DEFAULT_PREFERENCES: SpontaneousUtterancePreferences = {
  enabled: true,
  cooldownMinutes: 20,
  dailyLimit: 8,
  preferredTone: 'auto',
  allowedIntentCategories: ['philosophy', 'encouragement', 'playful', 'reminder', 'planning', 'empathy', 'reflection']
};

function mergePreferences(preferences: SpontaneousUtterancePreferences | null | undefined): SpontaneousUtterancePreferences {
  return {
    ...DEFAULT_PREFERENCES,
    ...preferences,
    allowedIntentCategories: preferences?.allowedIntentCategories && preferences.allowedIntentCategories.length > 0 ? preferences.allowedIntentCategories : DEFAULT_PREFERENCES.allowedIntentCategories
  };
}

export function useSpontaneousUtteranceSettings(): SpontaneousUtteranceSettingsState {
  const [preferences, setPreferences] = useState<SpontaneousUtterancePreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [history, setHistory] = useState<SpontaneousUtteranceHistoryItem[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<HistoryStatus | 'all'>('all');
  const [intentFilter, setIntentFilter] = useState<IntentCategory | 'all'>('all');

  const loadPreferences = useCallback(async (): Promise<void> => {
    try {
      const next = await window.YUA.sprite.getSpontaneousUtterancePreferences();
      setPreferences(mergePreferences(next || undefined));
    } catch (error) {
      console.error('加载主动发言偏好失败:', error);
      setPreferences(DEFAULT_PREFERENCES);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(
    async (nextQuery?: Partial<HistoryFilterState>): Promise<void> => {
      setHistoryLoading(true);
      try {
        const result = await window.YUA.sprite.listSpontaneousUtteranceHistory({
          limit: 120,
          query: nextQuery?.query ?? query,
          status: nextQuery?.status ?? statusFilter,
          intentCategory: nextQuery?.intentCategory ?? intentFilter
        });
        setHistory(result || []);
      } catch (error) {
        console.error('加载主动发言历史失败:', error);
        setHistory([]);
      } finally {
        setHistoryLoading(false);
      }
    },
    [intentFilter, query, statusFilter]
  );

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        void loadHistory();
      },
      query.trim() ? 220 : 0
    );

    return () => {
      window.clearTimeout(timer);
    };
  }, [intentFilter, loadHistory, query, statusFilter]);

  const updatePreferences = useCallback(async (patch: Partial<SpontaneousUtterancePreferences>): Promise<void> => {
    try {
      const next = await window.YUA.sprite.updateSpontaneousUtterancePreferences(patch);
      setPreferences(mergePreferences(next || undefined));
    } catch (error) {
      console.error('更新主动发言偏好失败:', error);
    }
  }, []);

  return {
    preferences,
    loading,
    history,
    historyLoading,
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    intentFilter,
    setIntentFilter,
    loadHistory,
    updatePreferences
  };
}

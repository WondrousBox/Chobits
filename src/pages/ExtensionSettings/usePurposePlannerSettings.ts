import { useCallback, useEffect, useState } from 'react';

import type { SpritePurposeHistoryEntry, SpritePurposePlannerPreferences, SpritePurposePlannerStatus, SpritePurposeStartResult, StartSpritePurposeRequest } from '@packages/sprite-core/purpose';

export type PurposePlannerPreferences = SpritePurposePlannerPreferences;
export type PurposePlannerStatus = SpritePurposePlannerStatus;
export type PurposePlannerHistoryEntry = SpritePurposeHistoryEntry;
export type PurposePlannerSmokeResult = SpritePurposeStartResult;

export type PurposePlannerSettingsState = {
  preferences: PurposePlannerPreferences;
  status: PurposePlannerStatus | null;
  history: PurposePlannerHistoryEntry[];
  lastSmokeResult: PurposePlannerSmokeResult | null;
  lastPresetResult: PurposePlannerSmokeResult | null;
  smokeError: string | null;
  presetError: string | null;
  loading: boolean;
  historyLoading: boolean;
  updating: boolean;
  smokeTesting: boolean;
  presetTesting: boolean;
  refresh: () => Promise<void>;
  loadHistory: () => Promise<void>;
  runSmokeTest: () => Promise<void>;
  runWorkspaceOnboardingPreset: () => Promise<void>;
  updatePreferences: (patch: Partial<PurposePlannerPreferences>) => Promise<void>;
};

const DEFAULT_PREFERENCES: PurposePlannerPreferences = {
  enabled: false,
  historyLimit: 20
};

function normalizeHistoryLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_PREFERENCES.historyLimit;
  }

  return Math.min(100, Math.max(1, Math.floor(value)));
}

function mergePreferences(preferences: Partial<PurposePlannerPreferences> | null | undefined): PurposePlannerPreferences {
  return {
    enabled: typeof preferences?.enabled === 'boolean' ? preferences.enabled : DEFAULT_PREFERENCES.enabled,
    historyLimit: normalizeHistoryLimit(preferences?.historyLimit)
  };
}

function mergeStatus(status: PurposePlannerStatus | null | undefined, preferences: PurposePlannerPreferences): PurposePlannerStatus | null {
  if (!status) {
    return null;
  }

  return {
    ...status,
    ...mergePreferences(status),
    enabled: typeof status.enabled === 'boolean' ? status.enabled : preferences.enabled,
    historyLimit: normalizeHistoryLimit(status.historyLimit)
  };
}

export function createPurposePlannerSmokeTestRequest(now = Date.now()): StartSpritePurposeRequest {
  return {
    kind: 'daily.care.reminder',
    title: '目的规划器试跑',
    reason: '手动触发目的规划器安全试跑',
    source: 'manual',
    presetId: 'daily.care.reminder',
    priority: 52,
    interruptPolicy: 'interruptible',
    coalesceKey: `purpose-planner-smoke:${now}`,
    context: {
      purposeId: `purpose-planner-smoke:${now}`,
      routineId: 'planner-smoke-test',
      routineTitle: '目的规划器试跑',
      routineKind: 'plannerSmokeTest',
      severity: 'gentle',
      message: '目的规划器试跑完成。',
      manual: true,
      triggeredAt: now,
      source: 'purpose-planner-settings'
    }
  };
}

export function createWorkspaceOnboardingPresetTestRequest(now = Date.now()): StartSpritePurposeRequest {
  return {
    kind: 'onboarding.workspace.create',
    title: '工作空间引导预设测试',
    reason: '手动执行现有工作空间引导预设',
    source: 'manual',
    presetId: 'onboarding.workspace.create',
    priority: 72,
    interruptPolicy: 'urgent',
    coalesceKey: `workspace-onboarding-preset-test:${now}`,
    plannerMode: 'preset-only',
    context: {
      purposeId: `workspace-onboarding-preset-test:${now}`,
      routineId: 'workspace-onboarding-preset-test',
      routineTitle: '工作空间引导预设测试',
      routineKind: 'workspaceOnboardingPresetTest',
      manual: true,
      triggeredAt: now,
      source: 'purpose-planner-settings'
    }
  };
}

export function usePurposePlannerSettings(): PurposePlannerSettingsState {
  const [preferences, setPreferences] = useState<PurposePlannerPreferences>(DEFAULT_PREFERENCES);
  const [status, setStatus] = useState<PurposePlannerStatus | null>(null);
  const [history, setHistory] = useState<PurposePlannerHistoryEntry[]>([]);
  const [lastSmokeResult, setLastSmokeResult] = useState<PurposePlannerSmokeResult | null>(null);
  const [lastPresetResult, setLastPresetResult] = useState<PurposePlannerSmokeResult | null>(null);
  const [smokeError, setSmokeError] = useState<string | null>(null);
  const [presetError, setPresetError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [smokeTesting, setSmokeTesting] = useState(false);
  const [presetTesting, setPresetTesting] = useState(false);

  const fetchHistory = useCallback(async (): Promise<PurposePlannerHistoryEntry[]> => {
    return window.YUA.sprite.listPurposeHistory({
      limit: 40,
      eventType: ['planner:planned', 'planner:fallback']
    });
  }, []);

  const loadHistory = useCallback(async (): Promise<void> => {
    setHistoryLoading(true);
    try {
      setHistory((await fetchHistory()) ?? []);
    } catch (error) {
      console.error('加载目的规划器历史失败:', error);
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [fetchHistory]);

  const refresh = useCallback(async (): Promise<void> => {
    setHistoryLoading(true);
    try {
      const [nextPreferences, nextStatus, nextHistory] = await Promise.all([window.YUA.sprite.getPurposePlannerPreferences(), window.YUA.sprite.getPurposePlannerStatus(), fetchHistory()]);
      const mergedPreferences = mergePreferences(nextPreferences);
      setPreferences(mergedPreferences);
      setStatus(mergeStatus(nextStatus, mergedPreferences));
      setHistory(nextHistory ?? []);
    } catch (error) {
      console.error('加载目的规划器状态失败:', error);
      setPreferences(DEFAULT_PREFERENCES);
      setStatus(null);
      setHistory([]);
    } finally {
      setLoading(false);
      setHistoryLoading(false);
    }
  }, [fetchHistory]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updatePreferences = useCallback(
    async (patch: Partial<PurposePlannerPreferences>): Promise<void> => {
      setUpdating(true);
      try {
        const next = mergePreferences(await window.YUA.sprite.updatePurposePlannerPreferences(patch));
        setPreferences(next);
        setStatus((current) => (current ? { ...current, ...next } : current));
        try {
          const nextStatus = await window.YUA.sprite.getPurposePlannerStatus();
          setStatus(mergeStatus(nextStatus, next));
        } catch (statusError) {
          console.error('刷新目的规划器状态失败:', statusError);
        }
      } catch (error) {
        console.error('更新目的规划器偏好失败:', error);
      } finally {
        setUpdating(false);
      }
    },
    []
  );

  const runSmokeTest = useCallback(async (): Promise<void> => {
    setSmokeTesting(true);
    setSmokeError(null);
    try {
      const result = await window.YUA.sprite.startPurpose(createPurposePlannerSmokeTestRequest());
      setLastSmokeResult(result);
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('目的规划器试跑失败:', error);
      setSmokeError(message);
    } finally {
      setSmokeTesting(false);
    }
  }, [refresh]);

  const runWorkspaceOnboardingPreset = useCallback(async (): Promise<void> => {
    setPresetTesting(true);
    setPresetError(null);
    try {
      const result = await window.YUA.sprite.startPurpose(createWorkspaceOnboardingPresetTestRequest());
      setLastPresetResult(result);
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('工作空间引导预设测试失败:', error);
      setPresetError(message);
    } finally {
      setPresetTesting(false);
    }
  }, [refresh]);

  return {
    preferences,
    status,
    history,
    lastSmokeResult,
    lastPresetResult,
    smokeError,
    presetError,
    loading,
    historyLoading,
    updating,
    smokeTesting,
    presetTesting,
    refresh,
    loadHistory,
    runSmokeTest,
    runWorkspaceOnboardingPreset,
    updatePreferences
  };
}

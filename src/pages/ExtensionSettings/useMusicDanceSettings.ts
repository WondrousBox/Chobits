import type { MusicReactivityAnalysisStatus, MusicReactivityCaptureSource, MusicReactivityPreferences, MusicReactivitySnapshot } from '@packages/audio-reactivity/types';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { DEFAULT_DANCE_TRIGGER, getDanceAnimationFallbackTrigger, useDanceAnimationAvailability } from './useDanceAnimationAvailability';

export const SOURCE_LABELS: Record<MusicReactivityPreferences['source'], string> = {
  auto: '自动',
  manual: '手动调试',
  'app-media': '应用内播放器',
  'system-loopback': '系统音频',
  'microphone-test': '麦克风测试'
};

export const SENSITIVITY_LABELS: Record<MusicReactivityPreferences['sensitivity'], string> = {
  low: '低',
  medium: '中',
  high: '高'
};

export const STATE_LABELS: Record<MusicReactivitySnapshot['state'], string> = {
  idle: '空闲',
  candidate: '候选',
  dancing: '跳舞中',
  cooldown: '冷却',
  unavailable: '不可用'
};

export const ANALYSIS_STATUS_LABELS: Record<MusicReactivityAnalysisStatus, string> = {
  none: '未收到',
  accepted: '正在喂入',
  'source-filtered': '来源被过滤',
  disabled: '服务已关闭'
};

const DEFAULT_MUSIC_PREFERENCES: MusicReactivityPreferences = {
  enabled: false,
  source: 'auto',
  sensitivity: 'medium',
  danceTrigger: DEFAULT_DANCE_TRIGGER,
  idleBopTrigger: 'music:idle-bop',
  stopTrigger: 'music:stop',
  showDebugOverlay: false
};

export function formatPercent(value?: number): string {
  if (!Number.isFinite(value)) return '-';
  return `${Math.round((value ?? 0) * 100)}%`;
}

export function formatDb(value?: number): string {
  if (!Number.isFinite(value)) return '-';
  return `${Math.round(value ?? 0)} dB`;
}

function formatAge(timestampMs?: number, now = Date.now()): string {
  if (!Number.isFinite(timestampMs) || !timestampMs) return '无';
  const ageMs = Math.max(0, now - timestampMs);
  if (ageMs < 1500) return '刚刚';
  if (ageMs < 60_000) return `${Math.round(ageMs / 1000)} 秒前`;
  if (ageMs < 3_600_000) return `${Math.round(ageMs / 60_000)} 分钟前`;
  return new Date(timestampMs).toLocaleTimeString();
}

export function sourceLabel(source?: MusicReactivityPreferences['source'] | MusicReactivityCaptureSource | 'none'): string {
  if (!source || source === 'none') return '无';
  return SOURCE_LABELS[source] ?? source;
}

function getFeedSummary(snapshot: MusicReactivitySnapshot | null, preferences: MusicReactivityPreferences, now: number): { label: string; tone: 'ok' | 'warn' | 'muted' } {
  if (!snapshot) return { label: '未连接快照', tone: 'muted' };
  if (!preferences.enabled || !snapshot.running || snapshot.lastAnalysisStatus === 'disabled') return { label: '服务未启用', tone: 'muted' };
  if (snapshot.lastAnalysisStatus === 'source-filtered') {
    return { label: `${sourceLabel(snapshot.lastAnalysisSource)} 被过滤`, tone: 'warn' };
  }
  if (!snapshot.lastAnalysisAtMs) return { label: '当前没有来源喂数据', tone: 'warn' };

  const ageMs = now - snapshot.lastAnalysisAtMs;
  if (snapshot.lastAnalysisStatus === 'accepted' && ageMs <= 2_000) {
    return { label: `${sourceLabel(snapshot.lastAnalysisSource)} 正在喂数据`, tone: 'ok' };
  }
  if (snapshot.lastAnalysisStatus === 'accepted') {
    return { label: `${sourceLabel(snapshot.lastAnalysisSource)} ${formatAge(snapshot.lastAnalysisAtMs, now)}`, tone: ageMs <= 5_000 ? 'ok' : 'warn' };
  }
  return { label: ANALYSIS_STATUS_LABELS[snapshot.lastAnalysisStatus], tone: 'muted' };
}

export function diagnosticPillClass(tone: 'ok' | 'warn' | 'muted'): string {
  if (tone === 'ok') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (tone === 'warn') return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  return 'border-transparent bg-muted text-muted-foreground';
}

export function useMusicDanceSettings(): {
  acceptedSnapshotAgeLabel: string;
  analysisSnapshotAgeLabel: string;
  availability: ReturnType<typeof useDanceAnimationAvailability>['availability'];
  danceAnimationTotal: number | null;
  danceTrigger: string;
  danceUsesFallback: boolean;
  description: string;
  disabled: boolean;
  fallbackTrigger: string | null;
  feedSummary: { label: string; tone: 'ok' | 'warn' | 'muted' };
  handleTestDance: () => Promise<void>;
  loadingAvailability: boolean;
  preferences: MusicReactivityPreferences;
  resetAgeLabel: string;
  setDanceTriggerDraft: (danceTrigger: string) => void;
  snapshot: MusicReactivitySnapshot | null;
  testing: boolean;
  updatePreferences: (patch: Partial<MusicReactivityPreferences>) => Promise<void>;
} {
  const [preferences, setPreferences] = useState<MusicReactivityPreferences>(DEFAULT_MUSIC_PREFERENCES);
  const [snapshot, setSnapshot] = useState<MusicReactivitySnapshot | null>(null);
  const [loadingPreferences, setLoadingPreferences] = useState(true);
  const [pending, setPending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const danceTrigger = preferences.danceTrigger.trim() || DEFAULT_MUSIC_PREFERENCES.danceTrigger;
  const fallbackTrigger = getDanceAnimationFallbackTrigger(danceTrigger);
  const { availability, loading: loadingAvailability, refresh: refreshDanceAnimationAvailability } = useDanceAnimationAvailability(danceTrigger);
  const danceAnimationTotal = availability ? availability.primaryCount + availability.fallbackCount : null;
  const danceUsesFallback = availability ? availability.primaryCount === 0 && availability.fallbackCount > 0 : false;
  const feedSummary = getFeedSummary(snapshot, preferences, now);
  const analysisSnapshotAgeLabel = formatAge(snapshot?.lastAnalysisAtMs, now);
  const acceptedSnapshotAgeLabel = formatAge(snapshot?.lastAcceptedAnalysisAtMs, now);
  const resetAgeLabel = formatAge(snapshot?.lastReset?.timestampMs, now);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let disposed = false;

    const load = async (): Promise<void> => {
      try {
        const [preferencesResult, snapshotResult] = await Promise.all([window.YUA.musicReactivity.getPreferences(), window.YUA.musicReactivity.getSnapshot()]);
        if (disposed) return;
        if (preferencesResult.ok && preferencesResult.preferences) {
          setPreferences(preferencesResult.preferences);
          void refreshDanceAnimationAvailability(preferencesResult.preferences.danceTrigger);
        }
        if (snapshotResult.ok && snapshotResult.snapshot) {
          setSnapshot(snapshotResult.snapshot);
        }
      } catch (error) {
        console.warn('[DanceAnimationSettings] failed to load music reactivity settings:', error);
      } finally {
        if (!disposed) {
          setLoadingPreferences(false);
        }
      }
    };

    const unsubscribe = window.YUA.musicReactivity.onSnapshot((nextSnapshot) => {
      setSnapshot(nextSnapshot);
    });

    void load();
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [refreshDanceAnimationAvailability]);

  const updatePreferences = useCallback(
    async (patch: Partial<MusicReactivityPreferences>): Promise<void> => {
      setPending(true);
      const previous = preferences;
      const optimistic = { ...preferences, ...patch };
      setPreferences(optimistic);
      try {
        const result = await window.YUA.musicReactivity.updatePreferences(patch);
        if (!result.ok || !result.preferences) {
          throw new Error(result.error || '设置音乐响应失败');
        }
        setPreferences(result.preferences);
        void refreshDanceAnimationAvailability(result.preferences.danceTrigger);
        if (result.snapshot) {
          setSnapshot(result.snapshot);
        }
      } catch (error) {
        setPreferences(previous);
        toast.error('设置音乐响应失败', {
          description: error instanceof Error ? error.message : String(error)
        });
      } finally {
        setPending(false);
      }
    },
    [preferences, refreshDanceAnimationAvailability]
  );

  const handleTestDance = useCallback(async (): Promise<void> => {
    setTesting(true);
    try {
      const result = await window.YUA.musicReactivity.testDance();
      if (!result.ok || !result.snapshot) {
        throw new Error(result.error || '测试跳舞触发失败');
      }
      setSnapshot(result.snapshot);
      if (danceAnimationTotal === 0) {
        toast.warning('已发送测试触发，但还没有匹配的舞蹈动画', {
          description: fallbackTrigger ? `请先给某个精灵动画设置 trigger：${danceTrigger} 或 ${fallbackTrigger}` : `请先给某个精灵动画设置 trigger：${danceTrigger}`
        });
      } else if (danceUsesFallback && fallbackTrigger) {
        toast.success(`已发送 ${danceTrigger} 测试触发，将回退使用 ${fallbackTrigger} 动画`);
      } else {
        toast.success(`已发送 ${danceTrigger} 测试触发`);
      }
    } catch (error) {
      toast.error('测试跳舞触发失败', {
        description: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setTesting(false);
    }
  }, [danceAnimationTotal, danceTrigger, danceUsesFallback, fallbackTrigger]);

  const disabled = loadingPreferences || pending;
  const description = preferences.enabled ? '开启后，音乐响应服务会根据音频分析结果触发精灵舞蹈。当前阶段已接通触发链路，系统音频采集会在后续阶段接入。' : '关闭后不会根据音乐分析触发跳舞。';
  const setDanceTriggerDraft = useCallback((nextDanceTrigger: string): void => {
    setPreferences((prev) => ({ ...prev, danceTrigger: nextDanceTrigger }));
  }, []);

  return {
    acceptedSnapshotAgeLabel,
    analysisSnapshotAgeLabel,
    availability,
    danceAnimationTotal,
    danceTrigger,
    danceUsesFallback,
    description,
    disabled,
    fallbackTrigger,
    feedSummary,
    handleTestDance,
    loadingAvailability,
    preferences,
    resetAgeLabel,
    setDanceTriggerDraft,
    snapshot,
    testing,
    updatePreferences
  };
}

export type MusicDanceSettingsState = ReturnType<typeof useMusicDanceSettings>;

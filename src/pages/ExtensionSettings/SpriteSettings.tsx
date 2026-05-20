import type { MusicReactivityAnalysisStatus, MusicReactivityCaptureSource, MusicReactivityPreferences, MusicReactivitySnapshot } from '@packages/audio-reactivity/types';
import type { SpriteCapabilityState } from '@packages/sprite-core/capability-registry';
import React, { useCallback, useEffect, useState } from 'react';
import { TbActivityHeartbeat, TbAlertTriangle, TbMoodKid, TbPlayerPlay } from 'react-icons/tb';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

import { SettingGroup, SettingItem } from '../SettingsPage/components/SettingComponents';
import SpriteManager from './SpriteManager';

export const SpriteItem: React.FC<{
  selected: boolean;
  onSelect: () => void;
}> = ({ selected, onSelect }) => (
  <div onClick={onSelect} className={cn('flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:bg-accent/50', selected && 'bg-accent ring-1 ring-primary/30')}>
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
      <TbMoodKid className="h-5 w-5" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium text-foreground">精灵管理</div>
      <div className="text-xs text-muted-foreground line-clamp-1">管理桌面精灵动画资源、导入与调试动作</div>
    </div>
  </div>
);

function useAssistantMiniWindowSetting(): {
  enabled: boolean;
  loading: boolean;
  pending: boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
} {
  const [enabled, setEnabledState] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let disposed = false;

    const load = async (): Promise<void> => {
      try {
        const result = await window.YUA.preferences['preferences:getConfig']();
        if (!disposed && result.ok && result.config) {
          setEnabledState(Boolean(result.config.assistantMiniWindowEnabled));
        }
      } catch (error) {
        console.warn('[SpriteSettings] failed to load assistant mini window setting:', error);
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      disposed = true;
    };
  }, []);

  const setEnabled = useCallback(
    async (nextEnabled: boolean): Promise<void> => {
      if (pending) return;
      const previous = enabled;
      setEnabledState(nextEnabled);
      setPending(true);
      try {
        const result = await window.YUA.preferences['preferences:setConfig']({
          config: { assistantMiniWindowEnabled: nextEnabled }
        });
        if (!result.ok || !result.config) {
          throw new Error(result.error || '设置迷你输入窗失败');
        }
        setEnabledState(Boolean(result.config.assistantMiniWindowEnabled));
      } catch (error) {
        setEnabledState(previous);
        toast.error('设置迷你输入窗失败', {
          description: error instanceof Error ? error.message : String(error)
        });
      } finally {
        setPending(false);
      }
    },
    [enabled, pending]
  );

  return { enabled, loading, pending, setEnabled };
}

const AssistantMiniWindowSettings: React.FC = () => {
  const setting = useAssistantMiniWindowSetting();

  return (
    <SettingGroup title="对话入口">
      <SettingItem
        title="双击打开迷你输入窗"
        description="开启后，双击桌面精灵会打开跟随精灵的小输入窗，只显示模型、麦克风和发送入口。其他对话选项继续沿用本地缓存。"
        action={<Switch checked={setting.enabled} disabled={setting.loading || setting.pending} onCheckedChange={(checked) => void setting.setEnabled(checked)} />}
      />
    </SettingGroup>
  );
};

const SOURCE_LABELS: Record<MusicReactivityPreferences['source'], string> = {
  auto: '自动',
  manual: '手动调试',
  'app-media': '应用内播放器',
  'system-loopback': '系统音频',
  'microphone-test': '麦克风测试'
};

const SENSITIVITY_LABELS: Record<MusicReactivityPreferences['sensitivity'], string> = {
  low: '低',
  medium: '中',
  high: '高'
};

const STATE_LABELS: Record<MusicReactivitySnapshot['state'], string> = {
  idle: '空闲',
  candidate: '候选',
  dancing: '跳舞中',
  cooldown: '冷却',
  unavailable: '不可用'
};

const ANALYSIS_STATUS_LABELS: Record<MusicReactivityAnalysisStatus, string> = {
  none: '未收到',
  accepted: '正在喂入',
  'source-filtered': '来源被过滤',
  disabled: '服务已关闭'
};

const DEFAULT_MUSIC_PREFERENCES: MusicReactivityPreferences = {
  enabled: false,
  source: 'auto',
  sensitivity: 'medium',
  danceTrigger: 'music:dance',
  idleBopTrigger: 'music:idle-bop',
  stopTrigger: 'music:stop',
  showDebugOverlay: false
};

interface DanceAnimationAvailability {
  fallbackCount: number;
  primaryCount: number;
}

function formatPercent(value?: number): string {
  if (!Number.isFinite(value)) return '-';
  return `${Math.round((value ?? 0) * 100)}%`;
}

function formatDb(value?: number): string {
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

function sourceLabel(source?: MusicReactivityPreferences['source'] | MusicReactivityCaptureSource | 'none'): string {
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

function diagnosticPillClass(tone: 'ok' | 'warn' | 'muted'): string {
  if (tone === 'ok') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (tone === 'warn') return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  return 'border-transparent bg-muted text-muted-foreground';
}

const MusicReactivitySettings: React.FC = () => {
  const [preferences, setPreferences] = useState<MusicReactivityPreferences>(DEFAULT_MUSIC_PREFERENCES);
  const [snapshot, setSnapshot] = useState<MusicReactivitySnapshot | null>(null);
  const [danceAnimationAvailability, setDanceAnimationAvailability] = useState<DanceAnimationAvailability | null>(null);
  const [danceAnimationLoading, setDanceAnimationLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const danceTrigger = preferences.danceTrigger.trim() || DEFAULT_MUSIC_PREFERENCES.danceTrigger;
  const danceAnimationTotal = danceAnimationAvailability ? danceAnimationAvailability.primaryCount + danceAnimationAvailability.fallbackCount : null;
  const danceUsesFallback = danceAnimationAvailability ? danceAnimationAvailability.primaryCount === 0 && danceAnimationAvailability.fallbackCount > 0 : false;
  const fallbackTrigger = danceTrigger === DEFAULT_MUSIC_PREFERENCES.danceTrigger ? 'dance' : null;
  const feedSummary = getFeedSummary(snapshot, preferences, now);
  const analysisSnapshotAgeLabel = formatAge(snapshot?.lastAnalysisAtMs, now);
  const acceptedSnapshotAgeLabel = formatAge(snapshot?.lastAcceptedAnalysisAtMs, now);
  const resetAgeLabel = formatAge(snapshot?.lastReset?.timestampMs, now);

  const refreshDanceAnimationAvailability = useCallback(
    async (trigger = danceTrigger): Promise<void> => {
      const normalizedTrigger = trigger.trim();
      if (!normalizedTrigger) {
        setDanceAnimationAvailability({ primaryCount: 0, fallbackCount: 0 });
        return;
      }
      setDanceAnimationLoading(true);
      try {
        const [primaryItems, fallbackItems] = await Promise.all([
          window.YUA.sprite.listByTrigger(normalizedTrigger),
          normalizedTrigger === DEFAULT_MUSIC_PREFERENCES.danceTrigger ? window.YUA.sprite.listByTrigger('dance') : Promise.resolve([])
        ]);
        setDanceAnimationAvailability({
          primaryCount: primaryItems.length,
          fallbackCount: fallbackItems.length
        });
      } catch (error) {
        console.warn('[SpriteSettings] failed to load dance trigger animations:', error);
        setDanceAnimationAvailability(null);
      } finally {
        setDanceAnimationLoading(false);
      }
    },
    [danceTrigger]
  );

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
        console.warn('[SpriteSettings] failed to load music reactivity settings:', error);
      } finally {
        if (!disposed) {
          setLoading(false);
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshDanceAnimationAvailability(danceTrigger);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [danceTrigger, refreshDanceAnimationAvailability]);

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

  const disabled = loading || pending;
  const description = preferences.enabled ? '开启后，音乐响应服务会根据音频分析结果触发精灵舞蹈。当前阶段已接通触发链路，系统音频采集会在后续阶段接入。' : '关闭后不会根据音乐分析触发跳舞。';

  return (
    <SettingGroup title="音乐响应">
      <SettingItem
        title="听到音乐时跳舞"
        description={description}
        action={<Switch checked={preferences.enabled} disabled={disabled} onCheckedChange={(checked) => void updatePreferences({ enabled: checked })} />}
      />
      <SettingItem
        title="音频来源"
        description="第一阶段用于记录偏好；真实系统音频采集会在后续接入。"
        action={
          <Select value={preferences.source} disabled={disabled} onValueChange={(value) => void updatePreferences({ source: value as MusicReactivityPreferences['source'] })}>
            <SelectTrigger className="h-8 w-[132px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      <SettingItem
        title="灵敏度"
        description="影响进入跳舞和退出跳舞的判定阈值。"
        action={
          <Select value={preferences.sensitivity} disabled={disabled} onValueChange={(value) => void updatePreferences({ sensitivity: value as MusicReactivityPreferences['sensitivity'] })}>
            <SelectTrigger className="h-8 w-[96px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SENSITIVITY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      <SettingItem title="跳舞触发器" description="给舞蹈动画设置同名 trigger 后，音乐响应会播放它。">
        <Input
          value={preferences.danceTrigger}
          disabled={disabled}
          placeholder="music:dance"
          onChange={(event) => setPreferences((prev) => ({ ...prev, danceTrigger: event.target.value }))}
          onBlur={() => void updatePreferences({ danceTrigger: preferences.danceTrigger })}
          className="h-8 max-w-[260px]"
        />
      </SettingItem>
      <SettingItem
        title="舞蹈动画"
        description={
          danceAnimationLoading
            ? fallbackTrigger
              ? `正在检查 ${danceTrigger} / ${fallbackTrigger} 对应动画...`
              : `正在检查 ${danceTrigger} 对应动画...`
            : danceAnimationAvailability === null
              ? '暂时无法检查舞蹈动画配置。'
              : danceAnimationAvailability.primaryCount > 0
                ? `已找到 ${danceAnimationAvailability.primaryCount} 个匹配 ${danceTrigger} 的动画。`
                : danceAnimationAvailability.fallbackCount > 0 && fallbackTrigger
                  ? `未找到 ${danceTrigger}，将回退使用 ${danceAnimationAvailability.fallbackCount} 个 ${fallbackTrigger} 动画。`
                  : fallbackTrigger
                    ? `未找到匹配 ${danceTrigger} 或 ${fallbackTrigger} 的动画。请在下方精灵管理中把某个动画的主触发器或别名设为 ${danceTrigger} 或 ${fallbackTrigger}。`
                    : `未找到匹配 ${danceTrigger} 的动画。请在下方精灵管理中把某个动画的主触发器或别名设为 ${danceTrigger}。`
        }
      >
        {danceAnimationTotal === 0 && (
          <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300">
            <TbAlertTriangle />
            音乐检测会进入跳舞状态，但没有动画可播放
          </div>
        )}
        {danceUsesFallback && fallbackTrigger && (
          <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-xs text-primary">
            <TbActivityHeartbeat />
            将兼容使用动作 trigger：{fallbackTrigger}
          </div>
        )}
      </SettingItem>
      <SettingItem
        title="调试状态"
        description={`状态：${snapshot ? STATE_LABELS[snapshot.state] : '-'} · 当前来源：${sourceLabel(snapshot?.source)} · 音乐 ${formatPercent(snapshot?.musicProbability)} · 音量 ${formatDb(snapshot?.energyDb)}`}
        action={
          <Button size="sm" variant="outline" onClick={() => void handleTestDance()} disabled={testing}>
            <TbPlayerPlay />
            测试跳舞
          </Button>
        }
      >
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          <div className={cn('flex items-center gap-2 rounded-md border px-2 py-1', diagnosticPillClass(feedSummary.tone))}>
            <TbActivityHeartbeat />
            <span>{feedSummary.label}</span>
          </div>
          <div className="rounded-md bg-muted px-2 py-1 text-muted-foreground">最近分析：{analysisSnapshotAgeLabel}</div>
          <div className="rounded-md bg-muted px-2 py-1 text-muted-foreground">
            接收来源：{sourceLabel(snapshot?.lastAcceptedAnalysisSource)} · {acceptedSnapshotAgeLabel}
          </div>
          <div className="rounded-md bg-muted px-2 py-1 text-muted-foreground">
            reset：{snapshot?.lastReset ? `${snapshot.lastReset.reason} · ${STATE_LABELS[snapshot.lastReset.previousState]} -> ${STATE_LABELS[snapshot.lastReset.state]} · ${resetAgeLabel}` : '无'}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-md bg-muted px-2 py-1">偏好来源 {sourceLabel(snapshot?.preferredSource ?? preferences.source)}</span>
          <span className="rounded-md bg-muted px-2 py-1">输入状态 {snapshot ? ANALYSIS_STATUS_LABELS[snapshot.lastAnalysisStatus] : '-'}</span>
          <span className="rounded-md bg-muted px-2 py-1">onset {formatPercent(snapshot?.onsetStrength)}</span>
          <span className="rounded-md bg-muted px-2 py-1">BPM {Number.isFinite(snapshot?.bpm) ? Math.round(snapshot?.bpm ?? 0) : '-'}</span>
        </div>
      </SettingItem>
    </SettingGroup>
  );
};

export const SpriteDetailContent: React.FC<{ assetAuthoringCapability?: SpriteCapabilityState | null; onBlocked?: (capability: SpriteCapabilityState) => void }> = ({
  assetAuthoringCapability,
  onBlocked
}) => (
  <div className="space-y-4">
    <AssistantMiniWindowSettings />
    <MusicReactivitySettings />
    <SpriteManager assetAuthoringCapability={assetAuthoringCapability} onCapabilityBlocked={onBlocked} />
  </div>
);

const SpriteSettings: React.FC = () => (
  <div className="space-y-4">
    <AssistantMiniWindowSettings />
    <MusicReactivitySettings />
    <SpriteManager />
  </div>
);

export default SpriteSettings;

import type { MusicReactivityPreferences } from '@packages/audio-reactivity/types';
import React from 'react';
import { TbActivityHeartbeat, TbAlertTriangle, TbMusic, TbPlayerPlay } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

import { SettingGroup, SettingItem } from '../SettingsPage/components/SettingComponents';
import {
  ANALYSIS_STATUS_LABELS,
  diagnosticPillClass,
  formatDb,
  formatPercent,
  type MusicDanceSettingsState,
  SENSITIVITY_LABELS,
  SOURCE_LABELS,
  sourceLabel,
  STATE_LABELS,
  useMusicDanceSettings
} from './useMusicDanceSettings';

export const DanceAnimationItem: React.FC<{
  state: MusicDanceSettingsState;
  selected: boolean;
  onSelect: () => void;
}> = ({ state, selected, onSelect }) => (
  <div onClick={onSelect} className={cn('flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:bg-accent/50', selected && 'bg-accent ring-1 ring-primary/30')}>
    <div className={cn('flex h-10 w-10 items-center justify-center rounded-full shrink-0', state.preferences.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
      <TbMusic className="h-5 w-5" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium text-foreground">音乐舞蹈</div>
      <div className="text-xs text-muted-foreground line-clamp-1">{state.description}</div>
    </div>
    <div onClick={(event) => event.stopPropagation()}>
      <Switch checked={state.preferences.enabled} disabled={state.disabled} onCheckedChange={(checked) => void state.updatePreferences({ enabled: checked })} />
    </div>
  </div>
);

export const DanceAnimationDetailContent: React.FC<{ state: MusicDanceSettingsState }> = ({ state }) => {
  const {
    acceptedSnapshotAgeLabel,
    analysisSnapshotAgeLabel,
    availability,
    danceAnimationTotal,
    danceTrigger,
    danceUsesFallback,
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
  } = state;

  return (
    <SettingGroup title="音乐舞蹈">
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
          onChange={(event) => setDanceTriggerDraft(event.target.value)}
          onBlur={() => void updatePreferences({ danceTrigger: preferences.danceTrigger })}
          className="h-8 max-w-[260px]"
        />
      </SettingItem>
      <SettingItem
        title="舞蹈动画"
        description={
          loadingAvailability
            ? fallbackTrigger
              ? `正在检查 ${danceTrigger} / ${fallbackTrigger} 对应动画...`
              : `正在检查 ${danceTrigger} 对应动画...`
            : availability === null
              ? '暂时无法检查舞蹈动画配置。'
              : availability.primaryCount > 0
                ? `已找到 ${availability.primaryCount} 个匹配 ${danceTrigger} 的动画。`
                : availability.fallbackCount > 0 && fallbackTrigger
                  ? `未找到 ${danceTrigger}，将回退使用 ${availability.fallbackCount} 个 ${fallbackTrigger} 动画。`
                  : fallbackTrigger
                    ? `未找到匹配 ${danceTrigger} 或 ${fallbackTrigger} 的动画。请在精灵管理中把某个动画的主触发器或别名设为 ${danceTrigger} 或 ${fallbackTrigger}。`
                    : `未找到匹配 ${danceTrigger} 的动画。请在精灵管理中把某个动画的主触发器或别名设为 ${danceTrigger}。`
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

const DanceAnimationSettings: React.FC = () => {
  const state = useMusicDanceSettings();
  return <DanceAnimationDetailContent state={state} />;
};

export default DanceAnimationSettings;

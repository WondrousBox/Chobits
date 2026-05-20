import React, { useCallback, useMemo } from 'react';
import { TbClock, TbHistory, TbLoader2, TbPlayerPlay, TbRefresh, TbSparkles } from 'react-icons/tb';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatRelativeTime, getHistoryTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { SettingGroup, SettingItem } from '@/pages/SettingsPage/components/SettingComponents';

import { type PurposePlannerHistoryEntry, type PurposePlannerSettingsState, type PurposePlannerStatus, usePurposePlannerSettings } from './usePurposePlannerSettings';

function getStatusLabel(status?: string): string {
  switch (status) {
    case 'disabled':
      return '已关闭';
    case 'planned':
      return '已生成规划';
    case 'fallback':
      return '已回退预设';
    default:
      return status || '暂无记录';
  }
}

function getStatusBadgeClass(status?: string): string {
  switch (status) {
    case 'planned':
      return 'border-emerald-500/30 text-emerald-600';
    case 'fallback':
      return 'border-amber-500/30 text-amber-600';
    case 'disabled':
      return 'border-muted-foreground/30 text-muted-foreground';
    default:
      return 'border-border text-muted-foreground';
  }
}

function getReasonLabel(reason?: string): string | undefined {
  switch (reason) {
    case 'planner-disabled':
      return 'planner 已关闭';
    case 'no-executor':
      return '缺少 AI executor';
    case 'planner-output-invalid':
      return 'AI 输出未通过安全校验';
    case 'planner-returned-empty':
      return 'AI 未返回可用规划';
    case 'planner-threw':
      return 'AI 规划执行异常';
    default:
      return reason;
  }
}

function clampHistoryLimit(value: number): number {
  return Math.min(100, Math.max(1, Math.floor(value)));
}

function formatDuration(ms?: number): string {
  if (ms == null) {
    return '暂无';
  }

  if (ms < 1000) {
    return `${ms}ms`;
  }

  return `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s`;
}

function StatusLine({ label, value }: { label: string; value: React.ReactNode }): JSX.Element {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right text-foreground">{value}</span>
    </div>
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === 'boolean' ? value : undefined;
}

function readStringList(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function getHistoryEventLabel(eventType: PurposePlannerHistoryEntry['eventType']): string {
  switch (eventType) {
    case 'planner:planned':
      return 'AI 规划';
    case 'planner:fallback':
      return 'Fallback';
    default:
      return eventType;
  }
}

function LastResultPanel({ status }: { status: PurposePlannerStatus | null }): JSX.Element {
  const lastResult = status?.lastResult;

  if (!lastResult) {
    return <div className="px-4 py-8 text-center text-sm text-muted-foreground">还没有目的规划器运行记录。</div>;
  }

  return (
    <div className="space-y-3 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn('text-[10px]', getStatusBadgeClass(lastResult.status))}>
          {getStatusLabel(lastResult.status)}
        </Badge>
        {lastResult.validationOk != null && (
          <Badge variant="outline" className={cn('text-[10px]', lastResult.validationOk ? 'border-emerald-500/30 text-emerald-600' : 'border-red-500/30 text-red-600')}>
            {lastResult.validationOk ? '校验通过' : '校验失败'}
          </Badge>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground" title={getHistoryTime(lastResult.timestamp)}>
          {formatRelativeTime(lastResult.timestamp)}
        </span>
      </div>

      {lastResult.whyThisPlan && <p className="text-sm leading-6 text-foreground">{lastResult.whyThisPlan}</p>}
      {lastResult.error && <p className="text-xs leading-5 text-red-600">{lastResult.error}</p>}

      <div className="grid gap-2 md:grid-cols-2">
        <StatusLine label="步骤数" value={lastResult.stepCount ?? '暂无'} />
        <StatusLine label="估算时长" value={formatDuration(lastResult.estimatedDurationMs)} />
        <StatusLine label="执行耗时" value={formatDuration(lastResult.elapsedMs)} />
        <StatusLine label="回退 preset" value={lastResult.fallbackPresetId || '无'} />
        <StatusLine label="原因" value={getReasonLabel(lastResult.reason) || '无'} />
        <StatusLine label="Prompt digest" value={lastResult.promptDigest || '暂无'} />
        <StatusLine label="Output digest" value={lastResult.outputDigest || '暂无'} />
      </div>
    </div>
  );
}

function PlannerHistoryCard({ entry }: { entry: PurposePlannerHistoryEntry }): JSX.Element {
  const result = asRecord(entry.result);
  const contextDigest = asRecord(entry.contextDigest);
  const validationOk = readBoolean(result, 'validationOk');
  const reason = readString(result, 'reason') ?? entry.summary;
  const errors = readStringList(result, 'errors');
  const warnings = readStringList(result, 'warnings');

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-card/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn('text-[10px]', entry.eventType === 'planner:planned' ? 'border-emerald-500/30 text-emerald-600' : 'border-amber-500/30 text-amber-600')}>
          {getHistoryEventLabel(entry.eventType)}
        </Badge>
        {validationOk != null && (
          <Badge variant="outline" className={cn('text-[10px]', validationOk ? 'border-emerald-500/30 text-emerald-600' : 'border-red-500/30 text-red-600')}>
            {validationOk ? '校验通过' : '校验失败'}
          </Badge>
        )}
        {entry.purposeKind && (
          <Badge variant="secondary" className="text-[10px]">
            {entry.purposeKind}
          </Badge>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground" title={getHistoryTime(entry.timestamp)}>
          {formatRelativeTime(entry.timestamp)}
        </span>
      </div>

      {reason && <p className="text-sm leading-6 text-foreground">{getReasonLabel(reason) ?? reason}</p>}
      {entry.error && <p className="text-xs leading-5 text-red-600">{entry.error}</p>}

      <div className="grid gap-2 md:grid-cols-2">
        <StatusLine label="Purpose" value={entry.purposeId} />
        <StatusLine label="状态" value={entry.status || '暂无'} />
        <StatusLine label="步骤数" value={readNumber(result, 'stepCount') ?? '暂无'} />
        <StatusLine label="估算时长" value={formatDuration(readNumber(result, 'estimatedDurationMs'))} />
        <StatusLine label="回退 preset" value={readString(result, 'fallbackPresetId') || '无'} />
        <StatusLine label="Prompt digest" value={readString(contextDigest, 'promptDigest') || '暂无'} />
        <StatusLine label="Output digest" value={readString(result, 'outputDigest') || '暂无'} />
      </div>

      {(errors.length > 0 || warnings.length > 0) && (
        <div className="space-y-1 text-xs leading-5 text-muted-foreground">
          {errors.length > 0 && <div>错误: {errors.join('；')}</div>}
          {warnings.length > 0 && <div>警告: {warnings.join('；')}</div>}
        </div>
      )}
    </div>
  );
}

export const PurposePlannerItem: React.FC<{
  state: PurposePlannerSettingsState;
  selected: boolean;
  onSelect: () => void;
}> = ({ state, selected, onSelect }) => (
  <div onClick={onSelect} className={cn('flex cursor-pointer items-center gap-3 rounded-xl p-3 transition-colors hover:bg-accent/50', selected && 'bg-accent ring-1 ring-primary/30')}>
    <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors', state.preferences.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
      <TbSparkles className="h-5 w-5" />
    </div>
    <div className="min-w-0 flex-1">
      <div className="text-sm font-medium text-foreground">目的规划器</div>
      <div className="line-clamp-1 text-xs text-muted-foreground">AI routine planner 的启用、限制和最近结果。</div>
    </div>
    <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
      {state.updating && <TbLoader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      <Switch checked={state.preferences.enabled} onCheckedChange={(checked) => void state.updatePreferences({ enabled: checked })} disabled={state.loading || state.updating} />
    </div>
  </div>
);

export const PurposePlannerDetailContent: React.FC<{ state: PurposePlannerSettingsState }> = ({ state }) => {
  const {
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
  } = state;
  const executorLabel = status?.hasExecutor ? 'runtime 已接入' : '缺少 executor';
  const lastResultSummary = useMemo(() => {
    if (!status?.lastResult) {
      return '暂无 planner 运行记录';
    }

    const reason = getReasonLabel(status.lastResult.reason);
    return reason ? `${getStatusLabel(status.lastResult.status)} · ${reason}` : getStatusLabel(status.lastResult.status);
  }, [status?.lastResult]);

  const handleHistoryLimitChange = useCallback(
    (value: number): void => {
      void updatePreferences({ historyLimit: clampHistoryLimit(value) });
    },
    [updatePreferences]
  );

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">加载中...</div>;
  }

  return (
    <Tabs defaultValue="settings" className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">目的规划器</h2>
          <p className="text-sm text-muted-foreground">控制 AI routine planner，并查看最近一次规划状态。</p>
        </div>
        <TabsList>
          <TabsTrigger value="settings">
            <TbSparkles className="h-4 w-4" />
            设置
          </TabsTrigger>
          <TabsTrigger value="diagnostics">
            <TbHistory className="h-4 w-4" />
            观测
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="settings" className="space-y-5">
        <SettingGroup title="总览">
          <SettingItem
            title="启用 AI 目的规划"
            description={preferences.enabled ? '新 purpose 会先尝试使用安全校验后的 AI routine。' : '关闭时始终使用内置 preset routine。'}
            action={<Switch checked={preferences.enabled} onCheckedChange={(checked) => void updatePreferences({ enabled: checked })} disabled={updating} />}
          />
          <SettingItem
            title="Executor 状态"
            description={status?.hasExecutor ? '主进程已接入 Pi runtime executor。' : '当前只能按 preset fallback 执行。'}
            action={
              <Badge variant="outline" className={cn(status?.hasExecutor ? 'border-emerald-500/30 text-emerald-600' : 'border-amber-500/30 text-amber-600')}>
                {executorLabel}
              </Badge>
            }
          />
          <SettingItem title="最近结果" description={lastResultSummary} />
        </SettingGroup>

        <SettingGroup title="历史上下文">
          <div className="space-y-4 px-4 py-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">Planner historyLimit</div>
                <div className="text-xs text-muted-foreground">传给 planner 的最近目的历史条数。</div>
              </div>
              <Input
                type="number"
                min={1}
                max={100}
                value={preferences.historyLimit}
                disabled={updating}
                onChange={(event) => handleHistoryLimitChange(Number(event.target.value))}
                className="w-24"
              />
            </div>
            <Slider value={[preferences.historyLimit]} min={1} max={100} step={1} disabled={updating} onValueChange={([value]) => handleHistoryLimitChange(value)} />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TbClock className="h-3.5 w-3.5" />
              当前保留 {preferences.historyLimit} 条目的历史给 planner 参考。
            </div>
          </div>
        </SettingGroup>
      </TabsContent>

      <TabsContent value="diagnostics" className="space-y-5">
        <SettingGroup title="运行状态">
          <SettingItem title="启用状态" description={preferences.enabled ? '已启用' : '已关闭'} />
          <SettingItem title="Executor" description={executorLabel} />
          <SettingItem
            title="手动试跑"
            description={lastSmokeResult ? `${lastSmokeResult.status} · ${lastSmokeResult.purpose.kind}` : smokeError ? `失败：${smokeError}` : '触发一个低风险 daily.care.reminder purpose，便于验证 planner / fallback 链路。'}
            action={
              <Button variant="outline" size="sm" onClick={() => void runSmokeTest()} disabled={smokeTesting}>
                {smokeTesting ? <TbLoader2 className="animate-spin" /> : <TbPlayerPlay />}
                试跑
              </Button>
            }
          />
          <SettingItem
            title="工作空间引导预设"
            description={
              lastPresetResult
                ? `${lastPresetResult.status} · ${lastPresetResult.purpose.kind}`
                : presetError
                  ? `失败：${presetError}`
                  : '直接执行 onboarding.workspace.create preset，用来在已有工作空间的电脑上测试创建引导气泡和窗口聚焦。'
            }
            action={
              <Button variant="outline" size="sm" onClick={() => void runWorkspaceOnboardingPreset()} disabled={presetTesting}>
                {presetTesting ? <TbLoader2 className="animate-spin" /> : <TbSparkles />}
                执行预设
              </Button>
            }
          />
          <SettingItem
            title="刷新状态"
            description="重新读取 planner preferences 与最近结果。"
            action={
              <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={updating}>
                <TbRefresh className={cn(updating && 'animate-spin')} />
                刷新
              </Button>
            }
          />
        </SettingGroup>

        <SettingGroup title="最近一次 planner 结果">
          <LastResultPanel status={status} />
        </SettingGroup>

        <SettingGroup title="Planner 历史">
          <div className="space-y-3 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground">最近 {history.length} 条 planner:planned / planner:fallback 记录。</div>
              <Button variant="outline" size="sm" onClick={() => void loadHistory()} disabled={historyLoading}>
                <TbRefresh className={cn(historyLoading && 'animate-spin')} />
                刷新
              </Button>
            </div>
            <ScrollArea className="h-[360px]">
              <div className="space-y-3 pr-3">
                {historyLoading ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">加载 planner 历史中...</div>
                ) : history.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">还没有 planner 计划或回退记录。</div>
                ) : (
                  history.map((entry) => <PlannerHistoryCard key={`${entry.timestamp}-${entry.purposeId}-${entry.eventType}`} entry={entry} />)
                )}
              </div>
            </ScrollArea>
          </div>
        </SettingGroup>
      </TabsContent>
    </Tabs>
  );
};

const PurposePlannerSettings: React.FC = () => {
  const state = usePurposePlannerSettings();
  return <PurposePlannerDetailContent state={state} />;
};

export default PurposePlannerSettings;

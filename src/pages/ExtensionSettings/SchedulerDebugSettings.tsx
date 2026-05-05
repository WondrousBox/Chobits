import type { ScheduleSpec, SchedulerAuditLogEntry, SchedulerAuditLogQuery, SchedulerAuditStatus } from '@main/scheduler';
import type { SchedulerIpcJobSnapshot } from '@main/scheduler/ipc-renderer';
import { Activity, Ban, Clock3, Download, History, Info, Pause, Play, RefreshCw, RotateCcw, TimerReset, Trash2, Zap } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getHistoryTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { SettingGroup } from '@/pages/SettingsPage/components/SettingComponents';

type EventFilter = SchedulerAuditLogQuery['eventType'] | 'all';
type StatusFilter = SchedulerAuditStatus | 'all';

function formatTimestamp(timestamp?: number): string {
  return timestamp ? getHistoryTime(timestamp) : '暂无';
}

function formatDuration(startedAt?: number, finishedAt?: number): string {
  if (!startedAt || !finishedAt) return '暂无';
  const ms = Math.max(0, finishedAt - startedAt);
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)}s`;
}

function getStatusLabel(status?: string): string {
  switch (status) {
    case 'success':
      return '成功';
    case 'skipped':
      return '跳过';
    case 'failed':
      return '失败';
    case 'paused':
      return '暂停';
    case 'resumed':
      return '恢复';
    default:
      return status || '暂无';
  }
}

function getStatusBadgeClass(status?: string): string {
  switch (status) {
    case 'success':
      return 'border-emerald-500/30 text-emerald-600';
    case 'skipped':
      return 'border-amber-500/30 text-amber-600';
    case 'failed':
      return 'border-red-500/30 text-red-600';
    case 'paused':
      return 'border-slate-500/30 text-slate-600';
    case 'resumed':
      return 'border-sky-500/30 text-sky-600';
    default:
      return 'border-border text-muted-foreground';
  }
}

function getEventLabel(eventType?: string): string {
  switch (eventType) {
    case 'run':
      return '运行';
    case 'control':
      return '控制';
    default:
      return eventType || '事件';
  }
}

function getControlActionLabel(action?: string): string {
  switch (action) {
    case 'pause-job':
      return '暂停 job';
    case 'resume-job':
      return '恢复 job';
    case 'pause-owner':
      return '暂停 owner';
    case 'resume-owner':
      return '恢复 owner';
    default:
      return action || '控制';
  }
}

function getTriggerLabel(trigger?: string): string {
  switch (trigger) {
    case 'scheduled':
      return '排期触发';
    case 'manual':
      return '按规则触发';
    case 'event':
      return '事件触发';
    case 'misfire':
      return '错过补偿';
    default:
      return trigger || '触发';
  }
}

function getSkipReasonLabel(reason?: string): string {
  if (!reason) return '无';
  if (reason.startsWith('paused:')) return `Job 暂停：${reason.slice('paused:'.length)}`;
  if (reason.startsWith('owner-paused:')) return `Owner 暂停：${reason.slice('owner-paused:'.length)}`;
  if (reason.startsWith('missing-gate:')) return `缺少准入 gate：${reason.slice('missing-gate:'.length)}`;
  if (reason.startsWith('gate:')) return `准入 gate 拒绝：${reason.slice('gate:'.length)}`;

  switch (reason) {
    case 'disabled':
      return 'Job 已禁用';
    case 'paused':
      return 'Job 已暂停';
    case 'owner-paused':
      return 'Owner 已暂停';
    case 'daily-limit':
      return '已达到每日上限';
    case 'cooldown':
      return '冷却时间未结束';
    case 'max-concurrent':
      return '并发数已满';
    case 'singleton-running':
      return '同名单例正在运行';
    case 'no-handler':
      return '缺少 owner handler';
    case 'handler-skipped':
      return '业务 handler 主动跳过';
    case 'daily-care-disabled':
      return '日常关心已关闭';
    case 'routine-disabled':
      return '例程已关闭';
    case 'system-idle':
      return '系统空闲，暂不提醒';
    case 'resume-cooldown':
      return '唤醒/解锁冷却中';
    case 'routine-not-found':
      return '未找到例程';
    case 'missing-routine-id':
      return '缺少例程 id';
    case 'movement-suspended':
      return '移动被当前交互暂停';
    case 'outside-active-window':
      return '不在生效时段内';
    case 'interval-not-elapsed':
      return '间隔尚未到达';
    case 'interval-not-aligned':
      return '未命中对齐时间点';
    case 'fixed-time-not-matched':
      return '未命中固定时间点';
    case 'calendar-date-not-matched':
      return '未命中日历日期';
    case 'calendar-time-not-matched':
      return '未命中日历时间点';
    case 'outside-days-of-week':
      return '不在允许星期内';
    case 'snoozed':
      return '已稍后提醒';
    case 'already-triggered':
      return '本周期已触发';
    case 'once-per-day':
      return '今日已触发';
    case 'not-due':
      return '业务判断尚未到期';
    default:
      return reason;
  }
}

function formatSchedule(spec: ScheduleSpec): string {
  switch (spec.kind) {
    case 'cron':
      return `cron · ${spec.expression}${spec.timezone ? ` · ${spec.timezone}` : ''}`;
    case 'date':
      return `date · ${formatTimestamp(spec.at)}`;
    case 'interval':
      return `interval · ${Math.round(spec.everyMs / 1000)}s`;
    case 'randomInterval':
      return `random · ${Math.round(spec.minMs / 1000)}-${Math.round(spec.maxMs / 1000)}s`;
    case 'event':
      return `event · ${spec.eventType}`;
    case 'manual':
      return 'manual';
    default:
      return 'unknown';
  }
}

function formatAuditMode(entry: SchedulerAuditLogEntry): string {
  if (entry.eventType !== 'run') return getEventLabel(entry.eventType);
  return entry.force ? '强制触发' : getTriggerLabel(entry.trigger);
}

function parseLocalDateTime(value: string): number | undefined {
  if (!value) return undefined;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function parseOptionalPositiveInteger(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function toJson(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

function JobStatusBadge({ job }: { job: SchedulerIpcJobSnapshot }): JSX.Element {
  if (job.paused) {
    return (
      <Badge variant="outline" className="border-slate-500/30 text-slate-600">
        {job.pausedByOwner ? 'Owner 暂停' : '已暂停'}
      </Badge>
    );
  }

  if (job.active) {
    return (
      <Badge variant="outline" className="border-emerald-500/30 text-emerald-600">
        已排期
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
      未排期
    </Badge>
  );
}

function SchedulerItemSummary({ loading }: { loading: boolean }): JSX.Element {
  if (loading) {
    return <span className="text-[11px] text-muted-foreground">加载中</span>;
  }

  return <span className="text-[11px] text-muted-foreground">主进程</span>;
}

export const SchedulerDebugItem: React.FC<{
  loading?: boolean;
  selected: boolean;
  onSelect: () => void;
}> = ({ loading = false, selected, onSelect }) => (
  <div onClick={onSelect} className={cn('flex cursor-pointer items-center gap-3 rounded-lg p-3 transition-colors hover:bg-accent/50', selected && 'bg-accent ring-1 ring-primary/30')}>
    <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', selected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
      <TimerReset className="h-5 w-5" />
    </div>
    <div className="min-w-0 flex-1">
      <div className="text-sm font-medium text-foreground">调度中心</div>
      <div className="line-clamp-1 text-xs text-muted-foreground">主进程 job、暂停态和运行历史</div>
    </div>
    <SchedulerItemSummary loading={loading} />
  </div>
);

function OwnerControlRow({
  owner,
  paused,
  pauseReason,
  jobCount,
  working,
  onPause,
  onResume
}: {
  owner: string;
  paused: boolean;
  pauseReason?: string;
  jobCount: number;
  working: boolean;
  onPause: (owner: string) => void;
  onResume: (owner: string) => void;
}): JSX.Element {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{owner}</div>
        <div className="truncate text-xs text-muted-foreground">
          {jobCount} jobs{pauseReason ? ` · ${pauseReason}` : ''}
        </div>
      </div>
      <Badge variant="outline" className={cn('text-[10px]', paused ? 'border-slate-500/30 text-slate-600' : 'border-emerald-500/30 text-emerald-600')}>
        {paused ? '已暂停' : '运行中'}
      </Badge>
      <Button size="icon" variant="ghost" className="h-8 w-8" title={paused ? '恢复 owner' : '暂停 owner'} disabled={working} onClick={() => (paused ? onResume(owner) : onPause(owner))}>
        {paused ? <RotateCcw className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
      </Button>
    </div>
  );
}

function AuditLogItem({ entry }: { entry: SchedulerAuditLogEntry }): JSX.Element {
  const title = entry.eventType === 'control' ? getControlActionLabel(entry.action) : entry.jobName || entry.jobId || entry.owner;
  const detail = entry.error || (entry.reason ? getSkipReasonLabel(entry.reason) : undefined) || entry.trigger || '无附加信息';

  return (
    <div className="rounded-lg border border-border/70 bg-card/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          {getEventLabel(entry.eventType)}
        </Badge>
        <Badge variant="outline" className={cn('text-[10px]', getStatusBadgeClass(entry.status))}>
          {getStatusLabel(entry.status)}
        </Badge>
        {entry.force && (
          <Badge variant="outline" className="border-rose-500/30 text-rose-600 text-[10px]">
            强制
          </Badge>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground" title={formatTimestamp(entry.finishedAt)}>
          {formatTimestamp(entry.finishedAt)}
        </span>
      </div>
      <div className="mt-2 min-w-0">
        <div className="truncate text-sm font-medium text-foreground">{title}</div>
        <div className="truncate text-xs text-muted-foreground">{entry.jobId || entry.owner}</div>
      </div>
      <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
        <div className="truncate">owner: {entry.owner}</div>
        <div className="truncate">耗时: {formatDuration(entry.startedAt, entry.finishedAt)}</div>
        <div className="truncate">计划时间: {formatTimestamp(entry.scheduledFor)}</div>
        <div className="truncate">模式: {formatAuditMode(entry)}</div>
        <div className="truncate">原因: {detail}</div>
      </div>
    </div>
  );
}

function JobDetailDialog({
  job,
  auditLog,
  auditLoading,
  onOpenChange
}: {
  job: SchedulerIpcJobSnapshot | null;
  auditLog: SchedulerAuditLogEntry[];
  auditLoading: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const detail = job
    ? {
        schedule: job.definition.schedule,
        runPolicy: job.definition.runPolicy ?? null,
        admission: job.definition.admission ?? null
      }
    : null;

  return (
    <Dialog open={!!job} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{job?.definition.name ?? 'Job 详情'}</DialogTitle>
          <DialogDescription>{job?.definition.id}</DialogDescription>
        </DialogHeader>
        {job && (
          <div className="space-y-4">
            <div className="grid gap-3 text-sm md:grid-cols-3">
              <div>
                <div className="text-xs text-muted-foreground">Owner</div>
                <div className="mt-1 font-medium text-foreground">{job.definition.owner}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">排期</div>
                <div className="mt-1 font-medium text-foreground">{formatSchedule(job.definition.schedule)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">状态</div>
                <div className="mt-1">
                  <JobStatusBadge job={job} />
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">下次运行</div>
                <div className="mt-1 font-medium text-foreground">{formatTimestamp(job.runtime.nextRunAt)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">最近完成</div>
                <div className="mt-1 font-medium text-foreground">{formatTimestamp(job.runtime.lastFinishedAt)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">最近结果</div>
                <div className="mt-1 font-medium text-foreground">{job.runtime.lastError || (job.runtime.lastSkipReason ? getSkipReasonLabel(job.runtime.lastSkipReason) : getStatusLabel(job.runtime.lastStatus))}</div>
              </div>
            </div>
            <ScrollArea className="max-h-[340px] rounded-md border border-border bg-muted/30">
              <pre className="whitespace-pre-wrap break-words p-3 text-xs leading-5 text-muted-foreground">{toJson(detail)}</pre>
            </ScrollArea>
            <div>
              <div className="mb-2 text-xs font-medium text-muted-foreground">最近历史</div>
              <ScrollArea className="max-h-[280px] rounded-md border border-border bg-muted/20">
                {auditLog.length === 0 ? (
                  <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">{auditLoading ? '加载中...' : '暂无历史'}</div>
                ) : (
                  <div className="space-y-2 p-2">
                    {auditLog.map((entry) => (
                      <AuditLogItem key={entry.id} entry={entry} />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export const SchedulerDebugDetailContent: React.FC = () => {
  const [jobs, setJobs] = useState<SchedulerIpcJobSnapshot[]>([]);
  const [ownerPauseState, setOwnerPauseState] = useState<Record<string, { paused?: boolean; pauseReason?: string }>>({});
  const [auditLog, setAuditLog] = useState<SchedulerAuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(true);
  const [workingKey, setWorkingKey] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [eventFilter, setEventFilter] = useState<EventFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [historyJobFilter, setHistoryJobFilter] = useState('all');
  const [historySince, setHistorySince] = useState('');
  const [historyUntil, setHistoryUntil] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedJob, setSelectedJob] = useState<SchedulerIpcJobSnapshot | null>(null);
  const [selectedJobAuditLog, setSelectedJobAuditLog] = useState<SchedulerAuditLogEntry[]>([]);
  const [selectedJobAuditLoading, setSelectedJobAuditLoading] = useState(false);
  const [cleanupRetentionDays, setCleanupRetentionDays] = useState('30');
  const [cleanupMaxFiles, setCleanupMaxFiles] = useState('60');

  const scheduler = window.YUA.scheduler;

  const ownerOptions = useMemo(() => {
    const owners = new Set<string>();
    jobs.forEach((job) => owners.add(job.definition.owner));
    Object.keys(ownerPauseState).forEach((owner) => owners.add(owner));
    return Array.from(owners).sort();
  }, [jobs, ownerPauseState]);

  const jobOptions = useMemo(() => {
    return jobs
      .map((job) => ({
        id: job.definition.id,
        label: job.definition.name
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [jobs]);

  const filteredJobs = useMemo(() => jobs.filter((job) => ownerFilter === 'all' || job.definition.owner === ownerFilter), [jobs, ownerFilter]);

  const ownerRows = useMemo(() => {
    return ownerOptions.map((owner) => ({
      owner,
      jobCount: jobs.filter((job) => job.definition.owner === owner).length,
      paused: ownerPauseState[owner]?.paused === true,
      pauseReason: ownerPauseState[owner]?.pauseReason
    }));
  }, [jobs, ownerOptions, ownerPauseState]);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const [nextJobs, nextOwnerPauseState] = await Promise.all([scheduler.listJobs(), scheduler.getOwnerPauseState()]);
      setJobs(nextJobs);
      setOwnerPauseState(nextOwnerPauseState);
    } catch (error) {
      toast.error('调度状态加载失败', { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  }, [scheduler]);

  const loadAuditLog = useCallback(async () => {
    setAuditLoading(true);
    try {
      const query: SchedulerAuditLogQuery = {
        limit: 120,
        jobId: historyJobFilter === 'all' ? undefined : historyJobFilter,
        owner: ownerFilter === 'all' ? undefined : ownerFilter,
        eventType: eventFilter === 'all' ? undefined : eventFilter,
        status: statusFilter === 'all' ? undefined : statusFilter,
        since: parseLocalDateTime(historySince),
        until: parseLocalDateTime(historyUntil)
      };
      setAuditLog(await scheduler.listAuditLog(query));
    } catch (error) {
      toast.error('调度历史加载失败', { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setAuditLoading(false);
    }
  }, [eventFilter, historyJobFilter, historySince, historyUntil, ownerFilter, scheduler, statusFilter]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadJobs(), loadAuditLog()]);
  }, [loadAuditLog, loadJobs]);

  const loadSelectedJobAuditLog = useCallback(
    async (jobId: string) => {
      setSelectedJobAuditLoading(true);
      try {
        setSelectedJobAuditLog(await scheduler.listAuditLog({ jobId, limit: 12 }));
      } catch (error) {
        setSelectedJobAuditLog([]);
        toast.error('Job 历史加载失败', { description: error instanceof Error ? error.message : String(error) });
      } finally {
        setSelectedJobAuditLoading(false);
      }
    },
    [scheduler]
  );

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    void loadAuditLog();
  }, [loadAuditLog]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    return scheduler.onUpdated(() => {
      void refreshAll();
      if (selectedJob) {
        void loadSelectedJobAuditLog(selectedJob.definition.id);
      }
    });
  }, [autoRefresh, loadSelectedJobAuditLog, refreshAll, scheduler, selectedJob]);

  useEffect(() => {
    if (!selectedJob) {
      setSelectedJobAuditLog([]);
      setSelectedJobAuditLoading(false);
      return undefined;
    }

    void loadSelectedJobAuditLog(selectedJob.definition.id);
    return undefined;
  }, [loadSelectedJobAuditLog, selectedJob]);

  const runAction = useCallback(
    async (key: string, action: () => Promise<unknown>, successText: string) => {
      setWorkingKey(key);
      try {
        await action();
        toast.success(successText);
        await refreshAll();
      } catch (error) {
        toast.error('调度操作失败', { description: error instanceof Error ? error.message : String(error) });
      } finally {
        setWorkingKey(null);
      }
    },
    [refreshAll]
  );

  const exportAuditLog = useCallback(() => {
    const content = auditLog.map((entry) => JSON.stringify(entry)).join('\n');
    const blob = new Blob([content, content ? '\n' : ''], { type: 'application/jsonl;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `scheduler-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success('已导出当前历史');
  }, [auditLog]);

  const cleanupAuditLog = useCallback(async () => {
    setWorkingKey('audit:cleanup');
    try {
      const result = await scheduler.cleanupAuditLog({
        retentionDays: parseOptionalPositiveInteger(cleanupRetentionDays),
        maxFiles: parseOptionalPositiveInteger(cleanupMaxFiles)
      });
      toast.success(result.deletedFiles.length ? `已清理 ${result.deletedFiles.length} 个历史文件` : '没有需要清理的历史文件');
      await loadAuditLog();
    } catch (error) {
      toast.error('调度历史清理失败', { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setWorkingKey(null);
    }
  }, [cleanupMaxFiles, cleanupRetentionDays, loadAuditLog, scheduler]);

  return (
    <>
    <Tabs defaultValue="jobs" className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">调度中心</h2>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{jobs.length} jobs</span>
            <span>{jobs.filter((job) => job.active).length} active</span>
            <span>{jobs.filter((job) => job.paused).length} paused</span>
            <span>{jobs.filter((job) => job.runtime.lastStatus === 'failed').length} failed</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-8 items-center gap-2 rounded-md border border-border px-2">
            <Switch id="scheduler-auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
            <Label htmlFor="scheduler-auto-refresh" className="text-xs text-muted-foreground">
              自动刷新
            </Label>
          </div>
          <Button size="icon" variant="outline" title="刷新" onClick={() => void refreshAll()} disabled={loading || auditLoading}>
            <RefreshCw className={cn('h-4 w-4', (loading || auditLoading) && 'animate-spin')} />
          </Button>
          <TabsList>
            <TabsTrigger value="jobs">
              <Activity className="h-4 w-4" />
              Jobs
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="h-4 w-4" />
              历史
            </TabsTrigger>
          </TabsList>
        </div>
      </div>

      <TabsContent value="jobs" className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="h-8 w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部 owner</SelectItem>
              {ownerOptions.map((owner) => (
                <SelectItem key={owner} value={owner}>
                  {owner}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <SettingGroup title="Owner 控制">
          {ownerRows.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">暂无 owner</div>
          ) : (
            ownerRows.map((row) => (
              <OwnerControlRow
                key={row.owner}
                owner={row.owner}
                paused={row.paused}
                pauseReason={row.pauseReason}
                jobCount={row.jobCount}
                working={workingKey === `owner:${row.owner}`}
                onPause={(owner) => void runAction(`owner:${owner}`, () => scheduler.pauseOwner(owner, 'debug-panel'), 'Owner 已暂停')}
                onResume={(owner) => void runAction(`owner:${owner}`, () => scheduler.resumeOwner(owner), 'Owner 已恢复')}
              />
            ))
          )}
        </SettingGroup>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[34%]">Job</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>下次运行</TableHead>
                <TableHead>最近结果</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredJobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                    {loading ? '加载中...' : '暂无 job'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredJobs.map((job) => {
                  const rowWorking = workingKey?.endsWith(job.definition.id) === true;
                  const canResumeJob = job.runtime.paused === true;
                  return (
                    <TableRow key={job.definition.id}>
                      <TableCell>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">{job.definition.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{job.definition.id}</div>
                          <div className="truncate text-[11px] text-muted-foreground">{job.definition.owner}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <JobStatusBadge job={job} />
                          {job.runningCount > 0 && <div className="text-[11px] text-muted-foreground">running: {job.runningCount}</div>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatTimestamp(job.runtime.nextRunAt)}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Badge variant="outline" className={cn('text-[10px]', getStatusBadgeClass(job.runtime.lastStatus))}>
                            {getStatusLabel(job.runtime.lastStatus)}
                          </Badge>
                          <div className="max-w-[220px] truncate text-xs text-muted-foreground">
                            {job.runtime.lastError || (job.runtime.lastSkipReason ? getSkipReasonLabel(job.runtime.lastSkipReason) : formatTimestamp(job.runtime.lastFinishedAt))}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8" title="查看详情" onClick={() => setSelectedJob(job)}>
                            <Info className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title="立即触发"
                            disabled={rowWorking}
                            onClick={() => void runAction(`run:${job.definition.id}`, () => scheduler.triggerNow(job.definition.id), 'Job 已触发')}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-rose-600 hover:text-rose-600"
                            title="强制触发"
                            disabled={rowWorking}
                            onClick={() => void runAction(`force:${job.definition.id}`, () => scheduler.triggerNow(job.definition.id, { force: true }), 'Job 已强制触发')}
                          >
                            <Zap className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title={canResumeJob ? '恢复 job' : '暂停 job'}
                            disabled={rowWorking || job.pausedByOwner}
                            onClick={() =>
                              void runAction(
                                canResumeJob ? `resume:${job.definition.id}` : `pause:${job.definition.id}`,
                                () => (canResumeJob ? scheduler.resumeJob(job.definition.id) : scheduler.pauseJob(job.definition.id, 'debug-panel')),
                                canResumeJob ? 'Job 已恢复' : 'Job 已暂停'
                              )
                            }
                          >
                            {canResumeJob ? <RotateCcw className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      <TabsContent value="history" className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="h-8 w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部 owner</SelectItem>
              {ownerOptions.map((owner) => (
                <SelectItem key={owner} value={owner}>
                  {owner}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={historyJobFilter} onValueChange={setHistoryJobFilter}>
            <SelectTrigger className="h-8 w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部 job</SelectItem>
              {jobOptions.map((job) => (
                <SelectItem key={job.id} value={job.id}>
                  {job.label} · {job.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={eventFilter} onValueChange={(value) => setEventFilter(value as EventFilter)}>
            <SelectTrigger className="h-8 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部事件</SelectItem>
              <SelectItem value="run">运行</SelectItem>
              <SelectItem value="control">控制</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
            <SelectTrigger className="h-8 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="success">成功</SelectItem>
              <SelectItem value="skipped">跳过</SelectItem>
              <SelectItem value="failed">失败</SelectItem>
              <SelectItem value="paused">暂停</SelectItem>
              <SelectItem value="resumed">恢复</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Label htmlFor="scheduler-history-since" className="text-xs text-muted-foreground">
              从
            </Label>
            <Input id="scheduler-history-since" type="datetime-local" value={historySince} onChange={(event) => setHistorySince(event.target.value)} className="h-8 w-[190px]" />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="scheduler-history-until" className="text-xs text-muted-foreground">
              到
            </Label>
            <Input id="scheduler-history-until" type="datetime-local" value={historyUntil} onChange={(event) => setHistoryUntil(event.target.value)} className="h-8 w-[190px]" />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="scheduler-cleanup-days" className="text-xs text-muted-foreground">
              保留天数
            </Label>
            <Input id="scheduler-cleanup-days" type="number" min={1} value={cleanupRetentionDays} onChange={(event) => setCleanupRetentionDays(event.target.value)} className="h-8 w-[82px]" />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="scheduler-cleanup-files" className="text-xs text-muted-foreground">
              文件上限
            </Label>
            <Input id="scheduler-cleanup-files" type="number" min={1} value={cleanupMaxFiles} onChange={(event) => setCleanupMaxFiles(event.target.value)} className="h-8 w-[82px]" />
          </div>
          <Button size="icon" variant="outline" title="刷新历史" onClick={() => void loadAuditLog()} disabled={auditLoading}>
            <Clock3 className={cn('h-4 w-4', auditLoading && 'animate-spin')} />
          </Button>
          <Button size="icon" variant="outline" title="导出当前历史" onClick={exportAuditLog} disabled={auditLog.length === 0}>
            <Download className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" title="清理过期历史" onClick={() => void cleanupAuditLog()} disabled={workingKey === 'audit:cleanup'}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="h-[430px] rounded-lg border border-border bg-card">
          {auditLog.length === 0 ? (
            <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Ban className="h-4 w-4" />
              {auditLoading ? '加载中...' : '暂无历史'}
            </div>
          ) : (
            <div className="space-y-2 p-3">
              {auditLog.map((entry) => (
                <AuditLogItem key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </ScrollArea>
      </TabsContent>
    </Tabs>
    <JobDetailDialog job={selectedJob} auditLog={selectedJobAuditLog} auditLoading={selectedJobAuditLoading} onOpenChange={(open) => !open && setSelectedJob(null)} />
    </>
  );
};

const SchedulerDebugSettings: React.FC = () => <SchedulerDebugDetailContent />;

export default SchedulerDebugSettings;

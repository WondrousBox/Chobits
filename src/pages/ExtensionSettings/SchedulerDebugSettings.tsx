import type { SchedulerAuditLogEntry, SchedulerAuditLogQuery, SchedulerAuditStatus } from '@main/scheduler';
import type { SchedulerIpcJobSnapshot } from '@main/scheduler/ipc-renderer';
import { Activity, Ban, Clock3, History, Pause, Play, RefreshCw, RotateCcw, TimerReset } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  const detail = entry.error || entry.reason || entry.trigger || '无附加信息';

  return (
    <div className="rounded-lg border border-border/70 bg-card/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          {getEventLabel(entry.eventType)}
        </Badge>
        <Badge variant="outline" className={cn('text-[10px]', getStatusBadgeClass(entry.status))}>
          {getStatusLabel(entry.status)}
        </Badge>
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
        <div className="truncate">原因: {detail}</div>
      </div>
    </div>
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

  const scheduler = window.YUA.scheduler;

  const ownerOptions = useMemo(() => {
    const owners = new Set<string>();
    jobs.forEach((job) => owners.add(job.definition.owner));
    Object.keys(ownerPauseState).forEach((owner) => owners.add(owner));
    return Array.from(owners).sort();
  }, [jobs, ownerPauseState]);

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
        limit: 80,
        owner: ownerFilter === 'all' ? undefined : ownerFilter,
        eventType: eventFilter === 'all' ? undefined : eventFilter,
        status: statusFilter === 'all' ? undefined : statusFilter
      };
      setAuditLog(await scheduler.listAuditLog(query));
    } catch (error) {
      toast.error('调度历史加载失败', { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setAuditLoading(false);
    }
  }, [eventFilter, ownerFilter, scheduler, statusFilter]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadJobs(), loadAuditLog()]);
  }, [loadAuditLog, loadJobs]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    void loadAuditLog();
  }, [loadAuditLog]);

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

  return (
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
                            {job.runtime.lastError || job.runtime.lastSkipReason || formatTimestamp(job.runtime.lastFinishedAt)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
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
          <Button size="icon" variant="outline" title="刷新历史" onClick={() => void loadAuditLog()} disabled={auditLoading}>
            <Clock3 className={cn('h-4 w-4', auditLoading && 'animate-spin')} />
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
  );
};

const SchedulerDebugSettings: React.FC = () => <SchedulerDebugDetailContent />;

export default SchedulerDebugSettings;

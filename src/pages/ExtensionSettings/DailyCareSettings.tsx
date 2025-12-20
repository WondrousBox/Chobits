import dayjs from 'dayjs';
import { CustomReminderInput, DailyCareRoutineSnapshot, DailyCareSnapshot } from 'electron/main/daily/types';
import { AnimatePresence, motion } from 'framer-motion';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TbCalendarEvent, TbChevronDown, TbHeartbeat, TbRefresh, TbTrash, TbWand } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

type ReminderFormState = {
  title: string;
  kind: CustomReminderInput['kind'];
  date: string;
  time: string;
  repeat: NonNullable<CustomReminderInput['repeat']>;
  leadMinutes: string;
  message: string;
};

const reminderKindOptions: Array<{ label: string; value: CustomReminderInput['kind'] }> = [
  { label: '会议 / 行程', value: 'meeting' },
  { label: '生日 / 纪念日', value: 'birthday' },
  { label: '父母 / 家人', value: 'family' },
  { label: '自定义', value: 'general' }
];

const repeatOptions: Array<{ label: string; value: NonNullable<CustomReminderInput['repeat']> }> = [
  { label: '不重复', value: 'none' },
  { label: '每年重复', value: 'annual' }
];

const getDefaultForm = (): ReminderFormState => ({
  title: '',
  kind: 'meeting',
  date: dayjs().format('YYYY-MM-DD'),
  time: '09:00',
  repeat: 'none',
  leadMinutes: '15',
  message: ''
});

const formatLastTriggered = (label?: string | null): string => {
  if (!label) return '尚未触发';
  return label;
};

type DailyCareSettingsProps = {
  expanded: boolean;
  onExpand: () => void;
};

const DailyCareSettings: React.FC<DailyCareSettingsProps> = ({ expanded, onExpand }) => {
  const bridge = window.YUA.dailyCare;
  const [snapshot, setSnapshot] = useState<DailyCareSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [globalPending, setGlobalPending] = useState(false);
  const [routinePendingId, setRoutinePendingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<ReminderFormState>(getDefaultForm);
  const [formPending, setFormPending] = useState(false);

  const fetchSnapshot = useCallback(async () => {
    if (!bridge) return;
    setLoading(true);
    try {
      const data = await bridge['dailyCare:getSnapshot']();
      setSnapshot(data);
    } catch (error) {
      console.warn('[daily-care] failed to load snapshot', error);
    } finally {
      setLoading(false);
    }
  }, [bridge]);

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  const groupedRoutines = useMemo(() => {
    const buckets: Record<'core' | 'seasonal' | 'custom', DailyCareRoutineSnapshot[]> = {
      core: [],
      seasonal: [],
      custom: []
    };
    snapshot?.routines.forEach((routine) => {
      if (routine.source === 'custom') {
        buckets.custom.push(routine);
      } else if (routine.kind === 'festival' || routine.kind === 'family') {
        buckets.seasonal.push(routine);
      } else {
        buckets.core.push(routine);
      }
    });
    return buckets;
  }, [snapshot]);

  const handleToggleGlobal = async (nextEnabled: boolean): Promise<void> => {
    if (!bridge) return;
    if (nextEnabled && !enabled) {
      onExpand();
    }
    setGlobalPending(true);
    try {
      const next = await bridge['dailyCare:updateSettings']({ enabled: nextEnabled });
      setSnapshot(next);
    } catch (error) {
      console.warn('[daily-care] failed to update global toggle', error);
    } finally {
      setGlobalPending(false);
    }
  };

  const handleRoutineToggle = async (id: string, nextEnabled: boolean): Promise<void> => {
    if (!bridge) return;
    setRoutinePendingId(id);
    try {
      const next = await bridge['dailyCare:updateSettings']({
        routines: { [id]: { enabled: nextEnabled } }
      });
      setSnapshot(next);
    } catch (error) {
      console.warn('[daily-care] failed to toggle routine', error);
    } finally {
      setRoutinePendingId(null);
    }
  };

  const handleSubmitReminder = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!bridge) return;
    if (!formState.title.trim()) return;
    setFormPending(true);
    try {
      const payload: CustomReminderInput = {
        title: formState.title.trim(),
        kind: formState.kind,
        date: formState.date,
        time: formState.time,
        repeat: formState.repeat,
        leadMinutes: Number(formState.leadMinutes) || 0,
        message: formState.message.trim() || undefined,
        enabled: true
      };
      const { snapshot: nextSnapshot } = await bridge['dailyCare:upsertCustomReminder'](payload);
      setSnapshot(nextSnapshot);
      setFormState(getDefaultForm());
    } catch (error) {
      console.warn('[daily-care] failed to create reminder', error);
    } finally {
      setFormPending(false);
    }
  };

  const handleRemoveReminder = async (id: string): Promise<void> => {
    if (!bridge) return;
    try {
      const next = await bridge['dailyCare:removeCustomReminder'](id);
      setSnapshot(next);
    } catch (error) {
      console.warn('[daily-care] failed to remove reminder', error);
    }
  };

  if (!bridge) {
    return (
      <div className="p-4">
        <div className="rounded-xl border border-dashed border-amber-500/70 bg-amber-500/10 px-4 py-6 text-sm text-amber-900">当前版本暂未启用日常关心模块。请更新客户端或联系开发者。</div>
      </div>
    );
  }

  const enabled = snapshot?.enabled ?? false;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <TbHeartbeat className="h-6 w-6" />
            </div>
            <div>
              <div className="text-base font-semibold text-foreground">日常关心模式</div>
              <div className="text-sm text-muted-foreground">健康提醒、节日彩蛋、自定义会议与生日提醒。</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {enabled && (
              <Button variant="ghost" size="icon" className={`w-8 h-8 transition-transform ${expanded ? 'rotate-180' : ''}`} onClick={onExpand}>
                <TbChevronDown className="h-4 w-4" />
              </Button>
            )}
            <Switch checked={enabled} onCheckedChange={handleToggleGlobal} disabled={globalPending} />
            <Button variant="ghost" className="w-8 h-8" size="icon" onClick={fetchSnapshot} disabled={loading}>
              <TbRefresh />
            </Button>
          </div>
        </div>
        <AnimatePresence initial={false}>
          {enabled && expanded && (
            <motion.div
              key="daily-care-settings-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-base font-semibold text-foreground">核心提醒</p>
                      <p className="text-xs text-muted-foreground">喝水 / 拉伸 / 夜间守护 / 节日彩蛋</p>
                    </div>
                  </div>
                  <ScrollArea className="h-[360px] pr-4">
                    {['core', 'seasonal', 'custom'].map((bucket) => {
                      const titleMap: Record<typeof bucket, string> = {
                        core: '日常节奏',
                        seasonal: '节日 & 家庭提醒',
                        custom: '自定义例程'
                      };
                      const routines = groupedRoutines[bucket as keyof typeof groupedRoutines];
                      if (!routines.length) return null;
                      return (
                        <div key={bucket} className="mb-4">
                          <p className="mb-2 text-sm font-semibold text-muted-foreground">{titleMap[bucket as keyof typeof titleMap]}</p>
                          <div className="space-y-3">
                            {routines.map((routine) => (
                              <div key={routine.id} className="rounded-xl border border-border/70 bg-background/80 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold text-foreground">{routine.title}</p>
                                    <p className="text-xs text-muted-foreground">{routine.scheduleLabel}</p>
                                  </div>
                                  <Switch checked={routine.enabled} disabled={routinePendingId === routine.id} onCheckedChange={(val) => handleRoutineToggle(routine.id, val)} />
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <span className="rounded-full bg-muted px-2 py-0.5">{routine.kind}</span>
                                  <span>上次触发：{formatLastTriggered(routine.lastTriggeredLabel)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </ScrollArea>
                </div>

                <div className="space-y-5">
                  <form onSubmit={handleSubmitReminder} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <div className="mb-3">
                      <p className="text-base font-semibold text-foreground">新建自定义提醒</p>
                      <p className="text-xs text-muted-foreground">创建会议、生日或家庭问候提醒</p>
                    </div>
                    <div className="space-y-3">
                      <Input placeholder="标题，如「下午例会」" value={formState.title} onChange={(e) => setFormState((prev) => ({ ...prev, title: e.target.value }))} />
                      <div className="grid gap-3 md:grid-cols-2">
                        <Select value={formState.kind} onValueChange={(value: ReminderFormState['kind']) => setFormState((prev) => ({ ...prev, kind: value }))}>
                          <SelectTrigger>
                            <SelectValue placeholder="提醒类型" />
                          </SelectTrigger>
                          <SelectContent>
                            {reminderKindOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={formState.repeat} onValueChange={(value: string) => setFormState((prev) => ({ ...prev, repeat: value as ReminderFormState['repeat'] }))}>
                          <SelectTrigger>
                            <SelectValue placeholder="重复" />
                          </SelectTrigger>
                          <SelectContent>
                            {repeatOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Input type="date" value={formState.date} onChange={(e) => setFormState((prev) => ({ ...prev, date: e.target.value }))} />
                        <Input type="time" value={formState.time} onChange={(e) => setFormState((prev) => ({ ...prev, time: e.target.value }))} />
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Input type="number" min={0} placeholder="提前分钟数" value={formState.leadMinutes} onChange={(e) => setFormState((prev) => ({ ...prev, leadMinutes: e.target.value }))} />
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <TbWand className="h-4 w-4" />
                          提前提醒分钟数（默认 15 分钟）
                        </div>
                      </div>
                      <Textarea placeholder="可选：提醒文案，如「记得和家里通个电话」" value={formState.message} onChange={(e) => setFormState((prev) => ({ ...prev, message: e.target.value }))} />
                      <Button type="submit" size="sm" className="w-full" disabled={formPending}>
                        保存提醒
                      </Button>
                    </div>
                  </form>

                  <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <p className="text-base font-semibold text-foreground">我的提醒列表</p>
                        <p className="text-xs text-muted-foreground">支持改日/删除，保持和家人的联系</p>
                      </div>
                    </div>
                    <ScrollArea className="h-[260px] pr-4">
                      {snapshot?.customReminders.length ? (
                        <div className="space-y-3">
                          {snapshot.customReminders.map((reminder) => (
                            <div key={reminder.id} className="rounded-xl border border-border/60 bg-background/80 p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-foreground">{reminder.title}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {reminder.date} {reminder.time} · {reminder.repeat === 'annual' ? '每年重复' : '单次'}
                                  </p>
                                </div>
                                <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleRemoveReminder(reminder.id)}>
                                  <TbTrash className="h-4 w-4" />
                                </Button>
                              </div>
                              {reminder.message && <p className="mt-2 text-xs text-muted-foreground">{reminder.message}</p>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                          <TbCalendarEvent className="h-6 w-6" />
                          <span>还没有自定义提醒，先在上方创建一个吧。</span>
                        </div>
                      )}
                    </ScrollArea>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default DailyCareSettings;

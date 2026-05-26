import { AppEvent } from '@packages/event/events';
import type { QuestListItem, QuestListItemStatus, QuestListSnapshot } from '@packages/sprite-core/quest';
import { CheckCircle2, Circle, Gift, Loader2, Play, RefreshCcw, Sparkles, Trophy, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type QuestFilter = 'onboarding' | 'feature-intro' | 'all' | 'done';

const statusLabels: Record<QuestListItemStatus, string> = {
  pending: '未开始',
  active: '进行中',
  done: '已完成',
  skipped: '已跳过'
};

const statusStyles: Record<QuestListItemStatus, string> = {
  pending: 'border-slate-200 bg-slate-50 text-slate-600',
  active: 'border-blue-200 bg-blue-50 text-blue-700',
  done: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  skipped: 'border-zinc-200 bg-zinc-50 text-zinc-500'
};

const categoryLabels: Record<QuestListItem['category'], string> = {
  onboarding: '新手引导',
  'feature-intro': '功能自述',
  daily: '日常',
  achievement: '成就',
  event: '活动'
};

function formatReward(item: QuestListItem): string[] {
  const reward = item.reward;
  if (!reward) return [];
  const parts: string[] = [];
  if (reward.xp) parts.push(`XP +${reward.xp}`);
  if (reward.favor) parts.push(`好感 +${reward.favor}`);
  if (reward.achievementId) parts.push('成就');
  return parts;
}

function filterQuestItems(items: QuestListItem[], filter: QuestFilter): QuestListItem[] {
  if (filter === 'onboarding') return items.filter((item) => item.category === 'onboarding');
  if (filter === 'feature-intro') return items.filter((item) => item.category === 'feature-intro');
  if (filter === 'done') return items.filter((item) => item.status === 'done');
  return items;
}

function QuestStatusIcon({ status }: { status: QuestListItemStatus }): JSX.Element {
  if (status === 'done') return <CheckCircle2 className="text-emerald-600" />;
  if (status === 'active') return <Sparkles className="text-blue-600" />;
  return <Circle className={status === 'skipped' ? 'text-zinc-400' : 'text-slate-400'} />;
}

function QuestRewardChips({ item }: { item: QuestListItem }): JSX.Element {
  const rewards = formatReward(item);
  if (!rewards.length) {
    return <span className="text-xs text-muted-foreground">无奖励</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {rewards.map((reward) => (
        <span key={reward} className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
          {reward === '成就' ? <Trophy className="size-3.5" /> : <Gift className="size-3.5" />}
          {reward}
        </span>
      ))}
    </div>
  );
}

function QuestCard({ item, startingQuestId, onStart }: { item: QuestListItem; startingQuestId: string | null; onStart: (item: QuestListItem) => void }): JSX.Element {
  const starting = startingQuestId === item.id;
  const actionable = Boolean(item.action) && item.status !== 'done' && item.status !== 'skipped';

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted [&_svg]:size-5">
          <QuestStatusIcon status={item.status} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">{item.title}</h3>
            <Badge variant="outline" className={cn('shrink-0', statusStyles[item.status])}>
              {statusLabels[item.status]}
            </Badge>
          </div>
          {item.description && <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.description}</p>}
        </div>
        {actionable && (
          <Button size="sm" className="no-drag shrink-0" disabled={starting} onClick={() => onStart(item)}>
            {starting ? <Loader2 className="animate-spin" /> : <Play />}
            {item.action?.label ?? '开始'}
          </Button>
        )}
      </div>

      <div className="mt-4 grid gap-3">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{categoryLabels[item.category]}</span>
          <span>{item.progressPercent}%</span>
        </div>
        <Progress value={item.progressPercent} className={cn('h-1.5', item.status === 'done' && '[&>div]:bg-emerald-500')} />
        <div className="flex items-center justify-between gap-3">
          <QuestRewardChips item={item} />
          {item.status === 'done' && item.completedAt && <span className="text-xs text-muted-foreground">{new Date(item.completedAt).toLocaleDateString()}</span>}
        </div>
      </div>
    </div>
  );
}

export default function QuestListPage(): JSX.Element {
  const [snapshot, setSnapshot] = useState<QuestListSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<QuestFilter>('onboarding');
  const [startingQuestId, setStartingQuestId] = useState<string | null>(null);

  const loadSnapshot = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const result = await window.YUA.quest['quest:list']();
      if (!result.ok || !result.snapshot) {
        throw new Error(result.error || '读取任务列表失败');
      }
      setSnapshot(result.snapshot);
    } catch (error) {
      toast.error('读取任务失败', { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    const unsubscribe = window.YUA.events.on((event) => {
      if (
        event.type === AppEvent.WORKSPACE_CREATED ||
        event.type === AppEvent.RESOURCE_CREATED ||
        event.type === AppEvent.SPRITE_RESOURCE_IMPORT_COMPLETE ||
        event.type === AppEvent.ASSISTANT_MENU_ITEM_SELECTED ||
        event.type === AppEvent.FILE_ACTION_SELECTED ||
        event.type === AppEvent.FILE_ACTION_WORKFLOW_STARTED ||
        event.type === AppEvent.AI_PROVIDER_CONFIG_UPDATED ||
        event.type === AppEvent.APP_WINDOW_OPENED ||
        event.type === AppEvent.APP_WINDOW_CLOSED ||
        event.type === AppEvent.RESOURCE_PREVIEW_OPENED ||
        event.type === AppEvent.SPRITE_AI_COMPLETE ||
        event.type === AppEvent.SPRITE_WORKFLOW_START ||
        event.type === AppEvent.SPRITE_DOWNLOAD_START ||
        event.type === AppEvent.SPRITE_RSS_REFRESH ||
        event.type === AppEvent.MEMORY_SAVED ||
        event.type === AppEvent.MEMORY_EXTRACTION_COMPLETED
      ) {
        void loadSnapshot();
      }
    });
    return unsubscribe;
  }, [loadSnapshot]);

  const filteredItems = useMemo(() => filterQuestItems(snapshot?.items ?? [], filter), [filter, snapshot?.items]);

  const handleStartQuest = useCallback(async (item: QuestListItem): Promise<void> => {
    setStartingQuestId(item.id);
    try {
      const result = await window.YUA.quest['quest:start']({ id: item.id });
      if (result.snapshot) {
        setSnapshot(result.snapshot);
      }
      if (!result.ok) {
        throw new Error(result.error || '启动任务失败');
      }
      toast.success(result.startResult ? '任务引导已启动' : '任务已完成');
    } catch (error) {
      toast.error('启动任务失败', { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setStartingQuestId(null);
    }
  }, []);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <header className="drag-region flex h-11 shrink-0 items-center gap-3 border-b px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Trophy className="size-4 text-amber-600" />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">任务</h1>
            <p className="truncate text-[11px] text-muted-foreground">{snapshot ? `${snapshot.summary.done}/${snapshot.summary.total} 已完成` : '读取任务进度'}</p>
          </div>
        </div>
        <div className="no-drag flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="w-8 h-8 p-0" disabled={loading} onClick={() => void loadSnapshot()}>
                <RefreshCcw className={cn(loading && 'animate-spin')} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>刷新任务</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="w-8 h-8 p-0" onClick={() => window.YUA.window['window:close']('questList' as any)}>
                <X />
              </Button>
            </TooltipTrigger>
            <TooltipContent>关闭</TooltipContent>
          </Tooltip>
        </div>
      </header>

      <div className="no-drag border-b px-4 py-3">
        <Tabs value={filter} onValueChange={(value) => setFilter(value as QuestFilter)}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="onboarding">新手</TabsTrigger>
            <TabsTrigger value="feature-intro">功能</TabsTrigger>
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="done">已完成</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ScrollArea className="no-drag min-h-0 flex-1">
        <main className="space-y-3 p-4">
          {loading && !snapshot ? (
            <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              载入任务中
            </div>
          ) : filteredItems.length > 0 ? (
            filteredItems.map((item) => <QuestCard key={item.id} item={item} startingQuestId={startingQuestId} onStart={handleStartQuest} />)
          ) : (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <CheckCircle2 className="size-8 text-emerald-500" />
              当前没有任务
            </div>
          )}
        </main>
      </ScrollArea>
    </div>
  );
}

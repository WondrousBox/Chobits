import type { ConversationRouteEvent, ConversationRouteSnapshot } from '@packages/ai/services/conversation-route-types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TbCheck, TbGitBranch, TbLoader2, TbRefresh, TbSearch, TbTrash } from 'react-icons/tb';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDateTime } from '@/lib/time';

interface ConversationRoutePanelProps {
  conversationId?: string;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  assumption: '假设',
  blocker: '阻碍',
  constraint: '约束',
  decision: '决策',
  key_clue: '线索',
  open_question: '问题',
  preference: '偏好',
  summary_checkpoint: '小结',
  task_added: '待办',
  task_done: '完成',
  task_progress: '进展',
  topic_shift: '转折',
  user_correction: '纠正',
  user_goal: '目标'
};

export function ConversationRoutePanel({ conversationId }: ConversationRoutePanelProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<ConversationRouteSnapshot | null>(null);
  const [events, setEvents] = useState<ConversationRouteEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [rebuilding, setRebuilding] = useState(false);

  const activeEvents = useMemo(() => events.filter((event) => event.status === 'active'), [events]);

  const loadRoute = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    try {
      const [nextSnapshot, nextEvents] = await Promise.all([
        window.YUA.conversationRoute.getSnapshot(conversationId),
        window.YUA.conversationRoute.listEvents({ conversationId, limit: 100 })
      ]);
      setSnapshot(nextSnapshot);
      setEvents(nextEvents || []);
    } catch (error) {
      console.error(error);
      toast.error('加载会话线路失败');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (open) void loadRoute();
  }, [loadRoute, open]);

  const search = async (): Promise<void> => {
    if (!conversationId) return;
    if (!query.trim()) {
      await loadRoute();
      return;
    }
    setLoading(true);
    try {
      const result = await window.YUA.conversationRoute.searchEvents({ conversationId, query: query.trim(), limit: 50 });
      setEvents(result || []);
    } catch (error) {
      console.error(error);
      toast.error('搜索会话线路失败');
    } finally {
      setLoading(false);
    }
  };

  const rebuild = async (): Promise<void> => {
    if (!conversationId) return;
    setRebuilding(true);
    try {
      const result = await window.YUA.conversationRoute.rebuild(conversationId);
      if (!result.ok) throw new Error(result.error || 'rebuild failed');
      setSnapshot(result.snapshot || null);
      setEvents(result.events || []);
      toast.success('会话线路已重建');
    } catch (error) {
      console.error(error);
      toast.error('重建会话线路失败');
    } finally {
      setRebuilding(false);
    }
  };

  const clearRoute = async (): Promise<void> => {
    if (!conversationId) return;
    try {
      await window.YUA.conversationRoute.clear(conversationId);
      setSnapshot(null);
      setEvents([]);
      toast.success('会话线路已清空');
    } catch (error) {
      console.error(error);
      toast.error('清空会话线路失败');
    }
  };

  const resolveEvent = async (eventId: string): Promise<void> => {
    try {
      const updated = await window.YUA.conversationRoute.updateEvent(eventId, { status: 'resolved' });
      if (updated) {
        setEvents((prev) => prev.map((event) => (event.id === eventId ? updated : event)));
        if (conversationId) {
          const nextSnapshot = await window.YUA.conversationRoute.getSnapshot(conversationId);
          setSnapshot(nextSnapshot);
        }
      }
    } catch (error) {
      console.error(error);
      toast.error('更新线路事件失败');
    }
  };

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="会话线路"
              className="h-8 w-8"
              disabled={!conversationId}
              size="icon"
              title={conversationId ? undefined : '开始对话后查看会话线路'}
              variant="ghost"
              onClick={() => setOpen(true)}
            >
              <TbGitBranch />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{conversationId ? '会话线路' : '开始对话后查看'}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-[420px] sm:max-w-[520px] p-0 flex flex-col">
          <SheetHeader className="px-5 py-4 border-b">
            <div className="flex items-center justify-between gap-3 pr-8">
              <SheetTitle className="text-base">会话线路</SheetTitle>
              <div className="flex items-center gap-1">
                <Button className="h-8 w-8" disabled={loading || rebuilding} size="icon" variant="ghost" onClick={() => void loadRoute()}>
                  {loading ? <TbLoader2 className="animate-spin" /> : <TbRefresh />}
                </Button>
                <Button className="h-8 w-8" disabled={rebuilding} size="icon" variant="ghost" onClick={() => void rebuild()}>
                  {rebuilding ? <TbLoader2 className="animate-spin" /> : <TbSearch />}
                </Button>
                <Button className="h-8 w-8" size="icon" variant="ghost" onClick={() => void clearRoute()}>
                  <TbTrash />
                </Button>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 min-h-0 overflow-auto px-5 py-4 space-y-5">
            {!conversationId && <EmptyState text="当前还没有会话。" />}
            {conversationId && !loading && !snapshot && events.length === 0 && <EmptyState text="这场会话还没有线路记录。" />}

            {snapshot && (
              <section className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <SnapshotCell label="目标" value={snapshot.currentGoal} />
                  <SnapshotCell label="话题" value={snapshot.currentTopic} />
                </div>
                {snapshot.summary && <p className="text-sm leading-6 text-muted-foreground">{snapshot.summary}</p>}
                <RouteList title="待办" items={snapshot.openTasks.map((task) => task.title)} />
                <RouteList title="用户纠正" items={snapshot.userCorrections} />
                <RouteList title="关键线索" items={snapshot.keyClues} />
                <RouteList title="决策" items={snapshot.decisions} />
                <RouteList title="约束" items={snapshot.keyConstraints} />
                <RouteList title="阻碍" items={snapshot.blockers} />
                {snapshot.nextSuggestedFocus && (
                  <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                    <div className="mb-1 text-xs text-muted-foreground">下一步</div>
                    {snapshot.nextSuggestedFocus}
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  已处理到 seq {snapshot.lastProcessedSeq}，版本 {snapshot.version}
                </div>
              </section>
            )}

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  className="h-8"
                  placeholder="搜索线路事件"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void search();
                  }}
                />
                <Button className="h-8 w-8" size="icon" variant="outline" onClick={() => void search()}>
                  <TbSearch />
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">时间线</h3>
                  <span className="text-xs text-muted-foreground">{activeEvents.length} 个活跃事件</span>
                </div>
                {events.length === 0 && conversationId && <div className="text-sm text-muted-foreground">暂无事件。</div>}
                {events.map((event) => (
                  <div key={event.id} className="rounded-md border px-3 py-2 text-sm">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium leading-5">{event.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          seq {event.seqStart}-{event.seqEnd}
                          {event.createdAt ? ` · ${formatDateTime(event.createdAt)}` : ''}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Badge variant="outline">{EVENT_TYPE_LABELS[event.type] || event.type}</Badge>
                        <Badge variant={event.status === 'active' ? 'default' : 'secondary'}>{event.status}</Badge>
                      </div>
                    </div>
                    <p className="leading-6 text-muted-foreground">{event.content}</p>
                    {event.status === 'active' && (
                      <div className="mt-2 flex justify-end">
                        <Button className="h-8" size="sm" variant="ghost" onClick={() => void resolveEvent(event.id)}>
                          <TbCheck />
                          标记完成
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function SnapshotCell({ label, value }: { label: string; value?: string }): JSX.Element {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className="text-sm leading-5">{value || '未记录'}</div>
    </div>
  );
}

function RouteList({ title, items }: { title: string; items: string[] }): JSX.Element | null {
  const visibleItems = items.filter(Boolean).slice(0, 8);
  if (!visibleItems.length) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <ul className="space-y-1.5 text-sm text-muted-foreground">
        {visibleItems.map((item, index) => (
          <li key={`${title}-${index}`} className="rounded-md bg-muted/50 px-3 py-2 leading-5">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyState({ text }: { text: string }): JSX.Element {
  return <div className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">{text}</div>;
}

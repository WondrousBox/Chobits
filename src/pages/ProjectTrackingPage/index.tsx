import type { ProjectEvent, ProjectMilestone, ProjectSnapshot, ProjectStatus, TrackedProject } from '@packages/ai/services/project-tracking-types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TbArchive, TbBriefcase, TbCalendar, TbLoader2, TbPlus, TbRefresh, TbRoute, TbSearch, TbTimelineEvent, TbX } from 'react-icons/tb';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

interface ProjectDetail {
  links: ProjectLinkLike[];
  project: TrackedProject;
  snapshot: ProjectSnapshot | null;
}

interface ProjectLinkLike {
  createdAt?: number;
  projectId?: string;
  relationType?: string;
  targetId?: string;
  targetType?: string;
}

const EVENT_TYPE_OPTIONS: Array<{ label: string; value: ProjectEvent['type'] }> = [
  { label: '待办', value: 'task_added' },
  { label: '进展', value: 'task_progress' },
  { label: '完成', value: 'task_done' },
  { label: '会议', value: 'meeting_scheduled' },
  { label: '决策', value: 'decision_made' },
  { label: '协议', value: 'agreement_reached' },
  { label: '变更', value: 'plan_changed' },
  { label: '阻塞', value: 'blocker_found' },
  { label: '风险', value: 'risk_identified' }
];

function formatDate(value?: number | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date(value));
}

function statusLabel(status: ProjectStatus | string): string {
  const labels: Record<string, string> = {
    active: '活跃',
    archived: '已归档',
    candidate: '候选',
    completed: '已完成',
    paused: '暂停',
    rejected: '已拒绝'
  };
  return labels[status] || status;
}

export default function ProjectTrackingPage(): JSX.Element {
  const [projects, setProjects] = useState<TrackedProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [events, setEvents] = useState<ProjectEvent[]>([]);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftGoal, setDraftGoal] = useState('');
  const [draftSummary, setDraftSummary] = useState('');
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventContent, setNewEventContent] = useState('');
  const [newEventType, setNewEventType] = useState<ProjectEvent['type']>('task_added');

  const filteredProjects = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return projects;
    return projects.filter((project) => [project.name, project.goal, project.summary, ...project.tags].some((value) => value?.toLowerCase().includes(term)));
  }, [projects, query]);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await window.YUA.projectTracking.listProjects({
        limit: 100,
        status: ['active', 'paused', 'completed', 'archived']
      });
      setProjects(rows);
      if (!selectedProjectId && rows[0]) setSelectedProjectId(rows[0].id);
    } catch (error) {
      console.error(error);
      toast.error('加载项目失败');
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  const loadDetail = useCallback(async (projectId: string) => {
    setLoading(true);
    try {
      const [nextDetail, nextEvents, nextMilestones] = await Promise.all([
        window.YUA.projectTracking.getProject(projectId),
        window.YUA.projectTracking.listEvents({ limit: 100, projectId }),
        window.YUA.projectTracking.listMilestones({ limit: 100, projectId })
      ]);
      setDetail(nextDetail as ProjectDetail | null);
      setEvents(nextEvents);
      setMilestones(nextMilestones);
      setDraftName(nextDetail?.project.name || '');
      setDraftGoal(nextDetail?.project.goal || '');
      setDraftSummary(nextDetail?.project.summary || '');
    } catch (error) {
      console.error(error);
      toast.error('加载项目详情失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!selectedProjectId) {
      setDetail(null);
      setEvents([]);
      setMilestones([]);
      return;
    }
    void loadDetail(selectedProjectId);
  }, [loadDetail, selectedProjectId]);

  const saveProject = async (): Promise<void> => {
    if (!detail) return;
    setSaving(true);
    try {
      const result = await window.YUA.projectTracking.updateProject(detail.project.id, {
        goal: draftGoal.trim() || detail.project.goal,
        name: draftName.trim() || detail.project.name,
        summary: draftSummary.trim() || draftGoal.trim() || detail.project.summary
      });
      if (!result.ok) throw new Error(result.error || 'update failed');
      toast.success('项目已更新');
      await Promise.all([loadProjects(), loadDetail(detail.project.id)]);
    } catch (error) {
      console.error(error);
      toast.error('更新项目失败');
    } finally {
      setSaving(false);
    }
  };

  const archiveProject = async (): Promise<void> => {
    if (!detail) return;
    setSaving(true);
    try {
      const result = await window.YUA.projectTracking.archiveProject(detail.project.id);
      if (!result.ok) throw new Error(result.error || 'archive failed');
      toast.success('项目已归档');
      await Promise.all([loadProjects(), loadDetail(detail.project.id)]);
    } catch (error) {
      console.error(error);
      toast.error('归档项目失败');
    } finally {
      setSaving(false);
    }
  };

  const rebuildSnapshot = async (): Promise<void> => {
    if (!detail) return;
    setSaving(true);
    try {
      const result = await window.YUA.projectTracking.rebuildSnapshot(detail.project.id);
      if (!result.ok) throw new Error(result.error || 'rebuild failed');
      toast.success('快照已重建');
      await loadDetail(detail.project.id);
    } catch (error) {
      console.error(error);
      toast.error('重建快照失败');
    } finally {
      setSaving(false);
    }
  };

  const addEvent = async (): Promise<void> => {
    if (!detail || !newEventTitle.trim()) return;
    setSaving(true);
    try {
      const result = await window.YUA.projectTracking.addEvent({
        content: newEventContent.trim() || newEventTitle.trim(),
        projectId: detail.project.id,
        title: newEventTitle.trim(),
        type: newEventType,
        workspaceId: detail.project.workspaceId
      });
      if (!result.ok) throw new Error(result.error || 'add event failed');
      setNewEventTitle('');
      setNewEventContent('');
      toast.success('事件已加入时间线');
      await loadDetail(detail.project.id);
    } catch (error) {
      console.error(error);
      toast.error('添加事件失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full w-full bg-background text-foreground">
      <aside className="flex h-full w-[320px] shrink-0 flex-col border-r bg-muted/25">
        <div className="flex h-12 items-center gap-2 border-b px-4">
          <TbBriefcase className="text-muted-foreground" />
          <div className="font-medium">项目中心</div>
          <Button className="ml-auto" size="sm" variant="ghost" onClick={() => void loadProjects()}>
            {loading ? <TbLoader2 className="animate-spin" /> : <TbRefresh />}
            刷新
          </Button>
        </div>
        <div className="border-b p-3">
          <div className="flex items-center gap-2 rounded-md border bg-background px-2">
            <TbSearch className="text-muted-foreground" />
            <Input className="border-0 shadow-none focus-visible:ring-0" value={query} placeholder="搜索项目" onChange={(event) => setQuery(event.target.value)} />
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-1 p-2">
            {filteredProjects.map((project) => (
              <button
                key={project.id}
                className={`w-full rounded-md px-3 py-2 text-left transition hover:bg-accent ${selectedProjectId === project.id ? 'bg-accent' : ''}`}
                onClick={() => setSelectedProjectId(project.id)}
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{project.name}</span>
                  <Badge variant={project.status === 'archived' ? 'outline' : 'secondary'}>{statusLabel(project.status)}</Badge>
                </div>
                <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{project.goal}</div>
              </button>
            ))}
            {!filteredProjects.length && <div className="px-3 py-8 text-center text-sm text-muted-foreground">暂无项目</div>}
          </div>
        </ScrollArea>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {!detail ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{loading ? '加载中...' : '选择一个项目查看详情'}</div>
        ) : (
          <>
            <header className="flex min-h-14 items-center gap-3 border-b px-5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-semibold">{detail.project.name}</div>
                <div className="truncate text-xs text-muted-foreground">{detail.project.goal}</div>
              </div>
              <Badge variant="outline">{statusLabel(detail.project.status)}</Badge>
              <Button disabled={saving} size="sm" variant="outline" onClick={() => void rebuildSnapshot()}>
                <TbRefresh />
                重建快照
              </Button>
              <Button disabled={saving || detail.project.status === 'archived'} size="sm" variant="outline" onClick={() => void archiveProject()}>
                <TbArchive />
                归档
              </Button>
              <Button size="sm" variant="ghost" onClick={() => window.YUA.window['window:close']('projectTracking' as any)}>
                <TbX />
                关闭
              </Button>
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-[minmax(360px,0.95fr)_minmax(440px,1.35fr)]">
              <ScrollArea className="min-h-0 border-r">
                <section className="space-y-4 p-5">
                  <div className="space-y-3">
                    <div className="text-sm font-medium">项目资料</div>
                    <div className="space-y-2">
                      <Input value={draftName} onChange={(event) => setDraftName(event.target.value)} />
                      <Textarea className="min-h-24" value={draftGoal} onChange={(event) => setDraftGoal(event.target.value)} />
                      <Textarea className="min-h-20" value={draftSummary} placeholder="摘要" onChange={(event) => setDraftSummary(event.target.value)} />
                    </div>
                    <Button disabled={saving} size="sm" onClick={() => void saveProject()}>
                      {saving ? <TbLoader2 className="animate-spin" /> : <TbBriefcase />}
                      保存项目
                    </Button>
                  </div>

                  <Separator />
                  <SnapshotPanel snapshot={detail.snapshot} />
                  <Separator />

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <TbPlus className="text-muted-foreground" />
                      添加事件
                    </div>
                    <select className="h-9 rounded-md border bg-background px-3 text-sm" value={newEventType} onChange={(event) => setNewEventType(event.target.value as ProjectEvent['type'])}>
                      {EVENT_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <Input value={newEventTitle} placeholder="事件标题" onChange={(event) => setNewEventTitle(event.target.value)} />
                    <Textarea value={newEventContent} placeholder="事件内容或证据" onChange={(event) => setNewEventContent(event.target.value)} />
                    <Button disabled={saving || !newEventTitle.trim()} size="sm" onClick={() => void addEvent()}>
                      {saving ? <TbLoader2 className="animate-spin" /> : <TbPlus />}
                      加入时间线
                    </Button>
                  </div>
                </section>
              </ScrollArea>

              <section className="min-w-0 p-5">
                <Tabs className="flex h-full min-h-0 flex-col" defaultValue="timeline">
                  <TabsList className="w-fit">
                    <TabsTrigger value="timeline">时间线</TabsTrigger>
                    <TabsTrigger value="milestones">里程碑</TabsTrigger>
                    <TabsTrigger value="links">关联</TabsTrigger>
                  </TabsList>
                  <TabsContent className="min-h-0 flex-1" value="timeline">
                    <Timeline events={events} />
                  </TabsContent>
                  <TabsContent className="min-h-0 flex-1" value="milestones">
                    <Milestones milestones={milestones} />
                  </TabsContent>
                  <TabsContent className="min-h-0 flex-1" value="links">
                    <Links links={detail.links || []} />
                  </TabsContent>
                </Tabs>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function SnapshotPanel({ snapshot }: { snapshot: ProjectSnapshot | null }): JSX.Element {
  if (!snapshot) return <div className="text-sm text-muted-foreground">暂无快照</div>;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <TbRoute className="text-muted-foreground" />
        当前快照
      </div>
      <FieldList title="开放事项" values={snapshot.openTasks.map((task) => task.title)} />
      <FieldList title="近期进展" values={snapshot.recentProgress} />
      <FieldList title="决策" values={snapshot.decisions} />
      <FieldList title="协议" values={snapshot.agreements} />
      <FieldList title="阻塞" values={snapshot.blockers} />
      <FieldList title="风险" values={snapshot.risks} />
      <FieldList title="变更" values={snapshot.changes} />
      {snapshot.upcomingDates.length ? (
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">临近时间点</div>
          {snapshot.upcomingDates.map((date) => (
            <div key={`${date.title}-${date.at}`} className="flex items-center gap-2 text-sm">
              <TbCalendar className="text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{date.title}</span>
              <span className="text-xs text-muted-foreground">{formatDate(date.at)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FieldList({ title, values }: { title: string; values: string[] }): JSX.Element | null {
  const cleanValues = values.filter(Boolean).slice(0, 8);
  if (!cleanValues.length) return null;
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      <div className="space-y-1">
        {cleanValues.map((value, index) => (
          <div key={`${value}-${index}`} className="rounded-md bg-muted/60 px-2 py-1.5 text-sm leading-5">
            {value}
          </div>
        ))}
      </div>
    </div>
  );
}

function Timeline({ events }: { events: ProjectEvent[] }): JSX.Element {
  if (!events.length) return <div className="py-12 text-center text-sm text-muted-foreground">暂无时间线事件</div>;
  return (
    <ScrollArea className="h-full">
      <div className="space-y-2 pr-4">
        {events.map((event) => (
          <div key={event.id} className="rounded-md border px-3 py-2">
            <div className="flex items-center gap-2">
              <TbTimelineEvent className="text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{event.title}</span>
              <Badge variant={event.status === 'resolved' ? 'secondary' : 'outline'}>{event.status}</Badge>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {event.type} · {formatDate(event.createdAt)}
            </div>
            <div className="mt-2 text-sm leading-6">{event.content}</div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function Milestones({ milestones }: { milestones: ProjectMilestone[] }): JSX.Element {
  if (!milestones.length) return <div className="py-12 text-center text-sm text-muted-foreground">暂无里程碑</div>;
  return (
    <ScrollArea className="h-full">
      <div className="space-y-2 pr-4">
        {milestones.map((milestone) => (
          <div key={milestone.id} className="rounded-md border px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{milestone.title}</span>
              <Badge variant={milestone.status === 'done' ? 'secondary' : 'outline'}>{milestone.status}</Badge>
            </div>
            {milestone.description ? <div className="mt-2 text-sm leading-6 text-muted-foreground">{milestone.description}</div> : null}
            <div className="mt-1 text-xs text-muted-foreground">目标时间：{formatDate(milestone.targetAt)}</div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function Links({ links }: { links: ProjectLinkLike[] }): JSX.Element {
  if (!links.length) return <div className="py-12 text-center text-sm text-muted-foreground">暂无关联对象</div>;
  return (
    <ScrollArea className="h-full">
      <div className="space-y-2 pr-4">
        {links.map((link, index) => (
          <div key={`${link.targetType}-${link.targetId}-${index}`} className="rounded-md border px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium">{link.targetType}</span>
              <Badge variant="outline">{link.relationType}</Badge>
            </div>
            <div className="mt-1 break-all text-xs text-muted-foreground">{link.targetId}</div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

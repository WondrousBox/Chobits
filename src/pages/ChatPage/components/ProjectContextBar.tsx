import type { ProjectImpactPreview, ProjectSnapshot, TrackedProject } from '@packages/ai/services/project-tracking-types';
import { useCallback, useEffect, useState } from 'react';
import { TbBriefcase, TbCalendar, TbChevronDown, TbChevronUp, TbLoader2, TbTrash } from 'react-icons/tb';
import { toast } from 'sonner';

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ProjectContextBarProps {
  conversationId?: string;
  refreshKey?: number;
}

interface LinkedProjectState {
  project: TrackedProject;
  snapshot: ProjectSnapshot | null;
}

export function ProjectContextBar({ conversationId, refreshKey = 0 }: ProjectContextBarProps): JSX.Element | null {
  const [linked, setLinked] = useState<LinkedProjectState | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deletePermanently, setDeletePermanently] = useState(false);
  const [deletePreview, setDeletePreview] = useState<ProjectImpactPreview | null>(null);
  const [deletePreviewLoading, setDeletePreviewLoading] = useState(false);

  const loadProject = useCallback(async () => {
    if (!conversationId) {
      setLinked(null);
      return;
    }
    setLoading(true);
    try {
      const links = await window.YUA.projectTracking.listLinksByTarget({
        limit: 1,
        targetId: conversationId,
        targetType: 'conversation'
      });
      const projectId = (links[0] as any)?.projectId;
      if (!projectId) {
        setLinked(null);
        return;
      }
      const detail = await window.YUA.projectTracking.getProject(projectId);
      setLinked(detail && !detail.project.deletedAt ? { project: detail.project, snapshot: detail.snapshot } : null);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  const openDeleteDialog = useCallback(async (projectId: string): Promise<void> => {
    setDeleteDialogOpen(true);
    setDeletePermanently(false);
    setDeletePreview(null);
    setDeletePreviewLoading(true);
    try {
      const result = await window.YUA.projectTracking.previewProjectImpact(projectId);
      if (result.ok) {
        setDeletePreview(result.preview ?? null);
      }
    } catch (error) {
      console.warn('[ProjectContextBar] Failed to preview project delete impact:', error);
    } finally {
      setDeletePreviewLoading(false);
    }
  }, []);

  const deleteProject = async (): Promise<void> => {
    if (!linked) return;
    const projectId = linked.project.id;
    setDeleteLoading(true);
    try {
      const result = deletePermanently ? await window.YUA.projectTracking.hardDeleteProject(projectId) : await window.YUA.projectTracking.softDeleteProject(projectId);
      if (!result.ok) throw new Error(result.error || 'delete project failed');
      toast.success(deletePermanently ? '项目已彻底删除' : '项目已删除');
      setDeleteDialogOpen(false);
      setDeletePreview(null);
      setLinked(null);
      setExpanded(false);
    } catch (error) {
      console.error(error);
      toast.error(deletePermanently ? '彻底删除项目失败' : '删除项目失败');
    } finally {
      setDeleteLoading(false);
    }
  };

  useEffect(() => {
    void loadProject().catch(() => undefined);
  }, [loadProject, refreshKey]);

  useEffect(() => {
    setExpanded(false);
  }, [conversationId]);

  if (!linked && !loading) return null;

  return (
    <div className="mx-auto mt-2 w-[min(760px,calc(100%-32px))] rounded-md border bg-background/95 px-3 py-2 text-sm shadow-sm">
      <div className="flex items-center gap-2">
        {loading ? <TbLoader2 className="animate-spin text-muted-foreground" /> : <TbBriefcase className="text-muted-foreground" />}
        {linked ? (
          <>
            <span className="min-w-0 flex-1 truncate">正在跟进：{linked.project.name}</span>
            <Badge variant="outline">{linked.snapshot?.status || linked.project.status}</Badge>
            {linked.snapshot?.openTasks?.length ? <Badge variant="secondary">{linked.snapshot.openTasks.length} 个开放事项</Badge> : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="删除项目"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={deleteLoading}
                  size="icon"
                  title="删除项目"
                  variant="ghost"
                  onClick={() => void openDeleteDialog(linked.project.id)}
                >
                  <TbTrash />
                </Button>
              </TooltipTrigger>
              <TooltipContent>删除项目</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={expanded ? '收起项目详情' : '展开项目详情'}
                  className="h-7 w-7 shrink-0"
                  size="icon"
                  title={expanded ? '收起项目详情' : '展开项目详情'}
                  variant="ghost"
                  onClick={() => setExpanded((value) => !value)}
                >
                  {expanded ? <TbChevronUp /> : <TbChevronDown />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{expanded ? '收起项目详情' : '展开项目详情'}</TooltipContent>
            </Tooltip>
          </>
        ) : (
          <span className="text-muted-foreground">加载项目状态...</span>
        )}
      </div>
      {linked && expanded ? <ProjectContextDetails project={linked.project} snapshot={linked.snapshot} /> : null}
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (deleteLoading) return;
          setDeleteDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除项目跟进</AlertDialogTitle>
            <AlertDialogDescription>
              {linked ? `确定要删除「${linked.project.name}」吗？默认删除会归档并隐藏项目，仍可在项目中心恢复。` : '确定要删除这个项目吗？'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <label className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
              <Checkbox checked={deletePermanently} disabled={deleteLoading} onCheckedChange={(checked) => setDeletePermanently(checked === true)} />
              <span className="space-y-1">
                <span className="block font-medium">彻底删除项目及相关数据</span>
                <span className="block text-xs leading-5 text-muted-foreground">会删除项目、快照、事件、里程碑、关联和提醒；已写入长期记忆的笔记会保留，但解除项目引用。</span>
              </span>
            </label>
            <DeleteImpactSummary loading={deletePreviewLoading} preview={deletePreview} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteLoading}
              onClick={(event) => {
                event.preventDefault();
                void deleteProject();
              }}
            >
              {deleteLoading ? <TbLoader2 className="animate-spin" /> : <TbTrash />}
              {deletePermanently ? '彻底删除' : '删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DeleteImpactSummary({ loading, preview }: { loading: boolean; preview: ProjectImpactPreview | null }): JSX.Element {
  if (loading) {
    return <div className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">正在检查项目关联数据...</div>;
  }
  if (!preview) {
    return <div className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">暂无影响预览数据。</div>;
  }
  return (
    <div className="space-y-2 rounded-md bg-muted/60 px-3 py-2 text-sm">
      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
        <span>事件 {preview.events}</span>
        <span>里程碑 {preview.milestones}</span>
        <span>关联 {preview.links}</span>
        <span>提醒 {preview.reminderLinks}</span>
        <span>Scheduler {preview.schedulerTasks}</span>
        <span>审计 {preview.auditLogs}</span>
      </div>
      {preview.promotedMemoryNoteIds.length ? <div className="text-xs leading-5 text-muted-foreground">长期记忆会保留：{preview.promotedMemoryNoteIds.join(', ')}</div> : null}
      {preview.warnings.length ? <div className="text-xs leading-5 text-destructive">{preview.warnings.join('；')}</div> : null}
    </div>
  );
}

function ProjectContextDetails({ project, snapshot }: LinkedProjectState): JSX.Element {
  return (
    <div className="mt-3 border-t pt-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(240px,0.8fr)]">
        <div className="space-y-3">
          <DetailText label="目标" value={snapshot?.goal || project.goal} />
          <DetailText label="摘要" value={snapshot?.summary || project.summary || project.scope || ''} />
          <DetailText label="当前焦点" value={snapshot?.currentFocus || snapshot?.nextSuggestedAction || ''} />
        </div>
        <div className="space-y-3">
          <DetailList title="开放事项" values={snapshot?.openTasks.map((task) => task.title) || []} />
          <DetailList title="近期进展" values={snapshot?.recentProgress || []} />
        </div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <DetailList title="决策" values={snapshot?.decisions || []} />
        <DetailList title="风险 / 阻塞" values={[...(snapshot?.risks || []), ...(snapshot?.blockers || [])]} />
      </div>
      {snapshot?.upcomingDates.length ? (
        <div className="mt-3 space-y-1">
          <div className="text-xs font-medium text-muted-foreground">临近时间点</div>
          <div className="space-y-1">
            {snapshot.upcomingDates.slice(0, 4).map((date) => (
              <div key={`${date.title}-${date.at}`} className="flex items-center gap-2 rounded-md bg-muted/60 px-2 py-1.5 text-sm leading-5">
                <TbCalendar className="shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{date.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatProjectDate(date.at)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DetailText({ label, value }: { label: string; value: string }): JSX.Element | null {
  const cleanValue = value.trim();
  if (!cleanValue) return null;
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="rounded-md bg-muted/60 px-2 py-1.5 leading-6">{cleanValue}</div>
    </div>
  );
}

function DetailList({ title, values }: { title: string; values: string[] }): JSX.Element | null {
  const cleanValues = values.filter(Boolean).slice(0, 5);
  if (!cleanValues.length) return null;
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      <div className="space-y-1">
        {cleanValues.map((value, index) => (
          <div key={`${value}-${index}`} className="rounded-md bg-muted/60 px-2 py-1.5 leading-5">
            {value}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatProjectDate(value: number): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('zh-CN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

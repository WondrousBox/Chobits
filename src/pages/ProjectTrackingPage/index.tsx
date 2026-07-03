import type {
  ProjectAuditLog,
  ProjectEvent,
  ProjectImpactPreview,
  ProjectMilestone,
  ProjectOrphanReport,
  ProjectPrivacySettings,
  ProjectReminderKind,
  ProjectReminderLink,
  ProjectReminderSuggestion,
  ProjectSnapshot,
  ProjectStatus,
  TrackedProject
} from '@packages/ai/services/project-tracking-types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  TbArchive,
  TbArrowsSplit,
  TbBell,
  TbBellPlus,
  TbBellX,
  TbBriefcase,
  TbCalendar,
  TbCheck,
  TbClipboardCheck,
  TbDownload,
  TbFileExport,
  TbGitMerge,
  TbHistory,
  TbLoader2,
  TbPlayerPlay,
  TbPlus,
  TbRefresh,
  TbReportAnalytics,
  TbRotateClockwise,
  TbRoute,
  TbSearch,
  TbShield,
  TbTimelineEvent,
  TbTrash,
  TbUpload,
  TbX
} from 'react-icons/tb';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

interface ProjectDetail {
  links: ProjectLinkLike[];
  project: TrackedProject;
  snapshot: ProjectSnapshot | null;
}

interface ProjectLinkLike {
  createdAt?: number;
  id?: string;
  projectId?: string;
  relationType?: string;
  targetId?: string;
  targetType?: string;
}

const PROJECT_LIST_STATUSES: ProjectStatus[] = ['candidate', 'active', 'paused', 'completed', 'archived', 'rejected'];

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

const REMINDER_KIND_OPTIONS: Array<{ label: string; value: ProjectReminderKind }> = [
  { label: '截止', value: 'deadline' },
  { label: '会议', value: 'meeting' },
  { label: '跟进', value: 'follow_up' },
  { label: '复盘', value: 'review' },
  { label: '里程碑', value: 'milestone_check' },
  { label: '阶段检查', value: 'stale_project_check' }
];

interface ReminderDraft {
  dueAt: string;
  kind: ProjectReminderKind;
  reason: string;
  title: string;
}

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

function formatDateTimeInput(value?: number | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function parseDateTimeInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const timestamp = new Date(trimmed).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
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

function qualityLabel(quality: ProjectEvent['quality']): string {
  const labels: Record<ProjectEvent['quality'], string> = {
    accepted: '已确认',
    draft: '草稿',
    rejected: '已拒绝'
  };
  return labels[quality] || quality;
}

function reminderKindLabel(kind: ProjectReminderLink['kind'] | ProjectReminderSuggestion['kind']): string {
  const labels: Record<string, string> = {
    deadline: '截止',
    follow_up: '跟进',
    meeting: '会议',
    milestone_check: '里程碑',
    review: '复盘',
    stale_project_check: '阶段检查'
  };
  return labels[kind] || kind;
}

function reminderStatusLabel(status: ProjectReminderLink['status'] | ProjectReminderLink['syncStatus']): string {
  const labels: Record<string, string> = {
    cancelled: '已取消',
    done: '已触发',
    failed: '失败',
    scheduled: '已创建',
    suggested: '建议',
    synced: '已同步'
  };
  return labels[status] || status;
}

function auditActionLabel(action: string): string {
  const labels: Record<string, string> = {
    project_completed: '项目完成',
    project_exported: '项目导出',
    project_hard_deleted: '彻底删除',
    project_memory_promoted: '复盘晋升长期记忆',
    project_merged: '项目合并',
    project_privacy_updated: '隐私设置更新',
    project_reminder_cancelled: '提醒取消',
    project_reminder_created: '提醒创建',
    project_reminder_triggered: '提醒触发',
    project_reopened: '重新打开',
    project_restored: '项目恢复',
    project_soft_deleted: '软删除',
    project_split: '项目拆分'
  };
  return labels[action] || action;
}

function memoryPromotionLabel(status: TrackedProject['memoryPromotionStatus']): string {
  const labels: Record<TrackedProject['memoryPromotionStatus'], string> = {
    declined: '已拒绝',
    none: '未晋升',
    promoted: '已晋升',
    suggested: '建议晋升'
  };
  return labels[status] || status;
}

function projectBadgeVariant(project: TrackedProject): 'destructive' | 'outline' | 'secondary' {
  if (project.deletedAt) return 'destructive';
  if (project.status === 'archived' || project.status === 'completed') return 'outline';
  return 'secondary';
}

function compactJson(value?: string | null): string {
  if (!value) return '';
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function ProjectTrackingPage(): JSX.Element {
  const [projects, setProjects] = useState<TrackedProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [events, setEvents] = useState<ProjectEvent[]>([]);
  const [reviewEvents, setReviewEvents] = useState<ProjectEvent[]>([]);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [auditLogs, setAuditLogs] = useState<ProjectAuditLog[]>([]);
  const [reminderSuggestions, setReminderSuggestions] = useState<ProjectReminderSuggestion[]>([]);
  const [reminderLinks, setReminderLinks] = useState<ProjectReminderLink[]>([]);
  const [impactPreview, setImpactPreview] = useState<ProjectImpactPreview | null>(null);
  const [orphanReport, setOrphanReport] = useState<ProjectOrphanReport | null>(null);
  const [reminderDrafts, setReminderDrafts] = useState<Record<string, ReminderDraft>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftGoal, setDraftGoal] = useState('');
  const [draftSummary, setDraftSummary] = useState('');
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventContent, setNewEventContent] = useState('');
  const [newEventType, setNewEventType] = useState<ProjectEvent['type']>('task_added');
  const [completionSummaryDraft, setCompletionSummaryDraft] = useState('');
  const [retrospectiveDraft, setRetrospectiveDraft] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [splitName, setSplitName] = useState('');
  const [splitGoal, setSplitGoal] = useState('');
  const [splitSummary, setSplitSummary] = useState('');
  const [splitEventIds, setSplitEventIds] = useState<string[]>([]);
  const [splitMilestoneIds, setSplitMilestoneIds] = useState<string[]>([]);

  const filteredProjects = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return projects;
    return projects.filter((project) => [project.name, project.goal, project.summary, ...project.tags].some((value) => value?.toLowerCase().includes(term)));
  }, [projects, query]);

  const mergeOptions = useMemo(() => projects.filter((project) => project.id !== detail?.project.id && !project.deletedAt), [detail?.project.id, projects]);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await window.YUA.projectTracking.listProjects({
        includeDeleted,
        limit: 200,
        status: PROJECT_LIST_STATUSES
      });
      setProjects(rows);
      setSelectedProjectId((current) => {
        if (current && rows.some((project) => project.id === current)) return current;
        return rows[0]?.id ?? null;
      });
    } catch (error) {
      console.error(error);
      toast.error('加载项目失败');
    } finally {
      setLoading(false);
    }
  }, [includeDeleted]);

  const loadDetail = useCallback(async (projectId: string) => {
    setLoading(true);
    try {
      const [nextDetail, nextEvents, nextReviewEvents, nextMilestones, nextAuditLogs, nextReminderSuggestions, nextReminderLinks, nextImpactPreview, nextOrphanReport] = await Promise.all([
        window.YUA.projectTracking.getProject(projectId),
        window.YUA.projectTracking.listEvents({ limit: 200, projectId }),
        window.YUA.projectTracking.listEvents({ limit: 100, projectId, quality: ['draft'] }),
        window.YUA.projectTracking.listMilestones({ limit: 200, projectId }),
        window.YUA.projectTracking.listAuditLogs(projectId, 100),
        window.YUA.projectTracking.listReminderSuggestions(projectId),
        window.YUA.projectTracking.listReminderLinks(projectId, 100),
        window.YUA.projectTracking.previewProjectImpact(projectId),
        window.YUA.projectTracking.inspectProjectOrphans(projectId)
      ]);
      if (!nextDetail) {
        setDetail(null);
        setImpactPreview(null);
        setOrphanReport(null);
        return;
      }
      setDetail(nextDetail as ProjectDetail);
      setEvents(nextEvents);
      setReviewEvents(nextReviewEvents);
      setMilestones(nextMilestones);
      setAuditLogs(nextAuditLogs);
      setReminderSuggestions(nextReminderSuggestions);
      setReminderLinks(nextReminderLinks);
      setImpactPreview(nextImpactPreview.preview ?? null);
      setOrphanReport(nextOrphanReport.report ?? null);
      setReminderDrafts(
        Object.fromEntries(
          nextReminderLinks.map((link) => [
            link.id,
            {
              dueAt: formatDateTimeInput(link.dueAt),
              kind: link.kind,
              reason: link.reason || '',
              title: link.title || ''
            }
          ])
        )
      );
      setDraftName(nextDetail.project.name || '');
      setDraftGoal(nextDetail.project.goal || '');
      setDraftSummary(nextDetail.project.summary || '');
      setCompletionSummaryDraft(nextDetail.project.completionSummary || '');
      setRetrospectiveDraft(nextDetail.project.retrospective || nextDetail.project.completionSummary || '');
      setMergeTargetId('');
      setSplitName('');
      setSplitGoal('');
      setSplitSummary('');
      setSplitEventIds([]);
      setSplitMilestoneIds([]);
    } catch (error) {
      console.error(error);
      toast.error('加载项目详情失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshCurrentProject = useCallback(
    async (projectId?: string | null) => {
      await loadProjects();
      if (projectId) await loadDetail(projectId);
    },
    [loadDetail, loadProjects]
  );

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!selectedProjectId) {
      setDetail(null);
      setEvents([]);
      setReviewEvents([]);
      setMilestones([]);
      setAuditLogs([]);
      setReminderSuggestions([]);
      setReminderLinks([]);
      setImpactPreview(null);
      setOrphanReport(null);
      setReminderDrafts({});
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
      await refreshCurrentProject(detail.project.id);
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
      await refreshCurrentProject(detail.project.id);
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

  const reviewEvent = async (eventId: string, quality: 'accepted' | 'rejected'): Promise<void> => {
    if (!detail) return;
    setSaving(true);
    try {
      const result = await window.YUA.projectTracking.reviewEvent(eventId, quality);
      if (!result.ok) throw new Error(result.error || 'review event failed');
      toast.success(quality === 'accepted' ? '事件已接受' : '事件已拒绝');
      await loadDetail(detail.project.id);
    } catch (error) {
      console.error(error);
      toast.error('审核事件失败');
    } finally {
      setSaving(false);
    }
  };

  const createReminder = async (suggestion: ProjectReminderSuggestion): Promise<void> => {
    if (!detail) return;
    setSaving(true);
    try {
      const result = await window.YUA.projectTracking.createReminderFromSuggestion(detail.project.id, suggestion);
      if (!result.ok) throw new Error(result.error || 'create reminder failed');
      toast.success('提醒已创建');
      await loadDetail(detail.project.id);
    } catch (error) {
      console.error(error);
      toast.error('创建提醒失败');
    } finally {
      setSaving(false);
    }
  };

  const cancelReminder = async (linkId: string): Promise<void> => {
    if (!detail) return;
    setSaving(true);
    try {
      const result = await window.YUA.projectTracking.cancelReminder(linkId);
      if (!result.ok) throw new Error(result.error || 'cancel reminder failed');
      toast.success('提醒已取消');
      await loadDetail(detail.project.id);
    } catch (error) {
      console.error(error);
      toast.error('取消提醒失败');
    } finally {
      setSaving(false);
    }
  };

  const updateReminderDraft = (linkId: string, patch: Partial<ReminderDraft>): void => {
    const fallback: ReminderDraft = {
      dueAt: '',
      kind: 'follow_up',
      reason: '',
      title: ''
    };
    setReminderDrafts((current) => ({
      ...current,
      [linkId]: { ...fallback, ...current[linkId], ...patch }
    }));
  };

  const saveReminder = async (linkId: string): Promise<void> => {
    if (!detail) return;
    const draft = reminderDrafts[linkId];
    if (!draft) return;
    const dueAt = parseDateTimeInput(draft.dueAt);
    if (!dueAt) {
      toast.error('请填写有效的提醒时间');
      return;
    }
    setSaving(true);
    try {
      const result = await window.YUA.projectTracking.updateReminder(linkId, {
        dueAt,
        kind: draft.kind,
        reason: draft.reason.trim() || null,
        title: draft.title.trim() || null
      });
      if (!result.ok) throw new Error(result.error || 'update reminder failed');
      toast.success('提醒已更新');
      await loadDetail(detail.project.id);
    } catch (error) {
      console.error(error);
      toast.error('更新提醒失败');
    } finally {
      setSaving(false);
    }
  };

  const resyncReminder = async (linkId: string): Promise<void> => {
    if (!detail) return;
    setSaving(true);
    try {
      const result = await window.YUA.projectTracking.resyncReminder(linkId);
      if (!result.ok) throw new Error(result.error || 'resync reminder failed');
      toast.success('提醒已重同步');
      await loadDetail(detail.project.id);
    } catch (error) {
      console.error(error);
      toast.error('重同步提醒失败');
    } finally {
      setSaving(false);
    }
  };

  const markReminderDone = async (linkId: string): Promise<void> => {
    if (!detail) return;
    setSaving(true);
    try {
      const result = await window.YUA.projectTracking.markReminderDone(linkId);
      if (!result.ok) throw new Error(result.error || 'mark reminder done failed');
      toast.success('提醒已标记完成');
      await loadDetail(detail.project.id);
    } catch (error) {
      console.error(error);
      toast.error('标记提醒完成失败');
    } finally {
      setSaving(false);
    }
  };

  const generateCompletionSummary = async (): Promise<void> => {
    if (!detail) return;
    setSaving(true);
    try {
      const result = await window.YUA.projectTracking.generateCompletionSummary(detail.project.id);
      if (!result.ok || !result.summary) throw new Error(result.error || 'generate summary failed');
      setCompletionSummaryDraft(result.summary);
      if (!retrospectiveDraft.trim()) setRetrospectiveDraft(result.summary);
      toast.success('完成总结已生成');
    } catch (error) {
      console.error(error);
      toast.error('生成完成总结失败');
    } finally {
      setSaving(false);
    }
  };

  const completeProject = async (): Promise<void> => {
    if (!detail) return;
    setSaving(true);
    try {
      const result = await window.YUA.projectTracking.completeProject(detail.project.id, {
        retrospective: retrospectiveDraft.trim() || null,
        summary: completionSummaryDraft.trim() || null
      });
      if (!result.ok) throw new Error(result.error || 'complete project failed');
      toast.success('项目已标记完成');
      await refreshCurrentProject(detail.project.id);
    } catch (error) {
      console.error(error);
      toast.error('完成项目失败');
    } finally {
      setSaving(false);
    }
  };

  const reopenProject = async (): Promise<void> => {
    if (!detail) return;
    setSaving(true);
    try {
      const result = await window.YUA.projectTracking.reopenProject(detail.project.id);
      if (!result.ok) throw new Error(result.error || 'reopen project failed');
      toast.success('项目已重新打开');
      await refreshCurrentProject(detail.project.id);
    } catch (error) {
      console.error(error);
      toast.error('重新打开项目失败');
    } finally {
      setSaving(false);
    }
  };

  const promoteRetrospectiveToMemory = async (): Promise<void> => {
    if (!detail) return;
    const contentPreview = (retrospectiveDraft.trim() || completionSummaryDraft.trim() || detail.project.summary || detail.project.goal).slice(0, 500);
    if (!window.confirm(`将「${detail.project.name}」复盘写入长期记忆？\n\n即将写入内容预览：\n${contentPreview}`)) return;
    setSaving(true);
    try {
      const result = await window.YUA.projectTracking.promoteRetrospectiveToMemory(detail.project.id, {
        retrospective: retrospectiveDraft.trim() || null,
        summary: completionSummaryDraft.trim() || null
      });
      if (!result.ok) throw new Error(result.error || 'promote memory failed');
      toast.success('复盘已晋升长期记忆');
      await refreshCurrentProject(detail.project.id);
    } catch (error) {
      console.error(error);
      toast.error('晋升长期记忆失败');
    } finally {
      setSaving(false);
    }
  };

  const updatePrivacySetting = async (key: keyof ProjectPrivacySettings, value: boolean): Promise<void> => {
    if (!detail) return;
    const patch: Partial<ProjectPrivacySettings> = { [key]: value };
    if (key === 'sensitive' && value) {
      patch.allowAutoLinking = false;
      patch.allowLongTermMemoryPromotion = false;
      patch.allowPromptInjection = false;
    }
    setSaving(true);
    try {
      const result = await window.YUA.projectTracking.updatePrivacySettings(detail.project.id, patch);
      if (!result.ok) throw new Error(result.error || 'update privacy failed');
      toast.success('隐私设置已更新');
      await loadDetail(detail.project.id);
    } catch (error) {
      console.error(error);
      toast.error('更新隐私设置失败');
    } finally {
      setSaving(false);
    }
  };

  const unlinkConversation = async (conversationId: string): Promise<void> => {
    if (!detail) return;
    setSaving(true);
    try {
      const result = await window.YUA.projectTracking.unlinkConversation({
        conversationId,
        projectId: detail.project.id,
        workspaceId: detail.project.workspaceId
      });
      if (!result.ok) throw new Error(result.error || 'unlink conversation failed');
      toast.success('会话关联已解除');
      await loadDetail(detail.project.id);
    } catch (error) {
      console.error(error);
      toast.error('解除会话关联失败');
    } finally {
      setSaving(false);
    }
  };

  const exportProject = async (): Promise<void> => {
    if (!detail) return;
    setSaving(true);
    try {
      const result = await window.YUA.projectTracking.exportProject(detail.project.id);
      if (!result.ok || !result.data) throw new Error(result.error || 'export project failed');
      downloadJson(`project-${detail.project.name}-${detail.project.id}.json`, result.data);
      toast.success('项目数据已导出');
      await loadDetail(detail.project.id);
    } catch (error) {
      console.error(error);
      toast.error('导出项目失败');
    } finally {
      setSaving(false);
    }
  };

  const softDeleteProject = async (): Promise<void> => {
    if (!detail) return;
    if (!window.confirm(`软删除项目「${detail.project.name}」？项目可以在显示已删除后恢复。`)) return;
    setSaving(true);
    try {
      const result = await window.YUA.projectTracking.softDeleteProject(detail.project.id);
      if (!result.ok) throw new Error(result.error || 'soft delete failed');
      toast.success('项目已软删除');
      await refreshCurrentProject(includeDeleted ? detail.project.id : null);
    } catch (error) {
      console.error(error);
      toast.error('软删除项目失败');
    } finally {
      setSaving(false);
    }
  };

  const restoreProject = async (): Promise<void> => {
    if (!detail) return;
    setSaving(true);
    try {
      const result = await window.YUA.projectTracking.restoreProject(detail.project.id);
      if (!result.ok) throw new Error(result.error || 'restore failed');
      toast.success('项目已恢复');
      await refreshCurrentProject(detail.project.id);
    } catch (error) {
      console.error(error);
      toast.error('恢复项目失败');
    } finally {
      setSaving(false);
    }
  };

  const hardDeleteProject = async (): Promise<void> => {
    if (!detail) return;
    const previewText = impactPreview
      ? `\n\n影响预览：事件 ${impactPreview.events}、里程碑 ${impactPreview.milestones}、关联 ${impactPreview.links}、提醒 ${impactPreview.reminderLinks}、scheduler 任务 ${impactPreview.schedulerTasks}、审计 ${impactPreview.auditLogs}。${
          impactPreview.promotedMemoryNoteIds.length ? `\n长期记忆笔记会保留，仅解除项目引用：${impactPreview.promotedMemoryNoteIds.join(', ')}` : ''
        }`
      : '';
    if (!window.confirm(`彻底删除项目「${detail.project.name}」及其事件、里程碑、提醒和关联？此操作不可恢复。${previewText}`)) return;
    const projectId = detail.project.id;
    setSaving(true);
    try {
      const result = await window.YUA.projectTracking.hardDeleteProject(projectId);
      if (!result.ok) throw new Error(result.error || 'hard delete failed');
      toast.success('项目已彻底删除');
      setDetail(null);
      setSelectedProjectId(null);
      await loadProjects();
    } catch (error) {
      console.error(error);
      toast.error('彻底删除项目失败');
    } finally {
      setSaving(false);
    }
  };

  const mergeProject = async (): Promise<void> => {
    if (!detail || !mergeTargetId) return;
    const target = projects.find((project) => project.id === mergeTargetId);
    if (!target) return;
    if (!window.confirm(`将「${detail.project.name}」合并到「${target.name}」？源项目会归档，事件、里程碑、关联和提醒会移动到目标项目。`)) return;
    setSaving(true);
    try {
      const result = await window.YUA.projectTracking.mergeProjects(detail.project.id, target.id);
      if (!result.ok) throw new Error(result.error || 'merge failed');
      toast.success('项目已合并');
      setSelectedProjectId(target.id);
      await refreshCurrentProject(target.id);
    } catch (error) {
      console.error(error);
      toast.error('合并项目失败');
    } finally {
      setSaving(false);
    }
  };

  const splitProject = async (): Promise<void> => {
    if (!detail || !splitName.trim() || !splitGoal.trim()) return;
    if (!splitEventIds.length && !splitMilestoneIds.length && !window.confirm('未选择事件或里程碑，仍然创建一个从当前项目拆分出的空项目？')) return;
    setSaving(true);
    try {
      const result = await window.YUA.projectTracking.splitProject({
        eventIds: splitEventIds,
        milestoneIds: splitMilestoneIds,
        newProject: {
          goal: splitGoal.trim(),
          name: splitName.trim(),
          status: 'active',
          summary: splitSummary.trim() || splitGoal.trim(),
          workspaceId: detail.project.workspaceId
        },
        sourceProjectId: detail.project.id
      });
      if (!result.ok || !result.project) throw new Error(result.error || 'split failed');
      toast.success('项目已拆分');
      setSelectedProjectId(result.project.id);
      await refreshCurrentProject(result.project.id);
    } catch (error) {
      console.error(error);
      toast.error('拆分项目失败');
    } finally {
      setSaving(false);
    }
  };

  const toggleSplitEvent = (eventId: string, checked: boolean): void => {
    setSplitEventIds((current) => (checked ? [...new Set([...current, eventId])] : current.filter((id) => id !== eventId)));
  };

  const toggleSplitMilestone = (milestoneId: string, checked: boolean): void => {
    setSplitMilestoneIds((current) => (checked ? [...new Set([...current, milestoneId])] : current.filter((id) => id !== milestoneId)));
  };

  const projectDeleted = Boolean(detail?.project.deletedAt);

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
        <div className="space-y-3 border-b p-3">
          <div className="flex items-center gap-2 rounded-md border bg-background px-2">
            <TbSearch className="text-muted-foreground" />
            <Input className="border-0 shadow-none focus-visible:ring-0" value={query} placeholder="搜索项目" onChange={(event) => setQuery(event.target.value)} />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <Label className="text-xs" htmlFor="include-deleted-projects">
              显示已删除
            </Label>
            <Switch id="include-deleted-projects" checked={includeDeleted} onCheckedChange={setIncludeDeleted} />
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
                  <Badge variant={projectBadgeVariant(project)}>{project.deletedAt ? '已删除' : statusLabel(project.status)}</Badge>
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
                <div className="flex min-w-0 items-center gap-2">
                  <div className="truncate text-lg font-semibold">{detail.project.name}</div>
                  {detail.project.privacySettings.sensitive ? <Badge variant="destructive">敏感</Badge> : null}
                </div>
                <div className="truncate text-xs text-muted-foreground">{detail.project.goal}</div>
              </div>
              <Badge variant={projectBadgeVariant(detail.project)}>{detail.project.deletedAt ? '已删除' : statusLabel(detail.project.status)}</Badge>
              <Button disabled={saving || projectDeleted} size="sm" variant="outline" onClick={() => void rebuildSnapshot()}>
                <TbRefresh />
                重建快照
              </Button>
              <Button disabled={saving || projectDeleted || detail.project.status === 'archived'} size="sm" variant="outline" onClick={() => void archiveProject()}>
                <TbArchive />
                归档
              </Button>
              <Button size="sm" variant="ghost" onClick={() => window.YUA.window['window:close']('projectTracking' as any)}>
                <TbX />
                关闭
              </Button>
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-[minmax(360px,0.9fr)_minmax(520px,1.45fr)]">
              <ScrollArea className="min-h-0 border-r">
                <section className="space-y-4 p-5">
                  <div className="space-y-3">
                    <div className="text-sm font-medium">项目资料</div>
                    <div className="space-y-2">
                      <Input disabled={projectDeleted} value={draftName} onChange={(event) => setDraftName(event.target.value)} />
                      <Textarea disabled={projectDeleted} className="min-h-24" value={draftGoal} onChange={(event) => setDraftGoal(event.target.value)} />
                      <Textarea disabled={projectDeleted} className="min-h-20" value={draftSummary} placeholder="摘要" onChange={(event) => setDraftSummary(event.target.value)} />
                    </div>
                    <Button disabled={saving || projectDeleted} size="sm" onClick={() => void saveProject()}>
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
                    <select
                      className="h-9 rounded-md border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={projectDeleted}
                      value={newEventType}
                      onChange={(event) => setNewEventType(event.target.value as ProjectEvent['type'])}
                    >
                      {EVENT_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <Input disabled={projectDeleted} value={newEventTitle} placeholder="事件标题" onChange={(event) => setNewEventTitle(event.target.value)} />
                    <Textarea disabled={projectDeleted} value={newEventContent} placeholder="事件内容或证据" onChange={(event) => setNewEventContent(event.target.value)} />
                    <Button disabled={saving || projectDeleted || !newEventTitle.trim()} size="sm" onClick={() => void addEvent()}>
                      {saving ? <TbLoader2 className="animate-spin" /> : <TbPlus />}
                      加入时间线
                    </Button>
                  </div>
                </section>
              </ScrollArea>

              <section className="min-w-0 p-5">
                <Tabs className="flex h-full min-h-0 flex-col" defaultValue="timeline">
                  <TabsList className="h-auto w-full flex-wrap justify-start">
                    <TabsTrigger value="timeline">时间线</TabsTrigger>
                    <TabsTrigger value="review">待确认{reviewEvents.length ? ` ${reviewEvents.length}` : ''}</TabsTrigger>
                    <TabsTrigger value="milestones">里程碑</TabsTrigger>
                    <TabsTrigger value="reminders">提醒</TabsTrigger>
                    <TabsTrigger value="completion">复盘</TabsTrigger>
                    <TabsTrigger value="governance">治理</TabsTrigger>
                    <TabsTrigger value="privacy">隐私</TabsTrigger>
                    <TabsTrigger value="audit">审计</TabsTrigger>
                    <TabsTrigger value="links">关联</TabsTrigger>
                  </TabsList>
                  <TabsContent className="min-h-0 flex-1" value="timeline">
                    <Timeline events={events} />
                  </TabsContent>
                  <TabsContent className="min-h-0 flex-1" value="review">
                    <ReviewQueue events={reviewEvents} saving={saving} onReview={(eventId, quality) => void reviewEvent(eventId, quality)} />
                  </TabsContent>
                  <TabsContent className="min-h-0 flex-1" value="milestones">
                    <Milestones milestones={milestones} />
                  </TabsContent>
                  <TabsContent className="min-h-0 flex-1" value="reminders">
                    <ReminderPanel
                      drafts={reminderDrafts}
                      links={reminderLinks}
                      saving={saving}
                      suggestions={reminderSuggestions}
                      onCancel={(linkId) => void cancelReminder(linkId)}
                      onCreate={(suggestion) => void createReminder(suggestion)}
                      onDraftChange={updateReminderDraft}
                      onMarkDone={(linkId) => void markReminderDone(linkId)}
                      onResync={(linkId) => void resyncReminder(linkId)}
                      onSave={(linkId) => void saveReminder(linkId)}
                    />
                  </TabsContent>
                  <TabsContent className="min-h-0 flex-1" value="completion">
                    <CompletionPanel
                      project={detail.project}
                      retrospectiveDraft={retrospectiveDraft}
                      saving={saving}
                      summaryDraft={completionSummaryDraft}
                      onComplete={() => void completeProject()}
                      onGenerate={() => void generateCompletionSummary()}
                      onPromote={() => void promoteRetrospectiveToMemory()}
                      onReopen={() => void reopenProject()}
                      onRetrospectiveChange={setRetrospectiveDraft}
                      onSummaryChange={setCompletionSummaryDraft}
                    />
                  </TabsContent>
                  <TabsContent className="min-h-0 flex-1" value="governance">
                    <GovernancePanel
                      currentProject={detail.project}
                      events={events}
                      impactPreview={impactPreview}
                      mergeOptions={mergeOptions}
                      mergeTargetId={mergeTargetId}
                      milestones={milestones}
                      orphanReport={orphanReport}
                      saving={saving}
                      splitEventIds={splitEventIds}
                      splitGoal={splitGoal}
                      splitMilestoneIds={splitMilestoneIds}
                      splitName={splitName}
                      splitSummary={splitSummary}
                      onExport={() => void exportProject()}
                      onHardDelete={() => void hardDeleteProject()}
                      onMerge={() => void mergeProject()}
                      onMergeTargetChange={setMergeTargetId}
                      onRestore={() => void restoreProject()}
                      onSoftDelete={() => void softDeleteProject()}
                      onSplit={() => void splitProject()}
                      onSplitEventToggle={toggleSplitEvent}
                      onSplitGoalChange={setSplitGoal}
                      onSplitMilestoneToggle={toggleSplitMilestone}
                      onSplitNameChange={setSplitName}
                      onSplitSummaryChange={setSplitSummary}
                    />
                  </TabsContent>
                  <TabsContent className="min-h-0 flex-1" value="privacy">
                    <PrivacyPanel project={detail.project} saving={saving} onUpdate={(key, value) => void updatePrivacySetting(key, value)} />
                  </TabsContent>
                  <TabsContent className="min-h-0 flex-1" value="audit">
                    <AuditLogPanel logs={auditLogs} />
                  </TabsContent>
                  <TabsContent className="min-h-0 flex-1" value="links">
                    <Links links={detail.links || []} saving={saving} onUnlinkConversation={(conversationId) => void unlinkConversation(conversationId)} />
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
              {event.needsUserConfirmation ? <Badge variant="destructive">需确认</Badge> : null}
              <Badge variant={event.quality === 'accepted' ? 'secondary' : 'outline'}>{qualityLabel(event.quality)}</Badge>
              <Badge variant={event.status === 'resolved' ? 'secondary' : 'outline'}>{event.status}</Badge>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {event.type} · {formatDate(event.createdAt)}
              {event.dueAt ? ` · 截止 ${formatDate(event.dueAt)}` : ''}
            </div>
            <div className="mt-2 text-sm leading-6">{event.content}</div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function ReviewQueue({ events, onReview, saving }: { events: ProjectEvent[]; onReview: (eventId: string, quality: 'accepted' | 'rejected') => void; saving: boolean }): JSX.Element {
  if (!events.length) return <div className="py-12 text-center text-sm text-muted-foreground">暂无待确认事件</div>;
  return (
    <ScrollArea className="h-full">
      <div className="space-y-2 pr-4">
        {events.map((event) => (
          <div key={event.id} className="rounded-md border px-3 py-2">
            <div className="flex items-center gap-2">
              <TbTimelineEvent className="text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{event.title}</span>
              {event.needsUserConfirmation ? <Badge variant="destructive">需确认</Badge> : null}
              <Badge variant="outline">{qualityLabel(event.quality)}</Badge>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {event.type} · {formatDate(event.createdAt)}
            </div>
            <div className="mt-2 text-sm leading-6">{event.content}</div>
            <div className="mt-3 flex gap-2">
              <Button disabled={saving} size="sm" onClick={() => onReview(event.id, 'accepted')}>
                {saving ? <TbLoader2 className="animate-spin" /> : <TbCheck />}
                接受
              </Button>
              <Button disabled={saving} size="sm" variant="outline" onClick={() => onReview(event.id, 'rejected')}>
                <TbX />
                拒绝
              </Button>
            </div>
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

function ReminderPanel({
  drafts,
  links,
  onCancel,
  onCreate,
  onDraftChange,
  onMarkDone,
  onResync,
  onSave,
  saving,
  suggestions
}: {
  drafts: Record<string, ReminderDraft>;
  links: ProjectReminderLink[];
  onCancel: (linkId: string) => void;
  onCreate: (suggestion: ProjectReminderSuggestion) => void;
  onDraftChange: (linkId: string, patch: Partial<ReminderDraft>) => void;
  onMarkDone: (linkId: string) => void;
  onResync: (linkId: string) => void;
  onSave: (linkId: string) => void;
  saving: boolean;
  suggestions: ProjectReminderSuggestion[];
}): JSX.Element {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 pr-4">
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <TbBell className="text-muted-foreground" />
            提醒建议
          </div>
          {suggestions.length ? (
            <div className="space-y-2">
              {suggestions.map((suggestion) => (
                <div key={`${suggestion.kind}-${suggestion.sourceEventId ?? suggestion.title}-${suggestion.dueAt ?? 'none'}`} className="rounded-md border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{suggestion.title}</span>
                    <Badge variant="outline">{reminderKindLabel(suggestion.kind)}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{formatDate(typeof suggestion.dueAt === 'number' ? suggestion.dueAt : Number(suggestion.dueAt))}</div>
                  <div className="mt-2 text-sm leading-6 text-muted-foreground">{suggestion.reason}</div>
                  <Button disabled={saving || !suggestion.dueAt} className="mt-3" size="sm" onClick={() => onCreate(suggestion)}>
                    {saving ? <TbLoader2 className="animate-spin" /> : <TbBellPlus />}
                    创建提醒
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border px-3 py-8 text-center text-sm text-muted-foreground">暂无新的提醒建议</div>
          )}
        </section>
        <Separator />
        <section className="space-y-2">
          <div className="text-sm font-medium">已关联提醒</div>
          {links.length ? (
            <div className="space-y-2">
              {links.map((link) => {
                const draft = drafts[link.id] ?? {
                  dueAt: formatDateTimeInput(link.dueAt),
                  kind: link.kind,
                  reason: link.reason || '',
                  title: link.title || ''
                };
                const inactive = link.status === 'cancelled' || link.status === 'done';
                return (
                  <div key={link.id} className="rounded-md border px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{link.title || link.schedulerTaskId}</span>
                      <Badge variant={link.status === 'scheduled' ? 'secondary' : 'outline'}>{reminderStatusLabel(link.status)}</Badge>
                      <Badge variant="outline">{reminderStatusLabel(link.syncStatus)}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {reminderKindLabel(link.kind)} · {formatDate(link.dueAt)} · {link.schedulerTaskId}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">最近同步/触发：{formatDate(link.lastSyncedAt)}</div>
                    <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(120px,1fr)_140px_190px]">
                      <Input disabled={saving || inactive} placeholder="提醒标题" value={draft.title} onChange={(event) => onDraftChange(link.id, { title: event.target.value })} />
                      <select
                        className="h-9 rounded-md border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={saving || inactive}
                        value={draft.kind}
                        onChange={(event) => onDraftChange(link.id, { kind: event.target.value as ProjectReminderKind })}
                      >
                        {REMINDER_KIND_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <Input disabled={saving || inactive} type="datetime-local" value={draft.dueAt} onChange={(event) => onDraftChange(link.id, { dueAt: event.target.value })} />
                    </div>
                    <Textarea
                      className="mt-2 min-h-16"
                      disabled={saving || inactive}
                      placeholder="提醒原因"
                      value={draft.reason}
                      onChange={(event) => onDraftChange(link.id, { reason: event.target.value })}
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button disabled={saving || inactive} size="sm" onClick={() => onSave(link.id)}>
                        {saving ? <TbLoader2 className="animate-spin" /> : <TbCheck />}
                        保存提醒
                      </Button>
                      <Button disabled={saving || inactive} size="sm" variant="outline" onClick={() => onResync(link.id)}>
                        <TbUpload />
                        重同步
                      </Button>
                      <Button disabled={saving || inactive} size="sm" variant="outline" onClick={() => onMarkDone(link.id)}>
                        <TbClipboardCheck />
                        标记完成
                      </Button>
                      <Button disabled={saving || inactive} size="sm" variant="outline" onClick={() => onCancel(link.id)}>
                        <TbBellX />
                        取消提醒
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-md border px-3 py-8 text-center text-sm text-muted-foreground">暂无已创建提醒</div>
          )}
        </section>
      </div>
    </ScrollArea>
  );
}

function CompletionPanel({
  onComplete,
  onGenerate,
  onPromote,
  onReopen,
  onRetrospectiveChange,
  onSummaryChange,
  project,
  retrospectiveDraft,
  saving,
  summaryDraft
}: {
  onComplete: () => void;
  onGenerate: () => void;
  onPromote: () => void;
  onReopen: () => void;
  onRetrospectiveChange: (value: string) => void;
  onSummaryChange: (value: string) => void;
  project: TrackedProject;
  retrospectiveDraft: string;
  saving: boolean;
  summaryDraft: string;
}): JSX.Element {
  const deleted = Boolean(project.deletedAt);
  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 pr-4">
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <TbClipboardCheck className="text-muted-foreground" />
            完成复盘
          </div>
          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
            <div className="rounded-md border px-3 py-2">完成时间：{formatDate(project.completedAt)}</div>
            <div className="rounded-md border px-3 py-2">晋升状态：{memoryPromotionLabel(project.memoryPromotionStatus)}</div>
            <div className="rounded-md border px-3 py-2">记忆笔记：{project.promotedMemoryNoteId || '-'}</div>
          </div>
          <Textarea className="min-h-36" disabled={deleted} placeholder="完成总结" value={summaryDraft} onChange={(event) => onSummaryChange(event.target.value)} />
          <Textarea className="min-h-40" disabled={deleted} placeholder="复盘、经验、后续建议" value={retrospectiveDraft} onChange={(event) => onRetrospectiveChange(event.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button disabled={saving || deleted} size="sm" variant="outline" onClick={onGenerate}>
              {saving ? <TbLoader2 className="animate-spin" /> : <TbReportAnalytics />}
              生成总结
            </Button>
            <Button disabled={saving || deleted || project.status === 'completed'} size="sm" onClick={onComplete}>
              <TbCheck />
              标记完成
            </Button>
            <Button disabled={saving || deleted || project.status !== 'completed'} size="sm" variant="outline" onClick={onReopen}>
              <TbPlayerPlay />
              重新打开
            </Button>
            <Button
              disabled={saving || deleted || !project.privacySettings.allowLongTermMemoryPromotion || project.memoryPromotionStatus === 'promoted'}
              size="sm"
              variant="outline"
              onClick={onPromote}
            >
              <TbRotateClockwise />
              晋升长期记忆
            </Button>
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}

function GovernancePanel({
  currentProject,
  events,
  impactPreview,
  mergeOptions,
  mergeTargetId,
  milestones,
  orphanReport,
  onExport,
  onHardDelete,
  onMerge,
  onMergeTargetChange,
  onRestore,
  onSoftDelete,
  onSplit,
  onSplitEventToggle,
  onSplitGoalChange,
  onSplitMilestoneToggle,
  onSplitNameChange,
  onSplitSummaryChange,
  saving,
  splitEventIds,
  splitGoal,
  splitMilestoneIds,
  splitName,
  splitSummary
}: {
  currentProject: TrackedProject;
  events: ProjectEvent[];
  impactPreview: ProjectImpactPreview | null;
  mergeOptions: TrackedProject[];
  mergeTargetId: string;
  milestones: ProjectMilestone[];
  orphanReport: ProjectOrphanReport | null;
  onExport: () => void;
  onHardDelete: () => void;
  onMerge: () => void;
  onMergeTargetChange: (value: string) => void;
  onRestore: () => void;
  onSoftDelete: () => void;
  onSplit: () => void;
  onSplitEventToggle: (eventId: string, checked: boolean) => void;
  onSplitGoalChange: (value: string) => void;
  onSplitMilestoneToggle: (milestoneId: string, checked: boolean) => void;
  onSplitNameChange: (value: string) => void;
  onSplitSummaryChange: (value: string) => void;
  saving: boolean;
  splitEventIds: string[];
  splitGoal: string;
  splitMilestoneIds: string[];
  splitName: string;
  splitSummary: string;
}): JSX.Element {
  const deleted = Boolean(currentProject.deletedAt);
  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 pr-4">
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <TbShield className="text-muted-foreground" />
            治理预检
          </div>
          <ImpactPreviewPanel preview={impactPreview} />
          <OrphanReportPanel report={orphanReport} />
        </section>

        <Separator />

        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <TbFileExport className="text-muted-foreground" />
            数据生命周期
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={saving} size="sm" variant="outline" onClick={onExport}>
              <TbDownload />
              导出 JSON
            </Button>
            {deleted ? (
              <Button disabled={saving} size="sm" variant="outline" onClick={onRestore}>
                <TbRotateClockwise />
                恢复项目
              </Button>
            ) : (
              <Button disabled={saving} size="sm" variant="outline" onClick={onSoftDelete}>
                <TbTrash />
                软删除
              </Button>
            )}
            <Button disabled={saving} size="sm" variant="destructive" onClick={onHardDelete}>
              <TbTrash />
              彻底删除
            </Button>
          </div>
          {currentProject.mergedIntoProjectId ? <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">已合并到：{currentProject.mergedIntoProjectId}</div> : null}
          {currentProject.splitFromProjectId ? <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">拆分来源：{currentProject.splitFromProjectId}</div> : null}
        </section>

        <Separator />

        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <TbGitMerge className="text-muted-foreground" />
            合并项目
          </div>
          <div className="flex gap-2">
            <select
              className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
              disabled={saving || deleted}
              value={mergeTargetId}
              onChange={(event) => onMergeTargetChange(event.target.value)}
            >
              <option value="">选择目标项目</option>
              {mergeOptions.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <Button disabled={saving || deleted || !mergeTargetId} size="sm" onClick={onMerge}>
              <TbGitMerge />
              合并
            </Button>
          </div>
        </section>

        <Separator />

        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <TbArrowsSplit className="text-muted-foreground" />
            拆分项目
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input disabled={saving || deleted} placeholder="新项目名称" value={splitName} onChange={(event) => onSplitNameChange(event.target.value)} />
            <Input disabled={saving || deleted} placeholder="新项目目标" value={splitGoal} onChange={(event) => onSplitGoalChange(event.target.value)} />
          </div>
          <Textarea disabled={saving || deleted} placeholder="新项目摘要" value={splitSummary} onChange={(event) => onSplitSummaryChange(event.target.value)} />
          <div className="grid gap-3 lg:grid-cols-2">
            <SelectableList
              emptyText="暂无可拆分事件"
              items={events.slice(0, 30).map((event) => ({ id: event.id, meta: event.type, title: event.title }))}
              selectedIds={splitEventIds}
              title="移动事件"
              onToggle={onSplitEventToggle}
            />
            <SelectableList
              emptyText="暂无可拆分里程碑"
              items={milestones.slice(0, 30).map((milestone) => ({ id: milestone.id, meta: milestone.status, title: milestone.title }))}
              selectedIds={splitMilestoneIds}
              title="移动里程碑"
              onToggle={onSplitMilestoneToggle}
            />
          </div>
          <Button disabled={saving || deleted || !splitName.trim() || !splitGoal.trim()} size="sm" onClick={onSplit}>
            <TbArrowsSplit />
            创建拆分项目
          </Button>
        </section>
      </div>
    </ScrollArea>
  );
}

function SelectableList({
  emptyText,
  items,
  onToggle,
  selectedIds,
  title
}: {
  emptyText: string;
  items: Array<{ id: string; meta: string; title: string }>;
  onToggle: (id: string, checked: boolean) => void;
  selectedIds: string[];
  title: string;
}): JSX.Element {
  return (
    <div className="rounded-md border">
      <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">{title}</div>
      <div className="max-h-56 space-y-1 overflow-auto p-2">
        {items.length ? (
          items.map((item) => (
            <label key={item.id} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
              <Checkbox checked={selectedIds.includes(item.id)} onCheckedChange={(checked) => onToggle(item.id, Boolean(checked))} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{item.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{item.meta}</span>
              </span>
            </label>
          ))
        ) : (
          <div className="px-2 py-8 text-center text-sm text-muted-foreground">{emptyText}</div>
        )}
      </div>
    </div>
  );
}

function ImpactPreviewPanel({ preview }: { preview: ProjectImpactPreview | null }): JSX.Element {
  if (!preview) return <div className="rounded-md border px-3 py-8 text-center text-sm text-muted-foreground">暂无治理预检数据</div>;
  const stats = [
    { label: '事件', value: preview.events },
    { label: '里程碑', value: preview.milestones },
    { label: '关联', value: preview.links },
    { label: '提醒', value: preview.reminderLinks },
    { label: 'Scheduler', value: preview.schedulerTasks },
    { label: '审计', value: preview.auditLogs }
  ];
  return (
    <div className="space-y-3 rounded-md border px-3 py-3">
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-md bg-muted/60 px-2 py-2">
            <div className="text-[11px] text-muted-foreground">{stat.label}</div>
            <div className="mt-1 text-lg font-semibold">{stat.value}</div>
          </div>
        ))}
      </div>
      {preview.promotedMemoryNoteIds.length ? (
        <div className="rounded-md bg-muted/60 px-2 py-2 text-xs leading-5 text-muted-foreground">长期记忆保留：{preview.promotedMemoryNoteIds.join(', ')}</div>
      ) : null}
      <WarningList warnings={preview.warnings} />
    </div>
  );
}

function OrphanReportPanel({ report }: { report: ProjectOrphanReport | null }): JSX.Element {
  if (!report) return <div className="rounded-md border px-3 py-8 text-center text-sm text-muted-foreground">暂无一致性报告</div>;
  const rows = [
    { count: report.deletedProjectActiveLinks.length, label: '软删项目仍有关联' },
    { count: report.danglingMemoryLinks.length, label: '长期记忆关联状态不一致' },
    { count: report.missingSchedulerTasks.length, label: '缺失 Scheduler 任务' },
    { count: report.staleSchedulerTasks.length, label: '陈旧 Scheduler 任务' }
  ];
  const hasIssues = rows.some((row) => row.count > 0) || report.warnings.length > 0;
  return (
    <div className="space-y-3 rounded-md border px-3 py-3">
      <div className="flex items-center gap-2">
        <Badge variant={hasIssues ? 'destructive' : 'secondary'}>{hasIssues ? '需处理' : '一致'}</Badge>
        <span className="text-sm text-muted-foreground">项目 ID：{report.projectId}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((row) => (
          <div key={row.label} className="rounded-md bg-muted/60 px-2 py-2">
            <div className="text-[11px] text-muted-foreground">{row.label}</div>
            <div className="mt-1 text-lg font-semibold">{row.count}</div>
          </div>
        ))}
      </div>
      <WarningList warnings={report.warnings} />
      <ReminderIssueList title="缺失 Scheduler 任务" links={report.missingSchedulerTasks} />
      <ReminderIssueList title="陈旧 Scheduler 任务" links={report.staleSchedulerTasks} />
      <LinkIssueList title="软删项目仍有关联" links={report.deletedProjectActiveLinks} />
      <LinkIssueList title="长期记忆关联状态不一致" links={report.danglingMemoryLinks} />
    </div>
  );
}

function WarningList({ warnings }: { warnings: string[] }): JSX.Element | null {
  if (!warnings.length) return null;
  return (
    <div className="space-y-1">
      {warnings.map((warning) => (
        <div key={warning} className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs leading-5 text-destructive">
          {warning}
        </div>
      ))}
    </div>
  );
}

function ReminderIssueList({ links, title }: { links: ProjectReminderLink[]; title: string }): JSX.Element | null {
  if (!links.length) return null;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground">
        {title}（{links.length}）
      </summary>
      <div className="mt-2 space-y-1">
        {links.map((link) => (
          <div key={link.id} className="rounded-md bg-muted/60 px-2 py-1.5">
            <div className="font-medium">{link.title || link.schedulerTaskId}</div>
            <div className="mt-1 break-all text-muted-foreground">
              {reminderStatusLabel(link.status)} · {reminderStatusLabel(link.syncStatus)} · {link.schedulerTaskId}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function LinkIssueList({ links, title }: { links: ProjectLinkLike[]; title: string }): JSX.Element | null {
  if (!links.length) return null;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground">
        {title}（{links.length}）
      </summary>
      <div className="mt-2 space-y-1">
        {links.map((link, index) => (
          <div key={`${link.targetType}-${link.targetId}-${index}`} className="rounded-md bg-muted/60 px-2 py-1.5">
            <div className="font-medium">{link.targetType}</div>
            <div className="mt-1 break-all text-muted-foreground">
              {link.relationType} · {link.targetId}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function PrivacyPanel({ onUpdate, project, saving }: { onUpdate: (key: keyof ProjectPrivacySettings, value: boolean) => void; project: TrackedProject; saving: boolean }): JSX.Element {
  const disabled = saving || Boolean(project.deletedAt);
  const rows: Array<{ description: string; keyName: keyof ProjectPrivacySettings; label: string }> = [
    { description: '允许自动把相关会话和上下文关联到项目。', keyName: 'allowAutoLinking', label: '自动关联' },
    { description: '允许把项目快照注入到后续对话上下文。', keyName: 'allowPromptInjection', label: '上下文注入' },
    { description: '允许根据时间点和开放事项生成 Scheduler 提醒建议。', keyName: 'allowReminderSuggestions', label: '提醒建议' },
    { description: '允许完成复盘写入长期记忆笔记。', keyName: 'allowLongTermMemoryPromotion', label: '长期记忆晋升' },
    { description: '敏感项目默认关闭自动关联、上下文注入和长期记忆晋升。', keyName: 'sensitive', label: '敏感项目' }
  ];
  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 pr-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <TbShield className="text-muted-foreground" />
          隐私与权限
        </div>
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.keyName} className="flex items-center gap-3 rounded-md border px-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{row.label}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">{row.description}</div>
              </div>
              <Switch checked={Boolean(project.privacySettings[row.keyName])} disabled={disabled} onCheckedChange={(checked) => onUpdate(row.keyName, checked)} />
            </div>
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}

function AuditLogPanel({ logs }: { logs: ProjectAuditLog[] }): JSX.Element {
  if (!logs.length) return <div className="py-12 text-center text-sm text-muted-foreground">暂无审计记录</div>;
  return (
    <ScrollArea className="h-full">
      <div className="space-y-2 pr-4">
        {logs.map((log) => {
          const before = compactJson(log.before);
          const after = compactJson(log.after);
          const metadata = compactJson(log.metadata);
          return (
            <div key={log.id} className="rounded-md border px-3 py-2">
              <div className="flex items-center gap-2">
                <TbHistory className="text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{auditActionLabel(log.action)}</span>
                <Badge variant="outline">{log.actor}</Badge>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {formatDate(log.createdAt)} · {log.targetType}
                {log.targetId ? ` · ${log.targetId}` : ''}
              </div>
              {log.reason ? <div className="mt-2 text-sm text-muted-foreground">{log.reason}</div> : null}
              {before || after || metadata ? (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-muted-foreground">查看变更</summary>
                  <div className="mt-2 grid gap-2 lg:grid-cols-3">
                    {before ? <AuditPre title="Before" value={before} /> : null}
                    {after ? <AuditPre title="After" value={after} /> : null}
                    {metadata ? <AuditPre title="Metadata" value={metadata} /> : null}
                  </div>
                </details>
              ) : null}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

function AuditPre({ title, value }: { title: string; value: string }): JSX.Element {
  return (
    <div className="min-w-0 rounded-md bg-muted/60 p-2">
      <div className="mb-1 font-medium text-muted-foreground">{title}</div>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words">{value}</pre>
    </div>
  );
}

function Links({ links, onUnlinkConversation, saving }: { links: ProjectLinkLike[]; onUnlinkConversation: (conversationId: string) => void; saving: boolean }): JSX.Element {
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
            {link.targetType === 'conversation' && link.targetId ? (
              <Button className="mt-3" disabled={saving} size="sm" variant="outline" onClick={() => onUnlinkConversation(link.targetId || '')}>
                <TbX />
                解除会话关联
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

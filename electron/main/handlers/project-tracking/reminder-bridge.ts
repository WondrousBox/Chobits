import { buildProjectReminderSuggestions } from '../../../../packages/ai/services/project-tracking-service';
import type { ProjectReminderKind, ProjectReminderLink, ProjectReminderSuggestion } from '../../../../packages/ai/services/project-tracking-types';
import { ProjectAuditLogRepo, ProjectEventRepo, ProjectReminderLinkRepo, ProjectRepo, ProjectSnapshotRepo } from '../../db/project-tracking-repositories';
import { getMainSchedulerService, type SchedulerJobDefinition, type SchedulerRunContext } from '../../scheduler';

const PROJECT_REMINDER_OWNER = 'project-tracking-reminder';
let registered = false;

interface ProjectReminderPayload {
  projectId: string;
  reminderLinkId: string;
  title: string;
}

interface ProjectReminderPatch {
  dueAt?: number | null;
  kind?: ProjectReminderKind;
  reason?: string | null;
  title?: string | null;
}

export function initProjectReminderBridge(): void {
  if (registered) return;
  registered = true;
  getMainSchedulerService().registerHandler<ProjectReminderPayload>(PROJECT_REMINDER_OWNER, async (context: SchedulerRunContext<ProjectReminderPayload>) => {
    const payload = context.payload;
    if (!payload?.projectId || !payload.reminderLinkId) return { status: 'skipped' as const, reason: 'missing-project-reminder-payload' };
    const project = await ProjectRepo.get(payload.projectId);
    if (!project || project.deletedAt || project.status === 'archived' || project.status === 'completed') {
      await ProjectReminderLinkRepo.update(payload.reminderLinkId, { status: 'cancelled', syncStatus: 'cancelled' });
      return { status: 'skipped' as const, reason: 'project-inactive' };
    }
    await ProjectReminderLinkRepo.update(payload.reminderLinkId, { status: 'done', lastSyncedAt: Date.now() });
    await ProjectAuditLogRepo.create({
      action: 'project_reminder_triggered',
      actor: 'system',
      metadata: { title: payload.title, triggeredAt: context.triggeredAt },
      projectId: payload.projectId,
      targetId: payload.reminderLinkId,
      targetType: 'reminder',
      workspaceId: project.workspaceId
    });
    return { status: 'success' as const };
  });
}

export async function listProjectReminderSuggestions(projectId: string): Promise<ProjectReminderSuggestion[]> {
  const project = await ProjectRepo.get(projectId);
  if (!project) return [];
  const [snapshot, events] = await Promise.all([ProjectSnapshotRepo.get(projectId), ProjectEventRepo.listByProject(projectId, { limit: 200 })]);
  const existing = await ProjectReminderLinkRepo.listByProject(projectId, 200);
  const existingSourceEventIds = new Set(existing.map((link) => link.projectEventId).filter(Boolean));
  const existingKeys = new Set(existing.filter((link) => link.status !== 'cancelled').map((link) => `${link.kind}:${link.projectEventId ?? link.title ?? ''}:${link.dueAt ?? ''}`));
  return buildProjectReminderSuggestions({ events, project, snapshot }).filter((suggestion) => {
    if (suggestion.sourceEventId && existingSourceEventIds.has(suggestion.sourceEventId)) return false;
    const dueAt = typeof suggestion.dueAt === 'number' ? suggestion.dueAt : Number(suggestion.dueAt);
    return !existingKeys.has(`${suggestion.kind}:${suggestion.sourceEventId ?? suggestion.title}:${Number.isFinite(dueAt) ? dueAt : ''}`);
  });
}

export async function createProjectReminderFromSuggestion(
  projectId: string,
  suggestion: ProjectReminderSuggestion
): Promise<{ link?: Awaited<ReturnType<typeof ProjectReminderLinkRepo.create>>; ok: boolean; error?: string }> {
  const project = await ProjectRepo.get(projectId);
  if (!project) return { ok: false, error: 'project not found' };
  const dueAt = typeof suggestion.dueAt === 'number' ? suggestion.dueAt : Number(suggestion.dueAt);
  if (!Number.isFinite(dueAt)) return { ok: false, error: 'dueAt is required' };
  const schedulerTaskId = `project-reminder:${projectId}:${suggestion.sourceEventId ?? Date.now()}`;
  const link = await ProjectReminderLinkRepo.create({
    dueAt,
    kind: suggestion.kind,
    projectEventId: suggestion.sourceEventId ?? null,
    projectId,
    reason: suggestion.reason,
    schedulerTaskId,
    status: 'scheduled',
    syncStatus: 'synced',
    title: suggestion.title,
    workspaceId: project.workspaceId
  });
  const definition = buildReminderJobDefinition(project, link);
  getMainSchedulerService().upsert(definition);
  await ProjectAuditLogRepo.create({
    action: 'project_reminder_created',
    actor: 'user',
    after: { dueAt, schedulerTaskId, suggestion },
    projectId,
    targetId: link.id,
    targetType: 'reminder',
    workspaceId: project.workspaceId
  });
  return { link, ok: true };
}

function buildReminderJobDefinition(project: NonNullable<Awaited<ReturnType<typeof ProjectRepo.get>>>, link: ProjectReminderLink): SchedulerJobDefinition<ProjectReminderPayload> {
  return {
    enabled: true,
    id: link.schedulerTaskId,
    name: `项目提醒：${project.name}`,
    owner: PROJECT_REMINDER_OWNER,
    payload: {
      projectId: project.id,
      reminderLinkId: link.id,
      title: link.title || project.name
    },
    runPolicy: {
      misfire: 'run-once',
      singletonKey: link.schedulerTaskId
    },
    schedule: {
      at: link.dueAt ?? Date.now(),
      kind: 'date'
    }
  };
}

export async function cancelProjectReminder(linkId: string): Promise<{ ok: boolean; link?: Awaited<ReturnType<typeof ProjectReminderLinkRepo.update>>; error?: string }> {
  const scheduler = getMainSchedulerService();
  const link = await ProjectReminderLinkRepo.get(linkId);
  if (!link) return { ok: false, error: 'reminder link not found' };
  scheduler.remove(link.schedulerTaskId);
  const updated = await ProjectReminderLinkRepo.update(linkId, { status: 'cancelled', syncStatus: 'cancelled', lastSyncedAt: Date.now() });
  await ProjectAuditLogRepo.create({
    action: 'project_reminder_cancelled',
    actor: 'user',
    projectId: link.projectId,
    targetId: link.id,
    targetType: 'reminder',
    workspaceId: link.workspaceId
  });
  return { link: updated, ok: true };
}

export async function updateProjectReminder(linkId: string, patch: ProjectReminderPatch): Promise<{ ok: boolean; link?: ProjectReminderLink; error?: string }> {
  const scheduler = getMainSchedulerService();
  const current = await ProjectReminderLinkRepo.get(linkId);
  if (!current) return { ok: false, error: 'reminder link not found' };
  if (current.status === 'cancelled' || current.status === 'done') return { ok: false, error: 'inactive reminder cannot be updated' };
  const project = await ProjectRepo.get(current.projectId);
  if (!project) return { ok: false, error: 'project not found' };
  const dueAt = patch.dueAt === undefined ? current.dueAt : patch.dueAt;
  if (!dueAt || !Number.isFinite(dueAt)) return { ok: false, error: 'dueAt is required' };
  const updated = await ProjectReminderLinkRepo.update(linkId, {
    dueAt,
    kind: patch.kind ?? current.kind,
    lastSyncedAt: Date.now(),
    reason: patch.reason === undefined ? current.reason : patch.reason,
    status: 'scheduled',
    syncStatus: 'synced',
    title: patch.title === undefined ? current.title : patch.title
  });
  if (!updated) return { ok: false, error: 'failed to update reminder link' };
  scheduler.upsert(buildReminderJobDefinition(project, updated));
  await ProjectAuditLogRepo.create({
    action: 'project_reminder_updated',
    actor: 'user',
    after: updated,
    before: current,
    projectId: updated.projectId,
    targetId: updated.id,
    targetType: 'reminder',
    workspaceId: updated.workspaceId
  });
  return { link: updated, ok: true };
}

export async function resyncProjectReminder(linkId: string): Promise<{ ok: boolean; link?: ProjectReminderLink; error?: string }> {
  const current = await ProjectReminderLinkRepo.get(linkId);
  if (!current) return { ok: false, error: 'reminder link not found' };
  if (current.status === 'cancelled' || current.status === 'done') return { ok: false, error: 'inactive reminder cannot be resynced' };
  const project = await ProjectRepo.get(current.projectId);
  if (!project) return { ok: false, error: 'project not found' };
  if (!current.dueAt) return { ok: false, error: 'dueAt is required' };
  getMainSchedulerService().upsert(buildReminderJobDefinition(project, current));
  const updated = await ProjectReminderLinkRepo.update(linkId, {
    lastSyncedAt: Date.now(),
    status: 'scheduled',
    syncStatus: 'synced'
  });
  await ProjectAuditLogRepo.create({
    action: 'project_reminder_resynced',
    actor: 'user',
    after: { schedulerTaskId: current.schedulerTaskId },
    projectId: current.projectId,
    targetId: current.id,
    targetType: 'reminder',
    workspaceId: current.workspaceId
  });
  return { link: updated, ok: true };
}

export async function markProjectReminderDone(linkId: string): Promise<{ ok: boolean; link?: ProjectReminderLink; error?: string }> {
  const link = await ProjectReminderLinkRepo.get(linkId);
  if (!link) return { ok: false, error: 'reminder link not found' };
  getMainSchedulerService().remove(link.schedulerTaskId);
  const updated = await ProjectReminderLinkRepo.update(linkId, { lastSyncedAt: Date.now(), status: 'done', syncStatus: 'synced' });
  await ProjectAuditLogRepo.create({
    action: 'project_reminder_done',
    actor: 'user',
    projectId: link.projectId,
    targetId: link.id,
    targetType: 'reminder',
    workspaceId: link.workspaceId
  });
  return { link: updated, ok: true };
}

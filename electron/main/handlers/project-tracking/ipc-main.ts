import { ipcMain } from 'electron';

import { buildWriteDbOps } from '../../../../packages/ai/runtime/pi/tools/memory-db-deps';
import { writeMemory } from '../../../../packages/ai/services/memory-extraction-service';
import { buildNotePath, generateNoteId } from '../../../../packages/ai/services/memory-note-writer';
import type { MergedNote } from '../../../../packages/ai/services/memory-types';
import { generateProjectCompletionSummary } from '../../../../packages/ai/services/project-tracking-service';
import type {
  CreateProjectInput,
  ProjectCandidateStatus,
  ProjectEventQuality,
  ProjectPrivacySettings,
  ProjectReminderSuggestion,
  ProjectStatus
} from '../../../../packages/ai/services/project-tracking-types';
import {
  ProjectAuditLogRepo,
  ProjectCandidateRepo,
  ProjectEventRepo,
  ProjectGovernanceRepo,
  ProjectLinkRepo,
  ProjectMilestoneRepo,
  ProjectReminderLinkRepo,
  ProjectRepo,
  ProjectSnapshotRepo
} from '../../db/project-tracking-repositories';
import { WorkspacesRepo } from '../../db/repositories';
import { getMainSchedulerService } from '../../scheduler';
import { initProjectTrackingEnricher } from './enricher';
import { getProjectTrackingConfig, setProjectTrackingConfig } from './project-tracking-config';
import {
  cancelProjectReminder,
  createProjectReminderFromSuggestion,
  initProjectReminderBridge,
  listProjectReminderSuggestions,
  markProjectReminderDone,
  resyncProjectReminder,
  updateProjectReminder
} from './reminder-bridge';
import { initProjectTrackingWorker } from './worker';

async function resolveWorkspaceId(workspaceId?: string): Promise<string | undefined> {
  if (workspaceId) return workspaceId;
  return (await WorkspacesRepo.getDefault())?.id;
}

export function initProjectTrackingHandlers(): void {
  initProjectTrackingEnricher();
  initProjectTrackingWorker();
  initProjectReminderBridge();

  ipcMain.handle('projectTracking:getConfig', async () => ({
    config: getProjectTrackingConfig(),
    ok: true
  }));

  ipcMain.handle('projectTracking:setConfig', async (_event, patch: Record<string, unknown>) => ({
    config: setProjectTrackingConfig(patch as any),
    ok: true
  }));

  ipcMain.handle(
    'projectTracking:listProjects',
    async (
      _event,
      params?: {
        includeDeleted?: boolean;
        limit?: number;
        offset?: number;
        status?: ProjectStatus[];
        workspaceId?: string;
      }
    ) => {
      const workspaceId = await resolveWorkspaceId(params?.workspaceId);
      if (!workspaceId) return [];
      return ProjectRepo.list(workspaceId, {
        includeDeleted: params?.includeDeleted,
        limit: params?.limit,
        offset: params?.offset,
        status: params?.status
      });
    }
  );

  ipcMain.handle('projectTracking:getProject', async (_event, projectId: string) => {
    if (!projectId) return null;
    const [project, snapshot, links] = await Promise.all([ProjectRepo.get(projectId), ProjectSnapshotRepo.get(projectId), ProjectLinkRepo.listByProject(projectId)]);
    if (!project) return null;
    return { links, project, snapshot: snapshot ?? null };
  });

  ipcMain.handle('projectTracking:searchProjects', async (_event, params?: { limit?: number; query?: string; workspaceId?: string }) => {
    const workspaceId = await resolveWorkspaceId(params?.workspaceId);
    const query = params?.query?.trim();
    if (!workspaceId || !query) return [];
    return ProjectRepo.search(workspaceId, query, params?.limit);
  });

  ipcMain.handle('projectTracking:listLinksByTarget', async (_event, params?: { limit?: number; targetId?: string; targetType?: any; workspaceId?: string }) => {
    const workspaceId = await resolveWorkspaceId(params?.workspaceId);
    if (!workspaceId || !params?.targetId || !params?.targetType) return [];
    return ProjectLinkRepo.listByTarget({
      limit: params.limit,
      targetId: params.targetId,
      targetType: params.targetType,
      workspaceId
    });
  });

  ipcMain.handle(
    'projectTracking:linkConversation',
    async (
      _event,
      params?: {
        confidence?: number;
        conversationId?: string;
        createdBy?: 'user' | 'agent' | 'system';
        projectId?: string;
        relationType?: any;
        strength?: number;
        workspaceId?: string;
      }
    ) => {
      const workspaceId = await resolveWorkspaceId(params?.workspaceId);
      if (!workspaceId || !params?.projectId || !params.conversationId) return { ok: false, error: 'projectId, conversationId and workspaceId are required' };
      const link = await ProjectLinkRepo.upsert({
        confidence: params.confidence,
        createdBy: params.createdBy ?? 'user',
        projectId: params.projectId,
        relationType: params.relationType ?? 'related_context',
        strength: params.strength,
        targetId: params.conversationId,
        targetType: 'conversation',
        workspaceId
      });
      return { link, ok: true };
    }
  );

  ipcMain.handle(
    'projectTracking:unlinkConversation',
    async (
      _event,
      params?: {
        conversationId?: string;
        projectId?: string;
        workspaceId?: string;
      }
    ) => {
      const workspaceId = await resolveWorkspaceId(params?.workspaceId);
      if (!workspaceId || !params?.conversationId) return { ok: false, error: 'conversationId and workspaceId are required' };
      const removed = await ProjectLinkRepo.remove({
        projectId: params.projectId,
        targetId: params.conversationId,
        targetType: 'conversation',
        workspaceId
      });
      return { ok: true, removed };
    }
  );

  ipcMain.handle('projectTracking:createProject', async (_event, input: CreateProjectInput) => {
    if (!input?.name?.trim() || !input?.goal?.trim()) return { ok: false, error: 'name and goal are required' };
    const workspaceId = await resolveWorkspaceId(input.workspaceId);
    if (!workspaceId) return { ok: false, error: 'workspaceId is required' };
    const project = await ProjectRepo.create({
      ...input,
      workspaceId
    });
    return {
      ok: true,
      project,
      snapshot: (await ProjectSnapshotRepo.get(project.id)) ?? null
    };
  });

  ipcMain.handle('projectTracking:updateProject', async (_event, projectId: string, patch: Partial<CreateProjectInput> & { status?: ProjectStatus }) => {
    if (!projectId) return { ok: false, error: 'projectId is required' };
    const project = await ProjectRepo.update(projectId, patch || {});
    return {
      ok: !!project,
      project: project ?? null,
      snapshot: project ? ((await ProjectSnapshotRepo.get(project.id)) ?? null) : null
    };
  });

  ipcMain.handle('projectTracking:archiveProject', async (_event, projectId: string) => {
    if (!projectId) return { ok: false, error: 'projectId is required' };
    const project = await ProjectRepo.archive(projectId);
    return {
      ok: !!project,
      project: project ?? null,
      snapshot: project ? ((await ProjectSnapshotRepo.get(project.id)) ?? null) : null
    };
  });

  ipcMain.handle('projectTracking:updatePrivacySettings', async (_event, projectId: string, patch: Partial<ProjectPrivacySettings>) => {
    if (!projectId) return { ok: false, error: 'projectId is required' };
    const before = await ProjectRepo.get(projectId);
    const project = await ProjectRepo.updatePrivacySettings(projectId, patch || {});
    if (project) {
      await ProjectAuditLogRepo.create({
        action: 'project_privacy_updated',
        actor: 'user',
        after: project.privacySettings,
        before: before?.privacySettings,
        projectId,
        targetId: projectId,
        targetType: 'project',
        workspaceId: project.workspaceId
      });
    }
    return { ok: !!project, project: project ?? null };
  });

  ipcMain.handle('projectTracking:exportProject', async (_event, projectId: string) => {
    if (!projectId) return { ok: false, error: 'projectId is required' };
    const data = await ProjectGovernanceRepo.exportProject(projectId);
    if (data) {
      await ProjectAuditLogRepo.create({
        action: 'project_exported',
        actor: 'user',
        projectId,
        targetId: projectId,
        targetType: 'project',
        workspaceId: data.project.workspaceId
      });
    }
    return { data: data ?? null, ok: !!data };
  });

  ipcMain.handle('projectTracking:previewProjectImpact', async (_event, projectId: string) => {
    if (!projectId) return { error: 'projectId is required', ok: false, preview: null };
    const preview = await ProjectGovernanceRepo.previewProjectImpact(projectId);
    if (!preview) return { error: 'project not found', ok: false, preview: null };
    const scheduler = getMainSchedulerService();
    const reminderLinks = await ProjectReminderLinkRepo.listByProject(projectId, 10000);
    const schedulerTasks = reminderLinks.filter((link) => link.status === 'scheduled' && link.syncStatus === 'synced' && Boolean(scheduler.getJob(link.schedulerTaskId))).length;
    const warnings = [...preview.warnings];
    if (schedulerTasks < preview.schedulerTasks) warnings.push('some synced reminder links are missing scheduler jobs');
    return {
      ok: true,
      preview: {
        ...preview,
        schedulerTasks,
        warnings: [...new Set(warnings)]
      }
    };
  });

  ipcMain.handle('projectTracking:inspectProjectOrphans', async (_event, projectId: string) => {
    if (!projectId) return { error: 'projectId is required', ok: false, report: null };
    const report = await ProjectGovernanceRepo.inspectProjectOrphans(projectId);
    if (!report) return { error: 'project not found', ok: false, report: null };

    const scheduler = getMainSchedulerService();
    const reminderLinks = await ProjectReminderLinkRepo.listByProject(projectId, 10000);
    const missingSchedulerTasks = reminderLinks.filter((link) => link.status === 'scheduled' && link.syncStatus === 'synced' && !scheduler.getJob(link.schedulerTaskId));
    const staleSchedulerTaskIds = new Set(report.staleSchedulerTasks.map((link) => link.id));
    const staleSchedulerTasks = [
      ...report.staleSchedulerTasks,
      ...reminderLinks.filter((link) => {
        if (staleSchedulerTaskIds.has(link.id)) return false;
        const hasJob = Boolean(scheduler.getJob(link.schedulerTaskId));
        return link.syncStatus === 'failed' || ((link.status === 'cancelled' || link.status === 'done') && hasJob);
      })
    ];
    const warnings = [...report.warnings];
    if (missingSchedulerTasks.length) warnings.push('scheduled reminder links are missing scheduler jobs');
    if (staleSchedulerTasks.some((link) => link.status === 'cancelled' || link.status === 'done')) warnings.push('inactive reminder links still have scheduler jobs');

    return {
      ok: true,
      report: {
        ...report,
        missingSchedulerTasks,
        staleSchedulerTasks,
        warnings: [...new Set(warnings)]
      }
    };
  });

  ipcMain.handle('projectTracking:softDeleteProject', async (_event, projectId: string) => {
    if (!projectId) return { ok: false, error: 'projectId is required' };
    const before = await ProjectRepo.get(projectId);
    const project = await ProjectRepo.softDelete(projectId);
    if (project) {
      await ProjectAuditLogRepo.create({
        action: 'project_soft_deleted',
        actor: 'user',
        after: project,
        before,
        projectId,
        targetId: projectId,
        targetType: 'project',
        workspaceId: project.workspaceId
      });
    }
    return { ok: !!project, project: project ?? null };
  });

  ipcMain.handle('projectTracking:restoreProject', async (_event, projectId: string) => {
    if (!projectId) return { ok: false, error: 'projectId is required' };
    const project = await ProjectRepo.restore(projectId);
    if (project) {
      await ProjectAuditLogRepo.create({
        action: 'project_restored',
        actor: 'user',
        projectId,
        targetId: projectId,
        targetType: 'project',
        workspaceId: project.workspaceId
      });
    }
    return { ok: !!project, project: project ?? null };
  });

  ipcMain.handle('projectTracking:hardDeleteProject', async (_event, projectId: string) => {
    if (!projectId) return { ok: false, error: 'projectId is required' };
    const before = await ProjectRepo.get(projectId);
    const [impactPreview, reminderLinks] = await Promise.all([ProjectGovernanceRepo.previewProjectImpact(projectId), ProjectReminderLinkRepo.listByProject(projectId, 10000)]);
    const scheduler = getMainSchedulerService();
    for (const link of reminderLinks) {
      scheduler.remove(link.schedulerTaskId);
    }
    const removed = await ProjectRepo.hardDelete(projectId);
    if (before) {
      await ProjectAuditLogRepo.create({
        action: 'project_hard_deleted',
        actor: 'user',
        before,
        metadata: {
          impactPreview,
          memoryReferencePolicy: 'unlink_project_only',
          promotedMemoryNoteIds: impactPreview?.promotedMemoryNoteIds ?? [],
          removedSchedulerTaskIds: reminderLinks.map((link) => link.schedulerTaskId)
        },
        projectId: null,
        targetId: projectId,
        targetType: 'project',
        workspaceId: before.workspaceId
      }).catch(() => undefined);
    }
    return { ok: removed > 0, removed };
  });

  ipcMain.handle('projectTracking:mergeProjects', async (_event, sourceProjectId: string, targetProjectId: string) => {
    if (!sourceProjectId || !targetProjectId) return { ok: false, error: 'sourceProjectId and targetProjectId are required' };
    const result = await ProjectGovernanceRepo.mergeProjects(sourceProjectId, targetProjectId, 'user');
    return { ok: !!result.source && !!result.target, ...result };
  });

  ipcMain.handle('projectTracking:splitProject', async (_event, input?: { eventIds?: string[]; milestoneIds?: string[]; newProject?: CreateProjectInput; sourceProjectId?: string }) => {
    if (!input?.sourceProjectId || !input.newProject?.name || !input.newProject.goal) return { ok: false, error: 'sourceProjectId and newProject are required' };
    const project = await ProjectGovernanceRepo.splitProject({
      actor: 'user',
      eventIds: input.eventIds ?? [],
      milestoneIds: input.milestoneIds ?? [],
      newProject: input.newProject,
      sourceProjectId: input.sourceProjectId
    });
    return { ok: !!project, project: project ?? null };
  });

  ipcMain.handle(
    'projectTracking:listCandidates',
    async (
      _event,
      params?: {
        conversationId?: string;
        limit?: number;
        offset?: number;
        status?: ProjectCandidateStatus[];
        workspaceId?: string;
      }
    ) => {
      const workspaceId = await resolveWorkspaceId(params?.workspaceId);
      if (!workspaceId) return [];
      return ProjectCandidateRepo.list(workspaceId, {
        conversationId: params?.conversationId,
        limit: params?.limit,
        offset: params?.offset,
        status: params?.status
      });
    }
  );

  ipcMain.handle('projectTracking:confirmCandidate', async (_event, candidateId: string, overrides?: Partial<CreateProjectInput>) => {
    if (!candidateId) return { ok: false, error: 'candidateId is required' };
    const candidate = await ProjectCandidateRepo.get(candidateId);
    if (!candidate) return { ok: false, error: 'candidate not found' };
    const project = await ProjectRepo.create({
      aliases: overrides?.aliases,
      createdBy: overrides?.createdBy ?? 'agent_suggestion',
      domains: overrides?.domains,
      goal: overrides?.goal || candidate.proposedGoal,
      name: overrides?.name || candidate.proposedName,
      scope: overrides?.scope,
      status: overrides?.status ?? 'active',
      summary: overrides?.summary || candidate.evidenceSummary || candidate.proposedGoal,
      tags: overrides?.tags,
      workspaceId: candidate.workspaceId
    });
    const updatedCandidate = await ProjectCandidateRepo.updateStatus(candidate.id, 'confirmed', project.id);
    await ProjectLinkRepo.upsert({
      confidence: candidate.signalScore,
      createdBy: 'agent',
      projectId: project.id,
      relationType: 'source',
      strength: 1,
      targetId: candidate.conversationId,
      targetType: 'conversation',
      workspaceId: candidate.workspaceId
    });
    return {
      candidate: updatedCandidate ?? null,
      ok: true,
      project,
      snapshot: (await ProjectSnapshotRepo.get(project.id)) ?? null
    };
  });

  ipcMain.handle('projectTracking:dismissCandidate', async (_event, candidateId: string) => {
    if (!candidateId) return { ok: false, error: 'candidateId is required' };
    const candidate = await ProjectCandidateRepo.updateStatus(candidateId, 'dismissed');
    return { candidate: candidate ?? null, ok: !!candidate };
  });

  ipcMain.handle('projectTracking:listEvents', async (_event, params?: { limit?: number; projectId?: string; quality?: ProjectEventQuality[]; status?: any[]; type?: any[] }) => {
    if (!params?.projectId) return [];
    return ProjectEventRepo.listByProject(params.projectId, {
      limit: params.limit,
      quality: params.quality,
      status: params.status,
      type: params.type
    });
  });

  ipcMain.handle('projectTracking:addEvent', async (_event, params?: Parameters<typeof ProjectEventRepo.create>[0]) => {
    const workspaceId = await resolveWorkspaceId(params?.workspaceId);
    if (!params?.projectId || !workspaceId || !params.title || !params.content || !params.type) return { ok: false, error: 'projectId, workspaceId, type, title and content are required' };
    const event = await ProjectEventRepo.create({
      ...params,
      needsUserConfirmation: params.needsUserConfirmation ?? false,
      quality: params.quality ?? 'accepted',
      reviewedAt: params.reviewedAt ?? Date.now(),
      reviewedBy: params.reviewedBy ?? 'user',
      workspaceId
    });
    const snapshot = await ProjectSnapshotRepo.recomputeFromEvents(event.projectId);
    return { event, ok: true, snapshot: snapshot ?? null };
  });

  ipcMain.handle('projectTracking:updateEvent', async (_event, eventId: string, patch: any) => {
    if (!eventId) return { ok: false, error: 'eventId is required' };
    const event = await ProjectEventRepo.update(eventId, patch || {});
    const snapshot = event ? await ProjectSnapshotRepo.recomputeFromEvents(event.projectId) : null;
    return { event: event ?? null, ok: !!event, snapshot: snapshot ?? null };
  });

  ipcMain.handle('projectTracking:reviewEvent', async (_event, eventId: string, quality: Extract<ProjectEventQuality, 'accepted' | 'rejected'>) => {
    if (!eventId) return { ok: false, error: 'eventId is required' };
    if (quality !== 'accepted' && quality !== 'rejected') return { ok: false, error: 'quality must be accepted or rejected' };
    const event = await ProjectEventRepo.review(eventId, { quality, reviewedBy: 'user' });
    const snapshot = event ? await ProjectSnapshotRepo.recomputeFromEvents(event.projectId) : null;
    return { event: event ?? null, ok: !!event, snapshot: snapshot ?? null };
  });

  ipcMain.handle('projectTracking:listAuditLogs', async (_event, projectId: string, limit?: number) => {
    if (!projectId) return [];
    return ProjectAuditLogRepo.listByProject(projectId, limit ?? 100);
  });

  ipcMain.handle('projectTracking:listReminderSuggestions', async (_event, projectId: string) => {
    if (!projectId) return [];
    return listProjectReminderSuggestions(projectId);
  });

  ipcMain.handle('projectTracking:listReminderLinks', async (_event, projectId: string, limit?: number) => {
    if (!projectId) return [];
    return ProjectReminderLinkRepo.listByProject(projectId, limit ?? 100);
  });

  ipcMain.handle('projectTracking:createReminderFromSuggestion', async (_event, projectId: string, suggestion: ProjectReminderSuggestion) => {
    if (!projectId || !suggestion) return { ok: false, error: 'projectId and suggestion are required' };
    return createProjectReminderFromSuggestion(projectId, suggestion);
  });

  ipcMain.handle('projectTracking:cancelReminder', async (_event, linkId: string) => {
    if (!linkId) return { ok: false, error: 'linkId is required' };
    return cancelProjectReminder(linkId);
  });

  ipcMain.handle('projectTracking:updateReminder', async (_event, linkId: string, patch?: Parameters<typeof updateProjectReminder>[1]) => {
    if (!linkId) return { ok: false, error: 'linkId is required' };
    return updateProjectReminder(linkId, patch || {});
  });

  ipcMain.handle('projectTracking:resyncReminder', async (_event, linkId: string) => {
    if (!linkId) return { ok: false, error: 'linkId is required' };
    return resyncProjectReminder(linkId);
  });

  ipcMain.handle('projectTracking:markReminderDone', async (_event, linkId: string) => {
    if (!linkId) return { ok: false, error: 'linkId is required' };
    return markProjectReminderDone(linkId);
  });

  ipcMain.handle('projectTracking:completeProject', async (_event, projectId: string, input?: { summary?: string | null; retrospective?: string | null }) => {
    if (!projectId) return { ok: false, error: 'projectId is required' };
    const project = await ProjectRepo.get(projectId);
    if (!project) return { ok: false, error: 'project not found' };
    const [events, milestones, snapshot] = await Promise.all([
      ProjectEventRepo.listByProject(projectId, { limit: 500 }),
      ProjectMilestoneRepo.listByProject(projectId, 500),
      ProjectSnapshotRepo.get(projectId)
    ]);
    const summary = input?.summary ?? generateProjectCompletionSummary({ events, milestones, project, snapshot });
    const completed = await ProjectRepo.markCompleted(projectId, summary, input?.retrospective ?? summary);
    await ProjectAuditLogRepo.create({
      action: 'project_completed',
      actor: 'user',
      after: completed,
      before: project,
      projectId,
      targetId: projectId,
      targetType: 'project',
      workspaceId: project.workspaceId
    });
    return { ok: !!completed, project: completed ?? null, snapshot: completed ? ((await ProjectSnapshotRepo.get(projectId)) ?? null) : null };
  });

  ipcMain.handle('projectTracking:reopenProject', async (_event, projectId: string) => {
    if (!projectId) return { ok: false, error: 'projectId is required' };
    const project = await ProjectRepo.reopen(projectId);
    if (project) {
      await ProjectAuditLogRepo.create({
        action: 'project_reopened',
        actor: 'user',
        projectId,
        targetId: projectId,
        targetType: 'project',
        workspaceId: project.workspaceId
      });
    }
    return { ok: !!project, project: project ?? null, snapshot: project ? ((await ProjectSnapshotRepo.get(projectId)) ?? null) : null };
  });

  ipcMain.handle('projectTracking:generateCompletionSummary', async (_event, projectId: string) => {
    const project = await ProjectRepo.get(projectId);
    if (!project) return { ok: false, error: 'project not found' };
    const [events, milestones, snapshot] = await Promise.all([
      ProjectEventRepo.listByProject(projectId, { limit: 500 }),
      ProjectMilestoneRepo.listByProject(projectId, 500),
      ProjectSnapshotRepo.get(projectId)
    ]);
    return { ok: true, summary: generateProjectCompletionSummary({ events, milestones, project, snapshot }) };
  });

  ipcMain.handle('projectTracking:promoteRetrospectiveToMemory', async (_event, projectId: string, input?: { retrospective?: string | null; summary?: string | null }) => {
    let project = await ProjectRepo.get(projectId);
    if (!project) return { ok: false, error: 'project not found' };
    if (!project.privacySettings.allowLongTermMemoryPromotion) return { ok: false, error: 'long-term memory promotion is disabled for this project' };
    if (input?.summary !== undefined || input?.retrospective !== undefined) {
      project =
        (await ProjectRepo.updateCompletion(projectId, {
          completionSummary: input.summary === undefined ? project.completionSummary : input.summary,
          retrospective: input.retrospective === undefined ? project.retrospective : input.retrospective
        })) ?? project;
    }
    const workspace = await WorkspacesRepo.getById(project.workspaceId);
    if (!workspace?.rootPath) return { ok: false, error: 'workspace root path not found' };
    const now = Date.now();
    const date = new Date(now).toISOString().slice(0, 10);
    const topic = '项目复盘';
    const noteId = generateNoteId(date, `project-${project.name}`.slice(0, 32));
    const content = project.retrospective || project.completionSummary || project.summary || project.goal;
    const filePath = buildNotePath(date, `project-${project.name}`.replace(/[^a-zA-Z0-9\u4e00-\u9fff]+/g, '-').slice(0, 32));
    const merged: MergedNote = {
      action: 'create',
      filePath,
      frontmatter: {
        createdAt: now,
        date,
        id: noteId,
        importance: 0.78,
        keywords: ['项目', project.name, '复盘'],
        sourceConversationIds: [],
        stability: 0.85,
        summary: `项目复盘：${project.name}`,
        topics: [topic],
        updatedAt: now,
        version: 1,
        workspaceId: project.workspaceId
      },
      noteId,
      sections: new Map([['Key Points', content]])
    };
    await writeMemory(merged, { workspaceRoot: workspace.rootPath }, buildWriteDbOps());
    const updated = await ProjectRepo.updateCompletion(projectId, {
      memoryPromotionStatus: 'promoted',
      promotedMemoryNoteId: noteId
    });
    await ProjectLinkRepo.upsert({
      createdBy: 'system',
      projectId,
      relationType: 'decision_record',
      targetId: noteId,
      targetType: 'memory_note',
      workspaceId: project.workspaceId
    });
    await ProjectAuditLogRepo.create({
      action: 'project_memory_promoted',
      actor: 'user',
      after: { contentPreview: content.slice(0, 500), noteId },
      projectId,
      targetId: noteId,
      targetType: 'memory_note',
      workspaceId: project.workspaceId
    });
    return { noteId, ok: true, project: updated ?? null };
  });

  ipcMain.handle('projectTracking:rebuildSnapshot', async (_event, projectId: string) => {
    if (!projectId) return { ok: false, error: 'projectId is required' };
    const snapshot = await ProjectSnapshotRepo.recomputeFromEvents(projectId);
    return { ok: !!snapshot, snapshot: snapshot ?? null };
  });

  ipcMain.handle('projectTracking:listMilestones', async (_event, params?: { limit?: number; projectId?: string }) => {
    if (!params?.projectId) return [];
    return ProjectMilestoneRepo.listByProject(params.projectId, params.limit);
  });

  ipcMain.handle('projectTracking:addMilestone', async (_event, params?: Parameters<typeof ProjectMilestoneRepo.create>[0]) => {
    const workspaceId = await resolveWorkspaceId(params?.workspaceId);
    if (!params?.projectId || !workspaceId || !params.title) return { ok: false, error: 'projectId, workspaceId and title are required' };
    const milestone = await ProjectMilestoneRepo.create({ ...params, workspaceId });
    return { milestone, ok: true };
  });

  ipcMain.handle('projectTracking:updateMilestone', async (_event, milestoneId: string, patch: any) => {
    if (!milestoneId) return { ok: false, error: 'milestoneId is required' };
    const milestone = await ProjectMilestoneRepo.update(milestoneId, patch || {});
    return { milestone: milestone ?? null, ok: !!milestone };
  });
}

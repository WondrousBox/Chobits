import { ipcMain } from 'electron';

import type { CreateProjectInput, ProjectCandidateStatus, ProjectStatus } from '../../../../packages/ai/services/project-tracking-types';
import { ProjectCandidateRepo, ProjectEventRepo, ProjectLinkRepo, ProjectMilestoneRepo, ProjectRepo, ProjectSnapshotRepo } from '../../db/project-tracking-repositories';
import { WorkspacesRepo } from '../../db/repositories';
import { initProjectTrackingEnricher } from './enricher';
import { getProjectTrackingConfig, setProjectTrackingConfig } from './project-tracking-config';
import { initProjectTrackingWorker } from './worker';

async function resolveWorkspaceId(workspaceId?: string): Promise<string | undefined> {
  if (workspaceId) return workspaceId;
  return (await WorkspacesRepo.getDefault())?.id;
}

export function initProjectTrackingHandlers(): void {
  initProjectTrackingEnricher();
  initProjectTrackingWorker();

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
        limit?: number;
        offset?: number;
        status?: ProjectStatus[];
        workspaceId?: string;
      }
    ) => {
      const workspaceId = await resolveWorkspaceId(params?.workspaceId);
      if (!workspaceId) return [];
      return ProjectRepo.list(workspaceId, {
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

  ipcMain.handle('projectTracking:listEvents', async (_event, params?: { limit?: number; projectId?: string; status?: any[]; type?: any[] }) => {
    if (!params?.projectId) return [];
    return ProjectEventRepo.listByProject(params.projectId, {
      limit: params.limit,
      status: params.status,
      type: params.type
    });
  });

  ipcMain.handle('projectTracking:addEvent', async (_event, params?: Parameters<typeof ProjectEventRepo.create>[0]) => {
    const workspaceId = await resolveWorkspaceId(params?.workspaceId);
    if (!params?.projectId || !workspaceId || !params.title || !params.content || !params.type) return { ok: false, error: 'projectId, workspaceId, type, title and content are required' };
    const event = await ProjectEventRepo.create({ ...params, workspaceId });
    const snapshot = await ProjectSnapshotRepo.recomputeFromEvents(event.projectId);
    return { event, ok: true, snapshot: snapshot ?? null };
  });

  ipcMain.handle('projectTracking:updateEvent', async (_event, eventId: string, patch: any) => {
    if (!eventId) return { ok: false, error: 'eventId is required' };
    const event = await ProjectEventRepo.update(eventId, patch || {});
    const snapshot = event ? await ProjectSnapshotRepo.recomputeFromEvents(event.projectId) : null;
    return { event: event ?? null, ok: !!event, snapshot: snapshot ?? null };
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

import { randomUUID } from 'node:crypto';

import { and, desc, eq, inArray, isNull, like, or } from 'drizzle-orm';

import {
  createEmptyProjectSnapshot,
  getDefaultProjectEventQuality,
  isHighRiskProjectEventType,
  normalizeProjectPrivacySettings,
  reduceProjectSnapshotFromEvents
} from '../../../packages/ai/services/project-tracking-service';
import type {
  CreateProjectInput,
  ExportedProjectData,
  ProjectAuditActor,
  ProjectAuditLog,
  ProjectCandidate,
  ProjectCandidateStatus,
  ProjectEvent,
  ProjectEventQuality,
  ProjectEventReviewedBy,
  ProjectEventStatus,
  ProjectEventType,
  ProjectImpactPreview,
  ProjectLink,
  ProjectLinkRelationType,
  ProjectLinkTargetType,
  ProjectMilestone,
  ProjectMilestoneStatus,
  ProjectOrphanReport,
  ProjectReminderKind,
  ProjectReminderLink,
  ProjectReminderSyncStatus,
  ProjectSnapshot,
  ProjectStatus,
  TrackedProject
} from '../../../packages/ai/services/project-tracking-types';
import { getOrm } from '.';
import {
  type NewProjectAuditLog,
  type NewProjectCandidate,
  type NewProjectEvent,
  type NewProjectLink,
  type NewProjectMilestone,
  type NewProjectReminderLink,
  type NewProjectSnapshot,
  type NewTrackedProject,
  project_audit_logs,
  project_candidates,
  project_events,
  project_links,
  project_milestones,
  project_reminder_links,
  project_snapshots,
  type ProjectAuditLogRow,
  type ProjectCandidateRow,
  type ProjectEventRow,
  type ProjectLinkRow,
  type ProjectMilestoneRow,
  type ProjectReminderLinkRow,
  type ProjectSnapshotRow,
  tracked_projects,
  type TrackedProjectRow
} from './schema';

function stringify(value: unknown): string {
  return JSON.stringify(value ?? []);
}

function parseArray<T = unknown>(value: string | null | undefined): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseStringArray(value: string | null | undefined): string[] {
  return parseArray(value).filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function parseJsonObject<T extends Record<string, unknown>>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? ({ ...fallback, ...parsed } as T) : fallback;
  } catch {
    return fallback;
  }
}

function rowToProject(row: TrackedProjectRow): TrackedProject {
  return {
    aliases: parseStringArray(row.aliases),
    archivedAt: row.archivedAt ?? null,
    completedAt: row.completedAt ?? null,
    completionSummary: row.completionSummary ?? null,
    confidence: row.confidence ?? 1,
    createdAt: row.createdAt ?? 0,
    createdBy: row.createdBy,
    deletedAt: row.deletedAt ?? null,
    domains: parseStringArray(row.domains),
    goal: row.goal,
    id: row.id,
    memoryPromotionStatus: row.memoryPromotionStatus,
    mergedIntoProjectId: row.mergedIntoProjectId ?? null,
    metadata: row.metadata,
    name: row.name,
    ownerUserId: row.ownerUserId,
    privacySettings: normalizeProjectPrivacySettings(parseJsonObject(row.privacySettings, {})),
    promotedMemoryNoteId: row.promotedMemoryNoteId ?? null,
    retrospective: row.retrospective ?? null,
    scope: row.scope,
    splitFromProjectId: row.splitFromProjectId ?? null,
    startedAt: row.startedAt ?? null,
    status: row.status,
    stakeholders: parseArray(row.stakeholders),
    summary: row.summary ?? '',
    tags: parseStringArray(row.tags),
    targetEndAt: row.targetEndAt ?? null,
    updatedAt: row.updatedAt ?? row.createdAt ?? 0,
    workspaceId: row.workspaceId
  };
}

function rowToCandidate(row: ProjectCandidateRow): ProjectCandidate {
  return {
    confirmedProjectId: row.confirmedProjectId,
    conversationId: row.conversationId,
    createdAt: row.createdAt ?? 0,
    evidenceMessageIds: parseStringArray(row.evidenceMessageIds),
    evidenceSummary: row.evidenceSummary ?? '',
    expiresAt: row.expiresAt,
    id: row.id,
    proposedGoal: row.proposedGoal,
    proposedName: row.proposedName,
    reasons: parseStringArray(row.reasons) as ProjectCandidate['reasons'],
    seqEnd: row.seqEnd,
    seqStart: row.seqStart,
    signalScore: row.signalScore ?? 0,
    status: row.status,
    suggestedMilestones: parseArray(row.suggestedMilestones),
    suggestedReminders: parseArray(row.suggestedReminders),
    updatedAt: row.updatedAt ?? row.createdAt ?? 0,
    workspaceId: row.workspaceId
  };
}

function rowToSnapshot(row: ProjectSnapshotRow): ProjectSnapshot {
  return {
    agreements: parseStringArray(row.agreements),
    blockers: parseStringArray(row.blockers),
    changes: parseStringArray(row.changes),
    completedMilestones: parseStringArray(row.completedMilestones),
    currentFocus: row.currentFocus ?? undefined,
    decisions: parseStringArray(row.decisions),
    goal: row.goal,
    nextSuggestedAction: row.nextSuggestedAction ?? undefined,
    openTasks: parseArray(row.openTasks),
    projectId: row.projectId,
    recentProgress: parseStringArray(row.recentProgress),
    risks: parseStringArray(row.risks),
    status: row.status,
    summary: row.summary ?? '',
    upcomingDates: parseArray(row.upcomingDates),
    updatedAt: row.updatedAt ?? 0,
    version: row.version ?? 1,
    workspaceId: row.workspaceId
  };
}

function rowToLink(row: ProjectLinkRow): ProjectLink {
  return {
    confidence: row.confidence ?? 1,
    createdAt: row.createdAt ?? 0,
    createdBy: row.createdBy,
    id: row.id,
    projectId: row.projectId,
    relationType: row.relationType,
    strength: row.strength ?? 1,
    targetId: row.targetId,
    targetType: row.targetType,
    workspaceId: row.workspaceId
  };
}

function rowToEvent(row: ProjectEventRow): ProjectEvent {
  return {
    confidence: row.confidence ?? 0.5,
    content: row.content,
    createdAt: row.createdAt ?? 0,
    dueAt: row.dueAt ?? null,
    eventTime: row.eventTime ?? null,
    id: row.id,
    importance: row.importance ?? 0.5,
    metadata: row.metadata,
    needsUserConfirmation: Boolean(row.needsUserConfirmation),
    projectId: row.projectId,
    quality: row.quality,
    relatedEventIds: parseStringArray(row.relatedEventIds),
    reviewedAt: row.reviewedAt ?? null,
    reviewedBy: row.reviewedBy ?? null,
    sourceConversationId: row.sourceConversationId,
    sourceMemoryNoteIds: parseStringArray(row.sourceMemoryNoteIds),
    sourceRouteEventIds: parseStringArray(row.sourceRouteEventIds),
    sourceSeqEnd: row.sourceSeqEnd ?? null,
    sourceSeqStart: row.sourceSeqStart ?? null,
    status: row.status,
    supersedesEventIds: parseStringArray(row.supersedesEventIds),
    title: row.title,
    type: row.type,
    updatedAt: row.updatedAt ?? row.createdAt ?? 0,
    workspaceId: row.workspaceId
  };
}

function rowToMilestone(row: ProjectMilestoneRow): ProjectMilestone {
  return {
    completedAt: row.completedAt ?? null,
    createdAt: row.createdAt ?? 0,
    description: row.description,
    evidenceEventIds: parseStringArray(row.evidenceEventIds),
    id: row.id,
    projectId: row.projectId,
    status: row.status,
    targetAt: row.targetAt ?? null,
    title: row.title,
    updatedAt: row.updatedAt ?? row.createdAt ?? 0,
    workspaceId: row.workspaceId
  };
}

function rowToReminderLink(row: ProjectReminderLinkRow): ProjectReminderLink {
  return {
    createdAt: row.createdAt ?? 0,
    dueAt: row.dueAt ?? null,
    id: row.id,
    kind: row.kind,
    lastSyncedAt: row.lastSyncedAt ?? null,
    metadata: row.metadata,
    projectEventId: row.projectEventId,
    projectId: row.projectId,
    reason: row.reason,
    schedulerTaskId: row.schedulerTaskId,
    status: row.status,
    syncStatus: row.syncStatus,
    title: row.title,
    workspaceId: row.workspaceId
  };
}

function rowToAuditLog(row: ProjectAuditLogRow): ProjectAuditLog {
  return {
    action: row.action,
    actor: row.actor,
    after: row.after,
    before: row.before,
    createdAt: row.createdAt ?? 0,
    id: row.id,
    metadata: row.metadata,
    projectId: row.projectId,
    reason: row.reason,
    targetId: row.targetId,
    targetType: row.targetType,
    workspaceId: row.workspaceId
  };
}

function projectToInsert(input: CreateProjectInput & { id?: string; now?: number }): NewTrackedProject {
  const now = input.now ?? Date.now();
  return {
    aliases: stringify(input.aliases),
    archivedAt: input.status === 'archived' ? now : null,
    completedAt: input.status === 'completed' ? now : null,
    completionSummary: null,
    confidence: 1,
    createdAt: now,
    createdBy: input.createdBy ?? 'user',
    domains: stringify(input.domains),
    goal: input.goal,
    id: input.id ?? randomUUID(),
    deletedAt: null,
    memoryPromotionStatus: 'none',
    mergedIntoProjectId: null,
    metadata: null,
    name: input.name,
    ownerUserId: null,
    privacySettings: JSON.stringify(normalizeProjectPrivacySettings()),
    promotedMemoryNoteId: null,
    retrospective: null,
    scope: input.scope ?? null,
    splitFromProjectId: null,
    startedAt: now,
    status: input.status ?? 'active',
    stakeholders: stringify([]),
    summary: input.summary ?? input.goal,
    tags: stringify(input.tags),
    targetEndAt: null,
    updatedAt: now,
    workspaceId: input.workspaceId
  };
}

function snapshotToInsert(snapshot: ProjectSnapshot): NewProjectSnapshot {
  return {
    agreements: stringify(snapshot.agreements),
    blockers: stringify(snapshot.blockers),
    changes: stringify(snapshot.changes),
    completedMilestones: stringify(snapshot.completedMilestones),
    createdAt: snapshot.updatedAt,
    currentFocus: snapshot.currentFocus ?? null,
    decisions: stringify(snapshot.decisions),
    goal: snapshot.goal,
    metadata: null,
    nextSuggestedAction: snapshot.nextSuggestedAction ?? null,
    openTasks: stringify(snapshot.openTasks),
    projectId: snapshot.projectId,
    recentProgress: stringify(snapshot.recentProgress),
    risks: stringify(snapshot.risks),
    status: snapshot.status,
    summary: snapshot.summary,
    upcomingDates: stringify(snapshot.upcomingDates),
    updatedAt: snapshot.updatedAt,
    version: snapshot.version,
    workspaceId: snapshot.workspaceId
  };
}

export const ProjectSnapshotRepo = {
  async get(projectId: string): Promise<ProjectSnapshot | undefined> {
    const db = getOrm();
    const rows = await db.select().from(project_snapshots).where(eq(project_snapshots.projectId, projectId)).limit(1);
    return rows[0] ? rowToSnapshot(rows[0]) : undefined;
  },

  async listByWorkspace(workspaceId: string, options: { limit?: number; status?: ProjectStatus[] } = {}): Promise<ProjectSnapshot[]> {
    const db = getOrm();
    const wheres: any[] = [eq(project_snapshots.workspaceId, workspaceId)];
    if (options.status?.length) wheres.push(inArray(project_snapshots.status, options.status as any));
    const rows = await db
      .select()
      .from(project_snapshots)
      .where(and(...wheres))
      .orderBy(desc(project_snapshots.updatedAt))
      .limit(options.limit ?? 50);
    return rows.map(rowToSnapshot);
  },

  async upsert(snapshot: ProjectSnapshot): Promise<ProjectSnapshot> {
    const db = getOrm();
    const insert = snapshotToInsert(snapshot);
    const rows = await db
      .insert(project_snapshots)
      .values(insert as any)
      .onConflictDoUpdate({
        target: project_snapshots.projectId,
        set: {
          agreements: insert.agreements,
          blockers: insert.blockers,
          changes: insert.changes,
          completedMilestones: insert.completedMilestones,
          currentFocus: insert.currentFocus,
          decisions: insert.decisions,
          goal: insert.goal,
          nextSuggestedAction: insert.nextSuggestedAction,
          openTasks: insert.openTasks,
          recentProgress: insert.recentProgress,
          risks: insert.risks,
          status: insert.status,
          summary: insert.summary,
          upcomingDates: insert.upcomingDates,
          updatedAt: insert.updatedAt,
          version: insert.version,
          workspaceId: insert.workspaceId
        } as any
      })
      .returning()
      .all();
    return rowToSnapshot(rows[0]);
  },

  async recomputeFromEvents(projectId: string): Promise<ProjectSnapshot | undefined> {
    const project = await ProjectRepo.get(projectId);
    if (!project) return undefined;
    const previous = await this.get(projectId);
    const events = await ProjectEventRepo.listByProject(projectId, { limit: 200 });
    const next = reduceProjectSnapshotFromEvents({
      events,
      goal: project.goal,
      previous,
      projectId,
      status: project.status,
      summary: project.summary,
      workspaceId: project.workspaceId
    });
    return this.upsert(next);
  }
};

export const ProjectRepo = {
  async create(input: CreateProjectInput): Promise<TrackedProject> {
    const db = getOrm();
    const insert = projectToInsert(input);
    const rows = await db
      .insert(tracked_projects)
      .values(insert as any)
      .returning()
      .all();
    const project = rowToProject(rows[0]);
    await ProjectSnapshotRepo.upsert(
      createEmptyProjectSnapshot({
        goal: project.goal,
        now: project.updatedAt,
        projectId: project.id,
        status: project.status,
        summary: project.summary,
        workspaceId: project.workspaceId
      })
    );
    return project;
  },

  async get(id: string): Promise<TrackedProject | undefined> {
    const db = getOrm();
    const rows = await db.select().from(tracked_projects).where(eq(tracked_projects.id, id)).limit(1);
    return rows[0] ? rowToProject(rows[0]) : undefined;
  },

  async list(workspaceId: string, options: { includeDeleted?: boolean; limit?: number; offset?: number; status?: ProjectStatus[] } = {}): Promise<TrackedProject[]> {
    const db = getOrm();
    const wheres: any[] = [eq(tracked_projects.workspaceId, workspaceId)];
    if (!options.includeDeleted) wheres.push(isNull(tracked_projects.deletedAt));
    if (options.status?.length) wheres.push(inArray(tracked_projects.status, options.status as any));
    const rows = await db
      .select()
      .from(tracked_projects)
      .where(and(...wheres))
      .orderBy(desc(tracked_projects.updatedAt))
      .limit(options.limit ?? 50)
      .offset(options.offset ?? 0);
    return rows.map(rowToProject);
  },

  async search(workspaceId: string, query: string, limit = 20, options: { includeDeleted?: boolean } = {}): Promise<TrackedProject[]> {
    const db = getOrm();
    const likeQuery = `%${query.trim()}%`;
    const wheres: any[] = [
      eq(tracked_projects.workspaceId, workspaceId),
      or(like(tracked_projects.name, likeQuery), like(tracked_projects.goal, likeQuery), like(tracked_projects.summary, likeQuery), like(tracked_projects.aliases, likeQuery))
    ];
    if (!options.includeDeleted) wheres.push(isNull(tracked_projects.deletedAt));
    const rows = await db
      .select()
      .from(tracked_projects)
      .where(and(...wheres))
      .orderBy(desc(tracked_projects.updatedAt))
      .limit(limit);
    return rows.map(rowToProject);
  },

  async update(id: string, patch: Partial<CreateProjectInput> & { status?: ProjectStatus }): Promise<TrackedProject | undefined> {
    const current = await this.get(id);
    if (!current) return undefined;
    const now = Date.now();
    const values: Record<string, unknown> = { updatedAt: now };
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.goal !== undefined) values.goal = patch.goal;
    if (patch.summary !== undefined) values.summary = patch.summary;
    if (patch.scope !== undefined) values.scope = patch.scope;
    if (patch.status !== undefined) {
      values.status = patch.status;
      if (patch.status === 'archived') values.archivedAt = now;
      if (patch.status === 'completed') values.completedAt = now;
    }
    if (patch.aliases !== undefined) values.aliases = stringify(patch.aliases);
    if (patch.domains !== undefined) values.domains = stringify(patch.domains);
    if (patch.tags !== undefined) values.tags = stringify(patch.tags);

    const db = getOrm();
    await db
      .update(tracked_projects)
      .set(values as any)
      .where(eq(tracked_projects.id, id))
      .run();
    const updated = await this.get(id);
    if (updated) {
      const snapshot =
        (await ProjectSnapshotRepo.get(id)) ??
        createEmptyProjectSnapshot({
          goal: updated.goal,
          now,
          projectId: updated.id,
          status: updated.status,
          summary: updated.summary,
          workspaceId: updated.workspaceId
        });
      await ProjectSnapshotRepo.upsert({
        ...snapshot,
        goal: updated.goal,
        status: updated.status,
        summary: updated.summary,
        updatedAt: now,
        version: snapshot.version + 1
      });
    }
    return updated;
  },

  async archive(id: string): Promise<TrackedProject | undefined> {
    return this.update(id, { status: 'archived' });
  },

  async updatePrivacySettings(id: string, patch: Partial<TrackedProject['privacySettings']>): Promise<TrackedProject | undefined> {
    const current = await this.get(id);
    if (!current) return undefined;
    const next = normalizeProjectPrivacySettings({ ...current.privacySettings, ...patch });
    const db = getOrm();
    await db
      .update(tracked_projects)
      .set({ privacySettings: JSON.stringify(next), updatedAt: Date.now() } as any)
      .where(eq(tracked_projects.id, id))
      .run();
    return this.get(id);
  },

  async softDelete(id: string): Promise<TrackedProject | undefined> {
    const now = Date.now();
    const db = getOrm();
    await db
      .update(tracked_projects)
      .set({ deletedAt: now, status: 'archived', updatedAt: now } as any)
      .where(eq(tracked_projects.id, id))
      .run();
    return this.get(id);
  },

  async restore(id: string): Promise<TrackedProject | undefined> {
    const db = getOrm();
    await db
      .update(tracked_projects)
      .set({ deletedAt: null, status: 'active', updatedAt: Date.now() } as any)
      .where(eq(tracked_projects.id, id))
      .run();
    return this.get(id);
  },

  async hardDelete(id: string): Promise<number> {
    const db = getOrm();
    const result = await db.delete(tracked_projects).where(eq(tracked_projects.id, id)).run();
    return result.changes ?? 0;
  },

  async markCompleted(id: string, summary?: string | null, retrospective?: string | null): Promise<TrackedProject | undefined> {
    const now = Date.now();
    const db = getOrm();
    await db
      .update(tracked_projects)
      .set({
        completedAt: now,
        completionSummary: summary ?? null,
        retrospective: retrospective ?? null,
        status: 'completed',
        updatedAt: now
      } as any)
      .where(eq(tracked_projects.id, id))
      .run();
    const project = await this.get(id);
    if (project) await ProjectSnapshotRepo.recomputeFromEvents(project.id);
    return project;
  },

  async reopen(id: string): Promise<TrackedProject | undefined> {
    const db = getOrm();
    await db
      .update(tracked_projects)
      .set({ completedAt: null, status: 'active', updatedAt: Date.now() } as any)
      .where(eq(tracked_projects.id, id))
      .run();
    const project = await this.get(id);
    if (project) await ProjectSnapshotRepo.recomputeFromEvents(project.id);
    return project;
  },

  async updateCompletion(
    id: string,
    patch: { completionSummary?: string | null; memoryPromotionStatus?: TrackedProject['memoryPromotionStatus']; promotedMemoryNoteId?: string | null; retrospective?: string | null }
  ): Promise<TrackedProject | undefined> {
    const values: Record<string, unknown> = { updatedAt: Date.now() };
    if (patch.completionSummary !== undefined) values.completionSummary = patch.completionSummary;
    if (patch.retrospective !== undefined) values.retrospective = patch.retrospective;
    if (patch.memoryPromotionStatus !== undefined) values.memoryPromotionStatus = patch.memoryPromotionStatus;
    if (patch.promotedMemoryNoteId !== undefined) values.promotedMemoryNoteId = patch.promotedMemoryNoteId;
    const db = getOrm();
    await db
      .update(tracked_projects)
      .set(values as any)
      .where(eq(tracked_projects.id, id))
      .run();
    return this.get(id);
  },

  async markMerged(sourceProjectId: string, targetProjectId: string): Promise<TrackedProject | undefined> {
    const now = Date.now();
    const db = getOrm();
    await db
      .update(tracked_projects)
      .set({ archivedAt: now, mergedIntoProjectId: targetProjectId, status: 'archived', updatedAt: now } as any)
      .where(eq(tracked_projects.id, sourceProjectId))
      .run();
    return this.get(sourceProjectId);
  },

  async markSplitFrom(projectId: string, sourceProjectId: string): Promise<TrackedProject | undefined> {
    const db = getOrm();
    await db
      .update(tracked_projects)
      .set({ splitFromProjectId: sourceProjectId, updatedAt: Date.now() } as any)
      .where(eq(tracked_projects.id, projectId))
      .run();
    return this.get(projectId);
  }
};

export const ProjectLinkRepo = {
  async upsert(input: {
    confidence?: number;
    createdBy?: 'user' | 'agent' | 'system';
    projectId: string;
    relationType: ProjectLinkRelationType;
    strength?: number;
    targetId: string;
    targetType: ProjectLinkTargetType;
    workspaceId: string;
  }): Promise<ProjectLink> {
    const db = getOrm();
    const now = Date.now();
    const insert: NewProjectLink = {
      confidence: input.confidence ?? 1,
      createdAt: now,
      createdBy: input.createdBy ?? 'system',
      id: randomUUID(),
      projectId: input.projectId,
      relationType: input.relationType,
      strength: input.strength ?? 1,
      targetId: input.targetId,
      targetType: input.targetType,
      workspaceId: input.workspaceId
    };
    const rows = await db
      .insert(project_links)
      .values(insert as any)
      .onConflictDoUpdate({
        target: [project_links.projectId, project_links.targetType, project_links.targetId, project_links.relationType],
        set: {
          confidence: insert.confidence,
          createdBy: insert.createdBy,
          strength: insert.strength
        } as any
      })
      .returning()
      .all();
    return rowToLink(rows[0]);
  },

  async listByProject(projectId: string, limit = 100): Promise<ProjectLink[]> {
    const db = getOrm();
    const rows = await db.select().from(project_links).where(eq(project_links.projectId, projectId)).orderBy(desc(project_links.createdAt)).limit(limit);
    return rows.map(rowToLink);
  },

  async listByTarget(input: { targetId: string; targetType: ProjectLinkTargetType; workspaceId?: string; limit?: number }): Promise<ProjectLink[]> {
    const db = getOrm();
    const wheres: any[] = [eq(project_links.targetType, input.targetType), eq(project_links.targetId, input.targetId)];
    if (input.workspaceId) wheres.push(eq(project_links.workspaceId, input.workspaceId));
    const rows = await db
      .select()
      .from(project_links)
      .where(and(...wheres))
      .orderBy(desc(project_links.strength), desc(project_links.confidence), desc(project_links.createdAt))
      .limit(input.limit ?? 10);
    return rows.map(rowToLink);
  },

  async remove(input: { projectId?: string; relationType?: ProjectLinkRelationType; targetId: string; targetType: ProjectLinkTargetType; workspaceId?: string }): Promise<number> {
    const db = getOrm();
    const wheres: any[] = [eq(project_links.targetType, input.targetType), eq(project_links.targetId, input.targetId)];
    if (input.workspaceId) wheres.push(eq(project_links.workspaceId, input.workspaceId));
    if (input.projectId) wheres.push(eq(project_links.projectId, input.projectId));
    if (input.relationType) wheres.push(eq(project_links.relationType, input.relationType));
    const result = await db
      .delete(project_links)
      .where(and(...wheres))
      .run();
    return result.changes ?? 0;
  },

  async moveProjectLinks(sourceProjectId: string, targetProjectId: string): Promise<number> {
    const db = getOrm();
    const rows = await db.select().from(project_links).where(eq(project_links.projectId, sourceProjectId));
    for (const row of rows) {
      await this.upsert({
        confidence: row.confidence ?? 1,
        createdBy: row.createdBy,
        projectId: targetProjectId,
        relationType: row.relationType,
        strength: row.strength ?? 1,
        targetId: row.targetId,
        targetType: row.targetType,
        workspaceId: row.workspaceId
      });
    }
    await db.delete(project_links).where(eq(project_links.projectId, sourceProjectId)).run();
    return rows.length;
  }
};

export const ProjectCandidateRepo = {
  async create(input: Omit<ProjectCandidate, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: number; updatedAt?: number }): Promise<ProjectCandidate> {
    const db = getOrm();
    const now = Date.now();
    const insert: NewProjectCandidate = {
      confirmedProjectId: input.confirmedProjectId ?? null,
      conversationId: input.conversationId,
      createdAt: input.createdAt ?? now,
      evidenceMessageIds: stringify(input.evidenceMessageIds),
      evidenceSummary: input.evidenceSummary,
      expiresAt: input.expiresAt,
      id: input.id ?? randomUUID(),
      proposedGoal: input.proposedGoal,
      proposedName: input.proposedName,
      reasons: stringify(input.reasons),
      seqEnd: input.seqEnd,
      seqStart: input.seqStart,
      signalScore: input.signalScore,
      status: input.status,
      suggestedMilestones: stringify(input.suggestedMilestones),
      suggestedReminders: stringify(input.suggestedReminders),
      updatedAt: input.updatedAt ?? now,
      workspaceId: input.workspaceId
    };
    const rows = await db
      .insert(project_candidates)
      .values(insert as any)
      .returning()
      .all();
    return rowToCandidate(rows[0]);
  },

  async get(id: string): Promise<ProjectCandidate | undefined> {
    const db = getOrm();
    const rows = await db.select().from(project_candidates).where(eq(project_candidates.id, id)).limit(1);
    return rows[0] ? rowToCandidate(rows[0]) : undefined;
  },

  async list(workspaceId: string, options: { conversationId?: string; limit?: number; offset?: number; status?: ProjectCandidateStatus[] } = {}): Promise<ProjectCandidate[]> {
    const db = getOrm();
    const wheres: any[] = [eq(project_candidates.workspaceId, workspaceId)];
    if (options.conversationId) wheres.push(eq(project_candidates.conversationId, options.conversationId));
    if (options.status?.length) wheres.push(inArray(project_candidates.status, options.status as any));
    const rows = await db
      .select()
      .from(project_candidates)
      .where(and(...wheres))
      .orderBy(desc(project_candidates.signalScore), desc(project_candidates.createdAt))
      .limit(options.limit ?? 20)
      .offset(options.offset ?? 0);
    return rows.map(rowToCandidate);
  },

  async updateStatus(id: string, status: ProjectCandidateStatus, confirmedProjectId?: string | null): Promise<ProjectCandidate | undefined> {
    const db = getOrm();
    await db
      .update(project_candidates)
      .set({
        confirmedProjectId: confirmedProjectId ?? null,
        status,
        updatedAt: Date.now()
      } as any)
      .where(eq(project_candidates.id, id))
      .run();
    return this.get(id);
  }
};

export const ProjectEventRepo = {
  async create(input: {
    confidence?: number;
    content: string;
    dueAt?: number | null;
    eventTime?: number | null;
    importance?: number;
    metadata?: string | null;
    needsUserConfirmation?: boolean;
    projectId: string;
    quality?: ProjectEventQuality;
    relatedEventIds?: string[];
    reviewedAt?: number | null;
    reviewedBy?: ProjectEventReviewedBy | null;
    sourceConversationId?: string | null;
    sourceMemoryNoteIds?: string[];
    sourceRouteEventIds?: string[];
    sourceSeqEnd?: number | null;
    sourceSeqStart?: number | null;
    status?: ProjectEventStatus;
    supersedesEventIds?: string[];
    title: string;
    type: ProjectEventType;
    workspaceId: string;
  }): Promise<ProjectEvent> {
    const now = Date.now();
    const needsUserConfirmation = input.needsUserConfirmation ?? isHighRiskProjectEventType(input.type);
    const quality = input.quality ?? getDefaultProjectEventQuality({ createdBy: 'system', needsUserConfirmation, type: input.type });
    const insert: NewProjectEvent = {
      confidence: input.confidence ?? 0.7,
      content: input.content,
      createdAt: now,
      dueAt: input.dueAt ?? null,
      eventTime: input.eventTime ?? null,
      id: randomUUID(),
      importance: input.importance ?? 0.7,
      metadata: input.metadata ?? null,
      needsUserConfirmation,
      projectId: input.projectId,
      quality,
      relatedEventIds: stringify(input.relatedEventIds),
      reviewedAt: input.reviewedAt ?? null,
      reviewedBy: input.reviewedBy ?? null,
      sourceConversationId: input.sourceConversationId ?? null,
      sourceMemoryNoteIds: stringify(input.sourceMemoryNoteIds),
      sourceRouteEventIds: stringify(input.sourceRouteEventIds),
      sourceSeqEnd: input.sourceSeqEnd ?? null,
      sourceSeqStart: input.sourceSeqStart ?? null,
      status: input.status ?? 'active',
      supersedesEventIds: stringify(input.supersedesEventIds),
      title: input.title,
      type: input.type,
      updatedAt: now,
      workspaceId: input.workspaceId
    };
    const db = getOrm();
    const rows = await db
      .insert(project_events)
      .values(insert as any)
      .returning()
      .all();
    return rowToEvent(rows[0]);
  },

  async listByProject(projectId: string, options: { limit?: number; quality?: ProjectEventQuality[]; status?: ProjectEventStatus[]; type?: ProjectEventType[] } = {}): Promise<ProjectEvent[]> {
    const db = getOrm();
    const wheres: any[] = [eq(project_events.projectId, projectId)];
    if (options.quality?.length) wheres.push(inArray(project_events.quality, options.quality as any));
    if (options.status?.length) wheres.push(inArray(project_events.status, options.status as any));
    if (options.type?.length) wheres.push(inArray(project_events.type, options.type as any));
    const rows = await db
      .select()
      .from(project_events)
      .where(and(...wheres))
      .orderBy(desc(project_events.importance), desc(project_events.createdAt))
      .limit(options.limit ?? 100);
    return rows.map(rowToEvent);
  },

  async update(id: string, patch: Partial<ProjectEvent>): Promise<ProjectEvent | undefined> {
    const db = getOrm();
    const values: Record<string, unknown> = { updatedAt: Date.now() };
    if (patch.status) values.status = patch.status;
    if (patch.quality) values.quality = patch.quality;
    if (typeof patch.needsUserConfirmation === 'boolean') values.needsUserConfirmation = patch.needsUserConfirmation;
    if (patch.reviewedAt !== undefined) values.reviewedAt = patch.reviewedAt;
    if (patch.reviewedBy !== undefined) values.reviewedBy = patch.reviewedBy;
    if (patch.title) values.title = patch.title;
    if (patch.content) values.content = patch.content;
    if (typeof patch.importance === 'number') values.importance = patch.importance;
    if (typeof patch.confidence === 'number') values.confidence = patch.confidence;
    await db
      .update(project_events)
      .set(values as any)
      .where(eq(project_events.id, id))
      .run();
    const rows = await db.select().from(project_events).where(eq(project_events.id, id)).limit(1);
    return rows[0] ? rowToEvent(rows[0]) : undefined;
  },

  async review(id: string, input: { quality: Extract<ProjectEventQuality, 'accepted' | 'rejected'>; reviewedBy?: ProjectEventReviewedBy }): Promise<ProjectEvent | undefined> {
    return this.update(id, {
      needsUserConfirmation: false,
      quality: input.quality,
      reviewedAt: Date.now(),
      reviewedBy: input.reviewedBy ?? 'user'
    });
  },

  async moveEvents(eventIds: string[], targetProjectId: string): Promise<number> {
    if (!eventIds.length) return 0;
    const db = getOrm();
    const result = await db
      .update(project_events)
      .set({ projectId: targetProjectId, updatedAt: Date.now() } as any)
      .where(inArray(project_events.id, eventIds))
      .run();
    return result.changes ?? 0;
  },

  async moveAll(sourceProjectId: string, targetProjectId: string): Promise<number> {
    const db = getOrm();
    const result = await db
      .update(project_events)
      .set({ projectId: targetProjectId, updatedAt: Date.now() } as any)
      .where(eq(project_events.projectId, sourceProjectId))
      .run();
    return result.changes ?? 0;
  }
};

export const ProjectMilestoneRepo = {
  async create(input: {
    description?: string | null;
    evidenceEventIds?: string[];
    projectId: string;
    status?: ProjectMilestoneStatus;
    targetAt?: number | null;
    title: string;
    workspaceId: string;
  }): Promise<ProjectMilestone> {
    const now = Date.now();
    const insert: NewProjectMilestone = {
      completedAt: input.status === 'done' ? now : null,
      createdAt: now,
      description: input.description ?? null,
      evidenceEventIds: stringify(input.evidenceEventIds),
      id: randomUUID(),
      projectId: input.projectId,
      status: input.status ?? 'planned',
      targetAt: input.targetAt ?? null,
      title: input.title,
      updatedAt: now,
      workspaceId: input.workspaceId
    };
    const db = getOrm();
    const rows = await db
      .insert(project_milestones)
      .values(insert as any)
      .returning()
      .all();
    return rowToMilestone(rows[0]);
  },

  async listByProject(projectId: string, limit = 100): Promise<ProjectMilestone[]> {
    const db = getOrm();
    const rows = await db.select().from(project_milestones).where(eq(project_milestones.projectId, projectId)).orderBy(desc(project_milestones.createdAt)).limit(limit);
    return rows.map(rowToMilestone);
  },

  async update(id: string, patch: Partial<ProjectMilestone>): Promise<ProjectMilestone | undefined> {
    const db = getOrm();
    const values: Record<string, unknown> = { updatedAt: Date.now() };
    if (patch.status) {
      values.status = patch.status;
      if (patch.status === 'done') values.completedAt = Date.now();
    }
    if (patch.title) values.title = patch.title;
    if (patch.description !== undefined) values.description = patch.description;
    if (patch.targetAt !== undefined) values.targetAt = patch.targetAt;
    await db
      .update(project_milestones)
      .set(values as any)
      .where(eq(project_milestones.id, id))
      .run();
    const rows = await db.select().from(project_milestones).where(eq(project_milestones.id, id)).limit(1);
    return rows[0] ? rowToMilestone(rows[0]) : undefined;
  },

  async moveMilestones(milestoneIds: string[], targetProjectId: string): Promise<number> {
    if (!milestoneIds.length) return 0;
    const db = getOrm();
    const result = await db
      .update(project_milestones)
      .set({ projectId: targetProjectId, updatedAt: Date.now() } as any)
      .where(inArray(project_milestones.id, milestoneIds))
      .run();
    return result.changes ?? 0;
  },

  async moveAll(sourceProjectId: string, targetProjectId: string): Promise<number> {
    const db = getOrm();
    const result = await db
      .update(project_milestones)
      .set({ projectId: targetProjectId, updatedAt: Date.now() } as any)
      .where(eq(project_milestones.projectId, sourceProjectId))
      .run();
    return result.changes ?? 0;
  }
};

export const ProjectReminderLinkRepo = {
  async get(id: string): Promise<ProjectReminderLink | undefined> {
    const db = getOrm();
    const rows = await db.select().from(project_reminder_links).where(eq(project_reminder_links.id, id)).limit(1);
    return rows[0] ? rowToReminderLink(rows[0]) : undefined;
  },

  async create(input: {
    dueAt?: number | null;
    kind: ProjectReminderKind;
    metadata?: string | null;
    projectEventId?: string | null;
    projectId: string;
    reason?: string | null;
    schedulerTaskId: string;
    status?: ProjectReminderLink['status'];
    syncStatus?: ProjectReminderSyncStatus;
    title?: string | null;
    workspaceId: string;
  }): Promise<ProjectReminderLink> {
    const insert: NewProjectReminderLink = {
      createdAt: Date.now(),
      dueAt: input.dueAt ?? null,
      id: randomUUID(),
      kind: input.kind,
      lastSyncedAt: input.syncStatus === 'synced' ? Date.now() : null,
      metadata: input.metadata ?? null,
      projectEventId: input.projectEventId ?? null,
      projectId: input.projectId,
      reason: input.reason ?? null,
      schedulerTaskId: input.schedulerTaskId,
      status: input.status ?? 'suggested',
      syncStatus: input.syncStatus ?? 'suggested',
      title: input.title ?? null,
      workspaceId: input.workspaceId
    };
    const db = getOrm();
    const rows = await db
      .insert(project_reminder_links)
      .values(insert as any)
      .returning()
      .all();
    return rowToReminderLink(rows[0]);
  },

  async listByProject(projectId: string, limit = 100): Promise<ProjectReminderLink[]> {
    const db = getOrm();
    const rows = await db.select().from(project_reminder_links).where(eq(project_reminder_links.projectId, projectId)).orderBy(desc(project_reminder_links.createdAt)).limit(limit);
    return rows.map(rowToReminderLink);
  },

  async update(id: string, patch: Partial<ProjectReminderLink>): Promise<ProjectReminderLink | undefined> {
    const values: Record<string, unknown> = {};
    if (patch.title !== undefined) values.title = patch.title;
    if (patch.dueAt !== undefined) values.dueAt = patch.dueAt;
    if (patch.reason !== undefined) values.reason = patch.reason;
    if (patch.kind) values.kind = patch.kind;
    if (patch.metadata !== undefined) values.metadata = patch.metadata;
    if (patch.status) values.status = patch.status;
    if (patch.syncStatus) values.syncStatus = patch.syncStatus;
    if (patch.lastSyncedAt !== undefined) values.lastSyncedAt = patch.lastSyncedAt;
    if (patch.schedulerTaskId) values.schedulerTaskId = patch.schedulerTaskId;
    const db = getOrm();
    await db
      .update(project_reminder_links)
      .set(values as any)
      .where(eq(project_reminder_links.id, id))
      .run();
    const rows = await db.select().from(project_reminder_links).where(eq(project_reminder_links.id, id)).limit(1);
    return rows[0] ? rowToReminderLink(rows[0]) : undefined;
  },

  async moveAll(sourceProjectId: string, targetProjectId: string): Promise<number> {
    const db = getOrm();
    const result = await db
      .update(project_reminder_links)
      .set({ projectId: targetProjectId } as any)
      .where(eq(project_reminder_links.projectId, sourceProjectId))
      .run();
    return result.changes ?? 0;
  },

  async removeByProject(projectId: string): Promise<number> {
    const db = getOrm();
    const result = await db.delete(project_reminder_links).where(eq(project_reminder_links.projectId, projectId)).run();
    return result.changes ?? 0;
  }
};

export const ProjectAuditLogRepo = {
  async create(input: {
    action: string;
    actor?: ProjectAuditActor;
    after?: unknown;
    before?: unknown;
    metadata?: unknown;
    projectId?: string | null;
    reason?: string | null;
    targetId?: string | null;
    targetType: string;
    workspaceId: string;
  }): Promise<ProjectAuditLog> {
    const insert: NewProjectAuditLog = {
      action: input.action,
      actor: input.actor ?? 'system',
      after: input.after === undefined ? null : JSON.stringify(input.after),
      before: input.before === undefined ? null : JSON.stringify(input.before),
      createdAt: Date.now(),
      id: randomUUID(),
      metadata: input.metadata === undefined ? null : JSON.stringify(input.metadata),
      projectId: input.projectId ?? null,
      reason: input.reason ?? null,
      targetId: input.targetId ?? null,
      targetType: input.targetType,
      workspaceId: input.workspaceId
    };
    const db = getOrm();
    const rows = await db
      .insert(project_audit_logs)
      .values(insert as any)
      .returning()
      .all();
    return rowToAuditLog(rows[0]);
  },

  async listByProject(projectId: string, limit = 100): Promise<ProjectAuditLog[]> {
    const db = getOrm();
    const rows = await db.select().from(project_audit_logs).where(eq(project_audit_logs.projectId, projectId)).orderBy(desc(project_audit_logs.createdAt)).limit(limit);
    return rows.map(rowToAuditLog);
  }
};

export const ProjectGovernanceRepo = {
  async previewProjectImpact(projectId: string): Promise<ProjectImpactPreview | undefined> {
    const project = await ProjectRepo.get(projectId);
    if (!project) return undefined;
    const [events, milestones, links, reminderLinks, auditLogs] = await Promise.all([
      ProjectEventRepo.listByProject(projectId, { limit: 10000 }),
      ProjectMilestoneRepo.listByProject(projectId, 10000),
      ProjectLinkRepo.listByProject(projectId, 10000),
      ProjectReminderLinkRepo.listByProject(projectId, 10000),
      ProjectAuditLogRepo.listByProject(projectId, 10000)
    ]);
    const promotedMemoryNoteIds = [project.promotedMemoryNoteId, ...links.filter((link) => link.targetType === 'memory_note').map((link) => link.targetId)].filter(
      (value, index, all): value is string => Boolean(value) && all.indexOf(value) === index
    );
    const warnings: string[] = [];
    if (project.deletedAt) warnings.push('project is already soft deleted');
    if (project.status === 'completed') warnings.push('project is completed');
    if (promotedMemoryNoteIds.length) warnings.push('project has promoted or linked memory notes');
    if (reminderLinks.some((link) => link.status === 'scheduled')) warnings.push('project has scheduled reminders');
    return {
      auditLogs: auditLogs.length,
      events: events.length,
      links: links.length,
      milestones: milestones.length,
      projectId,
      promotedMemoryNoteIds,
      reminderLinks: reminderLinks.length,
      schedulerTasks: reminderLinks.filter((link) => link.status === 'scheduled' && link.syncStatus === 'synced').length,
      warnings
    };
  },

  async inspectProjectOrphans(projectId: string): Promise<ProjectOrphanReport | undefined> {
    const project = await ProjectRepo.get(projectId);
    if (!project) return undefined;
    const [links, reminderLinks] = await Promise.all([ProjectLinkRepo.listByProject(projectId, 10000), ProjectReminderLinkRepo.listByProject(projectId, 10000)]);
    const deletedProjectActiveLinks = project.deletedAt ? links : [];
    const danglingMemoryLinks = links.filter(
      (link) => link.targetType === 'memory_note' && (project.memoryPromotionStatus !== 'promoted' || !project.promotedMemoryNoteId || link.targetId !== project.promotedMemoryNoteId)
    );
    const warnings: string[] = [];
    if (deletedProjectActiveLinks.length) warnings.push('soft-deleted project still has active links');
    if (danglingMemoryLinks.length) warnings.push('project has memory note links without promoted status');
    return {
      deletedProjectActiveLinks,
      danglingMemoryLinks,
      missingSchedulerTasks: [],
      projectId,
      staleSchedulerTasks: reminderLinks.filter((link) => link.status === 'scheduled' && link.syncStatus === 'failed'),
      warnings
    };
  },

  async exportProject(projectId: string): Promise<ExportedProjectData | undefined> {
    const project = await ProjectRepo.get(projectId);
    if (!project) return undefined;
    const [snapshot, events, milestones, links, reminderLinks, auditLogs] = await Promise.all([
      ProjectSnapshotRepo.get(projectId),
      ProjectEventRepo.listByProject(projectId, { limit: 1000 }),
      ProjectMilestoneRepo.listByProject(projectId, 1000),
      ProjectLinkRepo.listByProject(projectId, 1000),
      ProjectReminderLinkRepo.listByProject(projectId, 1000),
      ProjectAuditLogRepo.listByProject(projectId, 1000)
    ]);
    return {
      auditLogs,
      events,
      links,
      milestones,
      project,
      reminderLinks,
      snapshot: snapshot ?? null
    };
  },

  async mergeProjects(sourceProjectId: string, targetProjectId: string, actor: ProjectAuditActor = 'user'): Promise<{ source?: TrackedProject; target?: TrackedProject }> {
    const source = await ProjectRepo.get(sourceProjectId);
    const target = await ProjectRepo.get(targetProjectId);
    if (!source || !target) return { source, target };
    const [eventCount, milestoneCount, linkCount, reminderCount] = await Promise.all([
      ProjectEventRepo.moveAll(sourceProjectId, targetProjectId),
      ProjectMilestoneRepo.moveAll(sourceProjectId, targetProjectId),
      ProjectLinkRepo.moveProjectLinks(sourceProjectId, targetProjectId),
      ProjectReminderLinkRepo.moveAll(sourceProjectId, targetProjectId)
    ]);
    const updatedSource = await ProjectRepo.markMerged(sourceProjectId, targetProjectId);
    await ProjectSnapshotRepo.recomputeFromEvents(targetProjectId);
    await ProjectAuditLogRepo.create({
      action: 'project_merged',
      actor,
      after: { eventCount, linkCount, milestoneCount, reminderCount, targetProjectId },
      before: source,
      projectId: targetProjectId,
      targetId: sourceProjectId,
      targetType: 'project',
      workspaceId: target.workspaceId
    });
    return { source: updatedSource, target: await ProjectRepo.get(targetProjectId) };
  },

  async splitProject(input: { actor?: ProjectAuditActor; eventIds: string[]; milestoneIds?: string[]; newProject: CreateProjectInput; sourceProjectId: string }): Promise<TrackedProject | undefined> {
    const source = await ProjectRepo.get(input.sourceProjectId);
    if (!source) return undefined;
    const project = await ProjectRepo.create({ ...input.newProject, createdBy: input.newProject.createdBy ?? 'user', workspaceId: source.workspaceId });
    await ProjectRepo.markSplitFrom(project.id, source.id);
    const [eventCount, milestoneCount] = await Promise.all([ProjectEventRepo.moveEvents(input.eventIds, project.id), ProjectMilestoneRepo.moveMilestones(input.milestoneIds ?? [], project.id)]);
    await Promise.all([ProjectSnapshotRepo.recomputeFromEvents(source.id), ProjectSnapshotRepo.recomputeFromEvents(project.id)]);
    await ProjectAuditLogRepo.create({
      action: 'project_split',
      actor: input.actor ?? 'user',
      after: { eventCount, milestoneCount, newProjectId: project.id },
      before: source,
      projectId: source.id,
      targetId: project.id,
      targetType: 'project',
      workspaceId: source.workspaceId
    });
    return ProjectRepo.get(project.id);
  }
};

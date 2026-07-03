import { randomUUID } from 'node:crypto';

import { and, desc, eq, inArray, like, or } from 'drizzle-orm';

import { createEmptyProjectSnapshot, reduceProjectSnapshotFromEvents } from '../../../packages/ai/services/project-tracking-service';
import type {
  CreateProjectInput,
  ProjectCandidate,
  ProjectCandidateStatus,
  ProjectEvent,
  ProjectEventStatus,
  ProjectEventType,
  ProjectLink,
  ProjectLinkRelationType,
  ProjectLinkTargetType,
  ProjectMilestone,
  ProjectMilestoneStatus,
  ProjectReminderKind,
  ProjectReminderLink,
  ProjectSnapshot,
  ProjectStatus,
  TrackedProject
} from '../../../packages/ai/services/project-tracking-types';
import { getOrm } from '.';
import {
  type NewProjectCandidate,
  type NewProjectEvent,
  type NewProjectLink,
  type NewProjectMilestone,
  type NewProjectReminderLink,
  type NewProjectSnapshot,
  type NewTrackedProject,
  project_candidates,
  project_events,
  project_links,
  project_milestones,
  project_reminder_links,
  project_snapshots,
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

function rowToProject(row: TrackedProjectRow): TrackedProject {
  return {
    aliases: parseStringArray(row.aliases),
    archivedAt: row.archivedAt ?? null,
    completedAt: row.completedAt ?? null,
    confidence: row.confidence ?? 1,
    createdAt: row.createdAt ?? 0,
    createdBy: row.createdBy,
    domains: parseStringArray(row.domains),
    goal: row.goal,
    id: row.id,
    metadata: row.metadata,
    name: row.name,
    ownerUserId: row.ownerUserId,
    scope: row.scope,
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
    projectId: row.projectId,
    relatedEventIds: parseStringArray(row.relatedEventIds),
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
    id: row.id,
    kind: row.kind,
    projectEventId: row.projectEventId,
    projectId: row.projectId,
    schedulerTaskId: row.schedulerTaskId,
    status: row.status,
    workspaceId: row.workspaceId
  };
}

function projectToInsert(input: CreateProjectInput & { id?: string; now?: number }): NewTrackedProject {
  const now = input.now ?? Date.now();
  return {
    aliases: stringify(input.aliases),
    archivedAt: input.status === 'archived' ? now : null,
    completedAt: input.status === 'completed' ? now : null,
    confidence: 1,
    createdAt: now,
    createdBy: input.createdBy ?? 'user',
    domains: stringify(input.domains),
    goal: input.goal,
    id: input.id ?? randomUUID(),
    metadata: null,
    name: input.name,
    ownerUserId: null,
    scope: input.scope ?? null,
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

  async list(workspaceId: string, options: { limit?: number; offset?: number; status?: ProjectStatus[] } = {}): Promise<TrackedProject[]> {
    const db = getOrm();
    const wheres: any[] = [eq(tracked_projects.workspaceId, workspaceId)];
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

  async search(workspaceId: string, query: string, limit = 20): Promise<TrackedProject[]> {
    const db = getOrm();
    const likeQuery = `%${query.trim()}%`;
    const rows = await db
      .select()
      .from(tracked_projects)
      .where(
        and(
          eq(tracked_projects.workspaceId, workspaceId),
          or(like(tracked_projects.name, likeQuery), like(tracked_projects.goal, likeQuery), like(tracked_projects.summary, likeQuery), like(tracked_projects.aliases, likeQuery))
        )
      )
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
    projectId: string;
    relatedEventIds?: string[];
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
    const insert: NewProjectEvent = {
      confidence: input.confidence ?? 0.7,
      content: input.content,
      createdAt: now,
      dueAt: input.dueAt ?? null,
      eventTime: input.eventTime ?? null,
      id: randomUUID(),
      importance: input.importance ?? 0.7,
      metadata: input.metadata ?? null,
      projectId: input.projectId,
      relatedEventIds: stringify(input.relatedEventIds),
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

  async listByProject(projectId: string, options: { limit?: number; status?: ProjectEventStatus[]; type?: ProjectEventType[] } = {}): Promise<ProjectEvent[]> {
    const db = getOrm();
    const wheres: any[] = [eq(project_events.projectId, projectId)];
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
  }
};

export const ProjectReminderLinkRepo = {
  async create(input: {
    kind: ProjectReminderKind;
    projectEventId?: string | null;
    projectId: string;
    schedulerTaskId: string;
    status?: ProjectReminderLink['status'];
    workspaceId: string;
  }): Promise<ProjectReminderLink> {
    const insert: NewProjectReminderLink = {
      createdAt: Date.now(),
      id: randomUUID(),
      kind: input.kind,
      projectEventId: input.projectEventId ?? null,
      projectId: input.projectId,
      schedulerTaskId: input.schedulerTaskId,
      status: input.status ?? 'suggested',
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
  }
};

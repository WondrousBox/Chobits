import { randomUUID } from 'node:crypto';

import { and, desc, eq, inArray, like, or, sql } from 'drizzle-orm';

import { createEmptyConversationRouteSnapshot, reduceConversationRouteSnapshot } from '../../../packages/ai/services/conversation-route-service';
import type { ConversationRouteEvent, ConversationRouteSnapshot } from '../../../packages/ai/services/conversation-route-types';
import { getOrm } from '.';
import {
  conversation_route_events,
  conversation_route_snapshots,
  type ConversationRouteEventRow,
  type ConversationRouteSnapshotRow,
  type NewConversationRouteEvent,
  type NewConversationRouteSnapshot
} from './schema';

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
  } catch {
    return [];
  }
}

function parseTaskArray(value: string | null | undefined): ConversationRouteSnapshot['openTasks'] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        eventId: typeof item?.eventId === 'string' ? item.eventId : '',
        status: normalizeTaskStatus(item?.status),
        title: typeof item?.title === 'string' ? item.title : ''
      }))
      .filter((item) => item.eventId && item.title);
  } catch {
    return [];
  }
}

function normalizeTaskStatus(status: unknown): ConversationRouteSnapshot['openTasks'][number]['status'] {
  if (status === 'active' || status === 'in_progress' || status === 'resolved' || status === 'blocked' || status === 'abandoned') return status;
  return 'active';
}

function stringify(value: unknown): string {
  return JSON.stringify(value ?? []);
}

function rowToEvent(row: ConversationRouteEventRow): ConversationRouteEvent {
  return {
    confidence: row.confidence ?? 0.5,
    content: row.content,
    conversationId: row.conversationId,
    createdAt: row.createdAt ?? 0,
    evidence: row.evidence,
    id: row.id,
    importance: row.importance ?? 0.5,
    metadata: row.metadata,
    promotedMemoryNoteId: row.promotedMemoryNoteId,
    relatedEventIds: parseStringArray(row.relatedEventIds),
    resolvesEventIds: parseStringArray(row.resolvesEventIds),
    seqEnd: row.seqEnd,
    seqStart: row.seqStart,
    status: row.status,
    supersedesEventIds: parseStringArray(row.supersedesEventIds),
    tags: parseStringArray(row.tags),
    title: row.title,
    type: row.type,
    updatedAt: row.updatedAt ?? row.createdAt ?? 0,
    workspaceId: row.workspaceId
  };
}

function rowToSnapshot(row: ConversationRouteSnapshotRow): ConversationRouteSnapshot {
  return {
    activeThreads: parseStringArray(row.activeThreads),
    blockers: parseStringArray(row.blockers),
    conversationId: row.conversationId,
    currentGoal: row.currentGoal ?? undefined,
    currentTopic: row.currentTopic ?? undefined,
    decisions: parseStringArray(row.decisions),
    keyClues: parseStringArray(row.keyClues),
    keyConstraints: parseStringArray(row.keyConstraints),
    lastProcessedSeq: row.lastProcessedSeq ?? 0,
    nextSuggestedFocus: row.nextSuggestedFocus ?? undefined,
    openTasks: parseTaskArray(row.openTasks),
    resolvedTasks: parseTaskArray(row.resolvedTasks),
    summary: row.summary ?? '',
    updatedAt: row.updatedAt ?? 0,
    userCorrections: parseStringArray(row.userCorrections),
    version: row.version ?? 1,
    workspaceId: row.workspaceId
  };
}

function eventToInsert(event: Omit<ConversationRouteEvent, 'id'> & { id?: string }): NewConversationRouteEvent {
  return {
    confidence: event.confidence,
    content: event.content,
    conversationId: event.conversationId,
    createdAt: event.createdAt,
    evidence: event.evidence ?? null,
    id: event.id ?? randomUUID(),
    importance: event.importance,
    metadata: event.metadata ?? null,
    promotedMemoryNoteId: event.promotedMemoryNoteId ?? null,
    relatedEventIds: stringify(event.relatedEventIds),
    resolvesEventIds: stringify(event.resolvesEventIds),
    seqEnd: event.seqEnd,
    seqStart: event.seqStart,
    status: event.status,
    supersedesEventIds: stringify(event.supersedesEventIds),
    tags: stringify(event.tags),
    title: event.title,
    type: event.type,
    updatedAt: event.updatedAt,
    workspaceId: event.workspaceId ?? null
  };
}

function snapshotToInsert(snapshot: ConversationRouteSnapshot): NewConversationRouteSnapshot {
  return {
    activeThreads: stringify(snapshot.activeThreads),
    blockers: stringify(snapshot.blockers),
    conversationId: snapshot.conversationId,
    createdAt: snapshot.updatedAt,
    currentGoal: snapshot.currentGoal ?? null,
    currentTopic: snapshot.currentTopic ?? null,
    decisions: stringify(snapshot.decisions),
    keyClues: stringify(snapshot.keyClues),
    keyConstraints: stringify(snapshot.keyConstraints),
    lastProcessedSeq: snapshot.lastProcessedSeq,
    metadata: null,
    nextSuggestedFocus: snapshot.nextSuggestedFocus ?? null,
    openTasks: stringify(snapshot.openTasks),
    resolvedTasks: stringify(snapshot.resolvedTasks),
    summary: snapshot.summary,
    updatedAt: snapshot.updatedAt,
    userCorrections: stringify(snapshot.userCorrections),
    version: snapshot.version,
    workspaceId: snapshot.workspaceId ?? null
  };
}

export const ConversationRouteEventRepo = {
  async bulkInsert(events: Array<Omit<ConversationRouteEvent, 'id'> & { id?: string }>): Promise<ConversationRouteEvent[]> {
    if (!events.length) return [];
    const db = getOrm();
    const rows = await db
      .insert(conversation_route_events)
      .values(events.map(eventToInsert) as any)
      .returning()
      .all();
    return rows.map(rowToEvent);
  },

  async applyResolutionLinks(sourceEvents: ConversationRouteEvent[]): Promise<void> {
    const db = getOrm();
    const now = Date.now();

    for (const event of sourceEvents) {
      const resolvedIds = event.resolvesEventIds.filter(Boolean);
      if (resolvedIds.length > 0) {
        await db
          .update(conversation_route_events)
          .set({ status: 'resolved', updatedAt: now } as any)
          .where(and(eq(conversation_route_events.conversationId, event.conversationId), inArray(conversation_route_events.id, resolvedIds), eq(conversation_route_events.status, 'active' as any)))
          .run();
      }

      const supersededIds = event.supersedesEventIds.filter(Boolean);
      if (supersededIds.length > 0) {
        await db
          .update(conversation_route_events)
          .set({ status: 'superseded', updatedAt: now } as any)
          .where(and(eq(conversation_route_events.conversationId, event.conversationId), inArray(conversation_route_events.id, supersededIds), eq(conversation_route_events.status, 'active' as any)))
          .run();
      }
    }
  },

  async getById(id: string): Promise<ConversationRouteEvent | undefined> {
    const db = getOrm();
    const rows = await db.select().from(conversation_route_events).where(eq(conversation_route_events.id, id)).limit(1);
    return rows[0] ? rowToEvent(rows[0]) : undefined;
  },

  async listByConversation(
    conversationId: string,
    options: {
      limit?: number;
      offset?: number;
      status?: ConversationRouteEvent['status'];
      type?: ConversationRouteEvent['type'];
    } = {}
  ): Promise<ConversationRouteEvent[]> {
    const db = getOrm();
    const wheres: any[] = [eq(conversation_route_events.conversationId, conversationId)];
    if (options.type) wheres.push(eq(conversation_route_events.type, options.type));
    if (options.status) wheres.push(eq(conversation_route_events.status, options.status));

    const rows = await db
      .select()
      .from(conversation_route_events)
      .where(and(...wheres))
      .orderBy(desc(conversation_route_events.seqEnd), desc(conversation_route_events.createdAt))
      .limit(options.limit ?? 100)
      .offset(options.offset ?? 0);
    return rows.map(rowToEvent);
  },

  async listActiveByConversation(conversationId: string, limit = 200): Promise<ConversationRouteEvent[]> {
    const db = getOrm();
    const rows = await db
      .select()
      .from(conversation_route_events)
      .where(and(eq(conversation_route_events.conversationId, conversationId), inArray(conversation_route_events.status, ['active', 'resolved'] as any)))
      .orderBy(desc(conversation_route_events.importance), desc(conversation_route_events.createdAt))
      .limit(limit);
    return rows.map(rowToEvent);
  },

  async search(options: { conversationId?: string; workspaceId?: string; query: string; limit?: number }): Promise<ConversationRouteEvent[]> {
    const db = getOrm();
    const likeQuery = `%${options.query.trim()}%`;
    const wheres: any[] = [
      or(
        like(conversation_route_events.title, likeQuery),
        like(conversation_route_events.content, likeQuery),
        like(conversation_route_events.evidence, likeQuery),
        like(conversation_route_events.tags, likeQuery)
      )
    ];
    if (options.conversationId) wheres.push(eq(conversation_route_events.conversationId, options.conversationId));
    if (options.workspaceId) wheres.push(eq(conversation_route_events.workspaceId, options.workspaceId));

    const rows = await db
      .select()
      .from(conversation_route_events)
      .where(and(...wheres))
      .orderBy(desc(conversation_route_events.importance), desc(conversation_route_events.createdAt))
      .limit(options.limit ?? 20);
    return rows.map(rowToEvent);
  },

  async update(id: string, patch: Partial<ConversationRouteEvent>): Promise<ConversationRouteEvent | undefined> {
    const db = getOrm();
    const values: Record<string, unknown> = {
      updatedAt: Date.now()
    };
    if (patch.status) values.status = patch.status;
    if (patch.title) values.title = patch.title;
    if (patch.content) values.content = patch.content;
    if (typeof patch.importance === 'number') values.importance = patch.importance;
    if (typeof patch.confidence === 'number') values.confidence = patch.confidence;
    if (patch.tags) values.tags = stringify(patch.tags);
    if (patch.promotedMemoryNoteId !== undefined) values.promotedMemoryNoteId = patch.promotedMemoryNoteId;

    await db
      .update(conversation_route_events)
      .set(values as any)
      .where(eq(conversation_route_events.id, id))
      .run();
    return this.getById(id);
  },

  async deleteByConversation(conversationId: string): Promise<number> {
    const db = getOrm();
    const result = await db.delete(conversation_route_events).where(eq(conversation_route_events.conversationId, conversationId)).run();
    return (result as any).changes ?? 0;
  },

  async countByConversation(conversationId: string): Promise<number> {
    const db = getOrm();
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(conversation_route_events)
      .where(eq(conversation_route_events.conversationId, conversationId));
    return (rows[0] as any)?.count ?? 0;
  }
};

export const ConversationRouteSnapshotRepo = {
  async get(conversationId: string): Promise<ConversationRouteSnapshot | undefined> {
    const db = getOrm();
    const rows = await db.select().from(conversation_route_snapshots).where(eq(conversation_route_snapshots.conversationId, conversationId)).limit(1);
    return rows[0] ? rowToSnapshot(rows[0]) : undefined;
  },

  async upsert(snapshot: ConversationRouteSnapshot): Promise<ConversationRouteSnapshot | undefined> {
    const db = getOrm();
    const row = snapshotToInsert(snapshot);
    const { createdAt: _createdAt, ...updateRow } = row as any;
    const rows = await db
      .insert(conversation_route_snapshots)
      .values(row as any)
      .onConflictDoUpdate({
        target: conversation_route_snapshots.conversationId,
        set: updateRow
      })
      .returning()
      .all();
    return rows[0] ? rowToSnapshot(rows[0]) : undefined;
  },

  async delete(conversationId: string): Promise<number> {
    const db = getOrm();
    const result = await db.delete(conversation_route_snapshots).where(eq(conversation_route_snapshots.conversationId, conversationId)).run();
    return (result as any).changes ?? 0;
  },

  async recomputeFromEvents(conversationId: string): Promise<ConversationRouteSnapshot | undefined> {
    const previous = await this.get(conversationId);
    const events = await ConversationRouteEventRepo.listByConversation(conversationId, { limit: 1000 });
    const now = Date.now();
    const workspaceId = previous?.workspaceId ?? events.find((event) => event.workspaceId)?.workspaceId ?? null;
    const targetSeq = Math.max(previous?.lastProcessedSeq ?? 0, ...events.map((event) => event.seqEnd));
    const baseline =
      previous ??
      createEmptyConversationRouteSnapshot({
        conversationId,
        lastProcessedSeq: targetSeq,
        now,
        workspaceId
      });
    if (!previous) baseline.version = 0;

    const snapshot = reduceConversationRouteSnapshot({
      conversationId,
      delta: { events: [], snapshotPatch: {} },
      existingEvents: events,
      newEvents: [],
      now,
      preservePreviousSnapshot: false,
      previous: baseline,
      targetSeq,
      workspaceId
    });

    return this.upsert(snapshot);
  }
};

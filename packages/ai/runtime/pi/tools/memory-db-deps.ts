/**
 * Shared RetrievalDbDeps builder for memory tools.
 * Adapts the concrete repository implementations to the RetrievalDbDeps interface.
 */

import { MemoryEdgeRepo, MemoryFTSRepo, MemoryKeywordRepo, MemoryNoteKeywordRepo, MemoryNoteRepo, MemorySectionRepo, MemoryTopicRepo, WorkspacesRepo } from '@packages/common/db';

import type { WriteDbOps } from '../../../services/memory-extraction-service';
import type { RetrievalDbDeps } from '../../../services/memory-retrieval-service';
import type { PiSessionToolContext } from '../tool-context';

export function buildRetrievalDbDeps(): RetrievalDbDeps {
  return {
    searchTopics: (term, workspaceId, limit) => MemoryTopicRepo.search(term, workspaceId, limit) as any,
    getTopicById: (id) => MemoryTopicRepo.getById(id),
    listTopicChildren: (parentId) => MemoryTopicRepo.listChildren(parentId),
    listTopicRoots: (workspaceId, limit) => MemoryTopicRepo.listRoots(workspaceId, limit),
    findKeywordsByTopic: (topicId) => MemoryKeywordRepo.findByTopicId(topicId),
    findKeywordByCanonical: (canonical, workspaceId) => MemoryKeywordRepo.findByCanonical(canonical, workspaceId),
    findKeywordByAlias: (alias, workspaceId) => MemoryKeywordRepo.findByAlias(alias, workspaceId),
    findAdjacentTopics: (topicIds, limit) => MemoryEdgeRepo.findAdjacentTopics(topicIds, limit),
    findEdgesBySource: (sourceType, sourceId, relationType) => MemoryEdgeRepo.findBySource(sourceType, sourceId, relationType),
    queryEntityFacts: (entity, opts) => MemoryEdgeRepo.queryEntityFacts(entity, opts),
    findTopicsByDomain: (domain, workspaceId, limit) => MemoryTopicRepo.findByDomain(domain, workspaceId, limit),
    getNoteById: (id) => MemoryNoteRepo.getById(id),
    listNotesByWorkspace: (workspaceId, limit, offset) => MemoryNoteRepo.listByWorkspace(workspaceId, limit, offset),
    listNotesByDateRange: (start, end, workspaceId) => MemoryNoteRepo.listByDateRange(start, end, workspaceId),
    listNotesByTopicId: (topicId, workspaceId, limit) => MemoryNoteRepo.listByTopicId(topicId, workspaceId, limit),
    listSectionsByNote: (noteId) => MemorySectionRepo.listByNote(noteId),
    ftsSearch: (query, opts) => MemoryFTSRepo.search(query, opts),
    getWorkspaceRoot: async (workspaceId) => {
      const ws = await WorkspacesRepo.getById(workspaceId);
      return ws?.rootPath ?? null;
    }
  };
}

export function buildWriteDbOps(): WriteDbOps {
  return {
    upsertNote: (note: any) => MemoryNoteRepo.upsert(note),
    rebuildSections: (noteId: string, sections: any[]) => MemorySectionRepo.rebuildForNote(noteId, sections),
    upsertTopic: async (topic: any) => {
      const existing = await MemoryTopicRepo.findBySlug(topic.slug, topic.workspaceId);
      if (existing) {
        await MemoryTopicRepo.updateHeat(existing.id, 0.05);
        // Update domain if provided and not already set
        if (topic.domain && !existing.domain) {
          await MemoryTopicRepo.update(existing.id, { domain: topic.domain, domainType: topic.domainType });
        }
        return null;
      }
      return MemoryTopicRepo.upsert({
        id: `topic_${topic.slug}`,
        ...topic,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    },
    upsertEdges: (edges: any[]) =>
      MemoryEdgeRepo.bulkUpsert(
        edges.map((e) => ({
          ...e,
          weight: 1.0,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }))
      ),
    upsertKeywords: async (noteId: string, keywords: string[], entities: any[], workspaceId: string) => {
      let created = 0;
      const links: any[] = [];
      for (const kw of keywords) {
        const canonical = kw.toLowerCase().trim();
        if (!canonical) continue;
        const row = await MemoryKeywordRepo.upsertCanonical({
          id: `kw_${canonical.replace(/[^a-z0-9\u4e00-\u9fff]+/g, '_').slice(0, 40)}`,
          canonical,
          workspaceId,
          aliases: null,
          entityType: entities.find((e: any) => e.name?.toLowerCase() === canonical)?.type ?? null,
          occurrenceCount: 1,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
        if (row) {
          created++;
          links.push({ keywordId: row.id, noteId, weight: 1.0, createdAt: Date.now() });
        }
      }
      if (links.length) {
        await MemoryNoteKeywordRepo.rebuildForNote(noteId, links);
      }
      return created;
    },
    rebuildFTS: (noteId: string, noteData: any, sections: any[]) => {
      MemoryFTSRepo.rebuildForNote(noteId, noteData, sections);
    },
    upsertEntityFact: (fact: { subject: string; predicate: string; object: string; validFrom?: number; evidenceNoteId?: string; workspaceId?: string }) => {
      return MemoryEdgeRepo.addEntityFact(fact);
    }
  };
}

export async function resolveWorkspaceId(toolContext?: PiSessionToolContext): Promise<string | undefined> {
  const requestedWorkspaceId =
    typeof toolContext?.resolved?.request?.extras?.workspaceId === 'string' && toolContext.resolved.request.extras.workspaceId.trim()
      ? toolContext.resolved.request.extras.workspaceId.trim()
      : undefined;
  if (requestedWorkspaceId) return requestedWorkspaceId;

  const conversationId = toolContext?.conversationId?.trim();
  if (toolContext && conversationId) {
    const existing = await toolContext.chatRepo.ensureConversation({ id: conversationId });
    if (existing?.workspaceId) return existing.workspaceId;
  }

  const ws = await WorkspacesRepo.getDefault();
  return ws?.id;
}

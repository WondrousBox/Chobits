/**
 * Shared RetrievalDbDeps builder for memory tools.
 * Adapts the concrete repository implementations to the RetrievalDbDeps interface.
 */

import { MemoryEdgeRepo, MemoryFTSRepo, MemoryKeywordRepo, MemoryNoteKeywordRepo, MemoryNoteRepo, MemorySectionRepo, MemoryTopicRepo, WorkspacesRepo } from '@packages/common/db';

import type { WriteDbOps } from '../../../services/memory-extraction-service';
import { canonicalizeTopicLabel } from '../../../services/memory-topic-canonicalization';
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
    listNotesByIds: (ids) => MemoryNoteRepo.listByIds(ids),
    listNotesByWorkspace: (workspaceId, limit, offset) => MemoryNoteRepo.listByWorkspace(workspaceId, limit, offset),
    listNotesByDateRange: (start, end, workspaceId) => MemoryNoteRepo.listByDateRange(start, end, workspaceId),
    listNotesByTopicId: (topicId, workspaceId, limit) => MemoryNoteRepo.listByTopicId(topicId, workspaceId, limit),
    searchNotesByTerms: (terms, workspaceId, limit) => MemoryNoteRepo.searchByTerms(terms, workspaceId, limit),
    listSectionsByNote: (noteId) => MemorySectionRepo.listByNote(noteId),
    listSectionsByNoteIds: (noteIds) => MemorySectionRepo.listByNoteIds(noteIds),
    ftsSearch: (query, opts) => MemoryFTSRepo.search(query, opts),
    getWorkspaceRoot: async (workspaceId) => {
      const ws = await WorkspacesRepo.getById(workspaceId);
      return ws?.rootPath ?? null;
    },
    listRecentImportant: (workspaceId, minImportance, days, limit) =>
      MemoryNoteRepo.listRecentImportant(workspaceId, minImportance, days, limit)
  };
}

export function buildWriteDbOps(): WriteDbOps {
  return {
    upsertNote: (note: any) => MemoryNoteRepo.upsert(note),
    rebuildSections: (noteId: string, sections: any[]) => MemorySectionRepo.rebuildForNote(noteId, sections),
    upsertTopic: async (topic: any) => {
      const existing = await MemoryTopicRepo.findBySlug(topic.slug, topic.workspaceId);
      const nextAliases = dedupStrings([...(parseStringArray(existing?.aliases) || []), ...normalizeStringArray(topic.aliases)]);
      const nextKeywords = dedupStrings([...(parseStringArray(existing?.keywords) || []), ...normalizeStringArray(topic.keywords)]);
      if (existing) {
        await MemoryTopicRepo.updateHeat(existing.id, 0.05);
        const patch: Record<string, unknown> = {};
        if (topic.domain && (!existing.domain || existing.domain === 'general')) {
          patch.domain = topic.domain;
          patch.domainType = topic.domainType;
        }
        if (nextAliases.length > 0 && JSON.stringify(nextAliases) !== (existing.aliases || null)) {
          patch.aliases = JSON.stringify(nextAliases);
        }
        if (nextKeywords.length > 0 && JSON.stringify(nextKeywords) !== (existing.keywords || null)) {
          patch.keywords = JSON.stringify(nextKeywords);
        }
        if (topic.description && !existing.description) {
          patch.description = topic.description;
        }
        if (Object.keys(patch).length > 0) {
          await MemoryTopicRepo.update(existing.id, patch as any);
        }
        const refreshed = (await MemoryTopicRepo.getById(existing.id)) || existing;
        return { id: refreshed.id, label: refreshed.label, slug: refreshed.slug, created: false };
      }
      const created = await MemoryTopicRepo.upsert({
        id: `topic_${topic.slug}`,
        ...topic,
        aliases: nextAliases.length ? JSON.stringify(nextAliases) : null,
        keywords: nextKeywords.length ? JSON.stringify(nextKeywords) : null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
      return created ? { id: created.id, label: created.label, slug: created.slug, created: true } : null;
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
    upsertKeywords: async (noteId: string, keywords: string[], entities: any[], workspaceId: string, primaryTopicId?: string) => {
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
          primaryTopicId,
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

export function buildTopicCanonicalizer() {
  return async (input: { topicLabel: string; topicSlug: string; workspaceId: string; domain?: string }) =>
    canonicalizeTopicLabel(
      input,
      {
        findTopicBySlug: (slug, workspaceId) => MemoryTopicRepo.findBySlug(slug, workspaceId),
        searchTopics: (term, workspaceId, limit) => MemoryTopicRepo.search(term, workspaceId, limit),
        findTopicsByDomain: (domain, workspaceId, limit) => MemoryTopicRepo.findByDomain(domain, workspaceId, limit)
      }
    );
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

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : [];
  } catch {
    return [];
  }
}

function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim());
}

function dedupStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

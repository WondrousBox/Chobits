import type { RetrievalDbDeps } from '../../../../packages/ai/services/memory-retrieval-service';
import {
  MemoryEdgeRepo,
  MemoryFTSRepo,
  MemoryKeywordRepo,
  MemoryNoteRepo,
  MemorySectionRepo,
  MemoryTopicRepo
} from '../../db/memory-repositories';
import { WorkspacesRepo } from '../../db/repositories';

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
    searchNotesByTerms: (terms, workspaceId, limit) => MemoryNoteRepo.searchByTerms(terms, workspaceId, limit),
    listSectionsByNote: (noteId) => MemorySectionRepo.listByNote(noteId),
    ftsSearch: (query, opts) => MemoryFTSRepo.search(query, opts),
    getWorkspaceRoot: async (workspaceId) => {
      const workspace = await WorkspacesRepo.getById(workspaceId);
      return workspace?.rootPath ?? null;
    },
    listRecentImportant: (workspaceId, minImportance, days, limit) =>
      MemoryNoteRepo.listRecentImportant(workspaceId, minImportance, days, limit)
  };
}

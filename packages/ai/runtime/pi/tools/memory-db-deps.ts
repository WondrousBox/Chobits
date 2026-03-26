/**
 * Shared RetrievalDbDeps builder for memory tools.
 * Adapts the concrete repository implementations to the RetrievalDbDeps interface.
 */

import { MemoryEdgeRepo, MemoryFTSRepo, MemoryKeywordRepo, MemoryNoteRepo, MemorySectionRepo, MemoryTopicRepo, WorkspacesRepo } from '@packages/common/db';

import type { RetrievalDbDeps } from '../../../services/memory-retrieval-service';

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

export async function resolveWorkspaceId(): Promise<string | undefined> {
  const ws = await WorkspacesRepo.getDefault();
  return ws?.id;
}

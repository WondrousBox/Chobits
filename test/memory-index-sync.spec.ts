import { beforeEach, describe, expect, it, vi } from 'vitest';

const indexSyncMocks = vi.hoisted(() => ({
  clearCriticalFactsCache: vi.fn(),
  clearMemorySearchCache: vi.fn(),
  generateMemoryIndex: vi.fn(async () => ({
    filePath: 'memory/MEMORY.md',
    indexFilePath: 'memory/INDEX.md',
    noteCount: 2,
    selectedCount: 2,
    topicCount: 1
  })),
  getWorkspaceById: vi.fn(async () => ({ id: 'ws-1', rootPath: 'F:\\Develop\\chobits' })),
  logMemoryTrace: vi.fn(),
  shortTraceId: vi.fn((value: string) => value),
  syncPurposeRetrospectiveToMemory: vi.fn(async () => ({ ok: true, skipped: true }))
}));

vi.mock('../packages/ai/services/memory-content-gen', () => ({
  generateMemoryIndex: indexSyncMocks.generateMemoryIndex
}));

vi.mock('../packages/ai/services/memory-auto-recall', () => ({
  clearCriticalFactsCache: indexSyncMocks.clearCriticalFactsCache
}));

vi.mock('../packages/ai/services/memory-retrieval-service', () => ({
  clearMemorySearchCache: indexSyncMocks.clearMemorySearchCache
}));

vi.mock('../packages/ai/services/memory-trace', () => ({
  logMemoryTrace: indexSyncMocks.logMemoryTrace,
  shortTraceId: indexSyncMocks.shortTraceId
}));

vi.mock('../electron/main/handlers/memory/purpose-retrospective-memory-sync', () => ({
  syncSpritePurposeRetrospectiveToMemory: indexSyncMocks.syncPurposeRetrospectiveToMemory
}));

vi.mock('../electron/main/db/memory-repositories', () => ({
  MemoryNoteRepo: {
    listByDate: vi.fn(),
    listByTopicId: vi.fn(),
    listByWorkspace: vi.fn()
  },
  MemoryTopicRepo: {
    listAll: vi.fn()
  }
}));

vi.mock('../electron/main/db/repositories', () => ({
  WorkspacesRepo: {
    getById: indexSyncMocks.getWorkspaceById
  }
}));

import { refreshMemoryIndexForWorkspace } from '../electron/main/handlers/memory/memory-index-sync';

beforeEach(() => {
  indexSyncMocks.clearCriticalFactsCache.mockClear();
  indexSyncMocks.clearMemorySearchCache.mockClear();
  indexSyncMocks.generateMemoryIndex.mockClear();
  indexSyncMocks.getWorkspaceById.mockClear();
  indexSyncMocks.logMemoryTrace.mockClear();
  indexSyncMocks.syncPurposeRetrospectiveToMemory.mockClear();
});

describe('memory index refresh cache invalidation', () => {
  it('clears the explicit search cache after a successful refresh', async () => {
    const result = await refreshMemoryIndexForWorkspace('ws-1', { trigger: 'test' });

    expect(result.ok).toBe(true);
    expect(indexSyncMocks.syncPurposeRetrospectiveToMemory).toHaveBeenCalledWith({ workspaceId: 'ws-1' });
    expect(indexSyncMocks.clearCriticalFactsCache).toHaveBeenCalledTimes(1);
    expect(indexSyncMocks.clearMemorySearchCache).toHaveBeenCalledWith('ws-1');
  });

  it('can sync a purpose retrospective for the extracted date before refresh', async () => {
    await refreshMemoryIndexForWorkspace('ws-1', {
      purposeRetrospectiveDate: '2026-05-02',
      trigger: 'test'
    });

    expect(indexSyncMocks.syncPurposeRetrospectiveToMemory).toHaveBeenCalledWith({
      date: '2026-05-02',
      workspaceId: 'ws-1'
    });
  });
});

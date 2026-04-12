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
  shortTraceId: vi.fn((value: string) => value)
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
});

describe('memory index refresh cache invalidation', () => {
  it('clears the explicit search cache after a successful refresh', async () => {
    const result = await refreshMemoryIndexForWorkspace('ws-1', { trigger: 'test' });

    expect(result.ok).toBe(true);
    expect(indexSyncMocks.clearCriticalFactsCache).toHaveBeenCalledTimes(1);
    expect(indexSyncMocks.clearMemorySearchCache).toHaveBeenCalledWith('ws-1');
  });
});

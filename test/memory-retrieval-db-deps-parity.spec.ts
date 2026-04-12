import { describe, expect, it, vi } from 'vitest';

vi.mock('../electron/main/logger', () => ({
  __esModule: true,
  default: class Logger {},
  logger: {
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    }
  },
  devLog: vi.fn(),
  binPathLog: vi.fn()
}));

vi.mock(
  '@packages/common/db',
  () => ({
    MemoryEdgeRepo: {
      findAdjacentTopics: vi.fn(),
      findBySource: vi.fn(),
      queryEntityFacts: vi.fn()
    },
    MemoryFTSRepo: {
      search: vi.fn()
    },
    MemoryKeywordRepo: {
      findByTopicId: vi.fn(),
      findByCanonical: vi.fn(),
      findByAlias: vi.fn()
    },
    MemoryNoteKeywordRepo: {
      rebuildForNote: vi.fn()
    },
    MemoryNoteRepo: {
      getById: vi.fn(),
      listByIds: vi.fn(),
      listByWorkspace: vi.fn(),
      listByDateRange: vi.fn(),
      listByTopicId: vi.fn(),
      searchByTerms: vi.fn(),
      listRecentImportant: vi.fn(),
      upsert: vi.fn()
    },
    MemorySectionRepo: {
      listByNote: vi.fn(),
      listByNoteIds: vi.fn(),
      rebuildForNote: vi.fn()
    },
    MemoryTopicRepo: {
      search: vi.fn(),
      getById: vi.fn(),
      listChildren: vi.fn(),
      listRoots: vi.fn(),
      findByDomain: vi.fn(),
      findBySlug: vi.fn(),
      upsert: vi.fn(),
      updateHeat: vi.fn(),
      update: vi.fn()
    },
    WorkspacesRepo: {
      getById: vi.fn(),
      getDefault: vi.fn()
    }
  }),
  { virtual: true }
);

import { buildRetrievalDbDeps as buildElectronRetrievalDbDeps } from '../electron/main/handlers/memory/retrieval-db-deps';
import { buildRetrievalDbDeps as buildPiRetrievalDbDeps } from '../packages/ai/runtime/pi/tools/memory-db-deps';

describe('memory retrieval db deps parity', () => {
  it('exposes the same optional retrieval capabilities for Electron auto-recall and Pi tools', () => {
    const electronDb = buildElectronRetrievalDbDeps();
    const piDb = buildPiRetrievalDbDeps();

    expect(typeof electronDb.searchNotesByTerms).toBe('function');
    expect(typeof piDb.searchNotesByTerms).toBe('function');

    expect(typeof electronDb.listRecentImportant).toBe('function');
    expect(typeof piDb.listRecentImportant).toBe('function');

    expect(typeof electronDb.listNotesByIds).toBe('function');
    expect(typeof piDb.listNotesByIds).toBe('function');

    expect(typeof electronDb.listSectionsByNoteIds).toBe('function');
    expect(typeof piDb.listSectionsByNoteIds).toBe('function');
  });
});

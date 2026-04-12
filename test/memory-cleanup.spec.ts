import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cleanupMocks = vi.hoisted(() => ({
  clearMemorySearchCache: vi.fn(),
  removeConversationSource: vi.fn(),
  deleteNoteByIds: vi.fn(async () => 1),
  deleteFtsByNote: vi.fn(),
  deleteEdgeByNote: vi.fn(async () => 1),
  deleteNoteKeywordByNote: vi.fn(async () => 1),
  getWorkspaceById: vi.fn(),
  rawPrepare: vi.fn(),
  rawExec: vi.fn()
}));

vi.mock('../electron/main/db', () => ({
  getDB: () => ({
    prepare: cleanupMocks.rawPrepare,
    exec: cleanupMocks.rawExec
  })
}));

vi.mock('../packages/ai/services/memory-retrieval-service', () => ({
  clearMemorySearchCache: cleanupMocks.clearMemorySearchCache
}));

vi.mock('../electron/main/db/memory-repositories', () => ({
  MemoryNoteRepo: {
    removeConversationSource: cleanupMocks.removeConversationSource,
    deleteByIds: cleanupMocks.deleteNoteByIds
  },
  MemoryEdgeRepo: {
    deleteByNote: cleanupMocks.deleteEdgeByNote
  },
  MemoryNoteKeywordRepo: {
    deleteByNote: cleanupMocks.deleteNoteKeywordByNote
  }
}));

vi.mock('../electron/main/db/memory-fts-repo', () => ({
  MemoryFTSRepo: {
    deleteByNote: cleanupMocks.deleteFtsByNote
  }
}));

vi.mock('../electron/main/db/repositories', () => ({
  WorkspacesRepo: {
    getById: cleanupMocks.getWorkspaceById
  }
}));

import { cleanupMemoryForConversations } from '../electron/main/handlers/memory/memory-cleanup';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

beforeEach(() => {
  cleanupMocks.clearMemorySearchCache.mockClear();
  cleanupMocks.removeConversationSource.mockReset();
  cleanupMocks.deleteNoteByIds.mockClear();
  cleanupMocks.deleteFtsByNote.mockClear();
  cleanupMocks.deleteEdgeByNote.mockClear();
  cleanupMocks.deleteNoteKeywordByNote.mockClear();
  cleanupMocks.getWorkspaceById.mockReset();
  cleanupMocks.rawExec.mockClear();
  cleanupMocks.rawPrepare.mockImplementation((sql: string) => ({
    get: vi.fn(() => {
      if (sql.includes('SELECT 1 FROM memory_note_keywords')) {
        return undefined;
      }
      return undefined;
    }),
    all: vi.fn(() => {
      if (sql.includes('SELECT keyword_id FROM memory_note_keywords')) {
        return [];
      }
      return [];
    }),
    run: vi.fn(() => ({}))
  }));
});

describe('memory cleanup regression coverage', () => {
  it('keeps shared notes and only reports them as updated when a source conversation is removed', async () => {
    cleanupMocks.removeConversationSource.mockResolvedValue({
      updated: [{ id: 'note_shared' }],
      orphaned: []
    });

    const result = await cleanupMemoryForConversations(['conv-shared']);

    expect(result).toEqual({
      updated: 1,
      deleted: 0,
      errors: []
    });
    expect(cleanupMocks.deleteFtsByNote).not.toHaveBeenCalled();
    expect(cleanupMocks.deleteEdgeByNote).not.toHaveBeenCalled();
    expect(cleanupMocks.deleteNoteKeywordByNote).not.toHaveBeenCalled();
    expect(cleanupMocks.deleteNoteByIds).not.toHaveBeenCalled();
    expect(cleanupMocks.clearMemorySearchCache).toHaveBeenCalledTimes(1);
  });

  it('fully deletes orphaned notes and removes their markdown file', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'chobits-memory-cleanup-'));
    tempDirs.push(workspaceRoot);

    const relPath = path.join('memory', 'daily', '2026', '04', '2026-04-12-runtime-memory.md');
    const absPath = path.join(workspaceRoot, relPath);
    await mkdir(path.dirname(absPath), { recursive: true });
    await writeFile(absPath, '# runtime memory', 'utf-8');

    cleanupMocks.removeConversationSource.mockResolvedValue({
      updated: [],
      orphaned: [
        {
          id: 'note_orphan',
          workspaceId: 'ws-1',
          filePath: relPath
        }
      ]
    });
    cleanupMocks.getWorkspaceById.mockResolvedValue({ id: 'ws-1', rootPath: workspaceRoot });

    const result = await cleanupMemoryForConversations(['conv-orphan']);

    expect(result).toEqual({
      updated: 0,
      deleted: 1,
      errors: []
    });
    expect(cleanupMocks.deleteFtsByNote).toHaveBeenCalledWith('note_orphan');
    expect(cleanupMocks.deleteEdgeByNote).toHaveBeenCalledWith('note_orphan');
    expect(cleanupMocks.deleteNoteKeywordByNote).toHaveBeenCalledWith('note_orphan');
    expect(cleanupMocks.deleteNoteByIds).toHaveBeenCalledWith(['note_orphan']);
    expect(cleanupMocks.clearMemorySearchCache).toHaveBeenCalledWith('ws-1');
    await expect(access(absPath)).rejects.toThrow();
  });
});

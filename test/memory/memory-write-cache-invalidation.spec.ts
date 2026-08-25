import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const writeCacheMocks = vi.hoisted(() => ({
  clearMemorySearchCache: vi.fn()
}));

vi.mock('../../packages/ai/services/memory-retrieval-service', () => ({
  clearMemorySearchCache: writeCacheMocks.clearMemorySearchCache
}));

import { writeMemory, type WriteDbOps } from '../../packages/ai/services/memory-extraction-service';
import type { MergedNote } from '../../packages/ai/services/memory-types';

const tempDirs: string[] = [];

afterEach(async () => {
  writeCacheMocks.clearMemorySearchCache.mockClear();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function createDbOps(): WriteDbOps {
  return {
    upsertNote: vi.fn(async (note: any) => note),
    rebuildSections: vi.fn(async () => []),
    upsertTopic: vi.fn(async (topic: any) => ({ id: `topic_${topic.slug}`, label: topic.label, slug: topic.slug, created: true })),
    upsertEdges: vi.fn(async () => 0),
    upsertKeywords: vi.fn(async () => 0),
    rebuildFTS: vi.fn()
  };
}

describe('memory write search cache invalidation', () => {
  it('clears the explicit search cache after a note write succeeds', async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'chobits-memory-write-'));
    tempDirs.push(workspaceRoot);

    const merged: MergedNote = {
      action: 'create',
      noteId: 'mem_runtime_cache',
      filePath: path.join('memory', 'daily', '2026', '04', '2026-04-12-runtime-cache.md'),
      frontmatter: {
        id: 'mem_runtime_cache',
        version: 1,
        workspaceId: 'ws-1',
        date: '2026-04-12',
        topics: ['Runtime Cache'],
        keywords: ['runtime', 'cache'],
        summary: 'Runtime cache write',
        sourceConversationIds: ['conv-1'],
        sourceMessageRange: [{ conversationId: 'conv-1', seqStart: 1, seqEnd: 1 }],
        importance: 0.84,
        stability: 0.71,
        createdAt: 1712908800000,
        updatedAt: 1712908800000
      },
      sections: new Map([['Key Points', '- Clear search cache after successful memory writes']])
    };

    await writeMemory(merged, { workspaceRoot }, createDbOps());

    expect(writeCacheMocks.clearMemorySearchCache).toHaveBeenCalledWith('ws-1');
  });
});

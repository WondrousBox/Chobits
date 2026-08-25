import { describe, expect, it, vi } from 'vitest';

import { syncSpritePurposeRetrospectiveToMemory, type PurposeDailyRetrospective, type PurposeRetrospectiveMemorySyncDeps } from '../../electron/main/handlers/memory/purpose-retrospective-memory-sync';

function createRetrospective(overrides: Partial<PurposeDailyRetrospective> = {}): PurposeDailyRetrospective {
  return {
    cancelledCount: 0,
    completedCount: 1,
    date: '2026-05-03',
    failedCount: 0,
    generatedAt: 1_777_777_000_000,
    items: [
      {
        completedStepIds: ['accept-drop'],
        durationMs: 4200,
        endedAt: 1_777_777_004_200,
        failedStepIds: [],
        memoryCandidate: true,
        memoryWorthiness: 0.74,
        outcome: 'completed after 4200ms with 3 steps',
        priority: 120,
        purposeId: 'purpose-file-drop',
        purposeKind: 'file.drop.intake',
        recallCue: '- [event] Sprite purpose file.drop.intake completed: accepted files',
        source: 'user-event',
        startedAt: 1_777_777_000_000,
        status: 'completed',
        stepCount: 3,
        summary: 'accepted files'
      }
    ],
    kindCounts: { 'file.drop.intake': 1 },
    memoryCandidateCount: 1,
    recallCues: ['- [event] Sprite purpose file.drop.intake completed: accepted files'],
    terminalPurposeCount: 1,
    totalPurposeCount: 1,
    ...overrides
  };
}

function createDeps(retrospective: PurposeDailyRetrospective, overrides: Partial<PurposeRetrospectiveMemorySyncDeps> = {}): PurposeRetrospectiveMemorySyncDeps {
  return {
    dbOps: {} as PurposeRetrospectiveMemorySyncDeps['dbOps'],
    generateNoteId: vi.fn(() => 'mem-fixed'),
    getExistingNoteByFilePath: vi.fn(async () => undefined),
    getRetrospective: vi.fn(async () => retrospective),
    now: () => 1_777_777_100_000,
    resolveWorkspace: vi.fn(async () => ({ id: 'ws-1', rootPath: 'F:\\Develop\\chobits' })),
    writeMemory: vi.fn(async () => ({
      edgesCreated: 0,
      keywordsCreated: 5,
      notesCreated: 1,
      notesUpdated: 0,
      topicsCreated: 1
    })),
    ...overrides
  };
}

describe('sprite purpose retrospective memory sync', () => {
  it('writes recall cues into a deterministic Memory Note', async () => {
    const retrospective = createRetrospective();
    const deps = createDeps(retrospective);

    const result = await syncSpritePurposeRetrospectiveToMemory({ workspaceId: 'ws-1' }, deps);

    expect(result.ok).toBe(true);
    expect(result.skipped).toBeUndefined();
    expect(result.action).toBe('create');
    expect(result.filePath).toBe('memory/daily/2026/05/2026-05-03-sprite-purpose-retrospective.md');
    expect(deps.getRetrospective).toHaveBeenCalledWith({
      date: undefined,
      limit: 20,
      minMemoryWorthiness: 0.55
    });
    expect(deps.getExistingNoteByFilePath).toHaveBeenCalledWith('memory/daily/2026/05/2026-05-03-sprite-purpose-retrospective.md', 'ws-1');
    expect(deps.writeMemory).toHaveBeenCalledTimes(1);

    const [merged, ctx] = vi.mocked(deps.writeMemory! as any).mock.calls[0];
    expect(ctx).toEqual({ workspaceRoot: 'F:\\Develop\\chobits' });
    expect(merged.noteId).toBe('mem-fixed');
    expect(merged.frontmatter.topics).toEqual(['Sprite Purpose Retrospective']);
    expect(merged.frontmatter.domain).toBe('project:chobits');
    expect(merged.sections.get('Recall Cues')).toBe('- [event] Sprite purpose file.drop.intake completed: accepted files');
    expect(merged.sections.get('Key Points')).toContain('file.drop.intake completed');
  });

  it('updates the existing generated note when the file path is already indexed', async () => {
    const retrospective = createRetrospective();
    const deps = createDeps(retrospective, {
      getExistingNoteByFilePath: vi.fn(async () => ({ createdAt: 111, id: 'mem-existing' })),
      writeMemory: vi.fn(async () => ({
        edgesCreated: 0,
        keywordsCreated: 0,
        notesCreated: 0,
        notesUpdated: 1,
        topicsCreated: 0
      }))
    });

    const result = await syncSpritePurposeRetrospectiveToMemory({ date: '2026-05-03', workspaceId: 'ws-1' }, deps);

    const [merged] = vi.mocked(deps.writeMemory! as any).mock.calls[0];
    expect(result.action).toBe('update');
    expect(result.noteId).toBe('mem-existing');
    expect(merged.action).toBe('update');
    expect(merged.frontmatter.id).toBe('mem-existing');
    expect(merged.frontmatter.createdAt).toBe(111);
    expect(merged.frontmatter.updatedAt).toBe(1_777_777_100_000);
  });

  it('skips cleanly when no sprite purpose is worth long-term memory', async () => {
    const deps = createDeps(
      createRetrospective({
        items: [],
        memoryCandidateCount: 0,
        recallCues: []
      })
    );

    const result = await syncSpritePurposeRetrospectiveToMemory({ workspaceId: 'ws-1' }, deps);

    expect(result).toMatchObject({
      ok: true,
      reason: 'no-memory-candidates',
      skipped: true
    });
    expect(deps.writeMemory).not.toHaveBeenCalled();
  });

  it('skips cleanly when no retrospective provider is registered', async () => {
    const deps = createDeps(createRetrospective(), { getRetrospective: undefined });

    const result = await syncSpritePurposeRetrospectiveToMemory({ workspaceId: 'ws-1' }, deps);

    expect(result).toMatchObject({
      ok: true,
      reason: 'purpose-retrospective-provider-missing',
      skipped: true,
      workspaceId: 'ws-1'
    });
    expect(deps.writeMemory).not.toHaveBeenCalled();
  });
});

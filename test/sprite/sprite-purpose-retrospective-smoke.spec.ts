import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { syncSpritePurposeRetrospectiveToMemory, type PurposeRetrospectiveMemorySyncDeps } from '../../electron/main/handlers/memory/purpose-retrospective-memory-sync';
import { buildSpontaneousPurposeRetrospectiveContext, formatSpontaneousPurposeRetrospectiveContext } from '../../electron/main/handlers/sprite/purpose-retrospective-context';
import { SpritePurposeHistoryStore, type SpritePurposeHistoryEntry } from '../../packages/sprite-core/purpose';

const DATE = '2026-05-03';
const BASE = Date.UTC(2026, 4, 3, 8, 0, 0);

async function append(store: SpritePurposeHistoryStore, entry: SpritePurposeHistoryEntry): Promise<void> {
  await store.append(entry);
}

describe('sprite purpose retrospective cross-layer smoke', () => {
  it('carries meaningful purpose history into Memory Notes and spontaneous utterance context', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'sprite-purpose-smoke-'));
    const store = new SpritePurposeHistoryStore(dataDir);
    try {
      await append(store, {
        timestamp: BASE,
        eventType: 'purpose:created',
        purposeId: 'purpose-file-drop',
        purposeKind: 'file.drop.intake',
        priority: 120,
        source: 'user-event',
        status: 'queued',
        summary: 'Accepted a dropped file and prepared action choices.'
      });
      await append(store, {
        timestamp: BASE + 10,
        eventType: 'purpose:started',
        purposeId: 'purpose-file-drop',
        purposeKind: 'file.drop.intake',
        priority: 120,
        source: 'user-event',
        status: 'active',
        summary: 'Accepted a dropped file and prepared action choices.'
      });
      await append(store, {
        timestamp: BASE + 20,
        eventType: 'step:completed',
        purposeId: 'purpose-file-drop',
        routineId: 'routine-file-drop',
        stepId: 'accept-drop',
        purposeKind: 'file.drop.intake',
        status: 'completed'
      });
      await append(store, {
        timestamp: BASE + 30,
        eventType: 'purpose:completed',
        purposeId: 'purpose-file-drop',
        purposeKind: 'file.drop.intake',
        priority: 120,
        source: 'user-event',
        status: 'completed',
        summary: 'Accepted a dropped file and prepared action choices.',
        contextDigest: { fileCount: 1, fileNames: ['brief.pdf'] },
        result: { durationMs: 30 }
      });

      await append(store, {
        timestamp: BASE + 100,
        eventType: 'purpose:created',
        purposeId: 'purpose-workflow',
        purposeKind: 'workflow.waiting',
        priority: 90,
        source: 'app-event',
        status: 'queued',
        summary: 'Kept the sprite present while OCR finished.'
      });
      await append(store, {
        timestamp: BASE + 110,
        eventType: 'purpose:started',
        purposeId: 'purpose-workflow',
        purposeKind: 'workflow.waiting',
        priority: 90,
        source: 'app-event',
        status: 'active',
        summary: 'Kept the sprite present while OCR finished.'
      });
      await append(store, {
        timestamp: BASE + 120,
        eventType: 'routine:completed',
        purposeId: 'purpose-workflow',
        routineId: 'routine-workflow',
        purposeKind: 'workflow.waiting',
        source: 'preset',
        status: 'completed',
        result: { elapsedMs: 20, stepCount: 2 }
      });
      await append(store, {
        timestamp: BASE + 130,
        eventType: 'purpose:completed',
        purposeId: 'purpose-workflow',
        purposeKind: 'workflow.waiting',
        priority: 90,
        source: 'app-event',
        status: 'completed',
        summary: 'Kept the sprite present while OCR finished.',
        result: { durationMs: 30 }
      });

      await append(store, {
        timestamp: BASE + 140,
        eventType: 'purpose:completed',
        purposeId: 'purpose-idle',
        purposeKind: 'idle.presence',
        priority: 10,
        source: 'behavior',
        status: 'completed',
        summary: 'Quiet idle presence.'
      });

      const retrospective = await store.getDailyRetrospective({
        date: DATE,
        limit: 10,
        minMemoryWorthiness: 0.55
      });

      expect(retrospective).toMatchObject({
        completedCount: 3,
        date: DATE,
        kindCounts: {
          'file.drop.intake': 1,
          'idle.presence': 1,
          'workflow.waiting': 1
        },
        memoryCandidateCount: 2,
        terminalPurposeCount: 3,
        totalPurposeCount: 3
      });
      expect(retrospective.items.map((item) => item.purposeKind)).toEqual(['workflow.waiting', 'file.drop.intake']);

      let mergedNoteSections: Map<string, string> | undefined;
      const deps: PurposeRetrospectiveMemorySyncDeps = {
        dbOps: {} as PurposeRetrospectiveMemorySyncDeps['dbOps'],
        generateNoteId: vi.fn(() => 'mem-purpose-smoke'),
        getExistingNoteByFilePath: vi.fn(async () => undefined),
        getRetrospective: (query) => store.getDailyRetrospective(query),
        now: () => BASE + 1_000,
        resolveWorkspace: vi.fn(async () => ({ id: 'ws-smoke', rootPath: 'F:\\Develop\\chobits' })),
        writeMemory: vi.fn(async (merged) => {
          mergedNoteSections = merged.sections;
          return {
            edgesCreated: 0,
            keywordsCreated: 4,
            notesCreated: 1,
            notesUpdated: 0,
            topicsCreated: 1
          };
        })
      };

      const syncResult = await syncSpritePurposeRetrospectiveToMemory({ date: DATE, workspaceId: 'ws-smoke' }, deps);

      expect(syncResult).toMatchObject({
        action: 'create',
        date: DATE,
        filePath: 'memory/daily/2026/05/2026-05-03-sprite-purpose-retrospective.md',
        memoryCandidateCount: 2,
        ok: true,
        recallCueCount: 2
      });
      expect(mergedNoteSections?.get('Recall Cues')).toContain('Sprite purpose workflow.waiting completed');
      expect(mergedNoteSections?.get('Recall Cues')).toContain('Sprite purpose file.drop.intake completed');
      expect(mergedNoteSections?.get('Recall Cues')).not.toContain('idle.presence');

      const spontaneousContext = buildSpontaneousPurposeRetrospectiveContext(retrospective);
      const promptContext = formatSpontaneousPurposeRetrospectiveContext(spontaneousContext);

      expect(spontaneousContext?.memoryCandidateCount).toBe(2);
      expect(promptContext).toContain('Purpose outcomes: 3 completed, 0 cancelled, 0 failed');
      expect(promptContext).toContain('workflow.waiting completed');
      expect(promptContext).toContain('file.drop.intake completed');
      expect(promptContext).not.toContain('idle.presence');
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});

import { describe, expect, it } from 'vitest';

import { buildSpontaneousPurposeRetrospectiveContext, formatSpontaneousPurposeRetrospectiveContext, type SpontaneousPurposeDailyRetrospective } from '../../electron/main/handlers/sprite/purpose-retrospective-context';

function createRetrospective(): SpontaneousPurposeDailyRetrospective {
  return {
    cancelledCount: 1,
    completedCount: 2,
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
      },
      {
        completedStepIds: [],
        endedAt: 1_777_777_005_000,
        failedStepIds: [],
        memoryCandidate: false,
        memoryWorthiness: 0,
        outcome: 'completed with 0 steps',
        purposeId: 'idle-presence',
        purposeKind: 'idle.presence',
        status: 'completed',
        stepCount: 0
      }
    ],
    kindCounts: { 'file.drop.intake': 1, 'idle.presence': 1 },
    memoryCandidateCount: 1,
    recallCues: ['- [event] Sprite purpose file.drop.intake completed: accepted files'],
    terminalPurposeCount: 2,
    totalPurposeCount: 2
  };
}

describe('spontaneous utterance purpose retrospective context', () => {
  it('formats high-value purpose retrospectives without idle noise', () => {
    const context = buildSpontaneousPurposeRetrospectiveContext(createRetrospective());
    const formatted = formatSpontaneousPurposeRetrospectiveContext(context);

    expect(context?.items).toHaveLength(1);
    expect(formatted).toContain('Purpose outcomes: 2 completed, 1 cancelled, 0 failed');
    expect(formatted).toContain('Sprite purpose file.drop.intake completed');
    expect(formatted).toContain('file.drop.intake completed: accepted files');
    expect(formatted).not.toContain('idle.presence');
  });

  it('returns null when there is no retrospective signal', () => {
    const context = buildSpontaneousPurposeRetrospectiveContext({
      cancelledCount: 0,
      completedCount: 0,
      date: '2026-05-03',
      failedCount: 0,
      generatedAt: 1_777_777_000_000,
      items: [],
      kindCounts: {},
      memoryCandidateCount: 0,
      recallCues: [],
      terminalPurposeCount: 0,
      totalPurposeCount: 0
    });

    expect(context).toBeNull();
    expect(formatSpontaneousPurposeRetrospectiveContext(context)).toContain('No sprite purpose retrospective');
  });

  it('returns null for idle-only retrospective signal', () => {
    const context = buildSpontaneousPurposeRetrospectiveContext({
      cancelledCount: 0,
      completedCount: 1,
      date: '2026-05-03',
      failedCount: 0,
      generatedAt: 1_777_777_000_000,
      items: [
        {
          completedStepIds: [],
          endedAt: 1_777_777_005_000,
          failedStepIds: [],
          memoryCandidate: false,
          memoryWorthiness: 0,
          outcome: 'completed with 0 steps',
          purposeId: 'idle-presence',
          purposeKind: 'idle.presence',
          status: 'completed',
          stepCount: 0
        }
      ],
      kindCounts: { 'idle.presence': 1 },
      memoryCandidateCount: 0,
      recallCues: [],
      terminalPurposeCount: 1,
      totalPurposeCount: 1
    });

    expect(context).toBeNull();
    expect(formatSpontaneousPurposeRetrospectiveContext(context)).toContain('No sprite purpose retrospective');
  });
});

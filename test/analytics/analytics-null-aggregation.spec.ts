import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDBMock, getOrmMock } = vi.hoisted(() => ({
  getDBMock: vi.fn(),
  getOrmMock: vi.fn()
}));

vi.mock('../../electron/main/db/index', () => ({
  getDB: getDBMock,
  getOrm: getOrmMock
}));

import { AnalyticsRepo } from '../../electron/main/db/analytics-repositories';

describe('analytics null aggregation semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOrmMock.mockReturnValue({});
    getDBMock.mockReturnValue({
      prepare: (statement: string) => {
        if (statement.includes('COUNT(*) AS totalEvents')) {
          return {
            get: () => ({
              billingEligibleEvents: 0,
              cancelledEvents: 0,
              completedEvents: 3,
              distinctFeatureCount: 1,
              distinctModelCount: 1,
              distinctProviderCount: 1,
              distinctRequestCount: 2,
              distinctTraceCount: 2,
              estimatedCost: null,
              exactEvents: 1,
              failedEvents: 0,
              firstEventAt: 1000,
              highAccuracyEvents: 1,
              inputTokens: null,
              lastEventAt: 2000,
              lowAccuracyEvents: 0,
              mediumAccuracyEvents: 1,
              outputTokens: null,
              totalEvents: 3,
              totalTokens: null,
              billableTotalTokens: null
            })
          };
        }

        if (statement.includes('GROUP BY bucket')) {
          return {
            all: () => [
              {
                billableTotalTokens: null,
                bucket: '2026-04-15',
                bucketEndAt: 2000,
                bucketStartAt: 1000,
                estimatedCost: null,
                eventCount: 2,
                inputTokens: null,
                outputTokens: null,
                totalTokens: null
              }
            ]
          };
        }

        if (statement.includes('GROUP BY provider_id')) {
          return {
            all: () => [
              {
                billableTotalTokens: null,
                estimatedCost: null,
                eventCount: 2,
                inputTokens: null,
                label: 'openai',
                outputTokens: null,
                totalTokens: null,
                value: 'openai'
              }
            ]
          };
        }

        throw new Error(`Unexpected SQL in test: ${statement}`);
      }
    });
  });

  it('keeps overview token aggregates nullable when all matched rows are unknown', async () => {
    const overview = await AnalyticsRepo.getAiUsageOverview();

    expect(overview.totalEvents).toBe(3);
    expect(overview.distinctRequestCount).toBe(2);
    expect(overview.inputTokens).toBeNull();
    expect(overview.outputTokens).toBeNull();
    expect(overview.totalTokens).toBeNull();
    expect(overview.billableTotalTokens).toBeNull();
    expect(overview.estimatedCost).toBeNull();
  });

  it('keeps timeline and breakdown token aggregates nullable when grouped rows are unknown', async () => {
    const timeline = await AnalyticsRepo.getAiUsageTimeline({}, 'day', 30);
    const breakdown = await AnalyticsRepo.getAiUsageBreakdown({}, 'provider', 10);

    expect(timeline).toEqual([
      expect.objectContaining({
        billableTotalTokens: null,
        estimatedCost: null,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null
      })
    ]);

    expect(breakdown).toEqual([
      expect.objectContaining({
        billableTotalTokens: null,
        estimatedCost: null,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null
      })
    ]);
  });
});

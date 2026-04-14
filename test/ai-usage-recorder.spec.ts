import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AiUsageNumbers, RecordAiUsageEventInput } from '../packages/ai/analytics/types';

const { analyticsRepoMocks } = vi.hoisted(() => ({
  analyticsRepoMocks: {
    findAiUsageEventByFingerprint: vi.fn(),
    findAiUsageEventByProviderRequestId: vi.fn(),
    insertAiUsageEvent: vi.fn()
  }
}));

vi.mock('../electron/main/db/analytics-repositories', () => ({
  AnalyticsRepo: analyticsRepoMocks
}));

import { recordAiUsageEvent } from '../electron/main/handlers/analytics/usage-recorder';

function createUsageInput(usage: AiUsageNumbers, rawUsage: Record<string, unknown>): RecordAiUsageEventInput {
  return {
    meteringSource: 'provider_reported',
    model: 'glm-4.5-air',
    operationKey: 'reply',
    providerId: 'zai',
    rawUsage,
    requestId: 'req-1',
    sourceId: 'conv-1',
    sourceType: 'chat',
    status: 'completed',
    traceId: 'trace-1',
    usage,
    usageCategory: 'conversation',
    usageFeature: 'chat',
    usageStage: 'generate'
  };
}

describe('ai usage recorder billing eligibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    analyticsRepoMocks.findAiUsageEventByFingerprint.mockResolvedValue(undefined);
    analyticsRepoMocks.findAiUsageEventByProviderRequestId.mockResolvedValue(undefined);
    analyticsRepoMocks.insertAiUsageEvent.mockImplementation(async (row: any) => ({
      id: 'usage-1',
      ...row
    }));
  });

  it('does not auto-mark zero-cost provider usage as billing eligible', async () => {
    const result = await recordAiUsageEvent(
      createUsageInput(
        {
          estimatedCost: 0,
          inputTokens: 12,
          outputTokens: 8,
          totalTokens: 20
        },
        {
          completion_tokens: 8,
          prompt_tokens: 12,
          total_tokens: 20
        }
      )
    );

    expect(result.ok).toBe(true);
    expect(analyticsRepoMocks.insertAiUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        billingEligible: 0,
        estimatedCost: 0
      })
    );
  });

  it('still auto-marks positive estimated cost as billing eligible', async () => {
    const result = await recordAiUsageEvent(
      createUsageInput(
        {
          estimatedCost: 0.018,
          inputTokens: 12,
          outputTokens: 8,
          totalTokens: 20
        },
        {
          completion_tokens: 8,
          prompt_tokens: 12,
          total_cost: 0.018,
          total_tokens: 20
        }
      )
    );

    expect(result.ok).toBe(true);
    expect(analyticsRepoMocks.insertAiUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        billingEligible: 1,
        estimatedCost: 0.018
      })
    );
  });
});

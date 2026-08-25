import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RecordAiUsageEventInput } from '../../packages/ai/analytics/types';

const { analyticsRepoMocks, recordAiUsageEventMock } = vi.hoisted(() => ({
  analyticsRepoMocks: {
    deleteProcessedAiUsageOutboxBefore: vi.fn(),
    findAiUsageEventOutboxByFingerprint: vi.fn(),
    insertAiUsageEventOutbox: vi.fn(),
    listPendingAiUsageEventOutbox: vi.fn(),
    markAiUsageEventOutboxFailed: vi.fn(),
    markAiUsageEventOutboxPendingRetry: vi.fn(),
    markAiUsageEventOutboxProcessed: vi.fn(),
    retryFailedAiUsageOutboxEvents: vi.fn()
  },
  recordAiUsageEventMock: vi.fn()
}));

vi.mock('../../electron/main/db/analytics-repositories', () => ({
  AnalyticsRepo: analyticsRepoMocks
}));

vi.mock('../../electron/main/handlers/analytics/usage-recorder', () => ({
  recordAiUsageEvent: recordAiUsageEventMock
}));

function createUsageInput(): RecordAiUsageEventInput {
  return {
    attemptIndex: 0,
    meteringSource: 'provider_reported' as const,
    model: 'gpt-4.1-mini',
    operationKey: 'reply',
    providerId: 'openai',
    requestId: 'req-1',
    sourceId: 'conv-1',
    sourceLabel: '聊天',
    sourceType: 'chat' as const,
    status: 'completed' as const,
    traceId: 'trace-1',
    usageCategory: 'conversation' as const,
    usageFeature: 'chat' as const,
    usageStage: 'generate' as const
  };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

describe('ai usage outbox recovery flow', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    analyticsRepoMocks.findAiUsageEventOutboxByFingerprint.mockResolvedValue(undefined);
    analyticsRepoMocks.insertAiUsageEventOutbox.mockResolvedValue(undefined);
    analyticsRepoMocks.listPendingAiUsageEventOutbox.mockResolvedValue([]);
    analyticsRepoMocks.deleteProcessedAiUsageOutboxBefore.mockResolvedValue(0);
    analyticsRepoMocks.markAiUsageEventOutboxFailed.mockResolvedValue(undefined);
    analyticsRepoMocks.markAiUsageEventOutboxPendingRetry.mockResolvedValue(undefined);
    analyticsRepoMocks.markAiUsageEventOutboxProcessed.mockResolvedValue(undefined);
    analyticsRepoMocks.retryFailedAiUsageOutboxEvents.mockResolvedValue(0);

    recordAiUsageEventMock.mockResolvedValue({
      dedupeStrategy: 'none',
      deduped: false,
      eventId: 'usage-1',
      ok: true,
      row: { id: 'usage-1' },
      warnings: []
    });

    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('writes emitted usage events into outbox and auto-drains them', async () => {
    const usageInput = createUsageInput();

    let insertedOutboxRow: any;
    analyticsRepoMocks.insertAiUsageEventOutbox.mockImplementation(async (row: any) => {
      insertedOutboxRow = {
        id: 'outbox-1',
        ...row
      };
      return insertedOutboxRow;
    });
    analyticsRepoMocks.listPendingAiUsageEventOutbox.mockImplementation(async () => {
      return insertedOutboxRow ? [insertedOutboxRow] : [];
    });

    const { initAiUsageAnalyticsListener } = await import('../../electron/main/handlers/analytics/usage-event-listener');
    const { emitAiUsageObservedEvent } = await import('../../packages/ai/analytics/events');

    initAiUsageAnalyticsListener();
    await flushAsyncWork();

    await emitAiUsageObservedEvent(usageInput, { producer: 'ChatService' });
    await flushAsyncWork();

    expect(analyticsRepoMocks.insertAiUsageEventOutbox).toHaveBeenCalledTimes(1);
    expect(analyticsRepoMocks.insertAiUsageEventOutbox).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'ai.usage.observed',
        operationKey: 'reply',
        producer: 'ChatService',
        providerId: 'openai',
        requestId: 'req-1',
        sourceId: 'conv-1',
        sourceType: 'chat',
        status: 'pending',
        traceId: 'trace-1',
        usageFeature: 'chat',
        usageStage: 'generate'
      })
    );
    expect(recordAiUsageEventMock).toHaveBeenCalledWith(usageInput);
    expect(analyticsRepoMocks.markAiUsageEventOutboxProcessed).toHaveBeenCalledWith('outbox-1');
    expect(analyticsRepoMocks.markAiUsageEventOutboxFailed).not.toHaveBeenCalled();
    expect(analyticsRepoMocks.markAiUsageEventOutboxPendingRetry).not.toHaveBeenCalled();
  });

  it('supports manually draining pending outbox rows', async () => {
    const usageInput = createUsageInput();
    const { AI_USAGE_OBSERVED_EVENT } = await import('../../packages/ai/analytics/events');
    const { buildAiUsageEventFingerprint } = await import('../../packages/ai/analytics/fingerprint');

    const pendingRow = {
      attemptCount: 1,
      createdAt: 100,
      emittedAt: 90,
      eventFingerprint: buildAiUsageEventFingerprint(usageInput),
      eventType: AI_USAGE_OBSERVED_EVENT,
      id: 'outbox-pending-1',
      lastAttemptAt: 80,
      lastError: 'temporary timeout',
      model: usageInput.model,
      operationKey: usageInput.operationKey,
      payload: {
        emittedAt: 90,
        eventFingerprint: buildAiUsageEventFingerprint(usageInput),
        input: usageInput,
        producer: 'PendingProducer',
        type: AI_USAGE_OBSERVED_EVENT
      },
      processedAt: null,
      producer: 'PendingProducer',
      providerId: usageInput.providerId,
      requestId: usageInput.requestId,
      sourceId: usageInput.sourceId,
      sourceType: usageInput.sourceType,
      status: 'pending',
      traceId: usageInput.traceId,
      updatedAt: 100,
      usageFeature: usageInput.usageFeature,
      usageStage: usageInput.usageStage
    };

    let shouldExposePending = false;
    analyticsRepoMocks.listPendingAiUsageEventOutbox.mockImplementation(async () => (shouldExposePending ? [pendingRow] : []));

    const { initAiUsageAnalyticsListener, triggerAiUsageOutboxDrain } = await import('../../electron/main/handlers/analytics/usage-event-listener');

    initAiUsageAnalyticsListener();
    await flushAsyncWork();

    shouldExposePending = true;
    triggerAiUsageOutboxDrain();
    await flushAsyncWork();

    expect(recordAiUsageEventMock).toHaveBeenCalledWith(usageInput);
    expect(analyticsRepoMocks.markAiUsageEventOutboxProcessed).toHaveBeenCalledWith('outbox-pending-1');
  });

  it('retries failed outbox rows and schedules them for re-processing', async () => {
    const usageInput = createUsageInput();
    const { AI_USAGE_OBSERVED_EVENT } = await import('../../packages/ai/analytics/events');
    const { buildAiUsageEventFingerprint } = await import('../../packages/ai/analytics/fingerprint');

    const failedRow = {
      attemptCount: 2,
      createdAt: 200,
      emittedAt: 180,
      eventFingerprint: buildAiUsageEventFingerprint(usageInput),
      eventType: AI_USAGE_OBSERVED_EVENT,
      id: 'outbox-failed-1',
      lastAttemptAt: 190,
      lastError: 'non-retryable before manual retry',
      model: usageInput.model,
      operationKey: usageInput.operationKey,
      payload: {
        emittedAt: 180,
        eventFingerprint: buildAiUsageEventFingerprint(usageInput),
        input: usageInput,
        producer: 'RetryProducer',
        type: AI_USAGE_OBSERVED_EVENT
      },
      processedAt: null,
      producer: 'RetryProducer',
      providerId: usageInput.providerId,
      requestId: usageInput.requestId,
      sourceId: usageInput.sourceId,
      sourceType: usageInput.sourceType,
      status: 'failed',
      traceId: usageInput.traceId,
      updatedAt: 200,
      usageFeature: usageInput.usageFeature,
      usageStage: usageInput.usageStage
    };

    let shouldExposePending = false;
    analyticsRepoMocks.listPendingAiUsageEventOutbox.mockImplementation(async () => (shouldExposePending ? [failedRow] : []));
    analyticsRepoMocks.retryFailedAiUsageOutboxEvents.mockImplementation(async () => {
      shouldExposePending = true;
      return 1;
    });

    const { initAiUsageAnalyticsListener, retryFailedAiUsageOutboxEvents } = await import('../../electron/main/handlers/analytics/usage-event-listener');

    initAiUsageAnalyticsListener();
    await flushAsyncWork();

    const retried = await retryFailedAiUsageOutboxEvents(25);
    await flushAsyncWork();

    expect(retried).toBe(1);
    expect(analyticsRepoMocks.retryFailedAiUsageOutboxEvents).toHaveBeenCalledWith(25);
    expect(recordAiUsageEventMock).toHaveBeenCalledWith(usageInput);
    expect(analyticsRepoMocks.markAiUsageEventOutboxProcessed).toHaveBeenCalledWith('outbox-failed-1');
  });
});

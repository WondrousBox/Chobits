import { AI_USAGE_OBSERVED_EVENT, type AiUsageObservedEvent, registerAiUsageObservedEventWriter } from '../../../../packages/ai/analytics/events';
import { AnalyticsRepo } from '../../db/analytics-repositories';
import type { AiUsageEventOutboxRow, NewAiUsageEventOutbox } from '../../db/schema';
import { recordAiUsageEvent } from './usage-recorder';

const TAG = '[analytics][usage-event-listener]';
const OUTBOX_DRAIN_BATCH_SIZE = 100;

let stopWriting: (() => void) | undefined;
let drainInFlight: Promise<void> | undefined;
let drainRequested = false;

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isAiUsageObservedEventPayload(payload: unknown): payload is AiUsageObservedEvent {
  if (!isRecord(payload)) {
    return false;
  }

  return payload.type === AI_USAGE_OBSERVED_EVENT && typeof payload.emittedAt === 'number' && typeof payload.eventFingerprint === 'string' && isRecord(payload.input);
}

async function appendAiUsageEventToOutbox(event: AiUsageObservedEvent): Promise<void> {
  const rowToInsert: NewAiUsageEventOutbox = {
    attemptCount: 0,
    attemptIndex: event.input.attemptIndex ?? 0,
    emittedAt: event.emittedAt,
    eventFingerprint: event.eventFingerprint,
    eventType: event.type,
    lastAttemptAt: null,
    lastError: null,
    model: event.input.model,
    operationKey: event.input.operationKey,
    payload: event,
    processedAt: null,
    producer: event.producer ?? null,
    providerId: event.input.providerId,
    requestId: event.input.requestId,
    sourceId: event.input.sourceId,
    sourceType: event.input.sourceType,
    status: 'pending',
    traceId: event.input.traceId,
    updatedAt: event.emittedAt,
    usageFeature: event.input.usageFeature,
    usageStage: event.input.usageStage
  };

  try {
    await AnalyticsRepo.insertAiUsageEventOutbox(rowToInsert);
  } catch (error) {
    const existing = await AnalyticsRepo.findAiUsageEventOutboxByFingerprint(event.type, event.eventFingerprint);
    if (existing) {
      return;
    }
    throw error;
  }
}

async function processOutboxEntry(entry: AiUsageEventOutboxRow): Promise<void> {
  if (!isAiUsageObservedEventPayload(entry.payload)) {
    await AnalyticsRepo.markAiUsageEventOutboxFailed(entry.id, 'Outbox payload is not a valid ai usage observed event.');
    console.warn(`${TAG} Invalid outbox payload skipped:`, {
      outboxId: entry.id,
      eventFingerprint: entry.eventFingerprint
    });
    return;
  }

  if (entry.payload.eventFingerprint !== entry.eventFingerprint) {
    await AnalyticsRepo.markAiUsageEventOutboxFailed(entry.id, 'Outbox fingerprint does not match payload fingerprint.');
    console.warn(`${TAG} Outbox fingerprint mismatch:`, {
      outboxId: entry.id,
      eventFingerprint: entry.eventFingerprint,
      payloadFingerprint: entry.payload.eventFingerprint
    });
    return;
  }

  try {
    const result = await recordAiUsageEvent(entry.payload.input);
    if (!result.ok) {
      const logPayload = {
        code: result.code,
        message: result.message,
        outboxId: entry.id,
        producer: entry.producer,
        requestId: entry.requestId,
        retryable: result.retryable,
        warnings: result.warnings
      };

      if (result.retryable) {
        await AnalyticsRepo.markAiUsageEventOutboxPendingRetry(entry.id, `${result.code}: ${result.message}`);
        console.warn(`${TAG} Retryable outbox processing failure:`, logPayload);
        return;
      }

      await AnalyticsRepo.markAiUsageEventOutboxFailed(entry.id, `${result.code}: ${result.message}`);
      console.warn(`${TAG} Non-retryable outbox processing failure:`, logPayload);
      return;
    }

    await AnalyticsRepo.markAiUsageEventOutboxProcessed(entry.id);

    if (result.warnings?.length) {
      console.warn(`${TAG} AI usage event processed with warnings:`, {
        eventId: result.eventId,
        outboxId: entry.id,
        producer: entry.producer,
        requestId: entry.requestId,
        warnings: result.warnings
      });
    }
  } catch (error) {
    await AnalyticsRepo.markAiUsageEventOutboxPendingRetry(entry.id, formatError(error));
    console.warn(`${TAG} Unexpected outbox processing error:`, {
      error,
      outboxId: entry.id,
      producer: entry.producer,
      requestId: entry.requestId
    });
  }
}

async function drainAiUsageEventOutbox(): Promise<void> {
  const drainStartedAt = Date.now();

  while (true) {
    const pendingEntries = await AnalyticsRepo.listPendingAiUsageEventOutbox(OUTBOX_DRAIN_BATCH_SIZE, drainStartedAt);
    if (!pendingEntries.length) {
      return;
    }

    for (const entry of pendingEntries) {
      await processOutboxEntry(entry);
    }

    if (pendingEntries.length < OUTBOX_DRAIN_BATCH_SIZE) {
      return;
    }
  }
}

function scheduleOutboxDrain(): void {
  if (drainInFlight) {
    drainRequested = true;
    return;
  }

  drainInFlight = (async () => {
    try {
      await drainAiUsageEventOutbox();
    } catch (error) {
      console.warn(`${TAG} Outbox drain crashed:`, error);
    }
  })().finally(() => {
    drainInFlight = undefined;
    if (drainRequested) {
      drainRequested = false;
      scheduleOutboxDrain();
    }
  });
}

export function triggerAiUsageOutboxDrain(): void {
  scheduleOutboxDrain();
}

export async function retryFailedAiUsageOutboxEvents(limit = 50): Promise<number> {
  const resetCount = await AnalyticsRepo.retryFailedAiUsageOutboxEvents(limit);
  if (resetCount > 0) {
    scheduleOutboxDrain();
  }
  return resetCount;
}

export function initAiUsageAnalyticsListener(): void {
  if (stopWriting) {
    return;
  }

  stopWriting = registerAiUsageObservedEventWriter(async (event) => {
    await appendAiUsageEventToOutbox(event);
    scheduleOutboxDrain();
  });

  scheduleOutboxDrain();
}

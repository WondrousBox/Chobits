import { createHash } from 'node:crypto';

import {
  AI_METERING_SOURCE_ALLOWED_ACCURACIES,
  AI_USAGE_CATEGORIES,
  AI_USAGE_FEATURE_ALLOWED_STAGES,
  AI_USAGE_FEATURES,
  AI_USAGE_SOURCE_TYPES,
  AI_USAGE_STAGES,
  AI_USAGE_STATUSES,
  type AiMeteringAccuracy,
  type AiMeteringSource,
  type AiUsageCategory,
  type AiUsageFeature,
  type AiUsageNumbers,
  type AiUsageSourceType,
  type AiUsageStage,
  type RecordAiUsageEventInput
} from '../../../../packages/ai/analytics/types';
import { AnalyticsRepo } from '../../db/analytics-repositories';
import type { AiUsageEventRow, NewAiUsageEvent } from '../../db/schema';

const TAG = '[analytics][usage-recorder]';

type NormalizedAiUsageNumbers = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  reasoningTokens: number | null;
  billableInputTokens: number | null;
  billableOutputTokens: number | null;
  billableTotalTokens: number | null;
  estimatedCost: number | null;
};

export type RecordAiUsageEventResult =
  | {
      ok: true;
      eventId: string;
      deduped: boolean;
      dedupeStrategy: 'provider_request_id' | 'fingerprint' | 'none';
      row: AiUsageEventRow;
      warnings?: string[];
    }
  | {
      ok: false;
      code: 'invalid_input' | 'invalid_metering_combination' | 'db_insert_failed' | 'db_lookup_failed';
      message: string;
      retryable: boolean;
      warnings?: string[];
    };

function fail(code: Extract<RecordAiUsageEventResult, { ok: false }>['code'], message: string, retryable: boolean, warnings?: string[]): RecordAiUsageEventResult {
  return {
    ok: false,
    code,
    message,
    retryable,
    ...(warnings?.length ? { warnings } : {})
  };
}

function trimOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function requireString(value: unknown): string | undefined {
  const normalized = trimOptionalString(value);
  if (!normalized) return undefined;
  return normalized;
}

function normalizeNullableInteger(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) return undefined;
  return value;
}

function normalizeNullableNumber(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return value;
}

function hasUsageEvidence(usage: NormalizedAiUsageNumbers, rawUsage: unknown): boolean {
  if (rawUsage !== undefined && rawUsage !== null) return true;
  return (
    usage.inputTokens !== null ||
    usage.outputTokens !== null ||
    usage.totalTokens !== null ||
    usage.cacheReadTokens !== null ||
    usage.cacheWriteTokens !== null ||
    usage.reasoningTokens !== null ||
    usage.billableInputTokens !== null ||
    usage.billableOutputTokens !== null ||
    usage.billableTotalTokens !== null ||
    usage.estimatedCost !== null
  );
}

function sumKnownIntegers(values: Array<number | null>): number | null {
  let total = 0;
  let hasValue = false;

  for (const value of values) {
    if (value === null) continue;
    total += value;
    hasValue = true;
  }

  return hasValue ? total : null;
}

export function computeDisplayTokens(
  usage: Pick<NormalizedAiUsageNumbers, 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens' | 'reasoningTokens' | 'totalTokens'>
): number | null {
  if (usage.totalTokens !== null) {
    return usage.totalTokens;
  }

  return sumKnownIntegers([usage.inputTokens, usage.outputTokens, usage.cacheReadTokens, usage.cacheWriteTokens, usage.reasoningTokens]);
}

export function computeBillableTokens(usage: Pick<NormalizedAiUsageNumbers, 'billableInputTokens' | 'billableOutputTokens' | 'billableTotalTokens'>): number | null {
  if (usage.billableTotalTokens !== null) {
    return usage.billableTotalTokens;
  }

  return sumKnownIntegers([usage.billableInputTokens, usage.billableOutputTokens]);
}

export function normalizeProviderUsage(usage: AiUsageNumbers | null | undefined): { ok: true; usage: NormalizedAiUsageNumbers } | { ok: false; message: string } {
  const inputTokens = normalizeNullableInteger(usage?.inputTokens);
  if (inputTokens === undefined) return { ok: false, message: 'usage.inputTokens must be a non-negative integer or null.' };

  const outputTokens = normalizeNullableInteger(usage?.outputTokens);
  if (outputTokens === undefined) return { ok: false, message: 'usage.outputTokens must be a non-negative integer or null.' };

  const totalTokens = normalizeNullableInteger(usage?.totalTokens);
  if (totalTokens === undefined) return { ok: false, message: 'usage.totalTokens must be a non-negative integer or null.' };

  const cacheReadTokens = normalizeNullableInteger(usage?.cacheReadTokens);
  if (cacheReadTokens === undefined) return { ok: false, message: 'usage.cacheReadTokens must be a non-negative integer or null.' };

  const cacheWriteTokens = normalizeNullableInteger(usage?.cacheWriteTokens);
  if (cacheWriteTokens === undefined) return { ok: false, message: 'usage.cacheWriteTokens must be a non-negative integer or null.' };

  const reasoningTokens = normalizeNullableInteger(usage?.reasoningTokens);
  if (reasoningTokens === undefined) return { ok: false, message: 'usage.reasoningTokens must be a non-negative integer or null.' };

  const billableInputTokens = normalizeNullableInteger(usage?.billableInputTokens);
  if (billableInputTokens === undefined) return { ok: false, message: 'usage.billableInputTokens must be a non-negative integer or null.' };

  const billableOutputTokens = normalizeNullableInteger(usage?.billableOutputTokens);
  if (billableOutputTokens === undefined) return { ok: false, message: 'usage.billableOutputTokens must be a non-negative integer or null.' };

  const billableTotalTokens = normalizeNullableInteger(usage?.billableTotalTokens);
  if (billableTotalTokens === undefined) return { ok: false, message: 'usage.billableTotalTokens must be a non-negative integer or null.' };

  const estimatedCost = normalizeNullableNumber(usage?.estimatedCost);
  if (estimatedCost === undefined) return { ok: false, message: 'usage.estimatedCost must be a non-negative number or null.' };

  const normalized: NormalizedAiUsageNumbers = {
    inputTokens,
    outputTokens,
    totalTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens,
    billableInputTokens,
    billableOutputTokens,
    billableTotalTokens,
    estimatedCost
  };

  return {
    ok: true,
    usage: {
      ...normalized,
      totalTokens: computeDisplayTokens(normalized),
      billableTotalTokens: computeBillableTokens(normalized)
    }
  };
}

export function resolveMeteringAccuracy(input: { meteringSource: AiMeteringSource; usage: NormalizedAiUsageNumbers; rawUsage: unknown; meteringAccuracy?: AiMeteringAccuracy }): AiMeteringAccuracy {
  if (input.meteringAccuracy) {
    return input.meteringAccuracy;
  }

  switch (input.meteringSource) {
    case 'provider_reported':
      return hasUsageEvidence(input.usage, input.rawUsage) ? 'exact' : 'high';
    case 'message_backfilled':
      return 'medium';
    case 'reconstructed':
      return hasUsageEvidence(input.usage, input.rawUsage) ? 'high' : 'medium';
    case 'estimated':
      return 'low';
    default:
      return 'low';
  }
}

export function shouldMarkBillingEligible(input: {
  billingEligible?: boolean;
  meteringSource: AiMeteringSource;
  meteringAccuracy: AiMeteringAccuracy;
  providerId: string;
  model: string;
  rawUsage: unknown;
  usage: NormalizedAiUsageNumbers;
}): boolean {
  if (typeof input.billingEligible === 'boolean') {
    return input.billingEligible;
  }

  return (
    input.meteringSource === 'provider_reported' &&
    input.meteringAccuracy === 'exact' &&
    !!input.providerId &&
    !!input.model &&
    input.rawUsage !== undefined &&
    input.rawUsage !== null &&
    (input.usage.billableInputTokens !== null || input.usage.billableOutputTokens !== null || input.usage.billableTotalTokens !== null || input.usage.estimatedCost !== null)
  );
}

export function buildAiUsageFingerprint(
  input: Pick<RecordAiUsageEventInput, 'traceId' | 'requestId' | 'sourceType' | 'sourceId' | 'usageFeature' | 'usageStage' | 'operationKey' | 'attemptIndex' | 'providerId' | 'model'>
): string {
  const payload = JSON.stringify({
    attemptIndex: input.attemptIndex ?? 0,
    model: input.model,
    operationKey: input.operationKey,
    providerId: input.providerId,
    requestId: input.requestId,
    sourceId: input.sourceId,
    sourceType: input.sourceType,
    traceId: input.traceId,
    usageFeature: input.usageFeature,
    usageStage: input.usageStage
  });

  return createHash('sha256').update(payload).digest('hex');
}

export async function recordAiUsageEvent(input: RecordAiUsageEventInput): Promise<RecordAiUsageEventResult> {
  const warnings: string[] = [];

  const traceId = requireString(input.traceId);
  if (!traceId) return fail('invalid_input', 'traceId is required.', false);

  const requestId = requireString(input.requestId);
  if (!requestId) return fail('invalid_input', 'requestId is required.', false);

  const operationKey = requireString(input.operationKey);
  if (!operationKey) return fail('invalid_input', 'operationKey is required.', false);

  const sourceId = requireString(input.sourceId);
  if (!sourceId) return fail('invalid_input', 'sourceId is required.', false);

  const providerId = requireString(input.providerId);
  if (!providerId) return fail('invalid_input', 'providerId is required.', false);

  const model = requireString(input.model);
  if (!model) return fail('invalid_input', 'model is required.', false);

  const sourceType = requireString(input.sourceType);
  if (!sourceType || !AI_USAGE_SOURCE_TYPES.includes(sourceType as AiUsageSourceType)) {
    return fail('invalid_input', 'sourceType is invalid.', false);
  }
  const normalizedSourceType = sourceType as AiUsageSourceType;

  const usageCategory = requireString(input.usageCategory);
  if (!usageCategory || !AI_USAGE_CATEGORIES.includes(usageCategory as AiUsageCategory)) {
    return fail('invalid_input', 'usageCategory is invalid.', false);
  }
  const normalizedUsageCategory = usageCategory as AiUsageCategory;

  const usageFeature = requireString(input.usageFeature);
  if (!usageFeature || !AI_USAGE_FEATURES.includes(usageFeature as AiUsageFeature)) {
    return fail('invalid_input', 'usageFeature is invalid.', false);
  }
  const normalizedUsageFeature = usageFeature as AiUsageFeature;

  const usageStage = requireString(input.usageStage);
  if (!usageStage || !AI_USAGE_STAGES.includes(usageStage as AiUsageStage)) {
    return fail('invalid_input', 'usageStage is invalid.', false);
  }
  const normalizedUsageStage = usageStage as AiUsageStage;

  const allowedStages = AI_USAGE_FEATURE_ALLOWED_STAGES[normalizedUsageFeature];
  if (!allowedStages.includes(normalizedUsageStage)) {
    return fail('invalid_input', `usageStage "${usageStage}" is not allowed for feature "${usageFeature}".`, false);
  }

  const status = requireString(input.status);
  if (!status || !AI_USAGE_STATUSES.includes(status as (typeof AI_USAGE_STATUSES)[number])) {
    return fail('invalid_input', 'status is invalid.', false);
  }
  const normalizedStatus = status as (typeof AI_USAGE_STATUSES)[number];

  const meteringSource = requireString(input.meteringSource);
  if (!meteringSource || !(meteringSource in AI_METERING_SOURCE_ALLOWED_ACCURACIES)) {
    return fail('invalid_input', 'meteringSource is invalid.', false);
  }
  const normalizedMeteringSource = meteringSource as AiMeteringSource;

  const attemptIndex = input.attemptIndex ?? 0;
  if (!Number.isInteger(attemptIndex) || attemptIndex < 0) {
    return fail('invalid_input', 'attemptIndex must be an integer >= 0.', false);
  }

  const startedAt = normalizeNullableInteger(input.startedAt);
  if (startedAt === undefined) {
    return fail('invalid_input', 'startedAt must be a non-negative integer timestamp.', false);
  }

  const completedAt = normalizeNullableInteger(input.completedAt);
  if (completedAt === undefined) {
    return fail('invalid_input', 'completedAt must be a non-negative integer timestamp.', false);
  }

  if (startedAt !== null && completedAt !== null && completedAt < startedAt) {
    warnings.push('completedAt is earlier than startedAt.');
  }

  if (input.metadata !== undefined && (!input.metadata || typeof input.metadata !== 'object' || Array.isArray(input.metadata))) {
    return fail('invalid_input', 'metadata must be a plain object when provided.', false);
  }

  const normalizedUsageResult = normalizeProviderUsage(input.usage);
  if (!normalizedUsageResult.ok) {
    return fail('invalid_input', normalizedUsageResult.message, false, warnings);
  }

  const rawUsage = input.rawUsage ?? null;
  const meteringAccuracy = resolveMeteringAccuracy({
    meteringSource: normalizedMeteringSource,
    meteringAccuracy: trimOptionalString(input.meteringAccuracy) as AiMeteringAccuracy | undefined,
    rawUsage,
    usage: normalizedUsageResult.usage
  });

  const allowedAccuracies = AI_METERING_SOURCE_ALLOWED_ACCURACIES[normalizedMeteringSource];
  if (!allowedAccuracies.includes(meteringAccuracy)) {
    return fail('invalid_metering_combination', `meteringAccuracy "${meteringAccuracy}" is not allowed for source "${meteringSource}".`, false, warnings);
  }

  const billingEligible = shouldMarkBillingEligible({
    billingEligible: input.billingEligible,
    meteringSource: normalizedMeteringSource,
    meteringAccuracy,
    providerId,
    model,
    rawUsage,
    usage: normalizedUsageResult.usage
  });

  if (billingEligible && (meteringSource === 'estimated' || meteringSource === 'message_backfilled')) {
    return fail('invalid_metering_combination', 'estimated or message_backfilled events cannot be billing eligible.', false, warnings);
  }

  if (billingEligible && meteringAccuracy !== 'exact') {
    return fail('invalid_metering_combination', 'billingEligible requires exact metering accuracy.', false, warnings);
  }

  if (billingEligible && rawUsage === null) {
    return fail('invalid_metering_combination', 'billingEligible requires rawUsage for traceability.', false, warnings);
  }

  const workspaceId = trimOptionalString(input.workspaceId) ?? null;
  const parentEventId = trimOptionalString(input.parentEventId) ?? null;
  const providerRequestId = trimOptionalString(input.providerRequestId) ?? null;
  const conversationId = trimOptionalString(input.conversationId) ?? null;
  const resourceId = trimOptionalString(input.resourceId) ?? null;
  const sourceLabel = trimOptionalString(input.sourceLabel) ?? null;
  const providerPresetId = trimOptionalString(input.providerPresetId) ?? null;
  const agentId = trimOptionalString(input.agentId) ?? null;

  const eventFingerprint = buildAiUsageFingerprint({
    attemptIndex,
    model,
    operationKey,
    providerId,
    requestId,
    sourceId,
    sourceType: normalizedSourceType,
    traceId,
    usageFeature: normalizedUsageFeature,
    usageStage: normalizedUsageStage
  });

  try {
    if (providerRequestId) {
      const existingByProviderRequestId = await AnalyticsRepo.findAiUsageEventByProviderRequestId(providerId, providerRequestId);
      if (existingByProviderRequestId) {
        return {
          ok: true,
          eventId: existingByProviderRequestId.id,
          deduped: true,
          dedupeStrategy: 'provider_request_id',
          row: existingByProviderRequestId,
          ...(warnings.length ? { warnings } : {})
        };
      }
    }

    const existingByFingerprint = await AnalyticsRepo.findAiUsageEventByFingerprint(eventFingerprint);
    if (existingByFingerprint) {
      return {
        ok: true,
        eventId: existingByFingerprint.id,
        deduped: true,
        dedupeStrategy: 'fingerprint',
        row: existingByFingerprint,
        ...(warnings.length ? { warnings } : {})
      };
    }
  } catch (error) {
    console.warn(`${TAG} lookup failed`, error);
    return fail('db_lookup_failed', error instanceof Error ? error.message : String(error), true, warnings);
  }

  const rowToInsert: NewAiUsageEvent = {
    workspaceId,
    traceId,
    parentEventId,
    requestId,
    providerRequestId,
    eventFingerprint,
    operationKey,
    attemptIndex,
    conversationId,
    resourceId,
    sourceType: normalizedSourceType,
    sourceId,
    sourceLabel,
    usageCategory: normalizedUsageCategory,
    usageFeature: normalizedUsageFeature,
    usageStage: normalizedUsageStage,
    providerId,
    providerPresetId,
    model,
    agentId,
    status: normalizedStatus,
    inputTokens: normalizedUsageResult.usage.inputTokens,
    outputTokens: normalizedUsageResult.usage.outputTokens,
    cacheReadTokens: normalizedUsageResult.usage.cacheReadTokens,
    cacheWriteTokens: normalizedUsageResult.usage.cacheWriteTokens,
    reasoningTokens: normalizedUsageResult.usage.reasoningTokens,
    totalTokens: normalizedUsageResult.usage.totalTokens,
    billableInputTokens: normalizedUsageResult.usage.billableInputTokens,
    billableOutputTokens: normalizedUsageResult.usage.billableOutputTokens,
    billableTotalTokens: normalizedUsageResult.usage.billableTotalTokens,
    estimatedCost: normalizedUsageResult.usage.estimatedCost,
    meteringSource: normalizedMeteringSource,
    meteringAccuracy,
    billingEligible: billingEligible ? 1 : 0,
    startedAt,
    completedAt,
    metadata: input.metadata ?? null,
    rawUsage
  };

  try {
    const inserted = await AnalyticsRepo.insertAiUsageEvent(rowToInsert);
    if (!inserted) {
      return fail('db_insert_failed', 'Database insert returned no row.', true, warnings);
    }

    return {
      ok: true,
      eventId: inserted.id,
      deduped: false,
      dedupeStrategy: 'none',
      row: inserted,
      ...(warnings.length ? { warnings } : {})
    };
  } catch (error) {
    console.warn(`${TAG} insert failed`, error);

    try {
      if (providerRequestId) {
        const existingByProviderRequestId = await AnalyticsRepo.findAiUsageEventByProviderRequestId(providerId, providerRequestId);
        if (existingByProviderRequestId) {
          return {
            ok: true,
            eventId: existingByProviderRequestId.id,
            deduped: true,
            dedupeStrategy: 'provider_request_id',
            row: existingByProviderRequestId,
            ...(warnings.length ? { warnings } : {})
          };
        }
      }

      const existingByFingerprint = await AnalyticsRepo.findAiUsageEventByFingerprint(eventFingerprint);
      if (existingByFingerprint) {
        return {
          ok: true,
          eventId: existingByFingerprint.id,
          deduped: true,
          dedupeStrategy: 'fingerprint',
          row: existingByFingerprint,
          ...(warnings.length ? { warnings } : {})
        };
      }
    } catch (lookupError) {
      console.warn(`${TAG} conflict re-lookup failed`, lookupError);
      return fail('db_lookup_failed', lookupError instanceof Error ? lookupError.message : String(lookupError), true, warnings);
    }

    return fail('db_insert_failed', error instanceof Error ? error.message : String(error), true, warnings);
  }
}

import type { AiChatUsageBackfillQuery, AiChatUsageBackfillResult, AiMeteringAccuracy, AiUsageNumbers } from '../../../../packages/ai/analytics/types';
import { getChatMessageUsage, normalizeTokenUsage } from '../../../../packages/ai/message-usage';
import type { TokenUsage } from '../../../../packages/ai/types';
import { AnalyticsRepo, type ChatUsageBackfillCandidateRow } from '../../db/analytics-repositories';
import type { AiUsageEventRow } from '../../db/schema';
import { recordAiUsageEvent } from './usage-recorder';

const TAG = '[analytics][chat-backfill]';
const MAX_WARNING_COUNT = 20;
const LIVE_EVENT_MATCH_WINDOW_MS = 2 * 60 * 1000;
const LIVE_EVENT_FALLBACK_MATCH_WINDOW_MS = 5 * 1000;

type ParsedMetadataResult = { ok: true; metadata?: Record<string, unknown> } | { ok: false };

type UsageSource = 'metadata' | 'pi_raw_usage';
type ProviderSource = 'message' | 'conversation' | 'missing';
type ModelSource = 'message' | 'raw_usage' | 'missing';

function trimOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function toFiniteNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return value;
}

function parseMessageMetadata(raw: string | null): ParsedMetadataResult {
  if (!raw) return { ok: true };

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false };
    }

    return {
      ok: true,
      metadata: parsed as Record<string, unknown>
    };
  } catch {
    return { ok: false };
  }
}

function extractRawUsage(metadata?: Record<string, unknown>): unknown {
  if (!metadata) return undefined;
  return metadata.piRawUsage ?? metadata.rawUsage;
}

function normalizePiRawUsage(rawUsage: unknown): TokenUsage | undefined {
  const normalized = normalizeTokenUsage(rawUsage);
  if (normalized) return normalized;

  if (!rawUsage || typeof rawUsage !== 'object' || Array.isArray(rawUsage)) {
    return undefined;
  }

  const record = rawUsage as Record<string, unknown>;
  const inputTokens = toFiniteNonNegativeNumber(record.input);
  const outputTokens = toFiniteNonNegativeNumber(record.output);
  const cacheReadTokens = toFiniteNonNegativeNumber(record.cacheRead);
  const cacheWriteTokens = toFiniteNonNegativeNumber(record.cacheWrite);
  const reasoningTokens = toFiniteNonNegativeNumber(record.reasoningTokens ?? record.reasoning);
  const explicitTotalTokens = toFiniteNonNegativeNumber(record.totalTokens);
  const hasTokenComponent = inputTokens !== undefined || outputTokens !== undefined || cacheReadTokens !== undefined || cacheWriteTokens !== undefined || reasoningTokens !== undefined;
  const totalTokens = explicitTotalTokens ?? (hasTokenComponent ? (inputTokens ?? 0) + (outputTokens ?? 0) + (cacheReadTokens ?? 0) + (cacheWriteTokens ?? 0) + (reasoningTokens ?? 0) : undefined);
  const cost = toFiniteNonNegativeNumber(record.cost) ?? toFiniteNonNegativeNumber((record.cost as Record<string, unknown> | undefined)?.total);

  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    cacheReadTokens === undefined &&
    cacheWriteTokens === undefined &&
    reasoningTokens === undefined &&
    totalTokens === undefined &&
    cost === undefined
  ) {
    return undefined;
  }

  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}),
    ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
    ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
    ...(cost !== undefined ? { cost } : {})
  };
}

function resolveUsage(metadata?: Record<string, unknown>): { source: UsageSource; usage?: TokenUsage } {
  const metadataUsage = getChatMessageUsage({ metadata });
  if (metadataUsage) {
    return {
      source: 'metadata',
      usage: metadataUsage
    };
  }

  const rawUsage = extractRawUsage(metadata);
  const piUsage = normalizePiRawUsage(rawUsage);
  if (piUsage) {
    return {
      source: 'pi_raw_usage',
      usage: piUsage
    };
  }

  return { source: 'metadata' };
}

function resolveProvider(candidate: ChatUsageBackfillCandidateRow, metadata?: Record<string, unknown>): { providerId?: string; source: ProviderSource } {
  const providerId = trimOptionalString(metadata?.piProvider) ?? trimOptionalString(metadata?.providerId);
  if (providerId) {
    return {
      providerId,
      source: 'message'
    };
  }

  if (candidate.providerId) {
    return {
      providerId: candidate.providerId,
      source: 'conversation'
    };
  }

  return { source: 'missing' };
}

function resolveModel(metadata?: Record<string, unknown>): { model?: string; source: ModelSource } {
  const messageModel = trimOptionalString(metadata?.model) ?? trimOptionalString(metadata?.modelId);
  if (messageModel) {
    return {
      model: messageModel,
      source: 'message'
    };
  }

  const rawUsage = extractRawUsage(metadata);
  if (rawUsage && typeof rawUsage === 'object' && !Array.isArray(rawUsage)) {
    const rawUsageModel = trimOptionalString((rawUsage as Record<string, unknown>).model) ?? trimOptionalString((rawUsage as Record<string, unknown>).modelId);
    if (rawUsageModel) {
      return {
        model: rawUsageModel,
        source: 'raw_usage'
      };
    }
  }

  return { source: 'missing' };
}

function toAiUsageNumbers(usage: TokenUsage): AiUsageNumbers {
  return {
    billableInputTokens: usage.billableInputTokens,
    billableOutputTokens: usage.billableOutputTokens,
    billableTotalTokens: usage.billableTotalTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    estimatedCost: usage.cost,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens,
    totalTokens: usage.totalTokens
  };
}

function normalizeComparableValue(value: unknown): unknown {
  if (typeof value === 'string') {
    try {
      return normalizeComparableValue(JSON.parse(value));
    } catch {
      return value;
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeComparableValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = normalizeComparableValue((value as Record<string, unknown>)[key]);
        return accumulator;
      }, {});
  }

  return value;
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(normalizeComparableValue(value));
}

function sameNullableNumber(left: number | null | undefined, right: number | null | undefined): boolean {
  return (left ?? null) === (right ?? null);
}

function usageMatchesEvent(usage: TokenUsage, event: AiUsageEventRow): boolean {
  return (
    sameNullableNumber(usage.inputTokens, event.inputTokens) &&
    sameNullableNumber(usage.outputTokens, event.outputTokens) &&
    sameNullableNumber(usage.cacheReadTokens, event.cacheReadTokens) &&
    sameNullableNumber(usage.cacheWriteTokens, event.cacheWriteTokens) &&
    sameNullableNumber(usage.reasoningTokens, event.reasoningTokens) &&
    sameNullableNumber(usage.totalTokens, event.totalTokens)
  );
}

function resolveBackfillAccuracy(input: { modelSource: ModelSource; providerSource: ProviderSource; rawUsage: unknown; usageSource: UsageSource }): AiMeteringAccuracy {
  if (input.rawUsage !== undefined && input.rawUsage !== null) {
    return 'high';
  }

  if (input.providerSource === 'message' && input.modelSource === 'message' && input.usageSource === 'metadata') {
    return 'high';
  }

  return 'medium';
}

function pushWarning(warnings: string[], warning: string): void {
  if (!warning || warnings.length >= MAX_WARNING_COUNT || warnings.includes(warning)) {
    return;
  }

  warnings.push(warning);
}

async function findExistingEventForMessage(params: {
  conversationId: string;
  createdAt: number | null;
  messageId: string;
  model: string;
  providerId: string;
  rawUsage: unknown;
  usage: TokenUsage;
}): Promise<AiUsageEventRow | undefined> {
  const byAssistantMessageId = await AnalyticsRepo.findChatUsageEventByAssistantMessageId(params.messageId);
  if (byAssistantMessageId) {
    return byAssistantMessageId;
  }

  const byRequestId = await AnalyticsRepo.listAiUsageEvents(
    {
      requestId: params.messageId,
      sourceType: 'chat'
    },
    1,
    0
  );
  if (byRequestId[0]) {
    return byRequestId[0];
  }

  if (!params.createdAt) {
    return undefined;
  }

  const nearbyEvents = await AnalyticsRepo.listAiUsageEvents(
    {
      conversationId: params.conversationId,
      createdAtFrom: params.createdAt - LIVE_EVENT_MATCH_WINDOW_MS,
      createdAtTo: params.createdAt + LIVE_EVENT_MATCH_WINDOW_MS,
      model: params.model,
      providerId: params.providerId,
      sourceType: 'chat',
      status: 'completed',
      usageFeature: 'chat',
      usageStage: 'generate'
    },
    25,
    0
  );

  if (params.rawUsage !== undefined && params.rawUsage !== null) {
    const rawUsageSignature = stableSerialize(params.rawUsage);
    const rawUsageMatchedEvent = nearbyEvents.find((event) => stableSerialize(event.rawUsage) === rawUsageSignature);
    if (rawUsageMatchedEvent) {
      return rawUsageMatchedEvent;
    }
  }

  const fallbackMatches = nearbyEvents.filter((event) => {
    const eventTimestamp = event.completedAt ?? event.createdAt ?? 0;
    if (!eventTimestamp || Math.abs(eventTimestamp - params.createdAt!) > LIVE_EVENT_FALLBACK_MATCH_WINDOW_MS) {
      return false;
    }

    return usageMatchesEvent(params.usage, event);
  });

  if (fallbackMatches.length === 1) {
    return fallbackMatches[0];
  }

  return undefined;
}

export async function backfillChatUsage(params: AiChatUsageBackfillQuery = {}): Promise<AiChatUsageBackfillResult> {
  const startedAt = Date.now();
  const warnings: string[] = [];

  const result: AiChatUsageBackfillResult = {
    candidateMessages: 0,
    completedAt: startedAt,
    dedupedEvents: 0,
    durationMs: 0,
    failedEvents: 0,
    insertedEvents: 0,
    scannedMessages: 0,
    skippedInvalidMetadata: 0,
    skippedMissingModel: 0,
    skippedMissingProvider: 0,
    skippedNoUsage: 0,
    startedAt,
    warnings
  };

  const candidates = await AnalyticsRepo.listChatUsageBackfillCandidates({
    conversationId: trimOptionalString(params.conversationId),
    limit: params.limit,
    workspaceId: trimOptionalString(params.workspaceId)
  });

  result.scannedMessages = candidates.length;

  for (const candidate of candidates) {
    const parsedMetadata = parseMessageMetadata(candidate.metadata);
    if (!parsedMetadata.ok) {
      result.skippedInvalidMetadata += 1;
      pushWarning(warnings, `${candidate.messageId}: invalid assistant metadata JSON.`);
      continue;
    }

    const metadata = parsedMetadata.metadata;
    const usageResolution = resolveUsage(metadata);
    if (!usageResolution.usage) {
      result.skippedNoUsage += 1;
      continue;
    }

    const providerResolution = resolveProvider(candidate, metadata);
    if (!providerResolution.providerId) {
      result.skippedMissingProvider += 1;
      pushWarning(warnings, `${candidate.messageId}: providerId is missing for chat backfill.`);
      continue;
    }

    const modelResolution = resolveModel(metadata);
    if (!modelResolution.model) {
      result.skippedMissingModel += 1;
      pushWarning(warnings, `${candidate.messageId}: model is missing for chat backfill.`);
      continue;
    }

    result.candidateMessages += 1;

    const rawUsage = extractRawUsage(metadata);

    try {
      const existingEvent = await findExistingEventForMessage({
        conversationId: candidate.conversationId,
        createdAt: candidate.createdAt,
        messageId: candidate.messageId,
        model: modelResolution.model,
        providerId: providerResolution.providerId,
        rawUsage,
        usage: usageResolution.usage
      });

      if (existingEvent) {
        result.dedupedEvents += 1;
        continue;
      }

      const recorderResult = await recordAiUsageEvent({
        agentId: trimOptionalString(metadata?.agentId) ?? candidate.agentId ?? undefined,
        billingEligible: false,
        completedAt: candidate.createdAt ?? Date.now(),
        conversationId: candidate.conversationId,
        metadata: {
          assistantMessageId: candidate.messageId,
          conversationDeletedAt: candidate.conversationDeletedAt,
          messageDeletedAt: candidate.messageDeletedAt,
          modelSource: modelResolution.source,
          providerSource: providerResolution.source,
          runtime: trimOptionalString(metadata?.runtime) ?? 'pi',
          usageSource: usageResolution.source
        },
        meteringAccuracy: resolveBackfillAccuracy({
          modelSource: modelResolution.source,
          providerSource: providerResolution.source,
          rawUsage,
          usageSource: usageResolution.source
        }),
        meteringSource: 'message_backfilled',
        model: modelResolution.model,
        operationKey: 'reply',
        providerId: providerResolution.providerId,
        providerPresetId: trimOptionalString(metadata?.providerPresetId) ?? candidate.providerPresetId ?? undefined,
        rawUsage,
        requestId: candidate.messageId,
        sourceId: candidate.conversationId,
        sourceLabel: '聊天',
        sourceType: 'chat',
        startedAt: candidate.createdAt ?? Date.now(),
        status: 'completed',
        traceId: candidate.conversationId,
        usage: toAiUsageNumbers(usageResolution.usage),
        usageCategory: 'conversation',
        usageFeature: 'chat',
        usageStage: 'generate',
        workspaceId: candidate.workspaceId ?? undefined
      });

      if (!recorderResult.ok) {
        result.failedEvents += 1;
        pushWarning(warnings, `${candidate.messageId}: ${recorderResult.message}`);
        continue;
      }

      if (recorderResult.deduped) {
        result.dedupedEvents += 1;
      } else {
        result.insertedEvents += 1;
      }

      for (const warning of recorderResult.warnings || []) {
        pushWarning(warnings, `${candidate.messageId}: ${warning}`);
      }
    } catch (error) {
      result.failedEvents += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`${TAG} failed for message=${candidate.messageId}`, error);
      pushWarning(warnings, `${candidate.messageId}: ${message}`);
    }
  }

  result.completedAt = Date.now();
  result.durationMs = result.completedAt - result.startedAt;
  return result;
}

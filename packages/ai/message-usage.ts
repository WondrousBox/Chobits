import type { ChatMessage, TokenUsage } from './types';

export const CHAT_USAGE_METADATA_KEY = 'aiUsage';

function toFiniteNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value >= 0 ? value : undefined;
}

export function normalizeTokenUsage(value: unknown): TokenUsage | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const record = value as Record<string, unknown>;
  const inputTokens = toFiniteNonNegativeNumber(record.inputTokens);
  const outputTokens = toFiniteNonNegativeNumber(record.outputTokens);
  const cacheReadTokens = toFiniteNonNegativeNumber(record.cacheReadTokens);
  const cacheWriteTokens = toFiniteNonNegativeNumber(record.cacheWriteTokens);
  const reasoningTokens = toFiniteNonNegativeNumber(record.reasoningTokens);
  const explicitTotalTokens = toFiniteNonNegativeNumber(record.totalTokens);
  const hasTokenComponent = inputTokens !== undefined || outputTokens !== undefined || cacheReadTokens !== undefined || cacheWriteTokens !== undefined || reasoningTokens !== undefined;
  const totalTokens = explicitTotalTokens ?? (hasTokenComponent ? (inputTokens ?? 0) + (outputTokens ?? 0) + (cacheReadTokens ?? 0) + (cacheWriteTokens ?? 0) + (reasoningTokens ?? 0) : undefined);
  const cost = toFiniteNonNegativeNumber(record.cost);

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

export function getChatMessageUsage(message?: Pick<ChatMessage, 'metadata' | 'usage'> | null): TokenUsage | undefined {
  if (!message) return undefined;

  const directUsage = normalizeTokenUsage(message.usage);
  if (directUsage) return directUsage;

  const metadata = message.metadata;
  if (!metadata || typeof metadata !== 'object') return undefined;

  const metadataRecord = metadata as Record<string, unknown>;
  return normalizeTokenUsage(metadataRecord[CHAT_USAGE_METADATA_KEY] ?? metadataRecord.usage);
}

export function withChatMessageUsage(metadata: Record<string, any> | undefined, usage?: TokenUsage): Record<string, any> | undefined {
  const normalizedUsage = normalizeTokenUsage(usage);
  const nextMetadata = metadata ? { ...metadata } : {};

  if (normalizedUsage) {
    nextMetadata[CHAT_USAGE_METADATA_KEY] = normalizedUsage;
  } else {
    delete nextMetadata[CHAT_USAGE_METADATA_KEY];
  }

  return Object.keys(nextMetadata).length > 0 ? nextMetadata : undefined;
}

export function sumTokenUsage(messages: Array<Pick<ChatMessage, 'metadata' | 'usage'> | null | undefined>): TokenUsage | undefined {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let reasoningTokens = 0;
  let totalTokens = 0;
  let cost = 0;
  let hasInputTokens = false;
  let hasOutputTokens = false;
  let hasCacheReadTokens = false;
  let hasCacheWriteTokens = false;
  let hasReasoningTokens = false;
  let hasTotalTokens = false;
  let hasCost = false;

  for (const message of messages) {
    const usage = getChatMessageUsage(message);
    if (!usage) continue;

    if (usage.inputTokens !== undefined) {
      inputTokens += usage.inputTokens;
      hasInputTokens = true;
    }

    if (usage.outputTokens !== undefined) {
      outputTokens += usage.outputTokens;
      hasOutputTokens = true;
    }

    if (usage.cacheReadTokens !== undefined) {
      cacheReadTokens += usage.cacheReadTokens;
      hasCacheReadTokens = true;
    }

    if (usage.cacheWriteTokens !== undefined) {
      cacheWriteTokens += usage.cacheWriteTokens;
      hasCacheWriteTokens = true;
    }

    if (usage.reasoningTokens !== undefined) {
      reasoningTokens += usage.reasoningTokens;
      hasReasoningTokens = true;
    }

    if (usage.totalTokens !== undefined) {
      totalTokens += usage.totalTokens;
      hasTotalTokens = true;
    }

    if (usage.cost !== undefined) {
      cost += usage.cost;
      hasCost = true;
    }
  }

  if (!hasInputTokens && !hasOutputTokens && !hasCacheReadTokens && !hasCacheWriteTokens && !hasReasoningTokens && !hasTotalTokens && !hasCost) {
    return undefined;
  }

  return {
    ...(hasInputTokens ? { inputTokens } : {}),
    ...(hasOutputTokens ? { outputTokens } : {}),
    ...(hasCacheReadTokens ? { cacheReadTokens } : {}),
    ...(hasCacheWriteTokens ? { cacheWriteTokens } : {}),
    ...(hasReasoningTokens ? { reasoningTokens } : {}),
    ...(hasTotalTokens ? { totalTokens } : {}),
    ...(hasCost ? { cost } : {})
  };
}

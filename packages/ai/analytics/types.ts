import type { AiUsageEventRow as DbAiUsageEventRow } from '../../../electron/main/db/schema';

export const AI_USAGE_SOURCE_TYPES = [
  'chat',
  'conversation_title',
  'translation',
  'summary',
  'mindmap',
  'memory',
  'tagging',
  'embedding',
  'transcription',
  'image_generation',
  'workflow',
  'system',
  'other'
] as const;

export const AI_USAGE_CATEGORIES = ['conversation', 'content_processing', 'memory', 'media', 'workflow', 'system', 'other'] as const;

export const AI_USAGE_FEATURES = [
  'chat',
  'conversation_title',
  'translation',
  'summary',
  'mindmap',
  'tagging',
  'memory_extraction',
  'memory_recall',
  'memory_diary',
  'embedding',
  'transcription',
  'image_generation',
  'workflow_ai',
  'other'
] as const;

export const AI_USAGE_STAGES = ['analyze', 'retrieve', 'generate', 'extract', 'classify', 'merge', 'vectorize', 'transcribe', 'postprocess', 'background', 'other'] as const;

export const AI_METERING_SOURCES = ['provider_reported', 'message_backfilled', 'reconstructed', 'estimated'] as const;
export const AI_METERING_ACCURACIES = ['exact', 'high', 'medium', 'low'] as const;
export const AI_USAGE_STATUSES = ['completed', 'failed', 'cancelled'] as const;

export type AiUsageSourceType = (typeof AI_USAGE_SOURCE_TYPES)[number];
export type AiUsageCategory = (typeof AI_USAGE_CATEGORIES)[number];
export type AiUsageFeature = (typeof AI_USAGE_FEATURES)[number];
export type AiUsageStage = (typeof AI_USAGE_STAGES)[number];
export type AiMeteringSource = (typeof AI_METERING_SOURCES)[number];
export type AiMeteringAccuracy = (typeof AI_METERING_ACCURACIES)[number];
export type AiUsageStatus = (typeof AI_USAGE_STATUSES)[number];

export const AI_METERING_SOURCE_ALLOWED_ACCURACIES: Record<AiMeteringSource, readonly AiMeteringAccuracy[]> = {
  estimated: ['low'],
  message_backfilled: ['high', 'medium'],
  provider_reported: ['exact', 'high'],
  reconstructed: ['high', 'medium', 'low']
};

const ALL_USAGE_STAGES: readonly AiUsageStage[] = AI_USAGE_STAGES;

export const AI_USAGE_FEATURE_ALLOWED_STAGES: Record<AiUsageFeature, readonly AiUsageStage[]> = {
  chat: ['generate'],
  conversation_title: ['generate'],
  translation: ['generate', 'postprocess'],
  summary: ['analyze', 'generate'],
  mindmap: ['analyze', 'generate'],
  tagging: ['classify'],
  memory_extraction: ['analyze', 'extract', 'merge'],
  memory_recall: ['analyze', 'retrieve'],
  memory_diary: ['generate', 'merge'],
  embedding: ['vectorize'],
  transcription: ['transcribe'],
  image_generation: ['generate'],
  workflow_ai: ['analyze', 'generate', 'classify', 'extract', 'merge', 'postprocess'],
  other: ALL_USAGE_STAGES
};

export type AiUsageNumbers = {
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  cacheReadTokens?: number | null;
  cacheWriteTokens?: number | null;
  reasoningTokens?: number | null;
  billableInputTokens?: number | null;
  billableOutputTokens?: number | null;
  billableTotalTokens?: number | null;
  estimatedCost?: number | null;
};

export type AiUsageEventInput = {
  workspaceId?: string;
  traceId: string;
  parentEventId?: string;
  requestId: string;
  providerRequestId?: string;
  operationKey: string;
  attemptIndex?: number;
  conversationId?: string;
  resourceId?: string;
  sourceType: AiUsageSourceType;
  sourceId: string;
  sourceLabel?: string;
  usageCategory: AiUsageCategory;
  usageFeature: AiUsageFeature;
  usageStage: AiUsageStage;
  providerId: string;
  providerPresetId?: string;
  model: string;
  agentId?: string;
  status: AiUsageStatus;
  usage?: AiUsageNumbers | null;
  rawUsage?: unknown;
  meteringSource: AiMeteringSource;
  meteringAccuracy?: AiMeteringAccuracy;
  billingEligible?: boolean;
  startedAt?: number;
  completedAt?: number;
  metadata?: Record<string, unknown>;
};

export type RecordAiUsageEventInput = AiUsageEventInput;
export type AiUsageEventRow = DbAiUsageEventRow;

export type AiUsageQueryFilter = {
  workspaceId?: string;
  traceId?: string;
  requestId?: string;
  providerId?: string;
  providerPresetId?: string;
  providerRequestId?: string;
  model?: string;
  conversationId?: string;
  resourceId?: string;
  sourceType?: AiUsageSourceType;
  sourceId?: string;
  usageCategory?: AiUsageCategory;
  usageFeature?: AiUsageFeature;
  usageStage?: AiUsageStage;
  status?: AiUsageStatus;
  meteringSource?: AiMeteringSource;
  meteringAccuracy?: AiMeteringAccuracy;
  billingEligible?: boolean;
  workflowRunId?: string;
  workflowNodeId?: string;
  workflowNodeType?: string;
  providerUsageType?: string;
  createdAtFrom?: number;
  createdAtTo?: number;
};

export const AI_USAGE_BREAKDOWN_DIMENSIONS = ['provider', 'model', 'category', 'feature', 'sourceType', 'stage', 'status', 'workflowNodeType'] as const;
export const AI_USAGE_TIMELINE_BUCKETS = ['day', 'hour'] as const;
export const AI_USAGE_OUTBOX_STATUSES = ['pending', 'processed', 'failed'] as const;

export type AiUsageBreakdownDimension = (typeof AI_USAGE_BREAKDOWN_DIMENSIONS)[number];
export type AiUsageTimelineBucket = (typeof AI_USAGE_TIMELINE_BUCKETS)[number];
export type AiUsageOutboxStatus = (typeof AI_USAGE_OUTBOX_STATUSES)[number];

export type AiUsageOverview = {
  totalEvents: number;
  completedEvents: number;
  failedEvents: number;
  cancelledEvents: number;
  exactEvents: number;
  highAccuracyEvents: number;
  mediumAccuracyEvents: number;
  lowAccuracyEvents: number;
  billingEligibleEvents: number;
  distinctRequestCount: number;
  distinctTraceCount: number;
  distinctProviderCount: number;
  distinctModelCount: number;
  distinctFeatureCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  billableTotalTokens: number | null;
  estimatedCost: number | null;
  firstEventAt: number | null;
  lastEventAt: number | null;
};

export type AiUsageTimelinePoint = {
  bucket: string;
  bucketStartAt: number;
  bucketEndAt: number;
  eventCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  billableTotalTokens: number | null;
  estimatedCost: number | null;
};

export type AiUsageBreakdownRow = {
  dimension: AiUsageBreakdownDimension;
  value: string;
  label: string;
  eventCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  billableTotalTokens: number | null;
  estimatedCost: number | null;
};

export type AiUsageOutboxHealth = {
  failedCount: number;
  lastEmittedAt: number | null;
  maxPendingAttemptCount: number;
  newestFailedAt: number | null;
  newestProcessedAt: number | null;
  oldestPendingCreatedAt: number | null;
  pendingCount: number;
  processedCount: number;
  retryingCount: number;
};

export type AiUsageOutboxEventSummary = {
  attemptCount: number;
  createdAt: number | null;
  emittedAt: number;
  eventFingerprint: string;
  eventType: string;
  id: string;
  lastAttemptAt: number | null;
  lastError: string | null;
  model: string;
  operationKey: string;
  processedAt: number | null;
  producer: string | null;
  providerId: string;
  requestId: string;
  sourceId: string;
  sourceType: string;
  status: AiUsageOutboxStatus;
  traceId: string;
  updatedAt: number | null;
  usageFeature: string;
  usageStage: string;
};

export type AiUsageOverviewQuery = {
  filter?: AiUsageQueryFilter;
};

export type AiUsageTimelineQuery = {
  filter?: AiUsageQueryFilter;
  bucket?: AiUsageTimelineBucket;
  limit?: number;
};

export type AiUsageBreakdownQuery = {
  filter?: AiUsageQueryFilter;
  dimension: AiUsageBreakdownDimension;
  limit?: number;
};

export type AiUsageEventsQuery = {
  filter?: AiUsageQueryFilter;
  limit?: number;
  offset?: number;
};

export type AiUsageOutboxHealthQuery = Record<string, never>;

export type AiUsageOutboxEventsQuery = {
  limit?: number;
  status?: AiUsageOutboxStatus;
};

export type AiUsageOutboxRetryQuery = {
  limit?: number;
};

export type AiUsageOutboxRetryResult = {
  limit: number;
  resetCount: number;
  scheduled: boolean;
};

export type AiUsageOutboxDrainQuery = Record<string, never>;

export type AiUsageOutboxDrainResult = {
  scheduled: boolean;
};

export type AiChatUsageBackfillQuery = {
  workspaceId?: string;
  conversationId?: string;
  limit?: number;
};

export type AiChatUsageBackfillResult = {
  startedAt: number;
  completedAt: number;
  durationMs: number;
  scannedMessages: number;
  candidateMessages: number;
  insertedEvents: number;
  dedupedEvents: number;
  skippedNoUsage: number;
  skippedInvalidMetadata: number;
  skippedMissingProvider: number;
  skippedMissingModel: number;
  failedEvents: number;
  warnings: string[];
};

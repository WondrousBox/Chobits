import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';

import type { AiUsageBreakdownDimension, AiUsageBreakdownRow, AiUsageOverview, AiUsageQueryFilter, AiUsageTimelineBucket, AiUsageTimelinePoint } from '../../../packages/ai/analytics/types';
import { getDB, getOrm } from '.';
import { ai_usage_events, type AiUsageEventRow, type NewAiUsageEvent } from './schema';

type SqlFilter = {
  clause: string;
  params: unknown[];
};

export type ChatUsageBackfillCandidateRow = {
  agentId: string | null;
  conversationDeletedAt: number | null;
  conversationId: string;
  createdAt: number | null;
  messageDeletedAt: number | null;
  messageId: string;
  metadata: string | null;
  providerId: string | null;
  providerPresetId: string | null;
  workspaceId: string | null;
};

const BREAKDOWN_DIMENSION_COLUMN_MAP: Record<AiUsageBreakdownDimension, string> = {
  provider: 'provider_id',
  model: 'model',
  category: 'usage_category',
  feature: 'usage_feature',
  sourceType: 'source_type',
  stage: 'usage_stage',
  status: 'status'
};

const TIMELINE_BUCKET_SQL_MAP: Record<AiUsageTimelineBucket, string> = {
  day: "strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', 'localtime')",
  hour: "strftime('%Y-%m-%d %H:00', created_at / 1000, 'unixepoch', 'localtime')"
};

function buildAiUsageSqlFilter(filter: AiUsageQueryFilter = {}): SqlFilter {
  const conditions: string[] = [];
  const params: unknown[] = [];

  const addEquals = (column: string, value: unknown): void => {
    if (value === undefined || value === null || value === '') return;
    conditions.push(`${column} = ?`);
    params.push(value);
  };

  addEquals('workspace_id', filter.workspaceId);
  addEquals('trace_id', filter.traceId);
  addEquals('request_id', filter.requestId);
  addEquals('provider_id', filter.providerId);
  addEquals('provider_preset_id', filter.providerPresetId);
  addEquals('provider_request_id', filter.providerRequestId);
  addEquals('model', filter.model);
  addEquals('conversation_id', filter.conversationId);
  addEquals('resource_id', filter.resourceId);
  addEquals('source_type', filter.sourceType);
  addEquals('source_id', filter.sourceId);
  addEquals('usage_category', filter.usageCategory);
  addEquals('usage_feature', filter.usageFeature);
  addEquals('usage_stage', filter.usageStage);
  addEquals('status', filter.status);
  addEquals('metering_source', filter.meteringSource);
  addEquals('metering_accuracy', filter.meteringAccuracy);

  if (typeof filter.billingEligible === 'boolean') {
    conditions.push('billing_eligible = ?');
    params.push(filter.billingEligible ? 1 : 0);
  }

  if (filter.createdAtFrom !== undefined) {
    conditions.push('created_at >= ?');
    params.push(filter.createdAtFrom);
  }

  if (filter.createdAtTo !== undefined) {
    conditions.push('created_at <= ?');
    params.push(filter.createdAtTo);
  }

  return {
    clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params
  };
}

function toNumber(value: unknown): number {
  const normalized = Number(value ?? 0);
  return Number.isFinite(normalized) ? normalized : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function emptyOverview(): AiUsageOverview {
  return {
    totalEvents: 0,
    completedEvents: 0,
    failedEvents: 0,
    cancelledEvents: 0,
    exactEvents: 0,
    highAccuracyEvents: 0,
    mediumAccuracyEvents: 0,
    lowAccuracyEvents: 0,
    billingEligibleEvents: 0,
    distinctRequestCount: 0,
    distinctTraceCount: 0,
    distinctProviderCount: 0,
    distinctModelCount: 0,
    distinctFeatureCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    billableTotalTokens: 0,
    estimatedCost: 0,
    firstEventAt: null,
    lastEventAt: null
  };
}

export const AnalyticsRepo = {
  async insertAiUsageEvent(event: NewAiUsageEvent): Promise<AiUsageEventRow | undefined> {
    const db = getOrm();
    const rows = await db
      .insert(ai_usage_events)
      .values(event as any)
      .returning()
      .all();
    return rows[0];
  },

  async findAiUsageEventByProviderRequestId(providerId: string, providerRequestId: string): Promise<AiUsageEventRow | undefined> {
    const db = getOrm();
    const rows = await db
      .select()
      .from(ai_usage_events)
      .where(and(eq(ai_usage_events.providerId, providerId), eq(ai_usage_events.providerRequestId, providerRequestId)))
      .limit(1);
    return rows[0];
  },

  async findAiUsageEventByFingerprint(eventFingerprint: string): Promise<AiUsageEventRow | undefined> {
    const db = getOrm();
    const rows = await db.select().from(ai_usage_events).where(eq(ai_usage_events.eventFingerprint, eventFingerprint)).limit(1);
    return rows[0];
  },

  async findChatUsageEventByAssistantMessageId(assistantMessageId: string): Promise<AiUsageEventRow | undefined> {
    const db = getOrm();
    const rows = await db
      .select()
      .from(ai_usage_events)
      .where(and(eq(ai_usage_events.sourceType, 'chat'), sql`json_extract(${ai_usage_events.metadata}, '$.assistantMessageId') = ${assistantMessageId}`))
      .limit(1);
    return rows[0];
  },

  async listAiUsageEvents(filter: AiUsageQueryFilter = {}, limit = 100, offset = 0): Promise<AiUsageEventRow[]> {
    const db = getOrm();
    let query = db.select().from(ai_usage_events);
    const wheres: any[] = [];

    if (filter.workspaceId) wheres.push(eq(ai_usage_events.workspaceId, filter.workspaceId));
    if (filter.traceId) wheres.push(eq(ai_usage_events.traceId, filter.traceId));
    if (filter.requestId) wheres.push(eq(ai_usage_events.requestId, filter.requestId));
    if (filter.providerId) wheres.push(eq(ai_usage_events.providerId, filter.providerId));
    if (filter.providerPresetId) wheres.push(eq(ai_usage_events.providerPresetId, filter.providerPresetId));
    if (filter.providerRequestId) wheres.push(eq(ai_usage_events.providerRequestId, filter.providerRequestId));
    if (filter.model) wheres.push(eq(ai_usage_events.model, filter.model));
    if (filter.conversationId) wheres.push(eq(ai_usage_events.conversationId, filter.conversationId));
    if (filter.resourceId) wheres.push(eq(ai_usage_events.resourceId, filter.resourceId));
    if (filter.sourceType) wheres.push(eq(ai_usage_events.sourceType, filter.sourceType));
    if (filter.sourceId) wheres.push(eq(ai_usage_events.sourceId, filter.sourceId));
    if (filter.usageCategory) wheres.push(eq(ai_usage_events.usageCategory, filter.usageCategory));
    if (filter.usageFeature) wheres.push(eq(ai_usage_events.usageFeature, filter.usageFeature));
    if (filter.usageStage) wheres.push(eq(ai_usage_events.usageStage, filter.usageStage));
    if (filter.status) wheres.push(eq(ai_usage_events.status, filter.status));
    if (filter.meteringSource) wheres.push(eq(ai_usage_events.meteringSource, filter.meteringSource));
    if (filter.meteringAccuracy) wheres.push(eq(ai_usage_events.meteringAccuracy, filter.meteringAccuracy));
    if (typeof filter.billingEligible === 'boolean') wheres.push(eq(ai_usage_events.billingEligible, filter.billingEligible ? 1 : 0));
    if (filter.createdAtFrom !== undefined) wheres.push(gte(ai_usage_events.createdAt, filter.createdAtFrom));
    if (filter.createdAtTo !== undefined) wheres.push(lte(ai_usage_events.createdAt, filter.createdAtTo));

    if (wheres.length) {
      query = query.where(and(...wheres));
    }

    return query.orderBy(desc(ai_usage_events.createdAt), desc(ai_usage_events.startedAt)).limit(limit).offset(offset);
  },

  async getAiUsageOverview(filter: AiUsageQueryFilter = {}): Promise<AiUsageOverview> {
    const rawDb = getDB();
    if (!rawDb) return emptyOverview();

    const { clause, params } = buildAiUsageSqlFilter(filter);
    const row = rawDb
      .prepare(
        `
          SELECT
            COUNT(*) AS totalEvents,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completedEvents,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failedEvents,
            SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelledEvents,
            SUM(CASE WHEN metering_accuracy = 'exact' THEN 1 ELSE 0 END) AS exactEvents,
            SUM(CASE WHEN metering_accuracy = 'high' THEN 1 ELSE 0 END) AS highAccuracyEvents,
            SUM(CASE WHEN metering_accuracy = 'medium' THEN 1 ELSE 0 END) AS mediumAccuracyEvents,
            SUM(CASE WHEN metering_accuracy = 'low' THEN 1 ELSE 0 END) AS lowAccuracyEvents,
            SUM(CASE WHEN billing_eligible = 1 THEN 1 ELSE 0 END) AS billingEligibleEvents,
            COUNT(DISTINCT request_id) AS distinctRequestCount,
            COUNT(DISTINCT trace_id) AS distinctTraceCount,
            COUNT(DISTINCT provider_id) AS distinctProviderCount,
            COUNT(DISTINCT model) AS distinctModelCount,
            COUNT(DISTINCT usage_feature) AS distinctFeatureCount,
            COALESCE(SUM(input_tokens), 0) AS inputTokens,
            COALESCE(SUM(output_tokens), 0) AS outputTokens,
            COALESCE(SUM(total_tokens), 0) AS totalTokens,
            COALESCE(SUM(billable_total_tokens), 0) AS billableTotalTokens,
            COALESCE(SUM(estimated_cost), 0) AS estimatedCost,
            MIN(created_at) AS firstEventAt,
            MAX(created_at) AS lastEventAt
          FROM ai_usage_events
          ${clause}
        `
      )
      .get(...params) as Record<string, unknown> | undefined;

    if (!row) return emptyOverview();

    return {
      totalEvents: toNumber(row.totalEvents),
      completedEvents: toNumber(row.completedEvents),
      failedEvents: toNumber(row.failedEvents),
      cancelledEvents: toNumber(row.cancelledEvents),
      exactEvents: toNumber(row.exactEvents),
      highAccuracyEvents: toNumber(row.highAccuracyEvents),
      mediumAccuracyEvents: toNumber(row.mediumAccuracyEvents),
      lowAccuracyEvents: toNumber(row.lowAccuracyEvents),
      billingEligibleEvents: toNumber(row.billingEligibleEvents),
      distinctRequestCount: toNumber(row.distinctRequestCount),
      distinctTraceCount: toNumber(row.distinctTraceCount),
      distinctProviderCount: toNumber(row.distinctProviderCount),
      distinctModelCount: toNumber(row.distinctModelCount),
      distinctFeatureCount: toNumber(row.distinctFeatureCount),
      inputTokens: toNumber(row.inputTokens),
      outputTokens: toNumber(row.outputTokens),
      totalTokens: toNumber(row.totalTokens),
      billableTotalTokens: toNumber(row.billableTotalTokens),
      estimatedCost: toNumber(row.estimatedCost),
      firstEventAt: toNullableNumber(row.firstEventAt),
      lastEventAt: toNullableNumber(row.lastEventAt)
    };
  },

  async getAiUsageTimeline(filter: AiUsageQueryFilter = {}, bucket: AiUsageTimelineBucket = 'day', limit = 90): Promise<AiUsageTimelinePoint[]> {
    const rawDb = getDB();
    if (!rawDb) return [];

    const { clause, params } = buildAiUsageSqlFilter(filter);
    const bucketSql = TIMELINE_BUCKET_SQL_MAP[bucket] || TIMELINE_BUCKET_SQL_MAP.day;
    const rows = rawDb
      .prepare(
        `
          SELECT
            ${bucketSql} AS bucket,
            MIN(created_at) AS bucketStartAt,
            MAX(created_at) AS bucketEndAt,
            COUNT(*) AS eventCount,
            COALESCE(SUM(input_tokens), 0) AS inputTokens,
            COALESCE(SUM(output_tokens), 0) AS outputTokens,
            COALESCE(SUM(total_tokens), 0) AS totalTokens,
            COALESCE(SUM(billable_total_tokens), 0) AS billableTotalTokens,
            COALESCE(SUM(estimated_cost), 0) AS estimatedCost
          FROM ai_usage_events
          ${clause}
          GROUP BY bucket
          ORDER BY bucket DESC
          LIMIT ?
        `
      )
      .all(...params, limit) as Array<Record<string, unknown>>;

    return rows.reverse().map((row) => ({
      bucket: String(row.bucket ?? ''),
      bucketStartAt: toNumber(row.bucketStartAt),
      bucketEndAt: toNumber(row.bucketEndAt),
      eventCount: toNumber(row.eventCount),
      inputTokens: toNumber(row.inputTokens),
      outputTokens: toNumber(row.outputTokens),
      totalTokens: toNumber(row.totalTokens),
      billableTotalTokens: toNumber(row.billableTotalTokens),
      estimatedCost: toNumber(row.estimatedCost)
    }));
  },

  async getAiUsageBreakdown(filter: AiUsageQueryFilter = {}, dimension: AiUsageBreakdownDimension, limit = 20): Promise<AiUsageBreakdownRow[]> {
    const rawDb = getDB();
    if (!rawDb) return [];

    const column = BREAKDOWN_DIMENSION_COLUMN_MAP[dimension];
    const { clause, params } = buildAiUsageSqlFilter(filter);
    const rows = rawDb
      .prepare(
        `
          SELECT
            ${column} AS value,
            ${column} AS label,
            COUNT(*) AS eventCount,
            COALESCE(SUM(input_tokens), 0) AS inputTokens,
            COALESCE(SUM(output_tokens), 0) AS outputTokens,
            COALESCE(SUM(total_tokens), 0) AS totalTokens,
            COALESCE(SUM(billable_total_tokens), 0) AS billableTotalTokens,
            COALESCE(SUM(estimated_cost), 0) AS estimatedCost
          FROM ai_usage_events
          ${clause}
          GROUP BY ${column}
          ORDER BY totalTokens DESC, eventCount DESC, label ASC
          LIMIT ?
        `
      )
      .all(...params, limit) as Array<Record<string, unknown>>;

    return rows.map((row) => {
      const value = String(row.value ?? '');
      return {
        dimension,
        value,
        label: String(row.label ?? value),
        eventCount: toNumber(row.eventCount),
        inputTokens: toNumber(row.inputTokens),
        outputTokens: toNumber(row.outputTokens),
        totalTokens: toNumber(row.totalTokens),
        billableTotalTokens: toNumber(row.billableTotalTokens),
        estimatedCost: toNumber(row.estimatedCost)
      };
    });
  },

  async listChatUsageBackfillCandidates(params: { conversationId?: string; limit?: number; workspaceId?: string } = {}): Promise<ChatUsageBackfillCandidateRow[]> {
    const rawDb = getDB();
    if (!rawDb) return [];

    const conditions = [`m.role = 'assistant'`];
    const queryParams: unknown[] = [];

    if (params.workspaceId) {
      conditions.push('c.workspace_id = ?');
      queryParams.push(params.workspaceId);
    }

    if (params.conversationId) {
      conditions.push('m.conversation_id = ?');
      queryParams.push(params.conversationId);
    }

    const limitClause = typeof params.limit === 'number' && Number.isFinite(params.limit) && params.limit > 0 ? 'LIMIT ?' : '';
    if (limitClause) {
      queryParams.push(Math.trunc(params.limit!));
    }

    const rows = rawDb
      .prepare(
        `
          SELECT
            m.id AS messageId,
            m.conversation_id AS conversationId,
            m.metadata AS metadata,
            m.created_at AS createdAt,
            m.deleted_at AS messageDeletedAt,
            c.workspace_id AS workspaceId,
            c.agent_id AS agentId,
            c.provider_id AS providerId,
            c.provider_preset_id AS providerPresetId,
            c.deleted_at AS conversationDeletedAt
          FROM chat_messages m
          INNER JOIN conversations c ON c.id = m.conversation_id
          WHERE ${conditions.join(' AND ')}
          ORDER BY m.created_at ASC, m.seq ASC
          ${limitClause}
        `
      )
      .all(...queryParams) as ChatUsageBackfillCandidateRow[];

    return rows;
  }
};

import { ipcMain } from 'electron';

import type { AiChatUsageBackfillQuery, AiUsageBreakdownQuery, AiUsageEventsQuery, AiUsageOverviewQuery, AiUsageTimelineQuery } from '../../../../packages/ai/analytics/types';
import { AI_USAGE_BREAKDOWN_DIMENSIONS, AI_USAGE_TIMELINE_BUCKETS } from '../../../../packages/ai/analytics/types';
import { AnalyticsRepo } from '../../db/analytics-repositories';
import { backfillChatUsage } from './backfill-chat-usage';

function clampLimit(value: unknown, fallback: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const normalized = Math.trunc(value);
  if (normalized <= 0) return fallback;
  return Math.min(normalized, max);
}

function clampOffset(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const normalized = Math.trunc(value);
  return normalized >= 0 ? normalized : 0;
}

export function initAnalyticsHandlers(): void {
  ipcMain.handle('analytics:overview', async (_event, params?: AiUsageOverviewQuery) => {
    try {
      return await AnalyticsRepo.getAiUsageOverview(params?.filter);
    } catch (error) {
      console.error('[Analytics] overview failed:', error);
      throw error;
    }
  });

  ipcMain.handle('analytics:timeline', async (_event, params?: AiUsageTimelineQuery) => {
    try {
      const bucket = params?.bucket && AI_USAGE_TIMELINE_BUCKETS.includes(params.bucket) ? params.bucket : 'day';
      return await AnalyticsRepo.getAiUsageTimeline(params?.filter, bucket, clampLimit(params?.limit, 90, 365));
    } catch (error) {
      console.error('[Analytics] timeline failed:', error);
      throw error;
    }
  });

  ipcMain.handle('analytics:breakdown', async (_event, params: AiUsageBreakdownQuery) => {
    try {
      if (!params?.dimension || !AI_USAGE_BREAKDOWN_DIMENSIONS.includes(params.dimension)) {
        throw new Error(`Invalid analytics breakdown dimension: ${String(params?.dimension)}`);
      }
      return await AnalyticsRepo.getAiUsageBreakdown(params.filter, params.dimension, clampLimit(params?.limit, 20, 200));
    } catch (error) {
      console.error('[Analytics] breakdown failed:', error);
      throw error;
    }
  });

  ipcMain.handle('analytics:events', async (_event, params?: AiUsageEventsQuery) => {
    try {
      return await AnalyticsRepo.listAiUsageEvents(params?.filter, clampLimit(params?.limit, 100, 500), clampOffset(params?.offset));
    } catch (error) {
      console.error('[Analytics] events failed:', error);
      throw error;
    }
  });

  ipcMain.handle('analytics:backfillChatUsage', async (_event, params?: AiChatUsageBackfillQuery) => {
    try {
      return await backfillChatUsage({
        conversationId: params?.conversationId,
        limit: typeof params?.limit === 'number' && Number.isFinite(params.limit) && params.limit > 0 ? clampLimit(params.limit, 1000, 50000) : undefined,
        workspaceId: params?.workspaceId
      });
    } catch (error) {
      console.error('[Analytics] backfillChatUsage failed:', error);
      throw error;
    }
  });
}

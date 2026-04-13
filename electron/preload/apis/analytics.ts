import { ipcRenderer } from 'electron';

import type {
  AiChatUsageBackfillQuery,
  AiChatUsageBackfillResult,
  AiUsageBreakdownQuery,
  AiUsageBreakdownRow,
  AiUsageEventRow,
  AiUsageOverview,
  AiUsageQueryFilter,
  AiUsageTimelineBucket,
  AiUsageTimelinePoint
} from '../../../packages/ai/analytics/types';

export const analyticsApi = {
  getUsageOverview: (filter?: AiUsageQueryFilter): Promise<AiUsageOverview> => ipcRenderer.invoke('analytics:overview', { filter }),

  getUsageTimeline: (filter?: AiUsageQueryFilter, bucket?: AiUsageTimelineBucket, limit?: number): Promise<AiUsageTimelinePoint[]> =>
    ipcRenderer.invoke('analytics:timeline', { bucket, filter, limit }),

  getUsageBreakdown: (params: AiUsageBreakdownQuery): Promise<AiUsageBreakdownRow[]> => ipcRenderer.invoke('analytics:breakdown', params),

  getUsageByProvider: (filter?: AiUsageQueryFilter, limit?: number): Promise<AiUsageBreakdownRow[]> => ipcRenderer.invoke('analytics:breakdown', { dimension: 'provider', filter, limit }),

  getUsageByModel: (filter?: AiUsageQueryFilter, limit?: number): Promise<AiUsageBreakdownRow[]> => ipcRenderer.invoke('analytics:breakdown', { dimension: 'model', filter, limit }),

  getUsageByCategory: (filter?: AiUsageQueryFilter, limit?: number): Promise<AiUsageBreakdownRow[]> => ipcRenderer.invoke('analytics:breakdown', { dimension: 'category', filter, limit }),

  getUsageByFeature: (filter?: AiUsageQueryFilter, limit?: number): Promise<AiUsageBreakdownRow[]> => ipcRenderer.invoke('analytics:breakdown', { dimension: 'feature', filter, limit }),

  listUsageEvents: (filter?: AiUsageQueryFilter, limit?: number, offset?: number): Promise<AiUsageEventRow[]> => ipcRenderer.invoke('analytics:events', { filter, limit, offset }),

  backfillChatUsage: (params?: AiChatUsageBackfillQuery): Promise<AiChatUsageBackfillResult> => ipcRenderer.invoke('analytics:backfillChatUsage', params)
};

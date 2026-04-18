import type {
  AiChatUsageBackfillResult,
  AiUsageBreakdownRow,
  AiUsageEventRow,
  AiUsageOutboxDrainResult,
  AiUsageOutboxEventSummary,
  AiUsageOutboxHealth,
  AiUsageOutboxRetryResult,
  AiUsageOverview,
  AiUsageProviderModelBreakdownRow,
  AiUsageQueryFilter,
  AiUsageTimelinePoint
} from '@packages/ai/analytics/types';
import { AI_METERING_ACCURACIES, AI_USAGE_CATEGORIES, AI_USAGE_FEATURES, AI_USAGE_SOURCE_TYPES, AI_USAGE_STATUSES } from '@packages/ai/analytics/types';
import React, { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { TbAlertTriangle, TbBolt, TbChartBar, TbCoins, TbDatabase, TbFilter, TbPlugConnected, TbRefresh, TbStethoscope } from 'react-icons/tb';

import { DonutPieCard } from '@/components/charts/DonutPie';
import { StackedVerticalBarCard } from '@/components/charts/StackedVerticalBar';
import { TimelineLineChart } from '@/components/charts/TimelineLineChart';
import PageToolbar from '@/components/common/PageToolbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

const DAY_MS = 24 * 60 * 60 * 1000;
const ANALYTICS_FILTERS_STORAGE_KEY = 'analytics-dashboard-filters:v2';
const RANGE_OPTIONS = [
  { label: '7 天', value: 7 },
  { label: '30 天', value: 30 },
  { label: '90 天', value: 90 }
] as const;

const BILLING_FILTER_OPTIONS = [
  { label: '全部计费口径', value: 'all' },
  { label: '仅可计费', value: 'billable' },
  { label: '仅非计费', value: 'non_billable' }
] as const;

const USAGE_CATEGORY_LABELS: Record<string, string> = {
  conversation: '对话',
  content_processing: '内容处理',
  media: '媒体',
  memory: '记忆',
  other: '其他',
  system: '系统',
  workflow: '工作流'
};

const USAGE_FEATURE_LABELS: Record<string, string> = {
  chat: '聊天',
  conversation_title: '对话标题',
  embedding: '嵌入',
  image_generation: '图片生成',
  memory_diary: '记忆日记',
  memory_extraction: '记忆提取',
  memory_recall: '记忆召回',
  mindmap: '思维导图',
  other: '其他',
  summary: '总结',
  tagging: '打标签',
  transcription: '转写',
  translation: '翻译',
  workflow_ai: '工作流 AI'
};

const USAGE_SOURCE_TYPE_LABELS: Record<string, string> = {
  chat: '聊天',
  conversation_title: '对话标题',
  embedding: '嵌入',
  image_generation: '图片生成',
  memory: '记忆',
  mindmap: '思维导图',
  other: '其他',
  summary: '总结',
  system: '系统',
  tagging: '打标签',
  transcription: '转写',
  translation: '翻译',
  workflow: '工作流'
};

const USAGE_STAGE_LABELS: Record<string, string> = {
  analyze: '分析',
  background: '后台',
  classify: '分类',
  extract: '提取',
  generate: '生成',
  merge: '合并',
  other: '其他',
  postprocess: '后处理',
  retrieve: '检索',
  transcribe: '转写',
  vectorize: '向量化'
};

const USAGE_STATUS_LABELS: Record<string, string> = {
  cancelled: '已取消',
  completed: '已完成',
  failed: '失败'
};

const METERING_ACCURACY_LABELS: Record<string, string> = {
  exact: '精准',
  high: '高',
  low: '低',
  medium: '中'
};

const METERING_SOURCE_LABELS: Record<string, string> = {
  estimated: '估算',
  message_backfilled: '历史补录',
  provider_reported: 'Provider 返回',
  reconstructed: '重建'
};

type BillingFilterValue = (typeof BILLING_FILTER_OPTIONS)[number]['value'];

type StoredAnalyticsFilters = {
  billingFilter: BillingFilterValue;
  categoryFilter: string;
  featureFilter: string;
  meteringAccuracyFilter: string;
  modelFilter: string;
  providerFilter: string;
  rangeDays: number;
  sourceTypeFilter: string;
  statusFilter: string;
};

type AnalyticsEventMetadata = {
  providerBilledSeconds?: number | null;
  providerUsageType?: string | null;
  workflowId?: string | null;
  workflowName?: string | null;
  workflowNodeId?: string | null;
  workflowNodeLabel?: string | null;
  workflowNodeType?: string | null;
  workflowRunId?: string | null;
};

const DEFAULT_STORED_FILTERS: StoredAnalyticsFilters = {
  billingFilter: 'all',
  categoryFilter: 'all',
  featureFilter: 'all',
  meteringAccuracyFilter: 'all',
  modelFilter: '',
  providerFilter: '',
  rangeDays: 30,
  sourceTypeFilter: 'all',
  statusFilter: 'all'
};

function formatLabel(value: string | null | undefined, labels: Record<string, string>): string {
  if (!value) return '未标记';
  return labels[value] || value;
}

function isAllowedOption<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && options.includes(value as T);
}

function loadStoredAnalyticsFilters(): StoredAnalyticsFilters {
  if (typeof window === 'undefined') {
    return DEFAULT_STORED_FILTERS;
  }

  try {
    const raw = window.localStorage.getItem(ANALYTICS_FILTERS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_STORED_FILTERS;
    }

    const parsed = JSON.parse(raw) as Partial<StoredAnalyticsFilters> | null;
    if (!parsed || typeof parsed !== 'object') {
      return DEFAULT_STORED_FILTERS;
    }

    return {
      billingFilter: isAllowedOption(
        parsed.billingFilter,
        BILLING_FILTER_OPTIONS.map((option) => option.value)
      )
        ? parsed.billingFilter
        : DEFAULT_STORED_FILTERS.billingFilter,
      categoryFilter:
        parsed.categoryFilter && (parsed.categoryFilter === 'all' || isAllowedOption(parsed.categoryFilter, AI_USAGE_CATEGORIES)) ? parsed.categoryFilter : DEFAULT_STORED_FILTERS.categoryFilter,
      featureFilter: parsed.featureFilter && (parsed.featureFilter === 'all' || isAllowedOption(parsed.featureFilter, AI_USAGE_FEATURES)) ? parsed.featureFilter : DEFAULT_STORED_FILTERS.featureFilter,
      meteringAccuracyFilter:
        parsed.meteringAccuracyFilter && (parsed.meteringAccuracyFilter === 'all' || isAllowedOption(parsed.meteringAccuracyFilter, AI_METERING_ACCURACIES))
          ? parsed.meteringAccuracyFilter
          : DEFAULT_STORED_FILTERS.meteringAccuracyFilter,
      modelFilter: typeof parsed.modelFilter === 'string' ? parsed.modelFilter : DEFAULT_STORED_FILTERS.modelFilter,
      providerFilter: typeof parsed.providerFilter === 'string' ? parsed.providerFilter : DEFAULT_STORED_FILTERS.providerFilter,
      rangeDays: RANGE_OPTIONS.some((option) => option.value === parsed.rangeDays) ? parsed.rangeDays! : DEFAULT_STORED_FILTERS.rangeDays,
      sourceTypeFilter:
        parsed.sourceTypeFilter && (parsed.sourceTypeFilter === 'all' || isAllowedOption(parsed.sourceTypeFilter, AI_USAGE_SOURCE_TYPES))
          ? parsed.sourceTypeFilter
          : DEFAULT_STORED_FILTERS.sourceTypeFilter,
      statusFilter: parsed.statusFilter && (parsed.statusFilter === 'all' || isAllowedOption(parsed.statusFilter, AI_USAGE_STATUSES)) ? parsed.statusFilter : DEFAULT_STORED_FILTERS.statusFilter
    };
  } catch {
    return DEFAULT_STORED_FILTERS;
  }
}

function formatInteger(value: number | null | undefined): string {
  return new Intl.NumberFormat('zh-CN').format(value ?? 0);
}

function formatMaybeInteger(value: number | null | undefined): string {
  if (value === undefined || value === null) return '-';
  return formatInteger(value);
}

function formatCost(value: number | null | undefined): string {
  const normalized = value ?? 0;
  if (normalized <= 0) return '0';
  if (normalized < 0.01) return '<0.01';
  return normalized.toFixed(2);
}

function formatMaybeCost(value: number | null | undefined): string {
  if (value === undefined || value === null) return '-';
  return formatCost(value);
}

function formatDateTime(value: number | null | undefined): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    day: '2-digit'
  }).format(value);
}

function formatPercent(numerator: number | null | undefined, denominator: number | null | undefined): string {
  const nextNumerator = numerator ?? 0;
  const nextDenominator = denominator ?? 0;
  if (nextDenominator <= 0) return '0%';
  const percent = (nextNumerator / nextDenominator) * 100;
  return `${percent.toFixed(percent >= 10 ? 0 : 1)}%`;
}

function formatRelativeDuration(value: number | null | undefined): string {
  if (!value) return '-';
  const diff = Math.max(0, Date.now() - value);
  if (diff < 60_000) {
    return `${Math.max(1, Math.floor(diff / 1000))} 秒`;
  }
  if (diff < 3_600_000) {
    return `${Math.floor(diff / 60_000)} 分钟`;
  }
  if (diff < 86_400_000) {
    return `${Math.floor(diff / 3_600_000)} 小时`;
  }
  return `${Math.floor(diff / 86_400_000)} 天`;
}

function compactId(value: string | null | undefined): string {
  if (!value) return '-';
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function outboxHealthBadgeVariant(level: 'healthy' | 'warning' | 'blocked'): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (level === 'blocked') return 'destructive';
  if (level === 'warning') return 'secondary';
  return 'default';
}

function resolveOutboxHealthLevel(outboxHealth: AiUsageOutboxHealth | null): { description: string; label: string; level: 'healthy' | 'warning' | 'blocked' } {
  if (!outboxHealth) {
    return {
      description: '等待健康状态数据',
      label: '加载中',
      level: 'warning'
    };
  }

  const oldestPendingAgeMs = outboxHealth.oldestPendingCreatedAt ? Date.now() - outboxHealth.oldestPendingCreatedAt : 0;
  if (outboxHealth.failedCount > 0) {
    return {
      description: `${formatInteger(outboxHealth.failedCount)} 条失败事件等待处理`,
      label: '存在失败',
      level: 'blocked'
    };
  }

  if (outboxHealth.pendingCount > 0 || outboxHealth.retryingCount > 0 || oldestPendingAgeMs >= 5 * 60 * 1000) {
    return {
      description: `${formatInteger(outboxHealth.pendingCount)} 条待消费，${formatInteger(outboxHealth.retryingCount)} 条在重试`,
      label: '排队中',
      level: 'warning'
    };
  }

  return {
    description: '当前没有待处理或失败事件',
    label: '健康',
    level: 'healthy'
  };
}

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'completed') return 'default';
  if (status === 'failed') return 'destructive';
  if (status === 'cancelled') return 'secondary';
  return 'outline';
}

function parseEventMetadata(value: unknown): AnalyticsEventMetadata {
  if (!value) {
    return {};
  }

  if (typeof value === 'string') {
    try {
      return parseEventMetadata(JSON.parse(value));
    } catch {
      return {};
    }
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  return {
    providerBilledSeconds: typeof record.providerBilledSeconds === 'number' && Number.isFinite(record.providerBilledSeconds) ? record.providerBilledSeconds : undefined,
    providerUsageType: typeof record.providerUsageType === 'string' && record.providerUsageType.trim() ? record.providerUsageType : undefined,
    workflowId: typeof record.workflowId === 'string' && record.workflowId.trim() ? record.workflowId : undefined,
    workflowName: typeof record.workflowName === 'string' && record.workflowName.trim() ? record.workflowName : undefined,
    workflowNodeId: typeof record.workflowNodeId === 'string' && record.workflowNodeId.trim() ? record.workflowNodeId : undefined,
    workflowNodeLabel: typeof record.workflowNodeLabel === 'string' && record.workflowNodeLabel.trim() ? record.workflowNodeLabel : undefined,
    workflowNodeType: typeof record.workflowNodeType === 'string' && record.workflowNodeType.trim() ? record.workflowNodeType : undefined,
    workflowRunId: typeof record.workflowRunId === 'string' && record.workflowRunId.trim() ? record.workflowRunId : undefined
  };
}

function localizeBreakdownRows(rows: AiUsageBreakdownRow[]): AiUsageBreakdownRow[] {
  return rows.map((row) => {
    if (row.dimension === 'category') {
      return { ...row, label: formatLabel(row.value || row.label, USAGE_CATEGORY_LABELS) };
    }
    if (row.dimension === 'feature') {
      return { ...row, label: formatLabel(row.value || row.label, USAGE_FEATURE_LABELS) };
    }
    if (row.dimension === 'sourceType') {
      return { ...row, label: formatLabel(row.value || row.label, USAGE_SOURCE_TYPE_LABELS) };
    }
    if (row.dimension === 'stage') {
      return { ...row, label: formatLabel(row.value || row.label, USAGE_STAGE_LABELS) };
    }
    if (row.dimension === 'status') {
      return { ...row, label: formatLabel(row.value || row.label, USAGE_STATUS_LABELS) };
    }
    return row;
  });
}

function TopListCard(props: { description: string; rows: AiUsageBreakdownRow[]; title: string }): JSX.Element {
  const maxTokens = Math.max(1, ...props.rows.map((row) => row.totalTokens ?? 0));

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{props.title}</CardTitle>
        <CardDescription>{props.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {props.rows.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">当前筛选下还没有可展示的数据。</div>
        ) : (
          props.rows.map((row) => (
            <div key={`${row.dimension}:${row.value}`} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{row.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatInteger(row.eventCount)} 次调用 · 可计费 {formatMaybeInteger(row.billableTotalTokens)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{formatMaybeInteger(row.totalTokens)}</div>
                  <div className="text-xs text-muted-foreground">tokens</div>
                </div>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div className="h-2 rounded-full bg-primary/80" style={{ width: row.totalTokens === null ? '0%' : `${Math.max(6, ((row.totalTokens ?? 0) / maxTokens) * 100)}%` }} />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

interface AnalyticsPageProps {
  workspaceId?: string;
}

const AnalyticsPage: React.FC<AnalyticsPageProps> = ({ workspaceId }) => {
  const [savedFilters] = useState<StoredAnalyticsFilters>(() => loadStoredAnalyticsFilters());
  const [rangeDays, setRangeDays] = useState<number>(savedFilters.rangeDays);
  const [featureFilter, setFeatureFilter] = useState<string>(savedFilters.featureFilter);
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>(savedFilters.sourceTypeFilter);
  const [categoryFilter, setCategoryFilter] = useState<string>(savedFilters.categoryFilter);
  const [statusFilter, setStatusFilter] = useState<string>(savedFilters.statusFilter);
  const [meteringAccuracyFilter, setMeteringAccuracyFilter] = useState<string>(savedFilters.meteringAccuracyFilter);
  const [billingFilter, setBillingFilter] = useState<BillingFilterValue>(savedFilters.billingFilter);
  const [providerFilter, setProviderFilter] = useState<string>(savedFilters.providerFilter);
  const [modelFilter, setModelFilter] = useState<string>(savedFilters.modelFilter);
  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [overview, setOverview] = useState<AiUsageOverview | null>(null);
  const [timeline, setTimeline] = useState<AiUsageTimelinePoint[]>([]);
  const [providerRows, setProviderRows] = useState<AiUsageBreakdownRow[]>([]);
  const [categoryRows, setCategoryRows] = useState<AiUsageBreakdownRow[]>([]);
  const [featureRows, setFeatureRows] = useState<AiUsageBreakdownRow[]>([]);
  const [providerModelRows, setProviderModelRows] = useState<AiUsageProviderModelBreakdownRow[]>([]);
  const [stageRows, setStageRows] = useState<AiUsageBreakdownRow[]>([]);
  const [workflowNodeRows, setWorkflowNodeRows] = useState<AiUsageBreakdownRow[]>([]);
  const [events, setEvents] = useState<AiUsageEventRow[]>([]);
  const [outboxHealth, setOutboxHealth] = useState<AiUsageOutboxHealth | null>(null);
  const [failedOutboxEvents, setFailedOutboxEvents] = useState<AiUsageOutboxEventSummary[]>([]);
  const [outboxActionRunning, setOutboxActionRunning] = useState<'drain' | 'retry' | null>(null);
  const [outboxActionError, setOutboxActionError] = useState('');
  const [outboxActionMessage, setOutboxActionMessage] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillError, setBackfillError] = useState('');
  const [backfillResult, setBackfillResult] = useState<AiChatUsageBackfillResult | null>(null);

  const deferredProviderFilter = useDeferredValue(providerFilter.trim());
  const deferredModelFilter = useDeferredValue(modelFilter.trim());

  const featurePieSlices = useMemo(
    () =>
      featureRows.map((row) => ({
        id: `${row.dimension}:${row.value}`,
        label: row.label,
        value: row.totalTokens ?? 0,
        tooltipLines: [`${formatInteger(row.eventCount)} 次调用 · 可计费 ${formatMaybeInteger(row.billableTotalTokens)}`]
      })),
    [featureRows]
  );
  const categoryPieSlices = useMemo(
    () =>
      categoryRows.map((row) => ({
        id: `${row.dimension}:${row.value}`,
        label: row.label,
        value: row.totalTokens ?? 0,
        tooltipLines: [`${formatInteger(row.eventCount)} 次调用 · 可计费 ${formatMaybeInteger(row.billableTotalTokens)}`]
      })),
    [categoryRows]
  );
  const providerModelStackedData = useMemo(() => {
    if (providerModelRows.length === 0) return [];

    const providerLabels = new Map(providerRows.map((row) => [row.value, row.label]));
    const providerTooltipById = new Map(
      providerRows.map((row) => [
        row.value,
        `${formatInteger(row.eventCount)} 次调用 · 可计费 ${formatMaybeInteger(row.billableTotalTokens)}`
      ])
    );
    const providerModelMap = new Map<string, Map<string, number>>();
    const modelTotals = new Map<string, number>();

    providerModelRows.forEach((row) => {
      const providerId = row.providerId || '未标记';
      const model = row.model || '未标记模型';
      const totalTokens = row.totalTokens ?? 0;
      if (totalTokens <= 0) return;

      const modelMap = providerModelMap.get(providerId) ?? new Map<string, number>();
      modelMap.set(model, (modelMap.get(model) ?? 0) + totalTokens);
      providerModelMap.set(providerId, modelMap);
      modelTotals.set(model, (modelTotals.get(model) ?? 0) + totalTokens);
    });

    const topModels = [...modelTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([model]) => model);
    const topModelSet = new Set(topModels);

    const providersInOrder = [...providerRows.map((row) => row.value), ...providerModelMap.keys()].filter((provider, index, arr) => provider && arr.indexOf(provider) === index);

    return providersInOrder
      .map((providerId) => {
        const modelMap = providerModelMap.get(providerId);
        if (!modelMap) return null;

        const segments = topModels
          .map((model) => ({
            key: model,
            label: model,
            value: modelMap.get(model) ?? 0
          }))
          .filter((segment) => segment.value > 0);

        const otherTotal = [...modelMap.entries()].reduce((sum, [model, value]) => (topModelSet.has(model) ? sum : sum + value), 0);
        if (otherTotal > 0) {
          segments.push({
            key: '__other_models__',
            label: '其他模型',
            value: otherTotal
          });
        }

        if (segments.length === 0) return null;
        const extraLine = providerTooltipById.get(providerId);
        return {
          id: providerId,
          label: providerLabels.get(providerId) ?? providerId,
          segments,
          tooltipLines: extraLine ? [extraLine] : undefined
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [providerModelRows, providerRows]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      ANALYTICS_FILTERS_STORAGE_KEY,
      JSON.stringify({
        billingFilter,
        categoryFilter,
        featureFilter,
        meteringAccuracyFilter,
        modelFilter,
        providerFilter,
        rangeDays,
        sourceTypeFilter,
        statusFilter
      } satisfies StoredAnalyticsFilters)
    );
  }, [billingFilter, categoryFilter, featureFilter, meteringAccuracyFilter, modelFilter, providerFilter, rangeDays, sourceTypeFilter, statusFilter]);

  useEffect(() => {
    let cancelled = false;

    const run = async (): Promise<void> => {
      setLoading(true);
      setError('');

      const now = Date.now();
      const filter: AiUsageQueryFilter = {
        createdAtFrom: now - rangeDays * DAY_MS,
        createdAtTo: now,
        ...(workspaceId ? { workspaceId } : {}),
        ...(featureFilter !== 'all' ? { usageFeature: featureFilter as AiUsageQueryFilter['usageFeature'] } : {}),
        ...(sourceTypeFilter !== 'all' ? { sourceType: sourceTypeFilter as AiUsageQueryFilter['sourceType'] } : {}),
        ...(categoryFilter !== 'all' ? { usageCategory: categoryFilter as AiUsageQueryFilter['usageCategory'] } : {}),
        ...(statusFilter !== 'all' ? { status: statusFilter as AiUsageQueryFilter['status'] } : {}),
        ...(meteringAccuracyFilter !== 'all' ? { meteringAccuracy: meteringAccuracyFilter as AiUsageQueryFilter['meteringAccuracy'] } : {}),
        ...(billingFilter === 'billable' ? { billingEligible: true } : {}),
        ...(billingFilter === 'non_billable' ? { billingEligible: false } : {}),
        ...(deferredProviderFilter ? { providerId: deferredProviderFilter } : {}),
        ...(deferredModelFilter ? { model: deferredModelFilter } : {})
      };

      try {
        const [nextOverview, nextTimeline, nextProviders, nextCategories, nextFeatures, nextProviderModelRows, nextStages, nextWorkflowNodes, nextEvents, nextOutboxHealth, nextFailedOutboxEvents] =
          await Promise.all([
            window.YUA.analytics.getUsageOverview(filter),
            window.YUA.analytics.getUsageTimeline(filter, 'day', Math.max(7, rangeDays)),
            window.YUA.analytics.getUsageByProvider(filter, 8),
            window.YUA.analytics.getUsageByCategory(filter, 8),
            window.YUA.analytics.getUsageByFeature(filter, 8),
            window.YUA.analytics.getUsageProviderModelBreakdown(filter, 8),
            window.YUA.analytics.getUsageBreakdown({ dimension: 'stage', filter, limit: 8 }),
            window.YUA.analytics.getUsageBreakdown({ dimension: 'workflowNodeType', filter, limit: 8 }),
            window.YUA.analytics.listUsageEvents(filter, 15, 0),
            window.YUA.analytics.getOutboxHealth(),
            window.YUA.analytics.listOutboxEvents('failed', 6)
          ]);

        if (cancelled) return;

        startTransition(() => {
          setOverview(nextOverview);
          setTimeline(nextTimeline);
          setProviderRows(localizeBreakdownRows(nextProviders));
          setCategoryRows(localizeBreakdownRows(nextCategories));
          setFeatureRows(localizeBreakdownRows(nextFeatures));
          setProviderModelRows(nextProviderModelRows);
          setStageRows(localizeBreakdownRows(nextStages));
          setWorkflowNodeRows(localizeBreakdownRows(nextWorkflowNodes));
          setEvents(nextEvents);
          setOutboxHealth(nextOutboxHealth);
          setFailedOutboxEvents(nextFailedOutboxEvents);
        });
      } catch (nextError) {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : '加载统计数据失败');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [billingFilter, categoryFilter, deferredModelFilter, deferredProviderFilter, featureFilter, meteringAccuracyFilter, rangeDays, refreshToken, sourceTypeFilter, statusFilter, workspaceId]);

  const outboxHealthStatus = resolveOutboxHealthLevel(outboxHealth);
  const nonDefaultFilterCount = [
    rangeDays !== DEFAULT_STORED_FILTERS.rangeDays,
    featureFilter !== DEFAULT_STORED_FILTERS.featureFilter,
    sourceTypeFilter !== DEFAULT_STORED_FILTERS.sourceTypeFilter,
    categoryFilter !== DEFAULT_STORED_FILTERS.categoryFilter,
    statusFilter !== DEFAULT_STORED_FILTERS.statusFilter,
    meteringAccuracyFilter !== DEFAULT_STORED_FILTERS.meteringAccuracyFilter,
    billingFilter !== DEFAULT_STORED_FILTERS.billingFilter,
    providerFilter.trim() !== DEFAULT_STORED_FILTERS.providerFilter,
    modelFilter.trim() !== DEFAULT_STORED_FILTERS.modelFilter
  ].filter(Boolean).length;
  const canResetFilters = nonDefaultFilterCount > 0;

  const handleBackfillChatUsage = async (): Promise<void> => {
    setBackfillRunning(true);
    setBackfillError('');

    try {
      const result = await window.YUA.analytics.backfillChatUsage(workspaceId ? { workspaceId } : undefined);
      setBackfillResult(result);
      setRefreshToken((value) => value + 1);
    } catch (nextError) {
      setBackfillError(nextError instanceof Error ? nextError.message : '历史聊天补录失败');
    } finally {
      setBackfillRunning(false);
    }
  };

  const handleDrainOutbox = async (): Promise<void> => {
    setOutboxActionRunning('drain');
    setOutboxActionError('');
    setOutboxActionMessage('');

    try {
      const result: AiUsageOutboxDrainResult = await window.YUA.analytics.drainOutbox();
      setOutboxActionMessage(result.scheduled ? '已请求立即消费 pending 队列。' : '当前没有触发新的消费任务。');
      setRefreshToken((value) => value + 1);
    } catch (nextError) {
      setOutboxActionError(nextError instanceof Error ? nextError.message : '触发队列消费失败');
    } finally {
      setOutboxActionRunning(null);
    }
  };

  const handleRetryFailedOutbox = async (): Promise<void> => {
    setOutboxActionRunning('retry');
    setOutboxActionError('');
    setOutboxActionMessage('');

    try {
      const result: AiUsageOutboxRetryResult = await window.YUA.analytics.retryOutboxEvents(50);
      setOutboxActionMessage(result.resetCount > 0 ? `已重试 ${formatInteger(result.resetCount)} 条失败事件，并重新安排消费。` : '当前没有可重试的失败事件。');
      setRefreshToken((value) => value + 1);
    } catch (nextError) {
      setOutboxActionError(nextError instanceof Error ? nextError.message : '重试失败队列失败');
    } finally {
      setOutboxActionRunning(null);
    }
  };

  const resetFilters = (): void => {
    setRangeDays(DEFAULT_STORED_FILTERS.rangeDays);
    setFeatureFilter(DEFAULT_STORED_FILTERS.featureFilter);
    setSourceTypeFilter(DEFAULT_STORED_FILTERS.sourceTypeFilter);
    setCategoryFilter(DEFAULT_STORED_FILTERS.categoryFilter);
    setStatusFilter(DEFAULT_STORED_FILTERS.statusFilter);
    setMeteringAccuracyFilter(DEFAULT_STORED_FILTERS.meteringAccuracyFilter);
    setBillingFilter(DEFAULT_STORED_FILTERS.billingFilter);
    setProviderFilter(DEFAULT_STORED_FILTERS.providerFilter);
    setModelFilter(DEFAULT_STORED_FILTERS.modelFilter);
  };

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <PageToolbar
        icon={<TbChartBar className="h-4 w-4" />}
        title="AI 统计"
        leftExtra={<Badge variant="outline">{workspaceId ? '当前工作空间' : '全部工作空间'}</Badge>}
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={cn(
                'h-8 w-8 shrink-0',
                canResetFilters && 'border-primary/60 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary'
              )}
              aria-label="查询筛选"
              title="查询筛选"
              onClick={() => setFiltersSheetOpen(true)}
            >
              <TbFilter className="h-4 w-4" />
            </Button>
            <div className="hidden gap-1 md:flex">
              {RANGE_OPTIONS.map((option) => (
                <Button key={option.value} size="sm" variant={rangeDays === option.value ? 'default' : 'outline'} onClick={() => setRangeDays(option.value)}>
                  {option.label}
                </Button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={() => setRefreshToken((value) => value + 1)}>
              <TbRefresh className="mr-1 h-3.5 w-3.5" />
              刷新
            </Button>
            <Button size="sm" variant="outline" onClick={() => void handleBackfillChatUsage()} disabled={backfillRunning}>
              {backfillRunning ? '补录中...' : '补录历史聊天'}
            </Button>
          </div>
        }
      />

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          {error ? (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-destructive">统计数据加载失败</CardTitle>
                <CardDescription>{error}</CardDescription>
              </CardHeader>
            </Card>
          ) : null}

          {backfillError ? (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-destructive">历史聊天补录失败</CardTitle>
                <CardDescription>{backfillError}</CardDescription>
              </CardHeader>
            </Card>
          ) : null}

          {backfillResult ? (
            <Card className="border-border/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">历史聊天补录结果</CardTitle>
                <CardDescription>用于把 `chat_messages.metadata.aiUsage / piRawUsage` 回填到统一 usage fact 表。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                  {[
                    ['扫描消息', formatInteger(backfillResult.scannedMessages)],
                    ['可处理', formatInteger(backfillResult.candidateMessages)],
                    ['新写入', formatInteger(backfillResult.insertedEvents)],
                    ['已去重', formatInteger(backfillResult.dedupedEvents)],
                    ['跳过', formatInteger(backfillResult.skippedNoUsage + backfillResult.skippedInvalidMetadata + backfillResult.skippedMissingProvider + backfillResult.skippedMissingModel)],
                    ['失败', formatInteger(backfillResult.failedEvents)]
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border bg-muted/20 p-3">
                      <div className="text-xs text-muted-foreground">{label}</div>
                      <div className="mt-1 text-xl font-semibold">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg border px-3 py-2 text-sm">
                    <div className="text-xs text-muted-foreground">无 usage</div>
                    <div className="mt-1 font-medium">{formatInteger(backfillResult.skippedNoUsage)}</div>
                  </div>
                  <div className="rounded-lg border px-3 py-2 text-sm">
                    <div className="text-xs text-muted-foreground">metadata 非法</div>
                    <div className="mt-1 font-medium">{formatInteger(backfillResult.skippedInvalidMetadata)}</div>
                  </div>
                  <div className="rounded-lg border px-3 py-2 text-sm">
                    <div className="text-xs text-muted-foreground">缺 provider</div>
                    <div className="mt-1 font-medium">{formatInteger(backfillResult.skippedMissingProvider)}</div>
                  </div>
                  <div className="rounded-lg border px-3 py-2 text-sm">
                    <div className="text-xs text-muted-foreground">缺 model</div>
                    <div className="mt-1 font-medium">{formatInteger(backfillResult.skippedMissingModel)}</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span>开始：{formatDateTime(backfillResult.startedAt)}</span>
                  <span>结束：{formatDateTime(backfillResult.completedAt)}</span>
                  <span>耗时：{formatInteger(backfillResult.durationMs)} ms</span>
                </div>

                {backfillResult.warnings.length > 0 ? (
                  <div className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
                    {backfillResult.warnings.slice(0, 5).map((warning) => (
                      <div key={warning}>{warning}</div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {loading && !overview
              ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-xl" />)
              : [
                {
                  description: `${formatInteger(overview?.completedEvents)} 完成 / ${formatInteger(overview?.failedEvents)} 失败 / ${formatInteger(overview?.cancelledEvents)} 取消`,
                  icon: <TbBolt className="h-4 w-4" />,
                  title: '总 tokens',
                  value: formatMaybeInteger(overview?.totalTokens)
                },
                {
                  description: `${formatMaybeInteger(overview?.inputTokens)} 输入 / ${formatMaybeInteger(overview?.outputTokens)} 输出`,
                  icon: <TbCoins className="h-4 w-4" />,
                  title: '可计费 tokens',
                  value: formatMaybeInteger(overview?.billableTotalTokens)
                },
                {
                  description: `${formatInteger(overview?.distinctRequestCount)} 个 request / ${formatInteger(overview?.distinctTraceCount)} 条 trace`,
                  icon: <TbDatabase className="h-4 w-4" />,
                  title: '总调用数',
                  value: formatInteger(overview?.totalEvents)
                },
                {
                  description: `精准 ${formatPercent(overview?.exactEvents, overview?.totalEvents)} / 可计费 ${formatPercent(overview?.billingEligibleEvents, overview?.totalEvents)}`,
                  icon: <TbPlugConnected className="h-4 w-4" />,
                  title: '模型数 / Provider 数',
                  value: `${formatInteger(overview?.distinctModelCount)} / ${formatInteger(overview?.distinctProviderCount)}`
                }
              ].map((item) => (
                <Card key={item.title} className="border-border/70">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <CardDescription>{item.title}</CardDescription>
                      {item.icon}
                    </div>
                    <CardTitle className="text-3xl">{item.value}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 text-sm text-muted-foreground">{item.description}</CardContent>
                </Card>
              ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
            <Card className="border-border/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">趋势</CardTitle>
                <CardDescription>按天汇总最近 {rangeDays} 天 total tokens；横轴为日期，纵轴为用量，曲线便于观察波动。</CardDescription>
              </CardHeader>
              <CardContent>
                {loading && timeline.length === 0 ? (
                  <Skeleton className="h-[min(22rem,calc(100vw-4rem))] min-h-[240px] w-full rounded-lg sm:min-h-[280px]" />
                ) : (
                  <TimelineLineChart
                    data={timeline}
                    emptyMessage="当前时间范围内还没有 AI 调用事件。"
                    valueLabel="total tokens"
                    formatValue={formatInteger}
                  />
                )}
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">计量精度</CardTitle>
                <CardDescription>用于后续成本核算、对账与付费能力的基线视图。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-xl border bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">精准计量事件</div>
                  <div className="mt-1 text-2xl font-semibold">{formatInteger(overview?.exactEvents)}</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">可计费事件</div>
                    <div className="mt-1 text-xl font-semibold">{formatInteger(overview?.billingEligibleEvents)}</div>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">最后一条事件</div>
                    <div className="mt-1 text-sm font-medium">{formatDateTime(overview?.lastEventAt)}</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="rounded-lg border px-3 py-2">
                    <div className="text-xs text-muted-foreground">high</div>
                    <div className="mt-1 font-medium">{formatInteger(overview?.highAccuracyEvents)}</div>
                  </div>
                  <div className="rounded-lg border px-3 py-2">
                    <div className="text-xs text-muted-foreground">medium</div>
                    <div className="mt-1 font-medium">{formatInteger(overview?.mediumAccuracyEvents)}</div>
                  </div>
                  <div className="rounded-lg border px-3 py-2">
                    <div className="text-xs text-muted-foreground">low</div>
                    <div className="mt-1 font-medium">{formatInteger(overview?.lowAccuracyEvents)}</div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">预计成本约 {formatMaybeCost(overview?.estimatedCost)}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <Card className="border-border/70">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <TbStethoscope className="h-4 w-4" />
                      采集链路健康
                    </CardTitle>
                    <CardDescription>这部分展示 analytics outbox 的全局健康状态，不受上方业务筛选影响。已处理记录默认只保留最近 7 天。</CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Badge variant={outboxHealthBadgeVariant(outboxHealthStatus.level)}>{outboxHealthStatus.label}</Badge>
                    <Button size="sm" variant="outline" disabled={outboxActionRunning !== null} onClick={() => void handleDrainOutbox()}>
                      {outboxActionRunning === 'drain' ? '消费中...' : '立即消费队列'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {loading && !outboxHealth ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <Skeleton key={index} className="h-10 rounded-lg" />
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="rounded-xl border bg-muted/20 p-3">
                      <div className="text-xs text-muted-foreground">当前状态</div>
                      <div className="mt-1 text-lg font-semibold">{outboxHealthStatus.description}</div>
                    </div>

                    {outboxActionError ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{outboxActionError}</div> : null}
                    {outboxActionMessage ? <div className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">{outboxActionMessage}</div> : null}

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border bg-muted/20 p-3">
                        <div className="text-xs text-muted-foreground">待消费</div>
                        <div className="mt-1 text-2xl font-semibold">{formatInteger(outboxHealth?.pendingCount)}</div>
                      </div>
                      <div className="rounded-xl border bg-muted/20 p-3">
                        <div className="text-xs text-muted-foreground">失败</div>
                        <div className="mt-1 text-2xl font-semibold">{formatInteger(outboxHealth?.failedCount)}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div className="rounded-lg border px-3 py-2">
                        <div className="text-xs text-muted-foreground">重试中</div>
                        <div className="mt-1 font-medium">{formatInteger(outboxHealth?.retryingCount)}</div>
                      </div>
                      <div className="rounded-lg border px-3 py-2">
                        <div className="text-xs text-muted-foreground">保留已处理</div>
                        <div className="mt-1 font-medium">{formatInteger(outboxHealth?.processedCount)}</div>
                      </div>
                      <div className="rounded-lg border px-3 py-2">
                        <div className="text-xs text-muted-foreground">最大重试次数</div>
                        <div className="mt-1 font-medium">{formatInteger(outboxHealth?.maxPendingAttemptCount)}</div>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg border px-3 py-2 text-sm">
                        <div className="text-xs text-muted-foreground">最老积压</div>
                        <div className="mt-1 font-medium">{outboxHealth?.oldestPendingCreatedAt ? `${formatRelativeDuration(outboxHealth.oldestPendingCreatedAt)} 前` : '无积压'}</div>
                      </div>
                      <div className="rounded-lg border px-3 py-2 text-sm">
                        <div className="text-xs text-muted-foreground">最近成功处理</div>
                        <div className="mt-1 font-medium">{formatDateTime(outboxHealth?.newestProcessedAt)}</div>
                      </div>
                      <div className="rounded-lg border px-3 py-2 text-sm">
                        <div className="text-xs text-muted-foreground">最近失败时间</div>
                        <div className="mt-1 font-medium">{formatDateTime(outboxHealth?.newestFailedAt)}</div>
                      </div>
                      <div className="rounded-lg border px-3 py-2 text-sm">
                        <div className="text-xs text-muted-foreground">最近发出事件</div>
                        <div className="mt-1 font-medium">{formatDateTime(outboxHealth?.lastEmittedAt)}</div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <TbAlertTriangle className="h-4 w-4" />
                      队列异常
                    </CardTitle>
                    <CardDescription>最近失败的 outbox 事件。用于排查“业务发了事件，但统计没有最终落账”的场景。</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">仅失败队列</Badge>
                    <Button size="sm" variant="outline" disabled={outboxActionRunning !== null} onClick={() => void handleRetryFailedOutbox()}>
                      {outboxActionRunning === 'retry' ? '重试中...' : '重试失败队列'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading && failedOutboxEvents.length === 0 ? (
                  Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-16 rounded-lg" />)
                ) : failedOutboxEvents.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">当前没有失败的 outbox 事件，采集链路状态稳定。</div>
                ) : (
                  failedOutboxEvents.map((event) => (
                    <div key={event.id} className="rounded-xl border bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="destructive">{event.status}</Badge>
                          <Badge variant="outline">{formatLabel(event.usageFeature, USAGE_FEATURE_LABELS)}</Badge>
                          <Badge variant="secondary">{formatLabel(event.usageStage, USAGE_STAGE_LABELS)}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">{formatDateTime(event.updatedAt || event.createdAt || event.emittedAt)}</div>
                      </div>

                      <div className="mt-2 text-sm font-medium">
                        {event.providerId} / {event.model}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        producer {event.producer || '-'} · request {compactId(event.requestId)} · trace {compactId(event.traceId)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        source {event.sourceType}:{compactId(event.sourceId)} · operation {event.operationKey} · 已尝试 {formatInteger(event.attemptCount)} 次
                      </div>
                      <div className="mt-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">{event.lastError || '未记录 lastError'}</div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <StackedVerticalBarCard
            title="服务提供商与模型分布"
            description="横轴为服务商，堆叠色块为各模型用量，柱高合计即该服务商 total tokens；悬浮可查看各模型明细、调用次数与可计费 tokens。"
            data={providerModelStackedData}
            emptyMessage="当前筛选下还没有可展示的数据。"
            valueLabel="tokens"
            formatValue={formatInteger}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <DonutPieCard
              title="用途分类"
              description="按业务分类观察资源分布，例如对话、媒体、记忆与工作流。"
              slices={categoryPieSlices}
              emptyMessage="当前筛选下还没有可展示的数据。"
              emptyWhenAllValuesZeroMessage="当前筛选下各分类 tokens 均为 0，暂无占比可展示。"
              valueLabel="tokens"
              formatValue={formatInteger}
            />
            <DonutPieCard
              title="具体功能"
              description="按 total tokens 观察翻译、总结、记忆提取、转写、图像生成等用途占比。"
              slices={featurePieSlices}
              emptyMessage="当前筛选下还没有可展示的数据。"
              emptyWhenAllValuesZeroMessage="当前筛选下各功能 tokens 均为 0，暂无占比可展示。"
              valueLabel="tokens"
              formatValue={formatInteger}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <TopListCard title="执行阶段" description="用于观察 analyze / generate / classify 等阶段的 token 占比。" rows={stageRows} />
            <TopListCard title="工作流 AI 节点" description="按 workflow node type 观察工作流中最耗资源的 AI 节点。" rows={workflowNodeRows} />
          </div>

          <Card className="border-border/70">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">最近调用明细</CardTitle>
              <CardDescription>用于排查 token 落点、工作流节点来源、计量精度与后续对账问题。</CardDescription>
            </CardHeader>
            <CardContent>
              {loading && events.length === 0 ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Skeleton key={index} className="h-10 rounded-lg" />
                  ))}
                </div>
              ) : events.length === 0 ? (
                <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">当前筛选下还没有可展示的调用明细。</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>时间</TableHead>
                      <TableHead>Provider / 模型</TableHead>
                      <TableHead>用途</TableHead>
                      <TableHead>上下文</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="text-right">输入 / 输出 / 总</TableHead>
                      <TableHead className="text-right">计费 / 精度</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((event) => {
                      const metadata = parseEventMetadata(event.metadata);
                      const isBillingEligible = Boolean(event.billingEligible);
                      const providerUsageHint =
                        metadata.providerBilledSeconds !== undefined
                          ? `按 ${metadata.providerBilledSeconds}s 计量`
                          : metadata.providerUsageType
                            ? `provider usage: ${metadata.providerUsageType}`
                            : event.totalTokens === null || event.totalTokens === undefined
                              ? 'provider 未返回 token usage'
                              : event.sourceLabel || event.operationKey;

                      return (
                        <TableRow key={event.id}>
                          <TableCell className="whitespace-nowrap align-top text-xs text-muted-foreground">{formatDateTime(event.createdAt)}</TableCell>

                          <TableCell className="align-top">
                            <div className="font-medium">
                              {event.providerId} / <span className="text-xs text-muted-foreground">{event.model}</span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {event.providerPresetId ? <Badge variant="outline">{event.providerPresetId}</Badge> : null}
                              {metadata.providerUsageType ? <Badge variant="secondary">{metadata.providerUsageType}</Badge> : null}
                            </div>
                          </TableCell>

                          <TableCell className="align-top">
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="outline">{formatLabel(event.usageFeature, USAGE_FEATURE_LABELS)}</Badge>
                              <Badge variant="secondary">{formatLabel(event.usageStage, USAGE_STAGE_LABELS)}</Badge>
                              <Badge variant="outline">{formatLabel(event.usageCategory, USAGE_CATEGORY_LABELS)}</Badge>
                              <Badge variant="outline">{formatLabel(event.sourceType, USAGE_SOURCE_TYPE_LABELS)}</Badge>
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">{event.sourceLabel || event.operationKey}</div>
                          </TableCell>

                          <TableCell className="align-top">
                            <div className="space-y-1 text-xs text-muted-foreground">
                              {metadata.workflowNodeType || metadata.workflowNodeLabel || metadata.workflowName ? (
                                <div className="flex flex-wrap gap-1">
                                  {metadata.workflowNodeType ? <Badge variant="outline">{metadata.workflowNodeType}</Badge> : null}
                                  {metadata.workflowNodeLabel ? <Badge variant="secondary">{metadata.workflowNodeLabel}</Badge> : null}
                                  {!metadata.workflowNodeLabel && metadata.workflowName ? <Badge variant="secondary">{metadata.workflowName}</Badge> : null}
                                </div>
                              ) : null}
                              {metadata.workflowRunId ? <div title={metadata.workflowRunId}>run {compactId(metadata.workflowRunId)}</div> : null}
                              {metadata.workflowNodeId ? <div title={metadata.workflowNodeId}>node {compactId(metadata.workflowNodeId)}</div> : null}
                              <div title={event.requestId}>req {compactId(event.requestId)}</div>
                              {event.providerRequestId ? <div title={event.providerRequestId}>provider {compactId(event.providerRequestId)}</div> : null}
                              <div title={event.traceId}>trace {compactId(event.traceId)}</div>
                            </div>
                          </TableCell>

                          <TableCell className="align-top">
                            <div className="flex flex-wrap gap-1">
                              <Badge variant={statusBadgeVariant(event.status)}>{formatLabel(event.status, USAGE_STATUS_LABELS)}</Badge>
                              <Badge variant="outline">{formatLabel(event.meteringAccuracy, METERING_ACCURACY_LABELS)}</Badge>
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">{formatLabel(event.meteringSource, METERING_SOURCE_LABELS)}</div>
                          </TableCell>

                          <TableCell className="align-top text-right">
                            <div className="font-medium">
                              {formatMaybeInteger(event.inputTokens)} / {formatMaybeInteger(event.outputTokens)} / {formatMaybeInteger(event.totalTokens)}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">可计费 {formatMaybeInteger(event.billableTotalTokens)}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{providerUsageHint}</div>
                          </TableCell>

                          <TableCell className="align-top text-right">
                            <div className="flex justify-end gap-1">
                              <Badge variant={isBillingEligible ? 'default' : 'secondary'}>{isBillingEligible ? '可计费' : '非计费'}</Badge>
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">accuracy {event.meteringAccuracy}</div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>

      <Sheet open={filtersSheetOpen} onOpenChange={setFiltersSheetOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-xl md:max-w-2xl">
          <SheetHeader>
            <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
              <div className="space-y-2 text-left">
                <SheetTitle>查询筛选</SheetTitle>
                <SheetDescription>筛选条件会同时作用于总览、趋势、排行和明细，便于按业务用途、计费口径和模型定位消耗来源。</SheetDescription>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {canResetFilters ? (
                  <>
                    <Badge variant="outline">{nonDefaultFilterCount} 项非默认</Badge>
                    <Button size="sm" variant="outline" onClick={resetFilters}>
                      重置筛选
                    </Button>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">当前为默认配置</span>
                )}
              </div>
            </div>
          </SheetHeader>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">具体功能</div>
              <Select value={featureFilter} onValueChange={setFeatureFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="全部功能" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部功能</SelectItem>
                  {AI_USAGE_FEATURES.map((feature) => (
                    <SelectItem key={feature} value={feature}>
                      {formatLabel(feature, USAGE_FEATURE_LABELS)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">来源类型</div>
              <Select value={sourceTypeFilter} onValueChange={setSourceTypeFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="全部来源" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部来源</SelectItem>
                  {AI_USAGE_SOURCE_TYPES.map((sourceType) => (
                    <SelectItem key={sourceType} value={sourceType}>
                      {formatLabel(sourceType, USAGE_SOURCE_TYPE_LABELS)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">业务分类</div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="全部分类" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部分类</SelectItem>
                  {AI_USAGE_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {formatLabel(category, USAGE_CATEGORY_LABELS)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">调用状态</div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="全部状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  {AI_USAGE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {formatLabel(status, USAGE_STATUS_LABELS)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">计量精度</div>
              <Select value={meteringAccuracyFilter} onValueChange={setMeteringAccuracyFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="全部精度" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部精度</SelectItem>
                  {AI_METERING_ACCURACIES.map((accuracy) => (
                    <SelectItem key={accuracy} value={accuracy}>
                      {formatLabel(accuracy, METERING_ACCURACY_LABELS)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">计费口径</div>
              <Select value={billingFilter} onValueChange={(value) => setBillingFilter(value as BillingFilterValue)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="全部计费口径" />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_FILTER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <div className="text-xs text-muted-foreground">Provider</div>
              <Input value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)} placeholder="精确匹配 providerId，例如 openai" />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <div className="text-xs text-muted-foreground">模型</div>
              <Input value={modelFilter} onChange={(event) => setModelFilter(event.target.value)} placeholder="精确匹配模型，例如 gpt-4.1-mini" />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default AnalyticsPage;

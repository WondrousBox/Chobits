import type { AiChatUsageBackfillResult, AiUsageBreakdownRow, AiUsageEventRow, AiUsageOverview, AiUsageQueryFilter, AiUsageTimelinePoint } from '@packages/ai/analytics/types';
import { AI_USAGE_FEATURES, AI_USAGE_SOURCE_TYPES } from '@packages/ai/analytics/types';
import React, { startTransition, useEffect, useState } from 'react';
import { TbBolt, TbChartBar, TbCoins, TbDatabase, TbPlugConnected, TbRefresh } from 'react-icons/tb';

import PageToolbar from '@/components/common/PageToolbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const DAY_MS = 24 * 60 * 60 * 1000;
const ANALYTICS_FILTERS_STORAGE_KEY = 'analytics-dashboard-filters:v1';
const RANGE_OPTIONS = [
  { label: '7 天', value: 7 },
  { label: '30 天', value: 30 },
  { label: '90 天', value: 90 }
] as const;

type StoredAnalyticsFilters = {
  featureFilter: string;
  rangeDays: number;
  sourceTypeFilter: string;
};

function loadStoredAnalyticsFilters(): StoredAnalyticsFilters {
  const defaults: StoredAnalyticsFilters = {
    featureFilter: 'all',
    rangeDays: 30,
    sourceTypeFilter: 'all'
  };

  if (typeof window === 'undefined') {
    return defaults;
  }

  try {
    const raw = window.localStorage.getItem(ANALYTICS_FILTERS_STORAGE_KEY);
    if (!raw) {
      return defaults;
    }

    const parsed = JSON.parse(raw) as Partial<StoredAnalyticsFilters> | null;
    if (!parsed || typeof parsed !== 'object') {
      return defaults;
    }

    const rangeDays = RANGE_OPTIONS.some((option) => option.value === parsed.rangeDays) ? parsed.rangeDays! : defaults.rangeDays;
    const featureFilter =
      parsed.featureFilter && (parsed.featureFilter === 'all' || AI_USAGE_FEATURES.includes(parsed.featureFilter as (typeof AI_USAGE_FEATURES)[number]))
        ? parsed.featureFilter
        : defaults.featureFilter;
    const sourceTypeFilter =
      parsed.sourceTypeFilter && (parsed.sourceTypeFilter === 'all' || AI_USAGE_SOURCE_TYPES.includes(parsed.sourceTypeFilter as (typeof AI_USAGE_SOURCE_TYPES)[number]))
        ? parsed.sourceTypeFilter
        : defaults.sourceTypeFilter;

    return {
      featureFilter,
      rangeDays,
      sourceTypeFilter
    };
  } catch {
    return defaults;
  }
}

function formatInteger(value: number | null | undefined): string {
  return new Intl.NumberFormat('zh-CN').format(value ?? 0);
}

function formatCost(value: number | null | undefined): string {
  const normalized = value ?? 0;
  if (normalized <= 0) return '0';
  if (normalized < 0.01) return '<0.01';
  return normalized.toFixed(2);
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

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'completed') return 'default';
  if (status === 'failed') return 'destructive';
  if (status === 'cancelled') return 'secondary';
  return 'outline';
}

function TopListCard(props: { description: string; rows: AiUsageBreakdownRow[]; title: string }): JSX.Element {
  const maxTokens = Math.max(1, ...props.rows.map((row) => row.totalTokens));

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
                  <div className="text-xs text-muted-foreground">{formatInteger(row.eventCount)} 次调用</div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{formatInteger(row.totalTokens)}</div>
                  <div className="text-xs text-muted-foreground">tokens</div>
                </div>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div className="h-2 rounded-full bg-primary/80" style={{ width: `${Math.max(6, (row.totalTokens / maxTokens) * 100)}%` }} />
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
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [overview, setOverview] = useState<AiUsageOverview | null>(null);
  const [timeline, setTimeline] = useState<AiUsageTimelinePoint[]>([]);
  const [providerRows, setProviderRows] = useState<AiUsageBreakdownRow[]>([]);
  const [modelRows, setModelRows] = useState<AiUsageBreakdownRow[]>([]);
  const [categoryRows, setCategoryRows] = useState<AiUsageBreakdownRow[]>([]);
  const [featureRows, setFeatureRows] = useState<AiUsageBreakdownRow[]>([]);
  const [events, setEvents] = useState<AiUsageEventRow[]>([]);
  const [refreshToken, setRefreshToken] = useState(0);
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillError, setBackfillError] = useState('');
  const [backfillResult, setBackfillResult] = useState<AiChatUsageBackfillResult | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      ANALYTICS_FILTERS_STORAGE_KEY,
      JSON.stringify({
        featureFilter,
        rangeDays,
        sourceTypeFilter
      } satisfies StoredAnalyticsFilters)
    );
  }, [featureFilter, rangeDays, sourceTypeFilter]);

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
        ...(sourceTypeFilter !== 'all' ? { sourceType: sourceTypeFilter as AiUsageQueryFilter['sourceType'] } : {})
      };

      try {
        const [nextOverview, nextTimeline, nextProviders, nextModels, nextCategories, nextFeatures, nextEvents] = await Promise.all([
          window.YUA.analytics.getUsageOverview(filter),
          window.YUA.analytics.getUsageTimeline(filter, 'day', Math.max(7, rangeDays)),
          window.YUA.analytics.getUsageByProvider(filter, 8),
          window.YUA.analytics.getUsageByModel(filter, 8),
          window.YUA.analytics.getUsageByCategory(filter, 8),
          window.YUA.analytics.getUsageByFeature(filter, 8),
          window.YUA.analytics.listUsageEvents(filter, 15, 0)
        ]);

        if (cancelled) return;

        startTransition(() => {
          setOverview(nextOverview);
          setTimeline(nextTimeline);
          setProviderRows(nextProviders);
          setModelRows(nextModels);
          setCategoryRows(nextCategories);
          setFeatureRows(nextFeatures);
          setEvents(nextEvents);
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
  }, [featureFilter, rangeDays, refreshToken, sourceTypeFilter, workspaceId]);

  const maxTimelineTokens = Math.max(1, ...timeline.map((point) => point.totalTokens));

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

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <PageToolbar
        icon={<TbChartBar className="h-4 w-4" />}
        title="AI 统计"
        leftExtra={<Badge variant="outline">{workspaceId ? '当前工作空间' : '全部工作空间'}</Badge>}
        actions={
          <div className="flex items-center gap-2">
            <div className="hidden gap-1 md:flex">
              {RANGE_OPTIONS.map((option) => (
                <Button key={option.value} size="sm" variant={rangeDays === option.value ? 'default' : 'outline'} onClick={() => setRangeDays(option.value)}>
                  {option.label}
                </Button>
              ))}
            </div>
            <Select value={featureFilter} onValueChange={setFeatureFilter}>
              <SelectTrigger className="h-8 w-[150px]">
                <SelectValue placeholder="功能范围" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部功能</SelectItem>
                {AI_USAGE_FEATURES.map((feature) => (
                  <SelectItem key={feature} value={feature}>
                    {feature}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sourceTypeFilter} onValueChange={setSourceTypeFilter}>
              <SelectTrigger className="h-8 w-[150px]">
                <SelectValue placeholder="来源范围" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部来源</SelectItem>
                {AI_USAGE_SOURCE_TYPES.map((sourceType) => (
                  <SelectItem key={sourceType} value={sourceType}>
                    {sourceType}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                    description: `${formatInteger(overview?.completedEvents)} 完成 / ${formatInteger(overview?.failedEvents)} 失败`,
                    icon: <TbBolt className="h-4 w-4" />,
                    title: '总 tokens',
                    value: formatInteger(overview?.totalTokens)
                  },
                  {
                    description: `${formatInteger(overview?.inputTokens)} 输入 / ${formatInteger(overview?.outputTokens)} 输出`,
                    icon: <TbCoins className="h-4 w-4" />,
                    title: '可计费 tokens',
                    value: formatInteger(overview?.billableTotalTokens)
                  },
                  {
                    description: `${formatInteger(overview?.exactEvents)} 条精准计量`,
                    icon: <TbPlugConnected className="h-4 w-4" />,
                    title: '总调用数',
                    value: formatInteger(overview?.totalEvents)
                  },
                  {
                    description: `约 ${formatCost(overview?.estimatedCost)} 成本`,
                    icon: <TbDatabase className="h-4 w-4" />,
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
                <CardDescription>按天汇总最近 {rangeDays} 天 token 消耗</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading && timeline.length === 0 ? (
                  Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-8 rounded-lg" />)
                ) : timeline.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">当前时间范围内还没有 AI 调用事件。</div>
                ) : (
                  timeline.map((point) => (
                    <div key={point.bucket} className="grid grid-cols-[80px_1fr_88px] items-center gap-3">
                      <div className="text-xs text-muted-foreground">{point.bucket}</div>
                      <div className="h-2.5 rounded-full bg-muted">
                        <div className="h-2.5 rounded-full bg-primary/80" style={{ width: `${Math.max(4, (point.totalTokens / maxTimelineTokens) * 100)}%` }} />
                      </div>
                      <div className="text-right text-xs font-medium">{formatInteger(point.totalTokens)}</div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">计量精度</CardTitle>
                <CardDescription>用于后续成本核算与付费能力的基线视图</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-xl border bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground">精准计量</div>
                  <div className="mt-1 text-2xl font-semibold">{formatInteger(overview?.exactEvents)}</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">billingEligible</div>
                    <div className="mt-1 text-xl font-semibold">{formatInteger(overview?.billingEligibleEvents)}</div>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <div className="text-xs text-muted-foreground">最后一条事件</div>
                    <div className="mt-1 text-sm font-medium">{formatDateTime(overview?.lastEventAt)}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg border px-3 py-2">
                    <div className="text-xs text-muted-foreground">high</div>
                    <div className="mt-1 font-medium">{formatInteger(overview?.highAccuracyEvents)}</div>
                  </div>
                  <div className="rounded-lg border px-3 py-2">
                    <div className="text-xs text-muted-foreground">medium + low</div>
                    <div className="mt-1 font-medium">{formatInteger((overview?.mediumAccuracyEvents ?? 0) + (overview?.lowAccuracyEvents ?? 0))}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <TopListCard title="Provider 排行" description="按 total tokens 排序" rows={providerRows} />
            <TopListCard title="模型排行" description="按 total tokens 排序" rows={modelRows} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <TopListCard title="用途分类" description="按业务分类观察资源分布" rows={categoryRows} />
            <TopListCard title="具体功能" description="区分翻译、总结、记忆提取等真实用途" rows={featureRows} />
          </div>

          <Card className="border-border/70">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">最近调用明细</CardTitle>
              <CardDescription>用于排查 token 落点、精度来源和后续对账问题</CardDescription>
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
                      <TableHead>状态</TableHead>
                      <TableHead className="text-right">输入 / 输出 / 总</TableHead>
                      <TableHead className="text-right">计费 / 精度</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(event.createdAt)}</TableCell>
                        <TableCell>
                          <div className="font-medium">{event.providerId}</div>
                          <div className="text-xs text-muted-foreground">{event.model}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="outline">{event.usageFeature}</Badge>
                            <Badge variant="secondary">{event.usageStage}</Badge>
                            <Badge variant="outline">{event.sourceType}</Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant={statusBadgeVariant(event.status)}>{event.status}</Badge>
                            <Badge variant="outline">{event.meteringAccuracy}</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="font-medium">
                            {formatInteger(event.inputTokens)} / {formatInteger(event.outputTokens)} / {formatInteger(event.totalTokens)}
                          </div>
                          <div className="text-xs text-muted-foreground">{event.sourceLabel || event.operationKey}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Badge variant={event.billingEligible ? 'default' : 'secondary'}>{event.billingEligible ? 'billable' : 'non-billable'}</Badge>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">{event.meteringSource}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
};

export default AnalyticsPage;

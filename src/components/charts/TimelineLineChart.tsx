import { useMemo } from 'react';
import type { AiUsageTimelinePoint } from '@packages/ai/analytics/types';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { cn } from '@/lib/utils';

type ChartRow = {
  bucket: string;
  tokens: number | null;
  eventCount: number;
  billableTotalTokens: number | null;
};

function formatInteger(value: number | null | undefined): string {
  return new Intl.NumberFormat('zh-CN').format(value ?? 0);
}

function formatMaybeInteger(value: number | null | undefined): string {
  if (value === undefined || value === null) return '-';
  return formatInteger(value);
}

function defaultFormatValue(value: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 20 }).format(value);
}

export type TimelineLineChartProps = {
  data: readonly AiUsageTimelinePoint[];
  emptyMessage?: string;
  valueLabel?: string;
  formatValue?: (value: number) => string;
  className?: string;
};

export function TimelineLineChart(props: TimelineLineChartProps): JSX.Element {
  const { className, data, emptyMessage, formatValue = defaultFormatValue, valueLabel } = props;

  const chartData = useMemo<ChartRow[]>(
    () =>
      data.map((point) => ({
        bucket: point.bucket,
        tokens: point.totalTokens,
        eventCount: point.eventCount,
        billableTotalTokens: point.billableTotalTokens
      })),
    [data]
  );

  if (chartData.length === 0) {
    return <div className={cn('rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground', className)}>{emptyMessage ?? '暂无数据。'}</div>;
  }

  return (
    <div
      className={cn(
        'h-[min(22rem,calc(100vw-4rem))] w-full min-h-[240px] sm:min-h-[280px]',
        '[&_.recharts-wrapper]:outline-none [&_.recharts-surface]:outline-none [&_.recharts-surface:focus]:outline-none [&_.recharts-layer:focus]:outline-none [&_path:focus]:outline-none',
        className
      )}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart accessibilityLayer={false} data={chartData} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" vertical={false} />
          <XAxis
            dataKey="bucket"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={16}
          />
          <YAxis
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={(v) => formatValue(Number(v))}
          />
          <Tooltip
            isAnimationActive={false}
            animationDuration={0}
            cursor={{ stroke: 'hsl(var(--muted-foreground) / 0.35)', strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as ChartRow;
              return (
                <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                  <div className="font-medium text-popover-foreground">{row.bucket}</div>
                  <div className="mt-1 text-muted-foreground">
                    {valueLabel ? `${valueLabel} ` : ''}
                    <span className="font-medium text-foreground">{formatMaybeInteger(row.tokens)}</span>
                  </div>
                  <div className="mt-1 space-y-0.5 text-muted-foreground">
                    <div>
                      调用 <span className="font-medium text-foreground">{formatInteger(row.eventCount)}</span> 次
                    </div>
                    <div>
                      可计费 tokens <span className="font-medium text-foreground">{formatMaybeInteger(row.billableTotalTokens)}</span>
                    </div>
                  </div>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="tokens"
            name={valueLabel ?? 'tokens'}
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ r: 2, strokeWidth: 0, fill: 'hsl(var(--primary))' }}
            activeDot={{ r: 4, strokeWidth: 0 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

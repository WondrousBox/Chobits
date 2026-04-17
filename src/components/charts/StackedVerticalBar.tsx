import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type StackedVerticalBarSegment = {
  key: string;
  label: string;
  value: number;
};

export type StackedVerticalBarDatum = {
  id: string;
  label: string;
  segments: readonly StackedVerticalBarSegment[];
};

type InternalChartDatum = {
  id: string;
  label: string;
  __segments: readonly StackedVerticalBarSegment[];
  [segmentKey: string]: string | number | readonly StackedVerticalBarSegment[];
};

type SeriesMeta = {
  key: string;
  label: string;
};

const CHART_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

function defaultFormatValue(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 20 }).format(value);
}

export type StackedVerticalBarChartProps = {
  data: readonly StackedVerticalBarDatum[];
  emptyMessage?: string;
  valueLabel?: string;
  formatValue?: (value: number) => string;
  className?: string;
};

export function StackedVerticalBarChart(props: StackedVerticalBarChartProps): JSX.Element {
  const { className, data, emptyMessage, formatValue = defaultFormatValue, valueLabel } = props;

  const { chartData, series } = useMemo(() => {
    const keyToLabel = new Map<string, string>();
    const flattened = data.map<InternalChartDatum>((item) => {
      const row: InternalChartDatum = {
        id: item.id,
        label: item.label,
        __segments: item.segments
      };

      item.segments.forEach((segment) => {
        keyToLabel.set(segment.key, segment.label);
        row[segment.key] = segment.value;
      });

      return row;
    });

    return {
      chartData: flattened,
      series: Array.from(keyToLabel.entries()).map<SeriesMeta>(([key, label]) => ({ key, label }))
    };
  }, [data]);

  if (chartData.length === 0 || series.length === 0) {
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
        <BarChart accessibilityLayer={false} data={chartData} margin={{ top: 8, right: 8, bottom: 24, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" vertical={false} />
          <XAxis dataKey="label" interval={0} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} tickLine={false} axisLine={false} width={46} />
          <Tooltip
            isAnimationActive={false}
            animationDuration={0}
            cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const datum = payload[0].payload as InternalChartDatum;
              const sorted = [...(datum.__segments ?? [])].sort((a, b) => b.value - a.value);
              const total = sorted.reduce((sum, s) => sum + s.value, 0);

              return (
                <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                  <div className="font-medium text-popover-foreground">{datum.label}</div>
                  <div className="mt-1 text-muted-foreground">
                    总计 {valueLabel ? `${valueLabel} ` : ''}
                    <span className="font-medium text-foreground">{formatValue(total)}</span>
                  </div>
                  <div className="mt-1 space-y-0.5 text-muted-foreground">
                    {sorted.map((segment) => (
                      <div key={segment.key}>
                        {segment.label}: <span className="font-medium text-foreground">{formatValue(segment.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }}
          />
          {series.map((item, index) => (
            <Bar key={item.key} dataKey={item.key} stackId="total" fill={CHART_COLORS[index % CHART_COLORS.length]} name={item.label} maxBarSize={52} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export type StackedVerticalBarCardProps = StackedVerticalBarChartProps & {
  title: string;
  description: string;
  cardClassName?: string;
};

export function StackedVerticalBarCard({ cardClassName, description, title, ...chartProps }: StackedVerticalBarCardProps): JSX.Element {
  return (
    <Card className={cn('border-border/70', cardClassName)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <StackedVerticalBarChart {...chartProps} />
      </CardContent>
    </Card>
  );
}

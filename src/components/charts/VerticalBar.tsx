import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type VerticalBarDatum = {
  id: string;
  label: string;
  value: number;
  tooltipLines?: readonly string[];
};

const CHART_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

function defaultFormatValue(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 20 }).format(value);
}

export type VerticalBarChartProps = {
  data: readonly VerticalBarDatum[];
  emptyMessage?: string;
  valueLabel?: string;
  formatValue?: (value: number) => string;
  className?: string;
};

export function VerticalBarChart(props: VerticalBarChartProps): JSX.Element {
  const { className, data, emptyMessage, formatValue = defaultFormatValue, valueLabel } = props;
  const chartData = useMemo(() => data.map((item) => ({ ...item })), [data]);

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
              const datum = payload[0].payload as VerticalBarDatum;
              return (
                <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                  <div className="font-medium text-popover-foreground">{datum.label}</div>
                  <div className="mt-1 space-y-0.5 text-muted-foreground">
                    <div>
                      {valueLabel ? (
                        <>
                          {valueLabel} <span className="font-medium text-foreground">{formatValue(datum.value)}</span>
                        </>
                      ) : (
                        <span className="font-medium text-foreground">{formatValue(datum.value)}</span>
                      )}
                    </div>
                    {datum.tooltipLines?.map((line, index) => (
                      <div key={index}>{line}</div>
                    ))}
                  </div>
                </div>
              );
            }}
          />
          <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={44}>
            {chartData.map((item, index) => (
              <Cell key={item.id} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export type VerticalBarCardProps = VerticalBarChartProps & {
  title: string;
  description: string;
  cardClassName?: string;
};

export function VerticalBarCard({ cardClassName, description, title, ...chartProps }: VerticalBarCardProps): JSX.Element {
  return (
    <Card className={cn('border-border/70', cardClassName)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <VerticalBarChart {...chartProps} />
      </CardContent>
    </Card>
  );
}

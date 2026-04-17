import { useMemo } from 'react';
import type { PieSectorDataItem } from 'recharts';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** One slice of the donut; `id` must be stable across renders. */
export type DonutPieSlice = {
  id: string;
  label: string;
  value: number;
  /** Optional extra text rows in the tooltip under the value + percent line */
  tooltipLines?: readonly string[];
};

const CHART_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

function formatSlicePercent(numerator: number, denominator: number): string {
  if (denominator <= 0) return '0%';
  const percent = (numerator / denominator) * 100;
  return `${percent.toFixed(percent >= 10 ? 0 : 1)}%`;
}

function defaultFormatValue(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 20 }).format(value);
}

function PieActiveSectorShape(props: PieSectorDataItem): JSX.Element {
  const { cornerRadius, cx, cy, endAngle, fill, innerRadius, outerRadius, startAngle } = props;
  const outer = typeof outerRadius === 'number' ? outerRadius + 5 : outerRadius;

  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outer}
      startAngle={startAngle}
      endAngle={endAngle}
      cornerRadius={cornerRadius}
      fill={fill}
      stroke="hsl(var(--foreground))"
      strokeOpacity={0.45}
      strokeWidth={2}
    />
  );
}

export type DonutPieChartProps = {
  slices: readonly DonutPieSlice[];
  /** When `slices` is empty */
  emptyMessage?: string;
  /** When every slice has `value` ≤ 0 */
  emptyWhenAllValuesZeroMessage?: string;
  /** Shown before the formatted value in the tooltip (e.g. unit name) */
  valueLabel?: string;
  formatValue?: (value: number) => string;
  className?: string;
};

/**
 * Donut chart only (no Card). Theme colors `--chart-1` … `--chart-5` rotate by slice index.
 */
export function DonutPieChart(props: DonutPieChartProps): JSX.Element {
  const { className, emptyMessage, emptyWhenAllValuesZeroMessage, formatValue = defaultFormatValue, slices, valueLabel } = props;

  const chartData = useMemo(() => slices.filter((s) => s.value > 0), [slices]);
  const chartTotal = useMemo(() => chartData.reduce((sum, d) => sum + d.value, 0), [chartData]);

  const emptyCopy = slices.length === 0 ? (emptyMessage ?? '暂无数据。') : chartData.length === 0 ? (emptyWhenAllValuesZeroMessage ?? '各项数值均为 0，暂无占比可展示。') : null;

  if (emptyCopy) {
    return <div className={cn('rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground', className)}>{emptyCopy}</div>;
  }

  return (
    <div
      className={cn(
        'h-[min(22rem,calc(100vw-4rem))] w-full min-h-[240px] sm:min-h-[280px]',
        // Recharts 默认可聚焦层在点击后会套上浏览器默认矩形 focus ring，与环形图不协调
        '[&_.recharts-wrapper]:outline-none [&_.recharts-surface]:outline-none [&_.recharts-surface:focus]:outline-none [&_.recharts-layer:focus]:outline-none [&_path:focus]:outline-none',
        className
      )}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart accessibilityLayer={false} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
          <Pie
            data={[...chartData]}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="46%"
            innerRadius="42%"
            outerRadius="72%"
            paddingAngle={1}
            stroke="hsl(var(--border))"
            strokeWidth={1}
            activeShape={PieActiveSectorShape}
            rootTabIndex={-1}
          >
            {chartData.map((entry, index) => (
              <Cell key={entry.id} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            isAnimationActive={false}
            animationDuration={0}
            cursor={false}
            content={({ active, payload }) => {
              if (!active || !payload?.length) {
                return null;
              }
              const datum = payload[0].payload as DonutPieSlice;
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
                      <span>（{formatSlicePercent(datum.value, chartTotal)}）</span>
                    </div>
                    {datum.tooltipLines?.map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                  </div>
                </div>
              );
            }}
          />
          <Legend
            layout="horizontal"
            verticalAlign="bottom"
            align="center"
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            formatter={(value) => <span className="text-muted-foreground">{String(value)}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export type DonutPieCardProps = DonutPieChartProps & {
  title: string;
  description: string;
  cardClassName?: string;
};

/** Card + title/description wrapping {@link DonutPieChart}. */
export function DonutPieCard({ cardClassName, description, title, ...chartProps }: DonutPieCardProps): JSX.Element {
  return (
    <Card className={cn('border-border/70', cardClassName)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <DonutPieChart {...chartProps} />
      </CardContent>
    </Card>
  );
}

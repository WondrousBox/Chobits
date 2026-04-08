import React from 'react';

export interface RadarDimension {
  id: string;
  name: string;
  icon: string;
  value: number;
  maxValue: number;
}

interface RadarChartProps {
  dimensions: RadarDimension[];
  size?: number;
  padding?: number;
  className?: string;
}

type LabelAnchor = 'start' | 'middle' | 'end';

const RadarChart: React.FC<RadarChartProps> = ({ dimensions, size = 200, padding = 24, className }) => {
  const count = dimensions.length;
  if (count < 3) return null;

  const cx = size / 2;
  const cy = size / 2;
  const levels = 4; // grid rings
  const labelFontSize = Math.max(8, Math.round(size * 0.045));
  const safePadding = Math.min(size / 3, Math.max(0, padding));
  const labelOffset = Math.max(12, size * 0.06);
  const labelEdgePadding = Math.max(8, Math.min(16, safePadding * 0.5));
  const radius = Math.min(size * 0.36, Math.max(size * 0.18, size / 2 - safePadding - labelOffset));
  const labelRadius = Math.min(size / 2 - safePadding, radius + labelOffset);

  // Angle for each axis (start from top, go clockwise)
  const angleStep = (2 * Math.PI) / count;
  const startAngle = -Math.PI / 2;

  const getPoint = (index: number, r: number): { x: number; y: number } => {
    const angle = startAngle + index * angleStep;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle)
    };
  };

  // Grid polygons
  const gridPolygons = Array.from({ length: levels }, (_, level) => {
    const r = (radius * (level + 1)) / levels;
    const points = dimensions.map((_, i) => {
      const p = getPoint(i, r);
      return `${p.x},${p.y}`;
    });
    return points.join(' ');
  });

  // Data polygon
  const dataPoints = dimensions.map((dim, i) => {
    const ratio = Math.min(1, dim.value / dim.maxValue);
    const p = getPoint(i, radius * ratio);
    return `${p.x},${p.y}`;
  });

  // Axis lines
  const axisLines = dimensions.map((_, i) => {
    const p = getPoint(i, radius);
    return { x1: cx, y1: cy, x2: p.x, y2: p.y };
  });

  // Labels
  const labels = dimensions.map((dim, i) => {
    const p = getPoint(i, labelRadius);
    const content = [dim.icon, dim.name].filter(Boolean).join(' ');
    const estimatedWidth = Math.max(labelFontSize * 2, Array.from(content).length * labelFontSize * 0.8);
    const halfWidth = estimatedWidth / 2;
    const halfHeight = labelFontSize * 0.6;
    const minX = labelEdgePadding;
    const maxX = size - labelEdgePadding;
    const minY = labelEdgePadding;
    const maxY = size - labelEdgePadding;
    let textAnchor: LabelAnchor = 'middle';
    let x = p.x;
    let y = p.y;

    if (p.x - halfWidth < minX) {
      textAnchor = 'start';
      x = minX;
    } else if (p.x + halfWidth > maxX) {
      textAnchor = 'end';
      x = maxX;
    }

    if (p.y - halfHeight < minY) {
      y = minY + halfHeight;
    } else if (p.y + halfHeight > maxY) {
      y = maxY - halfHeight;
    }

    return {
      content,
      x,
      y,
      textAnchor
    };
  });

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full" style={{ height: 'auto' }}>
        {/* Grid rings */}
        {gridPolygons.map((points, i) => (
          <polygon key={`grid-${i}`} points={points} fill="none" stroke="currentColor" strokeWidth={0.5} opacity={0.15} />
        ))}

        {/* Axis lines */}
        {axisLines.map((line, i) => (
          <line key={`axis-${i}`} {...line} stroke="currentColor" strokeWidth={0.5} opacity={0.2} />
        ))}

        {/* Data polygon (fill) */}
        <polygon points={dataPoints.join(' ')} fill="hsl(270, 70%, 60%)" fillOpacity={0.2} stroke="hsl(270, 70%, 60%)" strokeWidth={1.5} strokeLinejoin="round" />

        {/* Data points */}
        {dimensions.map((dim, i) => {
          const ratio = Math.min(1, dim.value / dim.maxValue);
          const p = getPoint(i, radius * ratio);
          return <circle key={`dot-${i}`} cx={p.x} cy={p.y} r={3} fill="hsl(270, 70%, 60%)" />;
        })}

        {/* Labels */}
        {labels.map((label, i) => (
          <text
            key={`label-${i}`}
            x={label.x}
            y={label.y}
            textAnchor={label.textAnchor}
            dominantBaseline="middle"
            className="pointer-events-none select-none text-muted-foreground/70"
            fill="currentColor"
            fontSize={labelFontSize}
          >
            {label.content}
          </text>
        ))}
      </svg>

      {/* Values below */}
      <div className="grid grid-cols-3 gap-x-4 gap-y-1 mt-2 px-2">
        {dimensions.map((dim) => (
          <div key={dim.id} className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>{dim.icon}</span>
            <span className="truncate">{dim.name}</span>
            <span className="ml-auto font-mono tabular-nums">{Math.round(dim.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RadarChart;

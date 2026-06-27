import clsx from 'clsx';
import React, { useMemo, useRef } from 'react';

import { useLabels } from '../../context';
import { DEFAULT_CONFIG } from '../../types';

interface TimeRulerProps {
  /** 时间轴起始时间（通常为 0） */
  startTime: number;
  /** 时间轴结束时间（总时长） */
  endTime: number;
  /** 每秒像素数 */
  pixelsPerSecond: number;
  /** 时间轴总宽度 */
  width: number;
  /** 当前播放时间 */
  currentTime?: number;
  /** 点击回调 */
  onClick?: (time: number) => void;
  /** 可视区域起始时间（用于优化渲染） */
  viewportStart?: number;
  /** 可视区域结束时间（用于优化渲染） */
  viewportEnd?: number;
  /** 自定义类名 */
  className?: string;
}

/**
 * 格式化时间显示
 */
function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * 根据缩放级别计算合适的刻度间隔
 */
function getTickInterval(pixelsPerSecond: number): { major: number; minor: number } {
  // 期望的刻度像素间距
  const targetMajorSpacing = 80;
  const targetMinorSpacing = 20;

  // 计算理想的时间间隔
  const idealMajorInterval = targetMajorSpacing / pixelsPerSecond;
  const idealMinorInterval = targetMinorSpacing / pixelsPerSecond;

  // 标准化到常见的时间间隔
  const standardIntervals = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

  let major = standardIntervals[0];
  for (const interval of standardIntervals) {
    if (interval >= idealMajorInterval) {
      major = interval;
      break;
    }
    major = interval;
  }

  let minor = standardIntervals[0];
  for (const interval of standardIntervals) {
    if (interval >= idealMinorInterval && interval < major) {
      minor = interval;
    }
  }

  // 确保 minor 是 major 的因子
  if (major / minor > 10) {
    minor = major / 5;
  }

  return { major, minor };
}

/**
 * 时间刻度尺组件
 *
 * 渲染整个时间范围的刻度，但使用虚拟化技术只渲染可见区域附近的刻度
 */
export const TimeRuler: React.FC<TimeRulerProps> = ({ startTime, endTime, pixelsPerSecond, width, currentTime, onClick, viewportStart, viewportEnd, className }) => {
  const labels = useLabels();
  // 计算刻度（带缓冲区的虚拟化）
  const ticks = useMemo(() => {
    const { major, minor } = getTickInterval(pixelsPerSecond);
    const majorTicks: { time: number; x: number; label: string }[] = [];
    const minorTicks: { time: number; x: number }[] = [];

    // 计算渲染范围（可视区域 + 缓冲区）
    // 缓冲区为可视区域的 50%，确保滚动时不会看到空白
    const bufferTime = viewportStart !== undefined && viewportEnd !== undefined ? (viewportEnd - viewportStart) * 0.5 : endTime;

    const renderStart = viewportStart !== undefined ? Math.max(startTime, viewportStart - bufferTime) : startTime;
    const renderEnd = viewportEnd !== undefined ? Math.min(endTime, viewportEnd + bufferTime) : endTime;

    // 计算起始刻度（向下取整到 minor 的倍数）
    const firstTick = Math.floor(renderStart / minor) * minor;

    for (let time = firstTick; time <= renderEnd; time += minor) {
      if (time < startTime) continue;

      const x = (time - startTime) * pixelsPerSecond;

      // 判断是否为主刻度
      if (Math.abs(time % major) < 0.001 || Math.abs((time % major) - major) < 0.001) {
        majorTicks.push({
          time,
          x,
          label: formatTime(time)
        });
      } else {
        minorTicks.push({ time, x });
      }
    }

    return { majorTicks, minorTicks };
  }, [startTime, endTime, pixelsPerSecond, viewportStart, viewportEnd]);

  // 当前时间指示器位置
  const currentTimeX = useMemo(() => {
    if (currentTime === undefined || currentTime < startTime || currentTime > endTime) {
      return null;
    }
    return (currentTime - startTime) * pixelsPerSecond;
  }, [currentTime, startTime, endTime, pixelsPerSecond]);

  // 跟踪鼠标按下位置，用于区分点击和拖拽
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);

  // 处理鼠标按下
  const handleMouseDown = (e: React.MouseEvent): void => {
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
  };

  // 处理鼠标抬起（只有在移动距离小时才算点击）
  const handleMouseUp = (e: React.MouseEvent): void => {
    if (!onClick || !mouseDownPosRef.current) return;

    const dx = Math.abs(e.clientX - mouseDownPosRef.current.x);
    const dy = Math.abs(e.clientY - mouseDownPosRef.current.y);

    // 只有移动距离小于 3 像素才算点击
    if (dx < 3 && dy < 3) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = startTime + x / pixelsPerSecond;
      onClick(Math.max(0, Math.min(endTime, time)));
    }

    mouseDownPosRef.current = null;
  };

  return (
    <div
      className={clsx('relative select-none cursor-pointer bg-muted/50 border-b border-border shrink-0', className)}
      style={{ height: DEFAULT_CONFIG.RULER_HEIGHT, width }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      {/* 次刻度线 */}
      {ticks.minorTicks.map(({ time, x }) => (
        <div key={`minor-${time}`} className="absolute bottom-0 w-px h-2 bg-border" style={{ left: x }} />
      ))}

      {/* 主刻度线和标签 */}
      {ticks.majorTicks.map(({ time, x, label }) => (
        <div key={`major-${time}`} className="absolute bottom-0" style={{ left: x }}>
          <div className="w-px h-3 bg-muted-foreground" />
          <span
            className="absolute text-[10px] text-muted-foreground whitespace-nowrap"
            style={{
              left: '50%',
              transform: 'translateX(-50%)',
              bottom: 14
            }}
          >
            {label}
          </span>
        </div>
      ))}

      {/* 当前时间指示器 */}
      {currentTimeX !== null && (
        <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10" style={{ left: currentTimeX, height: 1000 }}>
          <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-red-500" />
        </div>
      )}

      {/* 音频结束截止线 */}
      <div className="absolute top-0 bottom-0 w-0.5 bg-orange-500 z-10" style={{ left: (endTime - startTime) * pixelsPerSecond }} title={labels.audioEnd.replace('{time}', endTime.toFixed(2))}>
        <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-orange-500" />
      </div>
    </div>
  );
};

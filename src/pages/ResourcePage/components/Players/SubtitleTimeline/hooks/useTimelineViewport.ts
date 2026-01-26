import { useCallback, useState } from 'react';

import { DEFAULT_CONFIG, ViewportState } from '../types';

interface UseTimelineViewportOptions {
  /** 总时长 */
  duration: number;
  /** 容器宽度 */
  containerWidth: number;
  /** 初始视口状态 */
  initialViewport?: Partial<ViewportState>;
  /** 最小缩放 */
  minPixelsPerSecond?: number;
  /** 最大缩放 */
  maxPixelsPerSecond?: number;
  /** 视口变化回调 */
  onViewportChange?: (viewport: ViewportState) => void;
}

interface UseTimelineViewportReturn {
  viewport: ViewportState;
  /** 设置视口 */
  setViewport: (viewport: ViewportState) => void;
  /** 缩放（以某个时间点为中心） */
  zoom: (factor: number, centerTime?: number) => void;
  /** 平移（按时间偏移） */
  pan: (deltaTime: number) => void;
  /** 平移（按像素偏移） */
  panByPixels: (deltaPixels: number) => void;
  /** 跳转到指定时间（将该时间显示在视口中心） */
  scrollToTime: (time: number) => void;
  /** 适配全部内容 */
  fitAll: () => void;
  /** 时间转像素位置 */
  timeToPixel: (time: number) => number;
  /** 像素位置转时间 */
  pixelToTime: (pixel: number) => number;
  /** 计算可视区域内的片段索引范围 */
  getVisibleRange: (startTimes: number[], endTimes: number[]) => { start: number; end: number };
}

/**
 * 时间轴视口管理 Hook
 * 负责视口的缩放、平移、时间/像素转换等
 */
export function useTimelineViewport({
  duration,
  containerWidth,
  initialViewport,
  minPixelsPerSecond = DEFAULT_CONFIG.MIN_PIXELS_PER_SECOND,
  maxPixelsPerSecond = DEFAULT_CONFIG.MAX_PIXELS_PER_SECOND,
  onViewportChange
}: UseTimelineViewportOptions): UseTimelineViewportReturn {
  // 计算初始视口
  const getInitialViewport = (): ViewportState => {
    const pps = initialViewport?.pixelsPerSecond ?? DEFAULT_CONFIG.DEFAULT_PIXELS_PER_SECOND;
    const visibleDuration = containerWidth / pps;
    const startTime = initialViewport?.startTime ?? 0;
    const endTime = initialViewport?.endTime ?? Math.min(startTime + visibleDuration, duration);

    return {
      startTime,
      endTime,
      pixelsPerSecond: pps
    };
  };

  const [viewport, setViewportInternal] = useState<ViewportState>(getInitialViewport);

  // 设置视口并通知外部
  const setViewport = useCallback(
    (newViewport: ViewportState) => {
      setViewportInternal(newViewport);
      onViewportChange?.(newViewport);
    },
    [onViewportChange]
  );

  // 限制视口在有效范围内
  const clampViewport = useCallback(
    (vp: ViewportState): ViewportState => {
      let { startTime, endTime, pixelsPerSecond } = vp;

      // 限制缩放级别
      pixelsPerSecond = Math.max(minPixelsPerSecond, Math.min(maxPixelsPerSecond, pixelsPerSecond));

      // 计算可视时长
      const visibleDuration = containerWidth / pixelsPerSecond;

      // 限制起始时间不小于 0
      if (startTime < 0) {
        startTime = 0;
        endTime = Math.min(visibleDuration, duration);
      }

      // 限制结束时间不超过总时长
      if (endTime > duration) {
        endTime = duration;
        startTime = Math.max(0, endTime - visibleDuration);
      }

      return { startTime, endTime, pixelsPerSecond };
    },
    [containerWidth, duration, minPixelsPerSecond, maxPixelsPerSecond]
  );

  // 缩放
  const zoom = useCallback(
    (factor: number, centerTime?: number) => {
      setViewportInternal((prev) => {
        const newPps = prev.pixelsPerSecond * factor;
        const clampedPps = Math.max(minPixelsPerSecond, Math.min(maxPixelsPerSecond, newPps));

        // 计算新的可视时长
        const newVisibleDuration = containerWidth / clampedPps;

        // 计算缩放中心点（默认为视口中心）
        const center = centerTime ?? (prev.startTime + prev.endTime) / 2;

        // 保持中心点在相对位置不变
        const ratio = (center - prev.startTime) / (prev.endTime - prev.startTime);
        let newStartTime = center - newVisibleDuration * ratio;
        let newEndTime = newStartTime + newVisibleDuration;

        // 边界修正
        if (newStartTime < 0) {
          newStartTime = 0;
          newEndTime = Math.min(newVisibleDuration, duration);
        }
        if (newEndTime > duration) {
          newEndTime = duration;
          newStartTime = Math.max(0, newEndTime - newVisibleDuration);
        }

        const newViewport = { startTime: newStartTime, endTime: newEndTime, pixelsPerSecond: clampedPps };
        onViewportChange?.(newViewport);
        return newViewport;
      });
    },
    [containerWidth, duration, minPixelsPerSecond, maxPixelsPerSecond, onViewportChange]
  );

  // 按时间平移
  const pan = useCallback(
    (deltaTime: number) => {
      setViewportInternal((prev) => {
        let newStartTime = prev.startTime + deltaTime;
        let newEndTime = prev.endTime + deltaTime;
        const visibleDuration = prev.endTime - prev.startTime;

        // 边界限制
        if (newStartTime < 0) {
          newStartTime = 0;
          newEndTime = visibleDuration;
        }
        if (newEndTime > duration) {
          newEndTime = duration;
          newStartTime = Math.max(0, newEndTime - visibleDuration);
        }

        const newViewport = { ...prev, startTime: newStartTime, endTime: newEndTime };
        onViewportChange?.(newViewport);
        return newViewport;
      });
    },
    [duration, onViewportChange]
  );

  // 按像素平移
  const panByPixels = useCallback(
    (deltaPixels: number) => {
      setViewportInternal((prev) => {
        const deltaTime = deltaPixels / prev.pixelsPerSecond;
        let newStartTime = prev.startTime + deltaTime;
        let newEndTime = prev.endTime + deltaTime;
        const visibleDuration = prev.endTime - prev.startTime;

        if (newStartTime < 0) {
          newStartTime = 0;
          newEndTime = visibleDuration;
        }
        if (newEndTime > duration) {
          newEndTime = duration;
          newStartTime = Math.max(0, newEndTime - visibleDuration);
        }

        const newViewport = { ...prev, startTime: newStartTime, endTime: newEndTime };
        onViewportChange?.(newViewport);
        return newViewport;
      });
    },
    [duration, onViewportChange]
  );

  // 跳转到指定时间
  const scrollToTime = useCallback(
    (time: number) => {
      setViewportInternal((prev) => {
        const visibleDuration = prev.endTime - prev.startTime;
        let newStartTime = time - visibleDuration / 2;
        let newEndTime = time + visibleDuration / 2;

        if (newStartTime < 0) {
          newStartTime = 0;
          newEndTime = visibleDuration;
        }
        if (newEndTime > duration) {
          newEndTime = duration;
          newStartTime = Math.max(0, newEndTime - visibleDuration);
        }

        const newViewport = { ...prev, startTime: newStartTime, endTime: newEndTime };
        onViewportChange?.(newViewport);
        return newViewport;
      });
    },
    [duration, onViewportChange]
  );

  // 适配全部内容
  const fitAll = useCallback(() => {
    const pps = Math.max(minPixelsPerSecond, Math.min(maxPixelsPerSecond, containerWidth / duration));
    const newViewport = clampViewport({
      startTime: 0,
      endTime: duration,
      pixelsPerSecond: pps
    });
    setViewport(newViewport);
  }, [containerWidth, duration, minPixelsPerSecond, maxPixelsPerSecond, clampViewport, setViewport]);

  // 时间转像素
  const timeToPixel = useCallback(
    (time: number): number => {
      return (time - viewport.startTime) * viewport.pixelsPerSecond;
    },
    [viewport]
  );

  // 像素转时间
  const pixelToTime = useCallback(
    (pixel: number): number => {
      return viewport.startTime + pixel / viewport.pixelsPerSecond;
    },
    [viewport]
  );

  // 使用二分查找获取可见片段范围
  const getVisibleRange = useCallback(
    (startTimes: number[], endTimes: number[]): { start: number; end: number } => {
      const { startTime, endTime } = viewport;
      const n = startTimes.length;

      if (n === 0) return { start: 0, end: 0 };

      // 二分查找第一个 endTime > viewport.startTime 的片段
      let left = 0;
      let right = n;
      while (left < right) {
        const mid = (left + right) >>> 1;
        if (endTimes[mid] <= startTime) {
          left = mid + 1;
        } else {
          right = mid;
        }
      }
      const start = left;

      // 二分查找第一个 startTime >= viewport.endTime 的片段
      left = start;
      right = n;
      while (left < right) {
        const mid = (left + right) >>> 1;
        if (startTimes[mid] < endTime) {
          left = mid + 1;
        } else {
          right = mid;
        }
      }
      const end = left;

      return { start, end };
    },
    [viewport]
  );

  return {
    viewport,
    setViewport,
    zoom,
    pan,
    panByPixels,
    scrollToTime,
    fitAll,
    timeToPixel,
    pixelToTime,
    getVisibleRange
  };
}

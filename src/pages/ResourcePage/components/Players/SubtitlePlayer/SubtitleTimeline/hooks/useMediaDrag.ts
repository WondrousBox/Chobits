import { useCallback, useRef, useState } from 'react';

import type { MediaSegment, MediaTransform } from '../types';
import { MEDIA_CONFIG } from '../types';

/**
 * 拖拽模式
 */
export type MediaDragMode = 'none' | 'move' | 'resize-start' | 'resize-end';

/**
 * 拖拽状态
 */
export interface MediaDragState {
  /** 当前拖拽模式 */
  mode: MediaDragMode;
  /** 拖拽起始 X 坐标 */
  startX: number;
  /** 当前 X 坐标偏移 */
  deltaX: number;
  /** 原始 timelineStart */
  originalTimelineStart: number;
  /** 原始 timelineEnd */
  originalTimelineEnd: number;
  /** 正在拖拽的片段 ID */
  segmentId: string | null;
}

/**
 * 拖拽回调
 */
export interface MediaDragCallbacks {
  /** 移动完成回调 */
  onMove?: (segmentId: string, newTimelineStart: number) => void;
  /** 调整大小完成回调 */
  onResize?: (segmentId: string, edge: 'start' | 'end', newTime: number) => void;
}

/**
 * 拖拽结果
 */
export interface MediaDragResult {
  /** 新的 timelineStart */
  timelineStart: number;
  /** 新的 timelineEnd */
  timelineEnd: number;
}

/**
 * useMediaDrag - 媒体片段拖拽 Hook
 *
 * 处理媒体片段的拖拽移动和边缘调整大小
 */
export function useMediaDrag(
  pixelsPerSecond: number,
  callbacks: MediaDragCallbacks,
  options?: {
    /** 最小片段时长（秒） */
    minDuration?: number;
    /** 最大时间（秒） */
    maxTime?: number;
    /** 吸附阈值（秒） */
    snapThreshold?: number;
    /** 吸附点（秒） */
    snapPoints?: number[];
  }
) {
  const { minDuration = 0.1, maxTime = Infinity, snapThreshold = 0.1, snapPoints = [] } = options ?? {};

  const [state, setState] = useState<MediaDragState>({
    mode: 'none',
    startX: 0,
    deltaX: 0,
    originalTimelineStart: 0,
    originalTimelineEnd: 0,
    segmentId: null
  });

  const didDragRef = useRef(false);

  /**
   * 吸附到最近的时间点
   */
  const snapToNearest = useCallback(
    (time: number): number => {
      if (snapPoints.length === 0) return time;

      for (const point of snapPoints) {
        if (Math.abs(time - point) <= snapThreshold) {
          return point;
        }
      }
      return time;
    },
    [snapPoints, snapThreshold]
  );

  /**
   * 开始拖拽
   */
  const startDrag = useCallback(
    (
      segment: MediaSegment,
      mode: MediaDragMode,
      clientX: number
    ) => {
      if (mode === 'none') return;

      didDragRef.current = false;

      setState({
        mode,
        startX: clientX,
        deltaX: 0,
        originalTimelineStart: segment.timelineStart,
        originalTimelineEnd: segment.timelineEnd,
        segmentId: segment.id
      });
    },
    []
  );

  /**
   * 更新拖拽位置
   */
  const updateDrag = useCallback((clientX: number) => {
    if (state.mode === 'none' || !state.segmentId) return;

    didDragRef.current = true;
    const deltaX = clientX - state.startX;

    setState((prev) => ({ ...prev, deltaX }));
  }, [state.mode, state.segmentId, state.startX]);

  /**
   * 结束拖拽
   */
  const endDrag = useCallback(() => {
    if (state.mode === 'none' || !state.segmentId) {
      setState((prev) => ({ ...prev, mode: 'none', segmentId: null }));
      return;
    }

    if (didDragRef.current) {
      const deltaTime = state.deltaX / pixelsPerSecond;

      if (state.mode === 'move') {
        let newStart = state.originalTimelineStart + deltaTime;
        newStart = Math.max(0, Math.min(maxTime - (state.originalTimelineEnd - state.originalTimelineStart), newStart));
        newStart = snapToNearest(newStart);
        callbacks.onMove?.(state.segmentId, newStart);
      } else if (state.mode === 'resize-start') {
        let newStart = state.originalTimelineStart + deltaTime;
        newStart = Math.max(0, Math.min(state.originalTimelineEnd - minDuration, newStart));
        newStart = snapToNearest(newStart);
        callbacks.onResize?.(state.segmentId, 'start', newStart);
      } else if (state.mode === 'resize-end') {
        let newEnd = state.originalTimelineEnd + deltaTime;
        newEnd = Math.max(state.originalTimelineStart + minDuration, Math.min(maxTime, newEnd));
        newEnd = snapToNearest(newEnd);
        callbacks.onResize?.(state.segmentId, 'end', newEnd);
      }
    }

    setState({
      mode: 'none',
      startX: 0,
      deltaX: 0,
      originalTimelineStart: 0,
      originalTimelineEnd: 0,
      segmentId: null
    });
  }, [state, pixelsPerSecond, minDuration, maxTime, snapToNearest, callbacks]);

  /**
   * 取消拖拽
   */
  const cancelDrag = useCallback(() => {
    setState({
      mode: 'none',
      startX: 0,
      deltaX: 0,
      originalTimelineStart: 0,
      originalTimelineEnd: 0,
      segmentId: null
    });
    didDragRef.current = false;
  }, []);

  /**
   * 计算预览位置
   */
  const getPreviewPosition = useCallback(
    (segment: MediaSegment): MediaDragResult | null => {
      if (state.mode === 'none' || state.segmentId !== segment.id) return null;

      const deltaTime = state.deltaX / pixelsPerSecond;

      if (state.mode === 'move') {
        let newStart = state.originalTimelineStart + deltaTime;
        newStart = Math.max(0, newStart);
        const duration = state.originalTimelineEnd - state.originalTimelineStart;
        return {
          timelineStart: newStart,
          timelineEnd: newStart + duration
        };
      } else if (state.mode === 'resize-start') {
        let newStart = state.originalTimelineStart + deltaTime;
        newStart = Math.max(0, Math.min(state.originalTimelineEnd - minDuration, newStart));
        return {
          timelineStart: newStart,
          timelineEnd: state.originalTimelineEnd
        };
      } else if (state.mode === 'resize-end') {
        let newEnd = state.originalTimelineEnd + deltaTime;
        newEnd = Math.max(state.originalTimelineStart + minDuration, newEnd);
        return {
          timelineStart: state.originalTimelineStart,
          timelineEnd: newEnd
        };
      }

      return null;
    },
    [state, pixelsPerSecond, minDuration]
  );

  /**
   * 检查是否正在拖拽
   */
  const isDragging = useCallback(
    (segmentId?: string): boolean => {
      if (state.mode === 'none') return false;
      if (segmentId) return state.segmentId === segmentId;
      return true;
    },
    [state.mode, state.segmentId]
  );

  /**
   * 检查是否发生了实际拖拽
   */
  const didDrag = useCallback(() => didDragRef.current, []);

  return {
    state,
    startDrag,
    updateDrag,
    endDrag,
    cancelDrag,
    getPreviewPosition,
    isDragging,
    didDrag
  };
}

/**
 * useMediaTransformDrag - 变换参数拖拽 Hook
 *
 * 用于拖拽调整变换参数（位置、缩放等）
 */
export function useMediaTransformDrag(
  callbacks: {
    onTransform?: (segmentId: string, transform: Partial<MediaTransform>) => void;
  },
  options?: {
    /** 画布宽度 */
    canvasWidth?: number;
    /** 画布高度 */
    canvasHeight?: number;
    /** 缩放步进 */
    scaleStep?: number;
    /** 旋转步进（度） */
    rotationStep?: number;
  }
) {
  const { canvasWidth = 100, canvasHeight = 100, scaleStep = 0.1, rotationStep = 15 } = options ?? {};

  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState<'position' | 'scale' | 'rotation' | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0, originalTransform: null as MediaTransform | null, segmentId: null as string | null });

  /**
   * 开始位置拖拽
   */
  const startPositionDrag = useCallback((segmentId: string, transform: MediaTransform, clientX: number, clientY: number) => {
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      originalTransform: { ...transform },
      segmentId
    };
    setDragType('position');
    setIsDragging(true);
  }, []);

  /**
   * 开始缩放拖拽
   */
  const startScaleDrag = useCallback((segmentId: string, transform: MediaTransform, clientX: number, clientY: number) => {
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      originalTransform: { ...transform },
      segmentId
    };
    setDragType('scale');
    setIsDragging(true);
  }, []);

  /**
   * 开始旋转拖拽
   */
  const startRotationDrag = useCallback((segmentId: string, transform: MediaTransform, clientX: number, clientY: number) => {
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      originalTransform: { ...transform },
      segmentId
    };
    setDragType('rotation');
    setIsDragging(true);
  }, []);

  /**
   * 更新拖拽
   */
  const updateTransformDrag = useCallback(
    (clientX: number, clientY: number) => {
      if (!isDragging || !dragStartRef.current.originalTransform || !dragStartRef.current.segmentId) return;

      const deltaX = clientX - dragStartRef.current.x;
      const deltaY = clientY - dragStartRef.current.y;
      const original = dragStartRef.current.originalTransform;

      if (dragType === 'position') {
        // 位置拖拽：转换为百分比
        const newX = Math.max(0, Math.min(100, original.x + (deltaX / canvasWidth) * 100));
        const newY = Math.max(0, Math.min(100, original.y + (deltaY / canvasHeight) * 100));
        callbacks.onTransform?.(dragStartRef.current.segmentId, { x: newX, y: newY });
      } else if (dragType === 'scale') {
        // 缩放拖拽：基于 X 方向移动
        const scaleDelta = (deltaX / 100) * scaleStep;
        const newScale = Math.max(0.1, Math.min(10, original.scale + scaleDelta));
        callbacks.onTransform?.(dragStartRef.current.segmentId, { scale: newScale });
      } else if (dragType === 'rotation') {
        // 旋转拖拽：基于 X 方向移动
        const rotationDelta = (deltaX / 5) * rotationStep;
        const newRotation = (original.rotation + rotationDelta) % 360;
        callbacks.onTransform?.(dragStartRef.current.segmentId, { rotation: newRotation });
      }
    },
    [isDragging, dragType, canvasWidth, canvasHeight, scaleStep, rotationStep, callbacks]
  );

  /**
   * 结束拖拽
   */
  const endTransformDrag = useCallback(() => {
    setIsDragging(false);
    setDragType(null);
    dragStartRef.current = { x: 0, y: 0, originalTransform: null, segmentId: null };
  }, []);

  return {
    isDragging,
    dragType,
    startPositionDrag,
    startScaleDrag,
    startRotationDrag,
    updateTransformDrag,
    endTransformDrag
  };
}

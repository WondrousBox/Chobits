/**
 * useBlockDrag - 通用块拖拽 Hook
 *
 * 夋持：
 * - 整体移动（move）
 * - 边缘调整时间（resize-start/resize-end）
 * - 边缘调整速度（speed 模式）
 * - 拖拽时间提示
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { DEFAULT_CONFIG } from '../../../types';
import type { BlockCallbacks, BlockCapabilities, BlockDragMode, BlockDragState, BlockLayout, BlockTimeTooltip } from '../types';

const EDGE_WIDTH = 8;

// 速度调整范围
const MIN_SPEED = 0.25;
const MAX_SPEED = 16.0;

interface UseBlockDragOptions {
  capabilities: BlockCapabilities;
  layout: BlockLayout;
  content: {
    id: string;
    startTime: number;
    endTime: number;
    playbackRate?: number;
    audioDuration?: number;
  };
  callbacks?: BlockCallbacks;
  disabled?: boolean;
  activeTool?: string;
}

interface UseBlockDragReturn {
  dragMode: BlockDragMode;
  dragState: BlockDragState;
  handlers: {
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseLeave: (e: React.MouseEvent) => void;
  };
  didDragJustEndRef: React.MutableRefObject<boolean>;
  resolveDragMode: (clientX: number, element: HTMLElement | null) => BlockDragMode;
}

export function useBlockDrag({ capabilities, layout, content, callbacks, disabled, activeTool = 'select' }: UseBlockDragOptions): UseBlockDragReturn {
  const { pixelsPerSecond, maxDuration } = layout;
  const { movable, edgeResize } = capabilities.drag || {};
  const canDrag = !disabled && activeTool === 'select' && (movable || edgeResize !== 'none');

  const [dragState, setDragState] = useState<BlockDragState>({
    mode: 'none',
    startX: 0,
    startTime: content.startTime,
    endTime: content.endTime,
    deltaX: 0,
    tooltip: null
  });

  const didDragJustEndRef = useRef(false);
  const didMoveDuringDragRef = useRef(false);

  // 使用 ref 存储拖拽开始时的值，避免 effect 依赖问题
  const dragStartValuesRef = useRef({
    startX: 0,
    startTime: 0,
    endTime: 0
  });

  // 解析拖拽模式（基于鼠标位置）
  const resolveDragMode = useCallback(
    (clientX: number, element: HTMLElement | null): BlockDragMode => {
      if (!canDrag || !element) return 'none';

      const rect = element.getBoundingClientRect();
      const relativeX = clientX - rect.left;

      if (edgeResize === 'time' || edgeResize === 'speed') {
        if (relativeX <= EDGE_WIDTH) return 'resize-start';
        if (relativeX >= rect.width - EDGE_WIDTH) return 'resize-end';
      }

      return movable ? 'move' : 'none';
    },
    [canDrag, edgeResize, movable]
  );

  // 开始拖拽
  const startDrag = useCallback(
    (e: React.MouseEvent, element: HTMLElement | null) => {
      if (!canDrag) return;

      const mode = resolveDragMode(e.clientX, element);
      if (mode === 'none') return;

      // 保存拖拽开始时的值到 ref
      dragStartValuesRef.current = {
        startX: e.clientX,
        startTime: content.startTime,
        endTime: content.endTime
      };

      setDragState({
        mode,
        startX: e.clientX,
        startTime: content.startTime,
        endTime: content.endTime,
        deltaX: 0,
        tooltip: null
      });

      didMoveDuringDragRef.current = false;
      didDragJustEndRef.current = false;
    },
    [canDrag, resolveDragMode, content.startTime, content.endTime]
  );

  // 拖拽过程和结束
  useEffect(() => {
    if (dragState.mode === 'none') return;

    // 使用 ref 存储当前拖拽值，供 handleMouseUp 使用
    const currentDragValuesRef = {
      startTime: dragState.startTime,
      endTime: dragState.endTime
    };

    const handleMouseMove = (e: MouseEvent): void => {
      didMoveDuringDragRef.current = true;

      // 使用 ref 中的初始值计算 delta
      const deltaX = e.clientX - dragStartValuesRef.current.startX;
      const deltaTime = deltaX / pixelsPerSecond;
      const originalDuration = dragStartValuesRef.current.endTime - dragStartValuesRef.current.startTime;

      let newStartTime = dragStartValuesRef.current.startTime;
      let newEndTime = dragStartValuesRef.current.endTime;

      if (dragState.mode === 'move') {
        newStartTime = Math.max(0, dragStartValuesRef.current.startTime + deltaTime);
        newEndTime = newStartTime + originalDuration;
        if (maxDuration !== undefined && newEndTime > maxDuration) {
          newEndTime = maxDuration;
          newStartTime = maxDuration - originalDuration;
        }
      } else if (dragState.mode === 'resize-start') {
        newStartTime = Math.max(0, Math.min(dragStartValuesRef.current.endTime - 0.1, dragStartValuesRef.current.startTime + deltaTime));
        newEndTime = dragStartValuesRef.current.endTime;
      } else if (dragState.mode === 'resize-end') {
        newStartTime = dragStartValuesRef.current.startTime;
        newEndTime = Math.max(dragStartValuesRef.current.startTime + 0.1, dragStartValuesRef.current.endTime + deltaTime);
        if (maxDuration !== undefined && newEndTime > maxDuration) {
          newEndTime = maxDuration;
        }
      }

      // 更新当前值引用
      currentDragValuesRef.startTime = newStartTime;
      currentDragValuesRef.endTime = newEndTime;

      // 更新提示
      const tooltip: BlockTimeTooltip = {
        x: e.clientX,
        y: e.clientY,
        ...(dragState.mode === 'move' ? { startTime: newStartTime, endTime: newEndTime } : dragState.mode === 'resize-start' ? { startTime: newStartTime } : { endTime: newEndTime })
      };

      setDragState((prev) => ({
        ...prev,
        deltaX,
        startTime: newStartTime,
        endTime: newEndTime,
        tooltip
      }));
    };

    const handleMouseUp = (): void => {
      if (didMoveDuringDragRef.current) {
        didDragJustEndRef.current = true;

        const { mode } = dragState;
        const newStart = currentDragValuesRef.startTime;
        const newEnd = currentDragValuesRef.endTime;

        // 根据拖拽模式调用不同的回调
        if (mode === 'move' && callbacks?.onMove) {
          callbacks.onMove(content.id, newStart);
        } else if ((mode === 'resize-start' || mode === 'resize-end') && edgeResize === 'speed') {
          // 速度调整模式：计算新速度
          const originalDuration = dragStartValuesRef.current.endTime - dragStartValuesRef.current.startTime;
          const sourceDuration = content.audioDuration ?? originalDuration;
          const newPlayDuration = newEnd - newStart;
          const newSpeed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round((sourceDuration / newPlayDuration) * 100) / 100));
          callbacks?.onSpeedChange?.(content.id, newSpeed);
        } else if ((mode === 'resize-start' || mode === 'resize-end') && edgeResize === 'time') {
          callbacks?.onTimeChange?.(content.id, newStart, newEnd);
        }
      }

      setDragState({
        mode: 'none',
        startX: 0,
        startTime: content.startTime,
        endTime: content.endTime,
        deltaX: 0,
        tooltip: null
      });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    // 只依赖 dragState.mode，避免每次鼠标移动时重新创建 effect
  }, [dragState.mode, pixelsPerSecond, maxDuration, edgeResize, content.id, content.audioDuration, callbacks]);

  // 事件处理器
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!canDrag || e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      startDrag(e, e.currentTarget as HTMLElement);
    },
    [canDrag, startDrag]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!canDrag || dragState.mode !== 'none') return;
      const element = e.currentTarget as HTMLElement;
      const mode = resolveDragMode(e.clientX, element);
      element.style.cursor = mode !== 'none' ? (mode === 'move' ? 'grab' : 'ew-resize') : 'pointer';
    },
    [canDrag, dragState.mode, resolveDragMode]
  );

  const handleMouseLeave = useCallback(
    (e: React.MouseEvent) => {
      if (dragState.mode === 'none') {
        (e.currentTarget as HTMLElement).style.cursor = canDrag ? 'grab' : 'pointer';
      }
    },
    [dragState.mode, canDrag]
  );

  return {
    dragMode: dragState.mode,
    dragState,
    handlers: {
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseLeave: handleMouseLeave
    },
    didDragJustEndRef,
    resolveDragMode
  };
}

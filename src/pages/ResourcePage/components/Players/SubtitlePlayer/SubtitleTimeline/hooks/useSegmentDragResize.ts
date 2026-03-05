import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react';

export type SegmentDragMode = 'none' | 'move' | 'resize-left' | 'resize-right';

export interface SegmentDragHoverTime {
  startTime?: number;
  endTime?: number;
  x: number;
  y: number;
}

interface StartDragOptions {
  mode: SegmentDragMode;
  clientX: number;
  startTime: number;
  endTime: number;
}

interface UseSegmentDragResizeOptions {
  pixelsPerSecond: number;
  maxDuration?: number;
  minDuration?: number;
  edgeWidth?: number;
  onTimeChange?: (newStartTime: number, newEndTime: number) => void;
  onDragEnd?: () => void;
}

interface UseSegmentDragResizeReturn {
  dragMode: SegmentDragMode;
  dragHoverTime: SegmentDragHoverTime | null;
  didDragJustEndRef: MutableRefObject<boolean>;
  startDrag: (options: StartDragOptions) => void;
  resolveDragMode: (clientX: number, element: HTMLElement | null) => SegmentDragMode;
}

/**
 * 通用片段拖拽/缩放逻辑：
 * - 整体移动
 * - 左右边缘缩放
 * - 拖拽悬浮时间提示
 * - 区分「拖拽结束」与「单击」
 */
export function useSegmentDragResize({ pixelsPerSecond, maxDuration, minDuration = 0.1, edgeWidth = 6, onTimeChange, onDragEnd }: UseSegmentDragResizeOptions): UseSegmentDragResizeReturn {
  const [dragMode, setDragMode] = useState<SegmentDragMode>('none');
  const [dragStartX, setDragStartX] = useState(0);
  const [originalTimes, setOriginalTimes] = useState({ start: 0, end: 0 });
  const [dragHoverTime, setDragHoverTime] = useState<SegmentDragHoverTime | null>(null);

  /** 拖拽结束后的 mouseup 会触发 click；该标记用于消费这次 click */
  const didDragJustEndRef = useRef(false);
  /** 本次按下后是否发生过位移 */
  const didMoveDuringDragRef = useRef(false);

  const resolveDragMode = useCallback(
    (clientX: number, element: HTMLElement | null): SegmentDragMode => {
      if (!element) return 'move';
      const rect = element.getBoundingClientRect();
      const relativeX = clientX - rect.left;
      if (relativeX <= edgeWidth) return 'resize-left';
      if (relativeX >= rect.width - edgeWidth) return 'resize-right';
      return 'move';
    },
    [edgeWidth]
  );

  const startDrag = useCallback(({ mode, clientX, startTime, endTime }: StartDragOptions) => {
    if (mode === 'none') return;
    setDragMode(mode);
    setDragStartX(clientX);
    setOriginalTimes({ start: startTime, end: endTime });
    didMoveDuringDragRef.current = false;
    didDragJustEndRef.current = false;
  }, []);

  useEffect(() => {
    if (dragMode === 'none') return;

    const handleMouseMove = (e: MouseEvent): void => {
      didMoveDuringDragRef.current = true;

      const deltaX = e.clientX - dragStartX;
      const deltaTime = deltaX / pixelsPerSecond;
      const segmentDuration = originalTimes.end - originalTimes.start;

      let newStartTime = originalTimes.start;
      let newEndTime = originalTimes.end;

      if (dragMode === 'move') {
        newStartTime = Math.max(0, originalTimes.start + deltaTime);
        newEndTime = newStartTime + segmentDuration;
        if (maxDuration !== undefined && newEndTime > maxDuration) {
          newEndTime = maxDuration;
          newStartTime = maxDuration - segmentDuration;
        }
      } else if (dragMode === 'resize-left') {
        newStartTime = Math.max(0, Math.min(originalTimes.end - minDuration, originalTimes.start + deltaTime));
      } else if (dragMode === 'resize-right') {
        newEndTime = Math.max(originalTimes.start + minDuration, originalTimes.end + deltaTime);
        if (maxDuration !== undefined && newEndTime > maxDuration) {
          newEndTime = maxDuration;
        }
      }

      if (dragMode === 'move') {
        setDragHoverTime({ startTime: newStartTime, endTime: newEndTime, x: e.clientX, y: e.clientY });
      } else if (dragMode === 'resize-left') {
        setDragHoverTime({ startTime: newStartTime, x: e.clientX, y: e.clientY });
      } else {
        setDragHoverTime({ endTime: newEndTime, x: e.clientX, y: e.clientY });
      }

      onTimeChange?.(newStartTime, newEndTime);
    };

    const handleMouseUp = (): void => {
      if (didMoveDuringDragRef.current) {
        didDragJustEndRef.current = true;
      }
      setDragMode('none');
      setDragHoverTime(null);
      onDragEnd?.();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragMode, dragStartX, pixelsPerSecond, originalTimes, maxDuration, minDuration, onTimeChange, onDragEnd]);

  return {
    dragMode,
    dragHoverTime,
    didDragJustEndRef,
    startDrag,
    resolveDragMode
  };
}

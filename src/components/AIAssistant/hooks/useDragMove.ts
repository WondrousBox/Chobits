/**
 * useDragMove
 * - 负责：长按进入拖拽，拖动时移动 Electron 窗口并保持助手可见；含 30fps IPC 节流。
 * - 输入：{ screenSize, padding, onHoldStart?, onDragStateChange? }
 * - 返回：{ bind: { onMouseDown }, isDragging, isDragReady }
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { clamp } from '@/utils/helpers';
import { ASSISTANT_HEIGHT, ASSISTANT_WIDTH, FRAME_INTERVAL } from '../constants';

export function useDragMove(
  containerRef: React.RefObject<HTMLElement>,
  options: {
    screenSize: { width: number; height: number };
    padding: number;
    onHoldStart?: () => void;
    onDragStateChange?: (dragging: boolean) => void;
  }
) {
  const { screenSize, padding, onHoldStart, onDragStateChange } = options;
  const [isDragging, setIsDragging] = useState(false);
  const [isDragReady, setIsDragReady] = useState(false);
  const dragTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dragStartTimeRef = useRef<number>(0);
  const dragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastIpcSendRef = useRef(0);
  // cleanup function for listeners used during the "hold to drag" pending phase
  const holdPhaseCleanupRef = useRef<() => void>(() => { });

  const cancelHold = useCallback(() => {
    // cancel the pending long-press timer and reset state
    if (dragTimerRef.current) {
      clearTimeout(dragTimerRef.current);
      dragTimerRef.current = null;
    }
    setIsDragReady(false);
    setIsDragging(false);
    onDragStateChange?.(false);
    // remove temporary listeners for the hold phase
    holdPhaseCleanupRef.current?.();
    // reset to no-op
    holdPhaseCleanupRef.current = () => { };
  }, [onDragStateChange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only respond to left-click; ignore right/middle clicks
    if (e.button !== 0) return;
    e.preventDefault();
    if (dragTimerRef.current) {
      clearTimeout(dragTimerRef.current);
      dragTimerRef.current = null;
    }
    setIsDragReady(false);
    dragStartTimeRef.current = Date.now();
    dragOffset.current = { x: e.clientX, y: e.clientY };

    // Prepare one-off listeners to detect early release before the long-press delay
    // If the user releases the mouse or the window loses focus before the delay,
    // we cancel the pending drag activation.
    const onEarlyUp = () => cancelHold();
    const onBlur = () => cancelHold();
    // mouseleave on document can be noisy; prefer pointerup/mouseup + blur.
    document.addEventListener('mouseup', onEarlyUp);
    window.addEventListener('blur', onBlur);
    holdPhaseCleanupRef.current = () => {
      document.removeEventListener('mouseup', onEarlyUp);
      window.removeEventListener('blur', onBlur);
    };

    dragTimerRef.current = setTimeout(() => {
      // only proceed if still pressed (i.e., not canceled)
      onHoldStart?.();
      setIsDragReady(true);
      setIsDragging(true);
      onDragStateChange?.(true);
      // hold phase is over; remove its listeners
      holdPhaseCleanupRef.current?.();
      holdPhaseCleanupRef.current = () => { };
      if (dragTimerRef.current) {
        clearTimeout(dragTimerRef.current);
        dragTimerRef.current = null;
      }
    }, 250);
  };

  const handleMouseUp = useCallback(() => {
    if (dragTimerRef.current) {
      clearTimeout(dragTimerRef.current);
      dragTimerRef.current = null;
    }
    setIsDragging(false);
    onDragStateChange?.(false);
    setIsDragReady(false);
  }, [onDragStateChange]);

  const handleMouseMove = useCallback(
    async (e: MouseEvent) => {
      if (!isDragging || !isDragReady) return;
      const winX = e.screenX - dragOffset.current.x;
      const winY = e.screenY - dragOffset.current.y;
      const minWinX = -padding;
      const maxWinX = screenSize.width - ASSISTANT_WIDTH - padding;
      const minWinY = -padding;
      const maxWinY = screenSize.height - ASSISTANT_HEIGHT - padding;
      const boundedWinX = clamp(winX, minWinX, maxWinX);
      const boundedWinY = clamp(winY, minWinY, maxWinY);

      const now = performance.now();
      if (!lastIpcSendRef.current || now - lastIpcSendRef.current >= FRAME_INTERVAL) {
        lastIpcSendRef.current = now;
        await window.YUA.window['window:move']({ x: Math.round(boundedWinX), y: Math.round(boundedWinY) });
      }
    },
    [isDragging, isDragReady, padding, screenSize.height, screenSize.width]
  );

  // global listeners during dragging
  useEffect(() => {
    if (isDragging) {
      const up = (e: MouseEvent) => handleMouseUp();
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', up);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', up);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  useEffect(
    () => () => {
      if (dragTimerRef.current) {
        clearTimeout(dragTimerRef.current);
        dragTimerRef.current = null;
      }
      holdPhaseCleanupRef.current?.();
      holdPhaseCleanupRef.current = () => { };
    },
    []
  );

  return { bind: { onMouseDown: handleMouseDown }, isDragging, isDragReady };
}

export default useDragMove;

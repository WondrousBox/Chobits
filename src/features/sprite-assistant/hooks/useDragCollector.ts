/**
 * useDragCollector
 *
 * 采集拖拽交互并上报到主进程（主进程负责窗口移动）。
 *
 * 逻辑：
 * 1. mousedown 开始 250ms 长按检测
 * 2. 长按后上报 sprite:drag start
 * 3. mousemove 30fps 节流上报 sprite:drag move
 * 4. mouseup 上报 sprite:drag end
 *
 * 不做窗口移动，窗口移动由主进程 WindowController 处理。
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const HOLD_DELAY_MS = 250;
const FRAME_INTERVAL = 1000 / 30; // 30fps

export function useDragCollector(): {
  onMouseDown: (e: React.MouseEvent) => void;
  isDragging: boolean;
  isDragReady: boolean;
} {
  const [isDragging, setIsDragging] = useState(false);
  const [isDragReady, setIsDragReady] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSendRef = useRef(0);
  const holdCleanupRef = useRef<() => void>(() => { });

  const cancelHold = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setIsDragReady(false);
    setIsDragging(false);
    holdCleanupRef.current?.();
    holdCleanupRef.current = () => { };
  }, []);

  const onMouseDown = useCallback(
    (e: React.MouseEvent): void => {
      if (e.button !== 0) return; // 仅左键
      e.preventDefault();

      const offsetX = e.clientX;
      const offsetY = e.clientY;

      // 取消之前的定时器
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      setIsDragReady(false);

      // 设置早期释放检测
      const onEarlyRelease = (): void => cancelHold();
      document.addEventListener('mouseup', onEarlyRelease);
      window.addEventListener('blur', onEarlyRelease);
      holdCleanupRef.current = () => {
        document.removeEventListener('mouseup', onEarlyRelease);
        window.removeEventListener('blur', onEarlyRelease);
      };

      holdTimerRef.current = setTimeout(() => {
        holdCleanupRef.current?.();
        holdCleanupRef.current = () => { };
        holdTimerRef.current = null;

        setIsDragReady(true);
        setIsDragging(true);

        // 上报拖拽开始
        window.YUA.sprite.dragStart(offsetX, offsetY);
      }, HOLD_DELAY_MS);
    },
    [cancelHold]
  );

  // 全局 mousemove/mouseup 监听
  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e: MouseEvent): void => {
      const now = performance.now();
      if (now - lastSendRef.current < FRAME_INTERVAL) return;
      lastSendRef.current = now;
      window.YUA.sprite.dragMove(e.screenX, e.screenY);
    };

    const onUp = (): void => {
      window.YUA.sprite.dragEnd();
      setIsDragging(false);
      setIsDragReady(false);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [isDragging]);

  // 清理
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      holdCleanupRef.current?.();
    };
  }, []);

  return { onMouseDown, isDragging, isDragReady };
}

export default useDragCollector;

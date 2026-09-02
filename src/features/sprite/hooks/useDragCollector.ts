/**
 * useDragCollector
 *
 * 采集拖拽交互并上报到主进程（主进程负责窗口移动）。
 *
 * 逻辑：
 * 1. mousedown 开始 250ms 长按检测
 * 2. 长按后上报 sprite:drag start（主进程开始 60fps 轮询光标位置）
 * 3. mouseup 上报 sprite:drag end
 *
 * 不再发送 mousemove 坐标——主进程直接通过 screen.getCursorScreenPoint()
 * 获取实时光标位置，彻底消除 IPC 往返延迟。
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const HOLD_DELAY_MS = 250;

export function useDragCollector(): {
  onMouseDown: (e: React.MouseEvent) => void;
  isDragging: boolean;
  isDragReady: boolean;
  /** 最近一次真实拖拽结束的毫秒时间戳（0 表示从未拖拽）；用于让调用方抑制拖拽后紧随的 click/dblclick */
  lastDragEndAtRef: { current: number };
} {
  const [isDragging, setIsDragging] = useState(false);
  const [isDragReady, setIsDragReady] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdCleanupRef = useRef<() => void>(() => {});
  const lastDragEndAtRef = useRef(0);

  const cancelHold = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setIsDragReady(false);
    setIsDragging(false);
    holdCleanupRef.current?.();
    holdCleanupRef.current = () => {};
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
        holdCleanupRef.current = () => {};
        holdTimerRef.current = null;

        setIsDragReady(true);
        setIsDragging(true);

        // 上报拖拽开始（主进程启动光标轮询）
        window.chobits.sprite.dragStart(offsetX, offsetY);
      }, HOLD_DELAY_MS);
    },
    [cancelHold]
  );

  // 全局 mouseup 监听（不再需要 mousemove，主进程自行轮询光标）
  useEffect(() => {
    if (!isDragging) return;

    const onUp = (): void => {
      window.chobits.sprite.dragEnd();
      lastDragEndAtRef.current = Date.now();
      setIsDragging(false);
      setIsDragReady(false);
    };

    document.addEventListener('mouseup', onUp);
    return () => {
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

  return { onMouseDown, isDragging, isDragReady, lastDragEndAtRef };
}

export default useDragCollector;

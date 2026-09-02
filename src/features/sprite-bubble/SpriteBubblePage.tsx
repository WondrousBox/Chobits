/**
 * SpriteBubblePage — 桌面精灵气泡独立窗口
 *
 * 职责：
 * 1. 订阅主进程消息桥（沿用 MessageProvider）渲染 toast/notice/busy 气泡。
 * 2. 通过离屏测量层和 ResizeObserver 测量内容尺寸，节流后调用 `sprite:bubble:resize`
 *    让主进程调整窗口大小，并触发对应的跟随/固定定位刷新。
 * 3. 根据当前是否有消息，调用 `sprite:bubble:set-visible` 显示/隐藏窗口；隐藏延迟到
 *    淡出动画结束之后，避免抖动。
 *
 * 注意：本页面服务于独立窗口气泡模式；inline 模式下窗口保持隐藏即可。
 */

import { isBubbleWindowMode } from '@packages/sprite-core/types';
import { type CSSProperties, useEffect, useLayoutEffect, useRef } from 'react';

import { useSpriteState } from '@/features/sprite-assistant/context/hooks';
import { MessageProvider, SpriteMessage, useMessage } from '@/features/sprite-assistant/message';

const HIDE_DELAY_MS = 220; // 比消息组件 200ms 淡出动画稍长，确保动画结束后再隐藏窗口
const MIN_BUBBLE_WIDTH = 104;
const MIN_BUBBLE_HEIGHT = 48;
const MAX_BUBBLE_WIDTH = 504;
const MAX_BUBBLE_HEIGHT = 392;

const MEASURE_LAYER_STYLE: CSSProperties = {
  contain: 'layout style',
  transform: 'translate3d(-10000px, -10000px, 0)'
};

function clampBubbleSize(width: number, height: number): { width: number; height: number } {
  return {
    width: Math.min(MAX_BUBBLE_WIDTH, Math.max(MIN_BUBBLE_WIDTH, Math.ceil(width))),
    height: Math.min(MAX_BUBBLE_HEIGHT, Math.max(MIN_BUBBLE_HEIGHT, Math.ceil(height)))
  };
}

function SpriteBubbleContent(): JSX.Element | null {
  const { current, clearAll } = useMessage();
  const { spriteConfig } = useSpriteState();
  const isWindowMode = isBubbleWindowMode(spriteConfig.bubbleMode);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const lastSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const lastVisibleRef = useRef<boolean | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeRafRef = useRef<number | null>(null);
  const wasWindowModeRef = useRef(false);

  // 维护窗口可见性
  useEffect(() => {
    const setVisible = (visible: boolean): void => {
      if (lastVisibleRef.current === visible) return;
      lastVisibleRef.current = visible;
      void window.chobits.sprite.bubbleSetVisible(visible).catch(() => undefined);
    };

    if (!isWindowMode) {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      if (wasWindowModeRef.current) {
        clearAll();
      }
      wasWindowModeRef.current = false;
      setVisible(false);
      return;
    }

    wasWindowModeRef.current = true;

    if (current) {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      setVisible(true);
    } else if (lastVisibleRef.current !== false) {
      // 延迟到淡出动画结束再隐藏，避免下一条消息瞬间到达时的“眨眼”
      hideTimerRef.current = setTimeout(() => {
        setVisible(false);
      }, HIDE_DELAY_MS);
    }

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [current, isWindowMode, clearAll]);

  // 监听内容尺寸变化，上报新窗口大小
  useLayoutEffect(() => {
    if (!isWindowMode || !current) return;
    const node = measureRef.current;
    if (!node) return;

    const pushSize = (): void => {
      // current 清空后 SpriteMessage 会在 200ms 后卸载内容；隐藏窗口前保持旧尺寸，
      // 避免最后一帧缩成空白小窗口。
      const rect = node.getBoundingClientRect();
      const measuredWidth = Math.max(rect.width, node.scrollWidth);
      const measuredHeight = Math.max(rect.height, node.scrollHeight);
      const { width, height } = clampBubbleSize(measuredWidth, measuredHeight);
      const last = lastSizeRef.current;
      if (last.width === width && last.height === height) return;
      lastSizeRef.current = { width, height };
      void window.chobits.sprite.bubbleResize(width, height).catch(() => undefined);
    };

    const schedule = (): void => {
      if (resizeRafRef.current != null) return;
      resizeRafRef.current = requestAnimationFrame(() => {
        resizeRafRef.current = null;
        pushSize();
      });
    };

    const observer = new ResizeObserver(() => {
      schedule();
    });
    observer.observe(node);
    schedule();

    return () => {
      observer.disconnect();
      if (resizeRafRef.current != null) {
        cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
      }
    };
  }, [current, isWindowMode]);

  if (!isWindowMode) {
    return null;
  }

  return (
    <div className="fixed inset-0 flex items-end justify-center overflow-visible pointer-events-none select-none">
      <div className="inline-flex w-full max-w-[504px] items-end justify-center overflow-visible px-3 pt-3 pb-0">
        <SpriteMessage placement="fixed-top" />
      </div>
      <div
        ref={measureRef}
        aria-hidden="true"
        className="invisible fixed left-0 top-0 inline-flex w-max max-w-[504px] items-end justify-center overflow-visible px-3 pt-3 pb-0 pointer-events-none select-none"
        style={MEASURE_LAYER_STYLE}
      >
        <SpriteMessage placement="fixed-top" />
      </div>
    </div>
  );
}

export function SpriteBubblePage(): JSX.Element {
  return (
    <MessageProvider surface="sprite-bubble">
      <SpriteBubbleContent />
    </MessageProvider>
  );
}

export default SpriteBubblePage;

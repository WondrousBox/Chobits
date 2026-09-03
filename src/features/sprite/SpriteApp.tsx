/**
 * SpriteApp 组装层 (重构后)
 *
 * 职责：纯展示层 + 交互采集器
 * - 从 SpriteStateContext 被动接收状态
 * - 通过 IPC 上报用户交互到主进程
 * - 不再实例化任何 sprite-core 引擎
 */
import { isBubbleWindowMode } from '@packages/sprite-core/types';
import React, { useEffect, useRef } from 'react';

import { ensureChatApiConfigGoal } from '@/lib/chat-api-config-guide';

import { SPRITE_RENDERER_MODE } from './constants';
import { useSpriteState } from './context/hooks';
import { useDragCollector } from './hooks/useDragCollector';
import { MessageProvider, SpriteMessage } from './message';
import { Renderer } from './renderers';
import { useSpriteSpeak } from './speak/useSpriteSpeak';
import PaddingDebugOverlay from './ui/PaddingDebugOverlay';
import { alignMainWindowToBottomRight } from './utils/positioning';

const shouldShowBlock = false; // 开发时显示
const CLICK_INTERACTION_DEDUP_MS = 300;

/** 内部组件：包含实际逻辑 */
const SpriteAppInner: React.FC = () => {
  const { currentAnimation, walkDirection, spriteConfig, ready } = useSpriteState();
  const { width, height, padding, bubbleMode } = spriteConfig;

  // 独立窗口气泡模式下运行期 padding 强制为 0（不修改持久化的原 padding）
  const isBubbleWindow = isBubbleWindowMode(bubbleMode);
  const effectivePadding = isBubbleWindow ? 0 : padding;

  const containerRef = useRef<HTMLDivElement>(null);
  const { onMouseDown, isDragReady, lastDragEndAtRef } = useDragCollector();
  const lastClickInteractionAtRef = useRef(0);

  // 拖拽松手后浏览器仍会派发 click（快速连击时还有 dblclick），拖动刚结束时一律忽略
  const isDragJustEnded = (): boolean => Date.now() - lastDragEndAtRef.current < CLICK_INTERACTION_DEDUP_MS;

  // 全局语音播放
  useSpriteSpeak();

  // 阻止浏览器默认拖放
  useEffect(() => {
    const prevent = (e: DragEvent): void => {
      e.preventDefault();
    };
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  // 首次挂载：初始定位窗口
  // live2d 渲染模式下窗口尺寸由 Live2DSprite 按 live2d.json 异步校正，右下角对齐也在那边完成，此处跳过
  const isInitialMountRef = useRef(true);
  useEffect(() => {
    if (!ready || SPRITE_RENDERER_MODE === 'live2d') return;
    const positionWindow = async (): Promise<void> => {
      try {
        const winWidth = width + effectivePadding * 2;
        const winHeight = height + effectivePadding * 2;

        if (isInitialMountRef.current) {
          isInitialMountRef.current = false;
          await alignMainWindowToBottomRight(winWidth, winHeight);
        }
      } catch (error) {
        console.error('Failed to handle window position:', error);
      }
    };
    positionWindow();
  }, [ready, width, height, effectivePadding]);

  // 当动画切换、尺寸或气泡模式变化时，同步到主进程调整主窗口尺寸。
  // live2d 渲染模式下窗口尺寸由 Live2DSprite 按 live2d.json 画布配置统一管理，此处跳过以避免互相覆盖。
  useEffect(() => {
    if (!ready || SPRITE_RENDERER_MODE === 'live2d') return;
    const playback = currentAnimation?.playback;
    const targetWidth = playback?.width ?? width;
    const targetHeight = playback?.height ?? height;
    const rawPadding = playback?.padding ?? padding;
    const targetPadding = isBubbleWindow ? 0 : rawPadding;
    const setSize = async (): Promise<void> => {
      try {
        await window.chobits.window['sprite:size:set']({
          width: targetWidth,
          height: targetHeight,
          padding: targetPadding
        });
      } catch (error) {
        console.error('Failed to set sprite size:', error);
      }
    };
    setSize();
  }, [ready, currentAnimation, width, height, padding, isBubbleWindow]);

  // 交互采集
  const handleClick = (): void => {
    if (isDragJustEnded()) return;
    const now = Date.now();
    if (now - lastClickInteractionAtRef.current < CLICK_INTERACTION_DEDUP_MS) {
      return;
    }
    lastClickInteractionAtRef.current = now;
    window.chobits.sprite.interact('click');
  };

  const handleMouseEnter = (): void => {
    window.chobits.sprite.interact('hover-enter');
  };

  const handleMouseLeave = (): void => {
    window.chobits.sprite.interact('hover-leave');
  };

  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault();
    void (async () => {
      void window.chobits.sprite.interact('context-menu', { open: true });
      void window.chobits.window['window:open']('menu');
    })();
  };

  const handleDoubleClick = (): void => {
    if (isDragJustEnded()) return;
    window.chobits.sprite.interact('double-click');
    void (async () => {
      const guide = await ensureChatApiConfigGoal({ trigger: 'sprite-double-click' });
      if (!guide.configured) {
        return;
      }

      try {
        const result = await window.chobits.preferences['preferences:get-config']();
        const targetWindow = result.ok && result.config?.miniChatWindowEnabled ? 'chatMini' : 'chatPanel';
        // 双击是开关式交互：窗口已打开时再次双击关闭
        await window.chobits.window['window:toggle'](targetWindow);
      } catch {
        await window.chobits.window['window:toggle']('chatPanel');
      }
    })();
  };

  if (!ready) return null;

  return (
    <div
      ref={containerRef}
      style={{ width, height, left: effectivePadding, top: effectivePadding }}
      className={`fixed select-none z-[9999] pointer-events-auto
        ${isDragReady ? 'cursor-grabbing opacity-80' : 'cursor-grab'}
        ${shouldShowBlock ? 'opacity-10' : ''}
      `}
      onMouseDown={onMouseDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      <PaddingDebugOverlay padding={effectivePadding} />
      {/* inline 模式下才在主窗口内嵌入气泡；独立窗口模式交给气泡窗口 */}
      {!isBubbleWindow && <SpriteMessage />}
      <Renderer width={width} height={height} walkDirection={walkDirection} />
    </div>
  );
};

/** SpriteApp 组件：包裹 MessageProvider */
export const SpriteApp: React.FC = () => {
  return (
    <MessageProvider surface="app">
      <SpriteAppInner />
    </MessageProvider>
  );
};

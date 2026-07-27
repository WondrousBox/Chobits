/**
 * AIAssistant 组装层 (重构后)
 *
 * 职责：纯展示层 + 交互采集器
 * - 从 SpriteStateContext 被动接收状态
 * - 通过 IPC 上报用户交互到主进程
 * - 不再实例化任何 sprite-core 引擎
 */
import { isBubbleWindowMode } from '@packages/sprite-core/types';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import Dropzone from '@/components/common/Dropzone';
import { ensureChatApiConfigGoal } from '@/lib/chat-api-config-guide';
import { ensureGuideGoal, WORKSPACE_EXISTS_GUIDE_GOAL } from '@/lib/guide-goals';

import { useSpriteState } from './context/hooks';
import { useAssistantEntrance } from './hooks/useAssistantEntrance';
import { useAssistantMotionEffect } from './hooks/useAssistantMotionEffect';
import { useDragCollector } from './hooks/useDragCollector';
import { useFileDropCollector } from './hooks/useFileDropCollector';
import { MessageProvider, SpriteMessage } from './message';
import { Renderer } from './renderers';
import { useSpriteSpeak } from './speak/useSpriteSpeak';
import PaddingDebugOverlay from './ui/PaddingDebugOverlay';
import PersonaGainEffects from './ui/PersonaGainEffects';
import StatusIndicator from './ui/StatusIndicator';

const showBlock = true; // 开发时显示
const CLICK_INTERACTION_DEDUP_MS = 300;

/** 内部组件：包含实际逻辑 */
const AIAssistantInner: React.FC = () => {
  const { currentAnimation, walkDirection, isWalking, spriteConfig, ready } = useSpriteState();
  const { width, height, padding, bubbleMode } = spriteConfig;

  // 独立窗口气泡模式下运行期 padding 强制为 0（不修改持久化的原 padding）
  const isBubbleWindow = isBubbleWindowMode(bubbleMode);
  const effectivePadding = isBubbleWindow ? 0 : padding;

  const containerRef = useRef<HTMLDivElement>(null);
  const { onMouseDown, isDragging, isDragReady } = useDragCollector();
  const { handleDragEnter, handleDragLeave, handleDropFiles } = useFileDropCollector();
  const lastClickInteractionAtRef = useRef(0);
  const initialCenterRequestedRef = useRef(false);
  const [assistantSizeReady, setAssistantSizeReady] = useState(false);
  const playback = currentAnimation?.playback;
  const targetWidth = playback?.width ?? width;
  const targetHeight = playback?.height ?? height;
  const rawPadding = playback?.padding ?? padding;
  const targetPadding = isBubbleWindow ? 0 : rawPadding;
  const entranceSurface = useMemo(() => ({ width: targetWidth + targetPadding * 2, height: targetHeight + targetPadding * 2 }), [targetHeight, targetPadding, targetWidth]);
  const entranceCharacterRect = useMemo(() => ({ x: targetPadding, y: targetPadding, width: targetWidth, height: targetHeight }), [targetHeight, targetPadding, targetWidth]);
  const { rendererWrapperRef, entranceComplete, entranceRunning, reportFirstFrame } = useAssistantEntrance({
    enabled: ready,
    sizeReady: assistantSizeReady,
    surface: entranceSurface,
    characterRect: entranceCharacterRect
  });
  const { motionWrapperRef, motionRunning } = useAssistantMotionEffect(entranceComplete);

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

  // 订阅升级事件，打开升级动画窗口
  useEffect(() => {
    const unsub = window.YUA.persona.onLevelUp(async (data) => {
      // 打开升级窗口并传递数据
      await window.YUA.window['window:open']('levelUp', data);
    });
    return () => {
      unsub();
    };
  }, []);

  // 订阅成就解锁事件，打开右上角独立成就动画窗口
  useEffect(() => {
    const unsub = window.YUA.persona.onAchievementUnlocked(async (data) => {
      await window.YUA.window['window:open']('achievementUnlock' as any, data);
    });
    return () => {
      unsub();
    };
  }, []);

  // // 首次挂载：初始定位窗口
  // const isInitialMountRef = useRef(true);
  // useEffect(() => {
  //   if (!ready) return;
  //   const positionWindow = async (): Promise<void> => {
  //     try {
  //       const screenSize = await window.YUA.window['screen:size:get']();
  //       const winWidth = width + effectivePadding * 2;
  //       const winHeight = height + effectivePadding * 2;

  //       if (isInitialMountRef.current) {
  //         isInitialMountRef.current = false;
  //         const winX = Math.max(0, screenSize.width - winWidth - 20);
  //         const winY = Math.max(0, screenSize.height - winHeight - 40);
  //         await window.YUA.window['window:move']({ x: winX, y: winY });
  //       }
  //     } catch (error) {
  //       console.error('Failed to handle window position:', error);
  //     }
  //   };
  //   positionWindow();
  // }, [ready, width, height, effectivePadding]);

  // 当动画切换、尺寸或气泡模式变化时，同步到主进程调整主窗口尺寸。
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const setSize = async (): Promise<void> => {
      try {
        const result = await window.YUA.window.setAssistantSize({
          width: targetWidth,
          height: targetHeight,
          padding: targetPadding
        });
        if (!result.success) {
          throw new Error(result.error || 'Failed to set assistant size');
        }
        if (cancelled) return;
        if (!initialCenterRequestedRef.current) {
          initialCenterRequestedRef.current = true;
          try {
            const centered = await window.YUA.window['window:center']('main');
            if (!centered) {
              initialCenterRequestedRef.current = false;
              console.error('Failed to center assistant window');
            }
          } catch (error) {
            initialCenterRequestedRef.current = false;
            console.error('Failed to center assistant window:', error);
          }
        }
        if (!cancelled) setAssistantSizeReady(true);
      } catch (error) {
        console.error('Failed to set assistant size:', error);
      }
    };
    setSize();
    return () => {
      cancelled = true;
    };
  }, [ready, targetWidth, targetHeight, targetPadding]);

  // 交互采集
  const handleClick = (): void => {
    if (!entranceComplete || motionRunning) return;
    const now = Date.now();
    if (now - lastClickInteractionAtRef.current < CLICK_INTERACTION_DEDUP_MS) {
      return;
    }
    lastClickInteractionAtRef.current = now;
    window.YUA.sprite.interact('click');
  };

  const handleMouseEnter = (): void => {
    if (!entranceComplete || motionRunning) return;
    window.YUA.sprite.interact('hover-enter');
  };

  const handleMouseLeave = (): void => {
    if (!entranceComplete || motionRunning) return;
    window.YUA.sprite.interact('hover-leave');
  };

  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault();
    if (!entranceComplete || motionRunning) return;
    void (async () => {
      const workspaceGoal = await ensureGuideGoal({
        goal: WORKSPACE_EXISTS_GUIDE_GOAL,
        trigger: 'workspace-entry',
        forceGuide: true
      });
      if (!workspaceGoal.achieved) {
        return;
      }
      void window.YUA.sprite.interact('context-menu', { open: true });
      void window.YUA.window['window:open']('menu');
    })();
  };

  const handleDoubleClick = (): void => {
    if (!entranceComplete || motionRunning) return;
    window.YUA.sprite.interact('double-click');
    void (async () => {
      const guide = await ensureChatApiConfigGoal({ trigger: 'assistant-double-click' });
      if (!guide.configured) {
        return;
      }

      try {
        const result = await window.YUA.preferences['preferences:getConfig']();
        const targetWindow = result.ok && result.config?.assistantMiniWindowEnabled ? 'assistantMini' : 'assistant';
        await window.YUA.window['window:open'](targetWindow);
      } catch {
        await window.YUA.window['window:open']('assistant');
      }
    })();
  };

  if (!ready) return null;

  return (
    <div
      ref={containerRef}
      style={{ width, height, left: effectivePadding, top: effectivePadding }}
      className={`fixed select-none z-[9999]
        ${entranceComplete && !motionRunning ? 'pointer-events-auto' : 'pointer-events-none'}
        ${isDragReady ? 'cursor-grabbing opacity-80' : 'cursor-grab'}
        ${showBlock ? 'opacity-10' : ''}
      `}
      onMouseDown={onMouseDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      <div ref={motionWrapperRef} data-assistant-motion={motionRunning ? 'running' : 'idle'} className="relative w-full h-full">
        {entranceComplete && <PaddingDebugOverlay padding={effectivePadding} />}
        {/* inline 模式下才在主窗口内嵌入气泡；独立窗口模式交给气泡窗口 */}
        {!isBubbleWindow && entranceComplete && <SpriteMessage />}
        <div className={entranceComplete ? 'contents' : 'contents invisible'}>
          <PersonaGainEffects />
        </div>
        <Dropzone
          onDragEnter={entranceComplete ? handleDragEnter : undefined}
          onDragLeave={entranceComplete ? handleDragLeave : undefined}
          onDropFiles={entranceComplete ? handleDropFiles : undefined}
          customDropzoneInside={
            <div className="flex items-center justify-center absolute top-2 left-1/2 -translate-x-1/2 p-1 rounded-md bg-primary text-primary-foreground text-xs whitespace-nowrap z-10">
              把文件交给我吧
            </div>
          }
        >
          <div
            ref={rendererWrapperRef}
            data-assistant-entrance={entranceRunning ? 'running' : entranceComplete ? 'complete' : 'waiting'}
            style={{ width: targetWidth, height: targetHeight, clipPath: entranceComplete ? 'inset(0 0 0 0)' : 'inset(100% 0 0 0)', opacity: entranceComplete ? 1 : 0 }}
          >
            <Renderer width={width} height={height} walkDirection={walkDirection} onFirstFrame={reportFirstFrame} />
          </div>
        </Dropzone>
        {entranceComplete && <StatusIndicator isDragging={isDragging} isWalking={isWalking} />}
      </div>
    </div>
  );
};

/** AIAssistant 组件：包裹 MessageProvider */
export const AIAssistant: React.FC = () => {
  return (
    <MessageProvider surface="app">
      <AIAssistantInner />
    </MessageProvider>
  );
};

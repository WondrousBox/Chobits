/**
 * AIAssistant 组装层 (重构后)
 *
 * 职责：纯展示层 + 交互采集器
 * - 从 SpriteStateContext 被动接收状态
 * - 通过 IPC 上报用户交互到主进程
 * - 不再实例化任何 sprite-core 引擎
 */
import React, { useEffect, useRef } from 'react';

import Dropzone from '@/components/common/Dropzone';

import { useSpriteState } from './context/hooks';
import { useDragCollector } from './hooks/useDragCollector';
import { useFileDropCollector } from './hooks/useFileDropCollector';
import { MessageProvider, SpriteMessage } from './message';
import { Renderer } from './renderers';
import { useSpriteSpeak } from './speak/useSpriteSpeak';
import PaddingDebugOverlay from './ui/PaddingDebugOverlay';
import PersonaGainEffects from './ui/PersonaGainEffects';
import StatusIndicator from './ui/StatusIndicator';

const showBlock = true; // 开发时显示

/** 内部组件：包含实际逻辑 */
const AIAssistantInner: React.FC = () => {
  const { currentAnimation, walkDirection, isWalking, spriteConfig, ready } = useSpriteState();
  const { width, height, padding } = spriteConfig;

  const containerRef = useRef<HTMLDivElement>(null);
  const { onMouseDown, isDragging, isDragReady } = useDragCollector();
  const { handleDragEnter, handleDragLeave, handleDropFiles } = useFileDropCollector();

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

  // 首次挂载：初始定位窗口
  const isInitialMountRef = useRef(true);
  useEffect(() => {
    if (!ready) return;
    const positionWindow = async (): Promise<void> => {
      try {
        const screenSize = await window.YUA.window['screen:size:get']();
        const winWidth = width + padding * 2;
        const winHeight = height + padding * 2;

        if (isInitialMountRef.current) {
          isInitialMountRef.current = false;
          const winX = Math.max(0, screenSize.width - winWidth - 20);
          const winY = Math.max(0, screenSize.height - winHeight - 40);
          await window.YUA.window['window:move']({ x: winX, y: winY });
        }
      } catch (error) {
        console.error('Failed to handle window position:', error);
      }
    };
    positionWindow();
  }, [ready, width, height, padding]);

  // 当动画切换时，设置窗口大小
  useEffect(() => {
    if (!currentAnimation?.playback) return;
    const p = currentAnimation.playback;
    const setSize = async (): Promise<void> => {
      try {
        await window.YUA.window.setAssistantSize({
          width: p.width ?? width,
          height: p.height ?? height,
          padding: p.padding ?? padding
        });
      } catch (error) {
        console.error('Failed to set assistant size:', error);
      }
    };
    setSize();
  }, [currentAnimation, width, height, padding]);

  // 交互采集
  const handleClick = (): void => {
    window.YUA.sprite.interact('click');
  };

  const handleMouseEnter = (): void => {
    window.YUA.sprite.interact('hover-enter');
  };

  const handleMouseLeave = (): void => {
    window.YUA.sprite.interact('hover-leave');
  };

  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault();
    void window.YUA.sprite.interact('context-menu', { open: true });
    void window.YUA.window['window:open']('menu');
  };

  const handleDoubleClick = (): void => {
    window.YUA.sprite.interact('double-click');
    window.YUA.window['window:open']('assistant');
  };

  if (!ready) return null;

  return (
    <div
      ref={containerRef}
      style={{ width, height, left: padding, top: padding }}
      className={`fixed select-none z-[9999] pointer-events-auto
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
      <PaddingDebugOverlay padding={padding} />
      {/* 统一消息组件 */}
      <SpriteMessage />
      <PersonaGainEffects />
      <Dropzone
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDropFiles={handleDropFiles}
        customDropzoneInside={
          <div className="flex items-center justify-center absolute top-2 left-1/2 -translate-x-1/2 p-1 rounded-md bg-primary text-primary-foreground text-xs whitespace-nowrap z-10">
            把文件交给我吧
          </div>
        }
      >
        <Renderer width={width} height={height} walkDirection={walkDirection} />
      </Dropzone>
      <StatusIndicator isDragging={isDragging} isWalking={isWalking} />
      {window.YUA.isDev && showBlock && (
        <div
          style={{
            left: padding,
            top: padding,
            bottom: padding,
            right: padding
          }}
          className="text-xs bg-background fixed rounded-md border border-solid border-ring"
        >
          {padding} {width} {height}
        </div>
      )}
    </div>
  );
};

/** AIAssistant 组件：包裹 MessageProvider */
export const AIAssistant: React.FC = () => {
  return (
    <MessageProvider>
      <AIAssistantInner />
    </MessageProvider>
  );
};

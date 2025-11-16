/**
 * AIAssistant 组装层
 * - 职责：拼装 UI（VideoSprite、MessageBubble、指示器）与行为 hooks（初始化、拖动、穿透、行走、文件拖拽）。
 * - 约束：不在此文件内编写复杂业务逻辑/IPC 调用，逻辑统一下沉到 hooks/services。
 */
import React, { useEffect, useRef } from 'react';

import Dropzone from '../common/Dropzone';
import { ASSISTANT_HEIGHT, ASSISTANT_WIDTH, SHOW_PADDING_DEBUG } from './constants';
import useAssistant from './hooks';
import useClickThrough from './hooks/useClickThrough';
import useDragMove from './hooks/useDragMove';
import useFileDrop from './hooks/useFileDrop';
import useSpriteEventController from './hooks/useSpriteEventController';
import useWalkAnimation from './hooks/useWalkAnimation';
import { MessageBubble } from './messages/MessageBubble';
import Messages from './messages/zh-CN';
import PaddingDebugOverlay from './ui/PaddingDebugOverlay';
import StatusIndicator from './ui/StatusIndicator';
import VideoSprite from './VideoSprite';

export const AIAssistant: React.FC = () => {
  const { padding: paddingState, screenSize, messageState, setAssistantState } = useAssistant();

  const containerRef = useRef<HTMLDivElement>(null);
  const { setClickThrough } = useClickThrough(containerRef);
  const { animateMoveWindow, stopWalking, isWalking } = useWalkAnimation();
  useSpriteEventController();
  const {
    bind: dragBind,
    isDragging,
    isDragReady
  } = useDragMove(containerRef, {
    screenSize,
    padding: paddingState,
    onHoldStart: () => {
      setAssistantState('hold:start', 'hold');
    },
    onDragStateChange: (dragging) => {
      if (dragging) setClickThrough(false);
    }
  });
  const { isFileDragOver, handleDragEnter, handleDragLeave, handleDropFiles } = useFileDrop(stopWalking, setClickThrough);

  // 点击交互
  const handleClick = (): void => {
    stopWalking();
    setAssistantState('click', 'click');
  };

  // keep dev vector probe to preserve previous behavior
  useEffect(() => {
    // window.YUA.ffmpeg.playSprite()
    window.YUA.vector
      .insertVectors({
        items: [
          {
            id: 'doc-1',
            content: '你好，世界',
            metadata: { lang: 'zh' },
            embedding: new Array(384).fill(0).map((_, i) => Math.sin(i))
          }
        ],
        dim: 384
      })
      .then((_res: any) => {
        console.log('inserted', _res);
      });

    window.YUA.vector
      .searchVectors({
        embedding: new Array(384).fill(0),
        k: 5,
        dim: 384
      })
      .then((_res: any) => {
        console.log(_res);
      });
  }, []);

  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault();
    window.YUA.window['window:open']('menu');
  };

  // drive sprite states from drag/walk flags
  useEffect(() => {
    if (isDragging) {
      setAssistantState('drag:start');
    } else if (isWalking) {
      setAssistantState('walk:start');
    } else {
      setAssistantState('idle');
    }
  }, [isDragging, isWalking, setAssistantState]);

  // reflect file drag-over on sprite
  useEffect(() => {
    if (isFileDragOver) {
      setAssistantState('drag:start');
    } else if (!isDragging && !isWalking) {
      setAssistantState('idle');
    }
  }, [isFileDragOver, isDragging, isWalking, setAssistantState]);

  const onDropFiles = React.useCallback(
    async (files: any) => {
      setAssistantState('drop');
      await handleDropFiles(files);
    },
    [handleDropFiles, setAssistantState]
  );

  // --- 稳定订阅 window:command，避免依赖变化导致重复绑定 ---
  const screenSizeRef = useRef(screenSize);
  const paddingRef = useRef(paddingState);
  const animateMoveWindowRef = useRef(animateMoveWindow);
  const lastMenuActionAtRef = useRef<Record<string, number>>({});

  useEffect(() => {
    screenSizeRef.current = screenSize;
  }, [screenSize]);
  useEffect(() => {
    paddingRef.current = paddingState;
  }, [paddingState]);
  useEffect(() => {
    animateMoveWindowRef.current = animateMoveWindow;
  }, [animateMoveWindow]);

  useEffect(() => {
    const onMenuCommand = async (_: any, action: string): Promise<void> => {
      // 防抖/去重：忽略极短时间内的重复事件
      const now = performance.now();
      const last = lastMenuActionAtRef.current[action] || 0;
      if (now - last < 100) return;
      lastMenuActionAtRef.current[action] = now;

      if (action === 'walk-once') {
        const size = screenSizeRef.current;
        const padding = paddingRef.current;
        const minX = -padding;
        const maxX = size.width - ASSISTANT_WIDTH - padding;
        const minY = -padding;
        const maxY = size.height - ASSISTANT_HEIGHT - padding;
        const targetX = Math.random() * (maxX - minX) + minX;
        const targetY = Math.random() * (maxY - minY) + minY;
        setAssistantState('walk:start');
        await animateMoveWindowRef.current(targetX, targetY);
        setAssistantState('walk:end');
        setAssistantState('idle');
      }
    };

    window.ipcRenderer?.on('window:command', onMenuCommand);
    return () => {
      window.ipcRenderer?.off('window:command', onMenuCommand);
    };
  }, [setAssistantState]);

  return (
    <div
      ref={containerRef}
      className={`
        fixed w-[180px] h-[240px] select-none z-[9999] 
        transition-transform duration-300 ease-in-out
        top-[100px] left-[100px] pointer-events-auto
        ${isDragReady ? 'cursor-grabbing opacity-70' : 'cursor-grab'}
        ${isFileDragOver ? 'outline-2 outline-dashed outline-indigo-500/60 outline-offset-[6px] shadow-[0_0_0_6px_rgba(99,102,241,0.15)_inset,0_12px_35px_rgba(99,102,241,0.25)]' : ''}
      `}
      onMouseDown={dragBind.onMouseDown}
      onContextMenu={handleContextMenu}
      onClick={handleClick}
      onDoubleClick={async () => {
        window.YUA.window['window:open']('pluginManager');
        // const cfg = await window.YUA.model['model:getConfig']();
        // if (!cfg?.rootDir) {
        //   // 未配置模型目录，先打开模型管理窗口让用户设置
        //   window.YUA.window['window:open']('pluginManager');
        // } else {
        //   window.YUA.window['window:open']('assistant');
        // }
      }}
    >
      {SHOW_PADDING_DEBUG && <PaddingDebugOverlay padding={paddingState} />}
      <MessageBubble state={messageState} />
      <Dropzone
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDropFiles={onDropFiles}
        customDropzoneInside={
          <div className="flex items-center justify-center absolute top-2 left-1/2 -translate-x-1/2 p-1 rounded-md bg-primary text-primary-foreground text-xs whitespace-nowrap z-10">
            {Messages.t('drag')}
          </div>
        }
      >
        {window.YUA.isDev && (
          <div className="text-xs bg-background fixed top-[100px] right-[100px] bottom-[100px] left-[100px] rounded-md border border-solid border-ring flex items-center justify-center">dev</div>
        )}
        <VideoSprite />
      </Dropzone>

      <StatusIndicator isDragging={isDragging} isWalking={isWalking} />
    </div>
  );
};

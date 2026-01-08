/**
 * AIAssistant 组装层
 * - 职责：拼装 UI（VideoSprite、MessageBubble、指示器）与行为 hooks（初始化、拖动、穿透、行走、文件拖拽）。
 * - 约束：不在此文件内编写复杂业务逻辑/IPC 调用，逻辑统一下沉到 hooks/services。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';

import Dropzone from '../common/Dropzone';
import { createBehaviors } from './behaviors';
import { useSpritePlayer } from './context/SpritePlayerContext';
import useAssistant from './hooks';
import { useBehaviorScheduler } from './hooks/useBehaviorScheduler';
import useBusyState from './hooks/useBusyState';
import useClickThrough from './hooks/useClickThrough';
import useDragMove from './hooks/useDragMove';
import useFileDrop from './hooks/useFileDrop';
import useNoticeState from './hooks/useNoticeState';
import useSpriteEventController from './hooks/useSpriteEventController';
import useWalkAnimation from './hooks/useWalkAnimation';
import { MessageBubble } from './messages/MessageBubble';
import Messages from './messages/zh-CN';
import { Renderer } from './renderers';
import BusyProgressBar from './ui/BusyProgressBar';
import PaddingDebugOverlay from './ui/PaddingDebugOverlay';
import SpriteNotice from './ui/SpriteNotice';
import StatusIndicator from './ui/StatusIndicator';

export const AIAssistant: React.FC = () => {
  const { padding: paddingState, screenSize, messageState, setAssistantState } = useAssistant();
  const { current: currentSprite, play: playAnimation, stop: stopAnimation } = useSpritePlayer();
  const [isHovering, setIsHovering] = useState(false);
  const [autoWalkEnabled, setAutoWalkEnabled] = useState(true);

  // 从当前精灵动画定义中获取尺寸，如果没有则使用默认值
  const spriteWidth = currentSprite?.width ?? 180;
  const spriteHeight = currentSprite?.height ?? 240;

  const containerRef = useRef<HTMLDivElement>(null);
  const { setClickThrough } = useClickThrough(containerRef);
  const { animateMoveWindow, stopWalking, isWalking, walkDirection } = useWalkAnimation();
  useSpriteEventController();
  const { busyState } = useBusyState();
  const { notice, dismiss, handleButtonClick } = useNoticeState();
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
    },
    onDragEnd: () => {
      setAssistantState('drop');
    }
  });
  const { isFileDragOver, handleDragEnter, handleDragLeave, handleDropFiles } = useFileDrop(stopWalking, setClickThrough);

  // 点击交互
  const handleClick = (): void => {
    stopWalking();
    setAssistantState('click', 'click');
  };

  // 鼠标进入精灵区域
  const handleMouseEnter = (): void => {
    setIsHovering(true);
  };

  // 鼠标离开精灵区域
  const handleMouseLeave = (): void => {
    setIsHovering(false);
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
            embedding: new Array(768).fill(0).map((_, i) => Math.sin(i))
          }
        ],
        dim: 768
      })
      .then((res: any) => {
        console.log('inserted', res);
        if (res.inserted === 0) {
          console.error('插入失败：返回 inserted=0');
        }
      })
      .catch((err: any) => {
        console.error('插入向量时出错:', err);
      });

    // 搜索时需要使用与插入时相同的维度！
    window.YUA.vector
      .searchVectors({
        embedding: new Array(768).fill(0).map((_, i) => Math.sin(i)),
        k: 5,
        dim: 768 // 必须与插入时的维度一致
      })
      .then((res: any) => {
        console.log('search results', res);
        if (Array.isArray(res) && res.length === 0) {
          console.warn('搜索返回空数组，可能原因：1) 维度不匹配 2) 数据未成功插入 3) 查询向量与存储向量差异太大');
        }
      })
      .catch((err: any) => {
        console.error('搜索向量时出错:', err);
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
      playAnimation(); // Start three-phase animation when walking starts
    } else {
      setAssistantState('idle');
      stopAnimation(); // Stop animation and play outro when walking stops
    }
  }, [isDragging, isWalking, setAssistantState, playAnimation, stopAnimation]);

  // reflect file drag-over on sprite
  useEffect(() => {
    if (isFileDragOver) {
      setAssistantState('fileDragOver');
      playAnimation(); // Start three-phase animation when file drag over starts
    } else if (!isDragging && !isWalking) {
      setAssistantState('idle');
      stopAnimation(); // Stop animation and play outro when file drag over stops
    }
  }, [isFileDragOver, isDragging, isWalking, setAssistantState, playAnimation, stopAnimation]);

  const onDropFiles = React.useCallback(
    async (files: any) => {
      setAssistantState('fileDrop');
      await handleDropFiles(files);
    },
    [handleDropFiles, setAssistantState]
  );

  // --- 稳定订阅 window:command，避免依赖变化导致重复绑定 ---
  // --- 监听自动移动开关变化 ---
  useEffect(() => {
    const loadConfig = async (): Promise<void> => {
      try {
        const enabled = await window.YUA.window.getAutoWalkEnabled();
        setAutoWalkEnabled(enabled);
      } catch (error) {
        console.error('加载自动移动开关失败:', error);
      }
    };

    const onEnabledChanged = (_: any, enabled: boolean): void => {
      setAutoWalkEnabled(enabled);
    };

    loadConfig();
    window.ipcRenderer?.on('auto-walk-enabled-changed', onEnabledChanged);

    return () => {
      window.ipcRenderer?.off('auto-walk-enabled-changed', onEnabledChanged as any);
    };
  }, []);

  // --- 行为调度器 ---
  const behaviors = useMemo(
    () =>
      createBehaviors(
        {
          animateMoveWindow,
          setAssistantState
        },
        { autoWalkEnabled }
      ),
    [animateMoveWindow, setAssistantState, autoWalkEnabled]
  );

  useBehaviorScheduler(
    {
      isDragging,
      isWalking,
      isHovering,
      screenSize,
      padding: paddingState,
      spriteWidth,
      spriteHeight,
      getPosition: () => window.YUA.window['window:position:get']()
    },
    behaviors
  );

  return (
    <div
      ref={containerRef}
      style={{
        width: spriteWidth,
        height: spriteHeight,
        left: paddingState,
        top: paddingState
      }}
      className={`fixed select-none z-[9999] transition-transform duration-300 ease-in-out pointer-events-auto
        ${isDragReady ? 'cursor-grabbing opacity-80' : 'cursor-grab'}
      `}
      onMouseDown={dragBind.onMouseDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
      onClick={handleClick}
      onDoubleClick={async () => {
        window.YUA.window['window:open']('assistant');
        // const cfg = await window.YUA.model['model:getConfig']();
        // if (!cfg?.rootDir) {
        //   // 未配置模型目录，先打开模型管理窗口让用户设置
        //   window.YUA.window['window:open']('pluginManager');
        // } else {
        //   window.YUA.window['window:open']('assistant');
        // }
      }}
    >
      <PaddingDebugOverlay padding={paddingState} />
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
          <div
            style={{
              left: paddingState,
              top: paddingState,
              bottom: paddingState,
              right: paddingState
            }}
            className="text-xs bg-background fixed rounded-md border border-solid border-ring"
          >
            {paddingState} {spriteWidth} {spriteHeight}
          </div>
        )}
        <Renderer width={spriteWidth} height={spriteHeight} walkDirection={walkDirection} />
      </Dropzone>
      {notice && <SpriteNotice message={notice.message} level={notice.level} buttons={notice.buttons} onClose={dismiss} onButtonClick={handleButtonClick} />}

      {busyState.isBusy && <BusyProgressBar progress={busyState.progress} message={busyState.message} />}

      <StatusIndicator isDragging={isDragging} isWalking={isWalking} />
    </div>
  );
};

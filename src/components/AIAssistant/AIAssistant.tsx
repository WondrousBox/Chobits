/**
 * AIAssistant 组装层
 * - 职责：拼装 UI（VideoSprite、MessageBubble、指示器）与行为 hooks（初始化、拖动、穿透、行走、文件拖拽）。
 * - 约束：不在此文件内编写复杂业务逻辑/IPC 调用，逻辑统一下沉到 hooks/services。
 */
import React, { useEffect, useRef } from 'react';

import Dropzone from '../common/Dropzone';
import { SHOW_PADDING_DEBUG } from './constants';
import { useSpritePlayer } from './context/SpritePlayerContext';
import useAssistant from './hooks';
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
  const { current: currentSprite } = useSpritePlayer();

  // 从当前精灵动画定义中获取尺寸，如果没有则使用默认值
  const spriteWidth = currentSprite?.width ?? 180;
  const spriteHeight = currentSprite?.height ?? 240;

  const containerRef = useRef<HTMLDivElement>(null);
  const { setClickThrough } = useClickThrough(containerRef);
  const { animateMoveWindow, stopWalking, isWalking } = useWalkAnimation();
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
    }
  });
  const { isFileDragOver, handleDragEnter, handleDragLeave, handleDropFiles } = useFileDrop(stopWalking, setClickThrough);

  // 点击交互
  const handleClick = (): void => {
    stopWalking();
    setAssistantState('click', 'click');
  };

  // 鼠标进入精灵区域，暂停自动移动
  const handleMouseEnter = (): void => {
    isHoveringRef.current = true;
    // 停止当前的自动移动定时器
    if (autoWalkTimerRef.current) {
      clearTimeout(autoWalkTimerRef.current);
      autoWalkTimerRef.current = null;
    }
  };

  // 鼠标离开精灵区域，恢复自动移动（如果启用）
  const handleMouseLeave = (): void => {
    isHoveringRef.current = false;
    // 如果自由移动已启用，重新启动自动移动
    if (autoWalkEnabledRef.current && startAutoWalkRef.current) {
      startAutoWalkRef.current();
    }
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
    isDraggingRef.current = isDragging;
    isWalkingRef.current = isWalking;
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
  const spriteWidthRef = useRef(spriteWidth);
  const spriteHeightRef = useRef(spriteHeight);
  const animateMoveWindowRef = useRef(animateMoveWindow);
  const autoWalkTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoWalkEnabledRef = useRef(true); // 默认启用
  const isDraggingRef = useRef(isDragging);
  const isWalkingRef = useRef(isWalking);
  const isHoveringRef = useRef(false);
  const startAutoWalkRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    screenSizeRef.current = screenSize;
  }, [screenSize]);
  useEffect(() => {
    paddingRef.current = paddingState;
  }, [paddingState]);
  useEffect(() => {
    spriteWidthRef.current = spriteWidth;
  }, [spriteWidth]);
  useEffect(() => {
    spriteHeightRef.current = spriteHeight;
  }, [spriteHeight]);
  useEffect(() => {
    animateMoveWindowRef.current = animateMoveWindow;
  }, [animateMoveWindow]);

  // --- 监听自动移动开关变化，实现自由移动 ---
  useEffect(() => {
    const loadConfig = async (): Promise<void> => {
      try {
        const enabled = await window.YUA.window.getAutoWalkEnabled();
        autoWalkEnabledRef.current = enabled;
        if (enabled) {
          startAutoWalk();
        } else {
          stopAutoWalk();
        }
      } catch (error) {
        console.error('加载自动移动开关失败:', error);
      }
    };

    const startAutoWalk = (): void => {
      stopAutoWalk();
      // 每 5-10 秒随机移动一次
      const scheduleNextWalk = (): void => {
        const delay = Math.random() * 5000 + 5000; // 5-10秒
        autoWalkTimerRef.current = setTimeout(async () => {
          if (!autoWalkEnabledRef.current || isDraggingRef.current || isWalkingRef.current || isHoveringRef.current) {
            scheduleNextWalk();
            return;
          }
          const size = screenSizeRef.current;
          const padding = paddingRef.current;
          const width = spriteWidthRef.current;
          const height = spriteHeightRef.current;
          const minX = -padding;
          const maxX = size.width - width - padding;
          const minY = -padding;
          const maxY = size.height - height - padding;
          const targetX = Math.random() * (maxX - minX) + minX;
          const targetY = Math.random() * (maxY - minY) + minY;
          setAssistantState('walk:start');
          await animateMoveWindowRef.current(targetX, targetY);
          setAssistantState('walk:end');
          setAssistantState('idle');
          scheduleNextWalk();
        }, delay);
      };
      scheduleNextWalk();
    };
    startAutoWalkRef.current = startAutoWalk;

    const stopAutoWalk = (): void => {
      if (autoWalkTimerRef.current) {
        clearTimeout(autoWalkTimerRef.current);
        autoWalkTimerRef.current = null;
      }
    };

    const onEnabledChanged = (_: any, enabled: boolean): void => {
      autoWalkEnabledRef.current = enabled;
      if (enabled) {
        startAutoWalk();
      } else {
        stopAutoWalk();
      }
    };

    loadConfig();
    window.ipcRenderer?.on('auto-walk-enabled-changed', onEnabledChanged);

    return () => {
      stopAutoWalk();
      window.ipcRenderer?.off('auto-walk-enabled-changed', onEnabledChanged as any);
    };
  }, [setAssistantState]);

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
        ${isFileDragOver ? 'outline-2 outline-dashed outline-indigo-500/60 outline-offset-[6px] shadow-[0_0_0_6px_rgba(99,102,241,0.15)_inset,0_12px_35px_rgba(99,102,241,0.25)]' : ''}
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
        <Renderer width={spriteWidth} height={spriteHeight} />
      </Dropzone>
      {notice && <SpriteNotice message={notice.message} level={notice.level} buttons={notice.buttons} onClose={dismiss} onButtonClick={handleButtonClick} />}

      {busyState.isBusy && <BusyProgressBar progress={busyState.progress} message={busyState.message} />}

      <StatusIndicator isDragging={isDragging} isWalking={isWalking} />
    </div>
  );
};

/**
 * AIAssistant 组装层
 * - 职责：拼装 UI（VideoSprite、统一消息组件、指示器）与行为 hooks（初始化、拖动、穿透、行走、文件拖拽）。
 * - 约束：不在此文件内编写复杂业务逻辑/IPC 调用，逻辑统一下沉到 hooks/services。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';

import Dropzone from '../common/Dropzone';
import { useSpritePersona } from './context/SpritePersonaContext';
import { useSpritePlayer } from './context/SpritePlayerContext';
import useAssistant from './hooks';
import useClickThrough from './hooks/useClickThrough';
import useDragMove from './hooks/useDragMove';
import useFileDrop from './hooks/useFileDrop';
import useSpriteStateBridge from './hooks/useSpriteStateBridge';
import useWalkAnimation from './hooks/useWalkAnimation';
import { MessageProvider, SpriteMessage, useMessageSync } from './message';
import { Renderer } from './renderers';
import PaddingDebugOverlay from './ui/PaddingDebugOverlay';
import StatusIndicator from './ui/StatusIndicator';

const showBlock = false; // 开发时显示

/** 内部组件：包含实际逻辑 */
const AIAssistantInner: React.FC = () => {
  const { padding: paddingState, screenSize, messageState, setMessageState } = useAssistant();
  const { current: currentSprite, play: playAnimation, stop: stopAnimation } = useSpritePlayer();
  const { stateMachine, eventBus, behaviorEngine } = useSpritePersona();
  const [isHovering, setIsHovering] = useState(false);
  const [autoWalkEnabled, setAutoWalkEnabled] = useState(true);

  // 同步 messageState 到统一消息系统
  useMessageSync(messageState);

  // 从当前精灵动画定义中获取尺寸，如果没有则使用默认值
  const spriteWidth = currentSprite?.width ?? 180;
  const spriteHeight = currentSprite?.height ?? 240;

  const containerRef = useRef<HTMLDivElement>(null);
  const { setClickThrough } = useClickThrough(containerRef);
  const { animateMoveWindow, stopWalking, isWalking, walkDirection } = useWalkAnimation();

  // 桥接 StateMachine → Conductor 动画切换
  useSpriteStateBridge();

  const {
    bind: dragBind,
    isDragging,
    isDragReady
  } = useDragMove(containerRef, {
    screenSize,
    padding: paddingState,
    onHoldStart: () => {
      stateMachine.playOnce('hold');
      setMessageState('hold');
    },
    onDragStateChange: (dragging) => {
      if (dragging) setClickThrough(false);
    },
    onDragEnd: () => {
      stateMachine.playOnce('drop');
    }
  });
  const { isFileDragOver, handleDragEnter, handleDragLeave, handleDropFiles } = useFileDrop(stopWalking, setClickThrough);

  // 点击交互
  const handleClick = (): void => {
    stopWalking();
    stateMachine.playOnce('click');
    setMessageState('click');
    eventBus.emit('interact:click', {}, 'ai-assistant');
  };

  // 鼠标进入精灵区域
  const handleMouseEnter = (): void => {
    setIsHovering(true);
    eventBus.emit('interact:hover:enter', {}, 'ai-assistant');
    if (isWalking) {
      stopWalking();
      stopAnimation();
    }
  };

  // 鼠标离开精灵区域
  const handleMouseLeave = (): void => {
    setIsHovering(false);
    eventBus.emit('interact:hover:leave', {}, 'ai-assistant');
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

  // 判断当前动画是否是三段式动画（有 outro 部分需要播放）
  const hasOutro = currentSprite?.loopStartMs != null && currentSprite?.loopEndMs != null;

  // drive sprite states from drag/walk flags
  useEffect(() => {
    if (isDragging) {
      stateMachine.transitionTo('dragging');
    } else if (isWalking) {
      stateMachine.transitionTo('walking');
      playAnimation(); // Start three-phase animation when walking starts
    } else {
      // 停止动画，让 VideoSprite 播放 outro 部分
      stopAnimation();
      // 如果不是三段式动画，直接切换到 idle
      // 如果是三段式动画，VideoSprite 会在 outro 播放完成后自动触发 idle 事件
      if (!hasOutro) {
        stateMachine.transitionTo('idle');
      }
    }
  }, [isDragging, isWalking, stateMachine, playAnimation, stopAnimation, hasOutro]);

  // reflect file drag-over on sprite
  useEffect(() => {
    if (isFileDragOver) {
      stateMachine.transitionTo('reacting', { subState: 'file-drag-over' });
      playAnimation(); // Start three-phase animation when file drag over starts
    } else if (!isDragging && !isWalking) {
      // 停止动画，让 VideoSprite 播放 outro 部分
      stopAnimation();
      // 如果不是三段式动画，直接切换到 idle
      // 如果是三段式动画，VideoSprite 会在 outro 播放完成后自动触发 idle 事件
      if (!hasOutro) {
        stateMachine.transitionTo('idle');
      }
    }
  }, [isFileDragOver, isDragging, isWalking, stateMachine, playAnimation, stopAnimation, hasOutro]);

  const onDropFiles = React.useCallback(
    async (files: any) => {
      stateMachine.playOnce('file-drop');
      setMessageState('fileDrop');
      await handleDropFiles(files);
    },
    [handleDropFiles, stateMachine, setMessageState]
  );

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

  // --- 同步自动行走开关到行为引擎 ---
  useEffect(() => {
    behaviorEngine.setEnabled('auto-walk', autoWalkEnabled);
  }, [autoWalkEnabled, behaviorEngine]);

  // --- 行为引擎事件监听 ---
  // BehaviorEngine 通过 EventBus 发出行为触发事件，此处监听并执行实际操作
  const animateMoveRef = useRef(animateMoveWindow);
  animateMoveRef.current = animateMoveWindow;

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    // 自动行走行为：计算随机目标并移动窗口
    unsubs.push(
      eventBus.on('behavior:walk-triggered' as any, async () => {
        try {
          const [currentX, currentY] = await window.YUA.window['window:position:get']();
          const size = screenSize;
          const pad = paddingState;
          const sw = spriteWidth;
          const sh = spriteHeight;

          const minX = -pad;
          const maxX = size.width - sw - pad;
          const minY = -pad;
          const maxY = size.height - sh - pad;

          // X: Random
          const targetX = Math.random() * (maxX - minX) + minX;
          // Y: Near current Y (10% of screen height)
          const yRange = size.height * 0.1;
          const yMin = Math.max(minY, currentY - yRange);
          const yMax = Math.min(maxY, currentY + yRange);
          const targetY = Math.random() * (yMax - yMin) + yMin;

          await animateMoveRef.current(targetX, targetY);
        } catch (err) {
          console.error('[AIAssistant] Auto walk failed:', err);
        }
      })
    );

    // 困倦行为
    unsubs.push(
      eventBus.on('behavior:night-sleepy-triggered' as any, () => {
        stateMachine.playOnce('sleepy');
      })
    );

    // 无聊行为
    unsubs.push(
      eventBus.on('behavior:long-idle-bored-triggered' as any, () => {
        stateMachine.transitionTo('bored');
      })
    );

    // 随机消息行为
    unsubs.push(
      eventBus.on('behavior:random-message-triggered' as any, () => {
        setMessageState('reminder');
      })
    );

    return () => unsubs.forEach((u) => u());
  }, [eventBus, stateMachine, screenSize, paddingState, spriteWidth, spriteHeight, setMessageState]);

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
        ${showBlock ? 'opacity-10' : ''}
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
      {/* 统一消息组件 */}
      <SpriteMessage />
      <Dropzone
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDropFiles={onDropFiles}
        customDropzoneInside={
          <div className="flex items-center justify-center absolute top-2 left-1/2 -translate-x-1/2 p-1 rounded-md bg-primary text-primary-foreground text-xs whitespace-nowrap z-10">
            把文件交给我吧
          </div>
        }
      >
        {window.YUA.isDev && showBlock && (
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
      <StatusIndicator isDragging={isDragging} isWalking={isWalking} />
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

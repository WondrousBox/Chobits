/**
 * SpriteStateContext — 被动 IPC 状态接收器
 *
 * 不再在渲染进程实例化任何 sprite-core 引擎
 *
 * 职责：
 * 1. 挂载时调用 sprite:get-initial-state 获取初始状态
 * 2. 订阅 sprite:state / sprite:play / sprite:walk / sprite:config 更新 React state
 * 3. 通过 Context 向下传递只读状态
 */

import React, { useEffect, useState } from 'react';

import { SpriteStateContext, type SpriteStateContextValue } from './sprite-state-context';
import { createDefaultSpriteStateContextValue, SpriteStateRuntimeController } from './sprite-state-runtime';

// ============================================================================
// Provider
// ============================================================================

export const SpriteStateProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [value, setValue] = useState<SpriteStateContextValue>(() => createDefaultSpriteStateContextValue());

  useEffect(() => {
    const controller = new SpriteStateRuntimeController(window.chobits.sprite, setValue, (error) => {
      console.error('[SpriteStateContext] Init failed:', error);
    });

    controller.start();
    return () => {
      controller.dispose();
    };
  }, []);

  return <SpriteStateContext.Provider value={value}>{children}</SpriteStateContext.Provider>;
};

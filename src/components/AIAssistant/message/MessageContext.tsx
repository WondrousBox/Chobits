/**
 * MessageContext - 消息系统 Context Provider
 *
 * 职责：
 * - 提供全局消息状态和操作方法
 * - 监听 IPC 事件，处理主进程发送的消息
 * - 兼容旧版 IPC 频道
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo } from 'react';

import type { MessageButton, MessageContextValue, MessageLevel } from './types';
import { MESSAGE_IPC_CHANNELS } from './types';
import { useMessageQueue } from './useMessageQueue';

// ============================================================================
// Context
// ============================================================================

const MessageContext = createContext<MessageContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface MessageProviderProps {
  children: React.ReactNode;
}

export function MessageProvider({ children }: MessageProviderProps): JSX.Element {
  const { current, showToast, showNotice, showBusy, updateBusy, clearBusy, dismiss, clearAll, currentNotice } = useMessageQueue();

  /** 处理按钮点击 */
  const handleButtonClick = useCallback(
    async (button: MessageButton) => {
      // 处理预定义动作
      if (button.action === 'dismiss') {
        dismiss();
        return;
      }

      // 发送按钮点击事件到后端
      if (currentNotice?.routineId) {
        try {
          await window.ipcRenderer?.invoke('dailyCare:handleButtonClick', currentNotice.routineId, button.id, button.action);
        } catch (error) {
          console.warn('[MessageContext] handleButtonClick failed', error);
        }
      }

      // 如果按钮点击后应该关闭消息（默认行为）
      if (button.action !== 'keep-open') {
        dismiss();
      }
    },
    [currentNotice, dismiss]
  );

  // ============================================================================
  // IPC 事件监听
  // ============================================================================

  useEffect(() => {
    // 统一消息频道处理
    const handleMessage = (
      _event: unknown,
      payload?: {
        type?: 'toast' | 'notice' | 'busy';
        id?: string;
        content?: string;
        level?: MessageLevel;
        progress?: number;
        buttons?: MessageButton[];
        duration?: number;
        persistent?: boolean;
        routineId?: string;
        category?: string;
        ctx?: any;
      }
    ): void => {
      if (!payload) return;

      switch (payload.type) {
        case 'toast':
          showToast({
            id: payload.id,
            content: payload.content,
            level: payload.level,
            category: payload.category as any,
            ctx: payload.ctx,
            duration: payload.duration
          });
          break;
        case 'notice':
          if (payload.content) {
            showNotice({
              id: payload.id,
              content: payload.content,
              level: payload.level,
              buttons: payload.buttons,
              duration: payload.duration,
              persistent: payload.persistent,
              routineId: payload.routineId
            });
          }
          break;
        case 'busy':
          showBusy({
            id: payload.id,
            content: payload.content,
            progress: payload.progress
          });
          break;
      }
    };

    // 清除消息
    const handleClear = (_event: unknown, payload?: { id?: string; type?: 'toast' | 'notice' | 'busy' | 'all' }): void => {
      if (!payload) {
        clearAll();
        return;
      }

      if (payload.id) {
        dismiss(payload.id);
      } else if (payload.type === 'busy') {
        clearBusy();
      } else if (payload.type === 'all') {
        clearAll();
      }
    };

    // ========== 兼容旧版 IPC 频道 ==========

    // 旧版通知处理
    const handleLegacyNotice = (
      _event: unknown,
      payload?: {
        message?: string;
        level?: MessageLevel;
        durationMs?: number;
        persistent?: boolean;
        routineId?: string;
        buttons?: MessageButton[];
      }
    ): void => {
      if (!payload?.message) return;
      showNotice({
        content: payload.message,
        level: payload.level,
        buttons: payload.buttons,
        duration: payload.durationMs,
        persistent: payload.persistent,
        routineId: payload.routineId
      });
    };

    // 旧版忙碌开始
    const handleLegacyBusyStart = (_event: unknown, payload?: { progress?: number; message?: string }): void => {
      showBusy({
        progress: payload?.progress,
        content: payload?.message
      });
    };

    // 旧版忙碌结束
    const handleLegacyBusyEnd = (): void => {
      clearBusy();
    };

    // 旧版忙碌进度
    const handleLegacyBusyProgress = (_event: unknown, payload?: { progress: number; message?: string }): void => {
      if (payload?.progress !== undefined) {
        updateBusy(payload.progress, payload.message);
      }
    };

    // 注册监听器
    window.ipcRenderer?.on(MESSAGE_IPC_CHANNELS.MESSAGE, handleMessage);
    window.ipcRenderer?.on(MESSAGE_IPC_CHANNELS.MESSAGE_CLEAR, handleClear);
    window.ipcRenderer?.on(MESSAGE_IPC_CHANNELS.LEGACY_NOTICE, handleLegacyNotice);
    window.ipcRenderer?.on(MESSAGE_IPC_CHANNELS.LEGACY_BUSY_START, handleLegacyBusyStart);
    window.ipcRenderer?.on(MESSAGE_IPC_CHANNELS.LEGACY_BUSY_END, handleLegacyBusyEnd);
    window.ipcRenderer?.on(MESSAGE_IPC_CHANNELS.LEGACY_BUSY_PROGRESS, handleLegacyBusyProgress);

    return () => {
      window.ipcRenderer?.off(MESSAGE_IPC_CHANNELS.MESSAGE, handleMessage);
      window.ipcRenderer?.off(MESSAGE_IPC_CHANNELS.MESSAGE_CLEAR, handleClear);
      window.ipcRenderer?.off(MESSAGE_IPC_CHANNELS.LEGACY_NOTICE, handleLegacyNotice);
      window.ipcRenderer?.off(MESSAGE_IPC_CHANNELS.LEGACY_BUSY_START, handleLegacyBusyStart);
      window.ipcRenderer?.off(MESSAGE_IPC_CHANNELS.LEGACY_BUSY_END, handleLegacyBusyEnd);
      window.ipcRenderer?.off(MESSAGE_IPC_CHANNELS.LEGACY_BUSY_PROGRESS, handleLegacyBusyProgress);
    };
  }, [showToast, showNotice, showBusy, updateBusy, clearBusy, dismiss, clearAll]);

  // ============================================================================
  // Context Value
  // ============================================================================

  const value = useMemo<MessageContextValue>(
    () => ({
      current,
      showToast,
      showNotice,
      showBusy,
      updateBusy,
      clearBusy,
      dismiss,
      clearAll,
      handleButtonClick
    }),
    [current, showToast, showNotice, showBusy, updateBusy, clearBusy, dismiss, clearAll, handleButtonClick]
  );

  return <MessageContext.Provider value={value}>{children}</MessageContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * 使用消息系统
 * @throws 如果在 MessageProvider 外部使用会抛出错误
 */
export function useMessage(): MessageContextValue {
  const context = useContext(MessageContext);
  if (!context) {
    throw new Error('useMessage must be used within a MessageProvider');
  }
  return context;
}

/**
 * 安全使用消息系统（不抛出错误）
 */
export function useMessageSafe(): MessageContextValue | null {
  return useContext(MessageContext);
}

export default MessageProvider;

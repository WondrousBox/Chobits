import React, { createContext, useCallback, useContext, useEffect, useMemo } from 'react';

import type { MessageBridgePayload, MessageButton, MessageContextValue, MessageLevel } from './types';
import { useMessageQueue } from './useMessageQueue';

const MessageContext = createContext<MessageContextValue | null>(null);

interface MessageProviderProps {
  children: React.ReactNode;
}

export function MessageProvider({ children }: MessageProviderProps): JSX.Element {
  const { current, showToast, showNotice, showBusy, updateBusy, clearBusy, dismiss, clearAll, currentNotice } = useMessageQueue();

  const handleButtonClick = useCallback(
    async (button: MessageButton) => {
      if (button.action === 'dismiss') {
        dismiss();
        return;
      }

      if (currentNotice?.routineId) {
        try {
          await window.ipcRenderer?.invoke('dailyCare:handleButtonClick', currentNotice.routineId, button.id, button.action);
        } catch (error) {
          console.warn('[MessageContext] handleButtonClick failed', error);
        }
      }

      if (button.action !== 'keep-open') {
        dismiss();
      }
    },
    [currentNotice, dismiss]
  );

  useEffect(() => {
    if (!window.YUA?.messages?.on) return;

    const handleMessage = (payload?: {
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
    }): void => {
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
          return;
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
          return;
        case 'busy':
          showBusy({
            id: payload.id,
            content: payload.content,
            progress: payload.progress
          });
          return;
      }
    };

    const handleClear = (payload?: { id?: string; type?: 'toast' | 'notice' | 'busy' | 'all' }): void => {
      if (!payload) {
        clearAll();
        return;
      }

      if (payload.id) {
        dismiss(payload.id);
        return;
      }

      if (payload.type === 'busy') {
        clearBusy();
        return;
      }

      if (payload.type === 'all') {
        clearAll();
      }
    };

    return window.YUA.messages.on((event: MessageBridgePayload) => {
      if (event.kind === 'show') {
        handleMessage(event.payload);
        return;
      }

      handleClear(event.payload);
    });
  }, [showToast, showNotice, showBusy, clearBusy, dismiss, clearAll]);

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

export function useMessage(): MessageContextValue {
  const context = useContext(MessageContext);
  if (!context) {
    throw new Error('useMessage must be used within a MessageProvider');
  }
  return context;
}

export function useMessageSafe(): MessageContextValue | null {
  return useContext(MessageContext);
}

export default MessageProvider;

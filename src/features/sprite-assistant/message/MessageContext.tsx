import React, { createContext, useCallback, useContext, useEffect, useMemo } from 'react';

import type { MessageBridgePayload, MessageButton, MessageContextValue, MessageLevel, NoticeMessage } from './types';
import { useMessageQueue } from './useMessageQueue';

const MessageContext = createContext<MessageContextValue | null>(null);

interface MessageProviderProps {
  children: React.ReactNode;
}

export function MessageProvider({ children }: MessageProviderProps): JSX.Element {
  const { current, showToast, showNotice, showBusy, updateBusy, clearBusy, clearByType, dismiss, clearAll, currentNotice } = useMessageQueue();

  const emitNoticeDismissed = useCallback(async (notice: NoticeMessage | null | undefined, reason: 'button' | 'close' | 'clear' | 'auto' = 'close') => {
    if (!notice?.id) return;
    try {
      await window.YUA.sprite?.emitPurposeEvent?.({
        source: 'purpose-event',
        event: 'bubble:dismissed',
        payload: {
          messageId: notice.id,
          routineId: notice.routineId,
          reason
        }
      });
    } catch (error) {
      console.warn('[MessageContext] emit purpose bubble:dismissed failed', error);
    }
  }, []);

  const dismissMessage = useCallback(
    (id?: string, reason: 'button' | 'close' | 'clear' | 'auto' = 'close') => {
      const targetId = id ?? current?.id;
      const notice = current?.type === 'notice' && (!targetId || current.id === targetId) ? (current as NoticeMessage) : currentNotice?.id === targetId ? currentNotice : null;
      void emitNoticeDismissed(notice, reason);
      dismiss(id);
    },
    [current, currentNotice, dismiss, emitNoticeDismissed]
  );

  const handleButtonClick = useCallback(
    async (button: MessageButton) => {
      if (button.action === 'dismiss') {
        dismissMessage(undefined, 'button');
        return;
      }

      // Purpose routine 按钮：约定 action 形如 'purpose:<actionKey>'
      // 派发 purpose-event 'bubble:action'，供 routine 的 waitForEvent / loopUntil 解锁
      if (typeof button.action === 'string' && button.action.startsWith('purpose:')) {
        const purposeAction = button.action.slice('purpose:'.length);
        let shouldDismiss = button.action !== 'keep-open';
        try {
          await window.YUA.sprite?.emitPurposeEvent?.({
            source: 'purpose-event',
            event: 'bubble:action',
            payload: {
              messageId: current?.id,
              actionId: button.id,
              purposeAction,
              routineId: current?.type === 'notice' ? currentNotice?.routineId : undefined
            }
          });
          if (purposeAction === 'open-wizard') {
            const opened = await window.YUA.window?.['window:open']?.('workspaceWizard');
            shouldDismiss = opened !== false;
          }
        } catch (error) {
          console.warn('[MessageContext] emit purpose bubble:action failed', error);
        }
        if (shouldDismiss && !currentNotice?.persistent) {
          dismissMessage(undefined, 'button');
        }
        return;
      }

      if (currentNotice?.routineId) {
        try {
          await window.YUA.dailyCare?.['dailyCare:handleButtonClick']?.(currentNotice.routineId, button.id, button.action);
        } catch (error) {
          console.warn('[MessageContext] handleButtonClick failed', error);
        }
      }

      if (button.action !== 'keep-open') {
        dismissMessage(undefined, 'button');
      }
    },
    [current, currentNotice, dismissMessage]
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
      image?: {
        alt?: string;
        title?: string;
        url: string;
      };
      persistent?: boolean;
      routineId?: string;
      category?: string;
      nextAction?: MessageButton;
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
            duration: payload.duration,
            image: payload.image,
            nextAction: payload.nextAction
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
        dismissMessage(payload.id, 'clear');
        return;
      }

      if (payload.type === 'busy') {
        clearBusy();
        return;
      }

      if (payload.type === 'toast' || payload.type === 'notice') {
        clearByType(payload.type);
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
  }, [showToast, showNotice, showBusy, clearBusy, clearByType, dismissMessage, clearAll]);

  const value = useMemo<MessageContextValue>(
    () => ({
      current,
      showToast,
      showNotice,
      showBusy,
      updateBusy,
      clearBusy,
      dismiss: dismissMessage,
      clearAll,
      handleButtonClick
    }),
    [current, showToast, showNotice, showBusy, updateBusy, clearBusy, dismissMessage, clearAll, handleButtonClick]
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

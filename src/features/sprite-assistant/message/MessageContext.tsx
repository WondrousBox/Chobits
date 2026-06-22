import React, { useCallback, useEffect, useMemo } from 'react';

import { MessageContext } from './message-context-value';
import type { MessageBridgePayload, MessageButton, MessageContextValue, MessageLevel, NoticeMessage } from './types';
import { useMessageQueue } from './useMessageQueue';

type MessageSurface = 'app' | 'sprite-bubble';

interface MessageProviderProps {
  children: React.ReactNode;
  surface?: MessageSurface;
}

function shouldHandleBridgeEvent(surface: MessageSurface, event: MessageBridgePayload): boolean {
  if (surface === 'sprite-bubble') {
    return event.target === undefined || event.target === 'all' || event.target === 'sprite';
  }
  return event.target !== 'sprite';
}

async function releaseFileDropPurposeBeforeOpenResourceLibrary(): Promise<void> {
  const snapshot = await window.YUA.sprite?.getPurposeSnapshot?.().catch((error) => {
    console.warn('[MessageContext] get purpose snapshot before open-resource-library failed', error);
    return null;
  });
  const currentPurpose = snapshot?.current;
  if (currentPurpose?.kind !== 'file.drop') {
    return;
  }

  console.info('[MessageContext] releasing file.drop before open resource library quest', {
    purposeId: currentPurpose.id,
    kind: currentPurpose.kind,
    priority: currentPurpose.priority
  });

  await window.YUA.window?.['window:close']?.('fileActionsMenu' as any).catch((error) => {
    console.warn('[MessageContext] close fileActionsMenu before open-resource-library failed', error);
  });
  await window.YUA.sprite?.cancelPurpose?.(currentPurpose.id, 'open-resource-library-recommendation').catch((error) => {
    console.warn('[MessageContext] cancel file.drop before open-resource-library failed', error);
  });
}

export function MessageProvider({ children, surface = 'app' }: MessageProviderProps): JSX.Element {
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

      if (typeof button.action === 'string' && button.action.startsWith('quest:start:')) {
        const questId = button.action.slice('quest:start:'.length).trim();
        if (!questId) return;
        try {
          if (questId === 'first-file-drop' || questId === 'open-resource-library') {
            console.info('[MessageContext] quest recommendation button clicked', {
              questId,
              buttonId: button.id,
              label: button.label
            });
          }
          if (questId === 'open-resource-library') {
            await releaseFileDropPurposeBeforeOpenResourceLibrary();
          }
          const result = await window.YUA.quest?.['quest:start']?.({ id: questId, source: 'recommendation' });
          if (questId === 'first-file-drop' || questId === 'open-resource-library') {
            console.info('[MessageContext] quest recommendation start result', {
              questId,
              ok: result?.ok,
              error: result?.error,
              startResult: result?.startResult
                ? {
                    accepted: result.startResult.accepted,
                    status: result.startResult.status,
                    reason: result.startResult.reason,
                    purpose: result.startResult.purpose
                      ? {
                          id: result.startResult.purpose.id,
                          kind: result.startResult.purpose.kind,
                          status: result.startResult.purpose.status,
                          priority: result.startResult.purpose.priority
                        }
                      : undefined
                  }
                : null
            });
          }
          if (!result?.ok) {
            throw new Error(result?.error || '启动任务失败');
          }
          showToast({
            content: result.startResult ? '任务引导已启动' : '任务已完成',
            level: 'success',
            duration: 2500
          });
          dismissMessage(undefined, 'button');
        } catch (error) {
          showToast({
            content: error instanceof Error ? error.message : String(error),
            level: 'error',
            duration: 4000
          });
        }
        return;
      }

      // Purpose routine 按钮：约定 action 形如 'purpose:<actionKey>'
      // 派发 purpose-event 'bubble:action'，供 routine 的 waitForEvent / loopUntil 解锁
      if (typeof button.action === 'string' && button.action.startsWith('purpose:')) {
        const purposeAction = button.action.slice('purpose:'.length);
        const shouldDismiss = button.action !== 'keep-open';
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
    [current, currentNotice, dismissMessage, showToast]
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
            image: payload.image
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
      const shouldHandle = shouldHandleBridgeEvent(surface, event);
      if (!shouldHandle) return;

      if (event.kind === 'show') {
        handleMessage(event.payload);
        return;
      }

      handleClear(event.payload);
    });
  }, [surface, showToast, showNotice, showBusy, clearBusy, clearByType, dismissMessage, clearAll]);

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

export default MessageProvider;

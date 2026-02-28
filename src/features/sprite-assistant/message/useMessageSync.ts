/**
 * useMessageSync - 同步 messageState 到消息系统
 *
 * 用于兼容原有的 messageState（MessageCategory）驱动方式，
 * 将其转换为新消息系统的 Toast 消息。
 */

import { useEffect, useRef } from 'react';

import type { MessageCategory } from '../types';
import { useMessageSafe } from './MessageContext';

/**
 * 同步 messageState 到消息系统
 * @param messageState 当前的消息状态
 */
export function useMessageSync(messageState: MessageCategory): void {
  const messageContext = useMessageSafe();
  const prevStateRef = useRef<MessageCategory | null>(null);

  useEffect(() => {
    // 如果没有消息上下文，跳过
    if (!messageContext) return;

    // 如果状态没有变化，跳过
    if (prevStateRef.current === messageState) return;

    // 更新引用
    prevStateRef.current = messageState;

    // 某些状态不需要显示消息
    const silentStates: MessageCategory[] = ['idle', 'loading', 'processing', 'waiting'];
    if (silentStates.includes(messageState)) return;

    // 显示 Toast
    messageContext.showToast({
      category: messageState,
      duration: 5000
    });
  }, [messageState, messageContext]);
}

export default useMessageSync;

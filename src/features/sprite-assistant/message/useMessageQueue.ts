/**
 * useMessageQueue - 消息队列管理 Hook
 *
 * 职责：
 * - 管理消息队列状态
 * - 处理消息优先级排序
 * - 处理消息自动过期
 * - 提供消息操作方法
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { BusyInput, BusyMessage, MessageQueueState, NoticeInput, NoticeMessage, SpriteMessage, ToastInput, ToastMessage } from './types';
import { DEFAULT_DURATION, MESSAGE_PRIORITY } from './types';

/** 生成唯一 ID */
const generateId = (): string => `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

/** 根据优先级排序消息 */
const sortByPriority = (messages: SpriteMessage[]): SpriteMessage[] => {
  return [...messages].sort((a, b) => {
    const priorityDiff = MESSAGE_PRIORITY[b.type] - MESSAGE_PRIORITY[a.type];
    if (priorityDiff !== 0) return priorityDiff;
    // 同优先级按创建时间排序（新的在前）
    return b.createdAt - a.createdAt;
  });
};

/**
 * 生成消息的去重键
 * - Notice: 使用 routineId（如果有）或 content 作为去重键
 * - Busy: 使用 content 作为去重键
 * - Toast: 普通预设消息使用 category 去重；角色说话气泡按内容去重
 */
const getDedupeKey = (message: SpriteMessage): string => {
  const { type } = message;

  if (type === 'notice') {
    const notice = message as NoticeMessage;
    // 优先使用 routineId（表示同一类提醒），否则用 content
    return `notice:${notice.routineId || notice.content}`;
  }

  if (type === 'busy') {
    const busy = message as BusyMessage;
    return `busy:${busy.content || 'default'}`;
  }

  if (type === 'toast') {
    const toast = message as ToastMessage;
    if (toast.category === 'message') {
      return `toast:message:${toast.content || toast.id}`;
    }
    // 使用 category（预设文案类型）或 content 作为去重键
    return `toast:${toast.category || toast.content || 'default'}`;
  }

  return `unknown:${(message as any).id}`;
};

export interface UseMessageQueueReturn {
  /** 当前显示的消息 */
  current: SpriteMessage | null;
  /** 显示 Toast 消息 */
  showToast: (input: ToastInput) => string;
  /** 显示 Notice 消息 */
  showNotice: (input: NoticeInput) => string;
  /** 显示 Busy 消息 */
  showBusy: (input: BusyInput) => string;
  /** 更新 Busy 进度 */
  updateBusy: (progress: number, content?: string) => void;
  /** 清除 Busy 状态 */
  clearBusy: () => void;
  /** 清除指定类型消息 */
  clearByType: (type: SpriteMessage['type']) => void;
  /** 关闭指定消息（不传 id 则关闭当前消息） */
  dismiss: (id?: string) => void;
  /** 清除所有消息 */
  clearAll: () => void;
  /** 当前 Notice 消息（用于按钮回调） */
  currentNotice: NoticeMessage | null;
}

export function useMessageQueue(): UseMessageQueueReturn {
  const [state, setState] = useState<MessageQueueState>({
    current: null,
    queue: []
  });

  // 定时器引用（用于自动过期）
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 清除定时器 */
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** 添加消息到队列 */
  const addMessage = useCallback((message: SpriteMessage) => {
    setState((prev) => {
      const newDedupeKey = getDedupeKey(message);

      // 检查是否已存在相同的消息（去重）
      const hasDuplicate = prev.queue.some((m) => {
        // 相同 ID 视为同一消息（会被替换）
        if (m.id === message.id) return false;
        // 检查去重键是否相同
        return getDedupeKey(m) === newDedupeKey;
      });

      // 如果已存在相同内容的消息，不添加新消息
      if (hasDuplicate) {
        return prev;
      }

      // 过滤掉需要被替换的消息
      const filteredQueue = prev.queue.filter((m) => {
        // busy 消息只保留一个（新的替换旧的）
        if (message.type === 'busy' && m.type === 'busy') return false;
        // 相同 ID 的消息替换
        if (m.id === message.id) return false;
        return true;
      });

      const newQueue = sortByPriority([...filteredQueue, message]);
      const newCurrent = newQueue[0] || null;

      return {
        current: newCurrent,
        queue: newQueue
      };
    });
  }, []);

  /** 移除消息 */
  const removeMessage = useCallback((id: string) => {
    setState((prev) => {
      const newQueue = prev.queue.filter((m) => m.id !== id);
      const newCurrent = newQueue[0] || null;

      return {
        current: newCurrent,
        queue: newQueue
      };
    });
  }, []);

  /** 显示 Toast */
  const showToast = useCallback(
    (input: ToastInput): string => {
      const id = input.id || generateId();
      const message: ToastMessage = {
        id,
        type: 'toast',
        level: input.level || 'info',
        content: input.content,
        category: input.category,
        ctx: input.ctx,
        duration: input.duration ?? DEFAULT_DURATION.toast,
        nextAction: input.nextAction,
        createdAt: Date.now()
      };
      addMessage(message);
      return id;
    },
    [addMessage]
  );

  /** 显示 Notice */
  const showNotice = useCallback(
    (input: NoticeInput): string => {
      const id = input.id || generateId();
      const message: NoticeMessage = {
        id,
        type: 'notice',
        level: input.level || 'info',
        content: input.content,
        buttons: input.buttons,
        duration: input.persistent ? 0 : (input.duration ?? DEFAULT_DURATION.notice),
        persistent: input.persistent,
        routineId: input.routineId,
        createdAt: Date.now()
      };
      addMessage(message);
      return id;
    },
    [addMessage]
  );

  /** 显示 Busy */
  const showBusy = useCallback(
    (input: BusyInput): string => {
      const id = input.id || 'busy_singleton';
      const message: BusyMessage = {
        id,
        type: 'busy',
        level: input.level,
        content: input.content,
        progress: input.progress,
        createdAt: Date.now()
      };
      addMessage(message);
      return id;
    },
    [addMessage]
  );

  /** 更新 Busy 进度 */
  const updateBusy = useCallback((progress: number, content?: string) => {
    setState((prev) => {
      const busyIndex = prev.queue.findIndex((m) => m.type === 'busy');
      if (busyIndex === -1) return prev;

      const busyMessage = prev.queue[busyIndex] as BusyMessage;
      const updatedMessage: BusyMessage = {
        ...busyMessage,
        progress: Math.max(0, Math.min(100, progress)),
        content: content !== undefined ? content : busyMessage.content
      };

      const newQueue = [...prev.queue];
      newQueue[busyIndex] = updatedMessage;

      return {
        current: prev.current?.id === updatedMessage.id ? updatedMessage : prev.current,
        queue: newQueue
      };
    });
  }, []);

  /** 清除 Busy */
  const clearBusy = useCallback(() => {
    setState((prev) => {
      const newQueue = prev.queue.filter((m) => m.type !== 'busy');
      const newCurrent = newQueue[0] || null;

      return {
        current: newCurrent,
        queue: newQueue
      };
    });
  }, []);

  /** 清除指定类型消息 */
  const clearByType = useCallback((type: SpriteMessage['type']) => {
    setState((prev) => {
      const newQueue = prev.queue.filter((m) => m.type !== type);
      if (newQueue.length === prev.queue.length) {
        return prev;
      }

      return {
        current: newQueue[0] || null,
        queue: newQueue
      };
    });
  }, []);

  /** 关闭消息 */
  const dismiss = useCallback((id?: string) => {
    setState((prev) => {
      const targetId = id ?? prev.current?.id;
      if (!targetId) return prev;

      const newQueue = prev.queue.filter((m) => m.id !== targetId);
      if (newQueue.length === prev.queue.length) {
        return prev;
      }

      return {
        current: newQueue[0] || null,
        queue: newQueue
      };
    });
  }, []);

  /** 清除所有消息 */
  const clearAll = useCallback(() => {
    clearTimer();
    setState({ current: null, queue: [] });
  }, [clearTimer]);

  /** 处理自动过期 */
  useEffect(() => {
    clearTimer();

    const current = state.current;
    if (!current) return;

    // busy 消息不自动过期
    if (current.type === 'busy') return;

    const duration = current.duration ?? DEFAULT_DURATION[current.type];
    if (duration > 0) {
      timerRef.current = setTimeout(() => {
        removeMessage(current.id);
      }, duration);
    }

    return clearTimer;
  }, [state.current, clearTimer, removeMessage]);

  /** 获取当前 Notice 消息 */
  const currentNotice = state.current?.type === 'notice' ? (state.current as NoticeMessage) : null;

  return {
    current: state.current,
    showToast,
    showNotice,
    showBusy,
    updateBusy,
    clearBusy,
    clearByType,
    dismiss,
    clearAll,
    currentNotice
  };
}

export default useMessageQueue;

/**
 * MessageBubble
 *
 * 用途
 * - 在目标区域上方显示一条轻量提示信息（如 “welcome/drag/drop”等）。
 * - 当消息内容（category/text/ctx）变化时，自动重新显示，并可按需自动隐藏。
 *
 * 行为与实现要点
 * - 在 effect 中通过 0ms 定时器异步 setVisible(true)，规避同步 setState 导致的级联渲染告警。
 * - 显示/隐藏定时器分离管理，依赖变化或组件卸载时会被清理，避免相互覆盖或泄漏。
 * - 依赖项包含 category、text、autoHideMs 以及 ctx 的签名（ctxSig）。当它们任一变化时，重置显示与隐藏逻辑。
 * - autoHideMs 为 0 或未传时，提示保持可见；否则在 autoHideMs 毫秒后隐藏。
 * - 不可见时返回 null；可见时渲染一个绝对定位、居中的白色圆角提示框。
 * - 文案计算：当 category 为 'custom' 时使用传入的 text，否则通过 Messages.t(category, ctx) 计算。
 *
 * Props
 * - autoHideMs?: number  // 0 或 undefined 表示常驻（默认 5000ms 自动隐藏）
 * - className?: string   // 追加根元素样式类
 * - state?: MessageCategory // 当前消息类别，决定展示文案（默认 'welcome'）
 *
 * 使用示例
 *   <MessageBubble state="welcome" autoHideMs={3000} />
 *
 * 备注
 * - 如果需要根据更复杂的上下文（ctx/text）来展示自定义文案，可在上层维护消息对象并扩展此组件入参；
 *   本组件会在这些依赖发生变化时自动重新显示并按配置隐藏。
 */
import clsx from 'clsx';
import React, { useEffect, useRef, useState } from 'react';

import type { MessageCategory } from '../types';
import Messages from './zh-CN';

export interface MessageBubbleProps {
  autoHideMs?: number; // 0 or undefined to keep visible
  className?: string;
  state?: MessageCategory;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ autoHideMs = 5000, className, state }) => {
  const [visible, setVisible] = useState(false);
  // manage separate timers for show/hide to avoid synchronous state updates in effects
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bubble: { category: MessageCategory; ctx?: any; text?: string } = { category: state || 'welcome' };
  // setBubble({ category: 'drop', ctx: { count: 1, singleName } })
  // setBubble({ category: 'drop', ctx: { count: details.length, names } })

  const { category, ctx, text } = bubble;
  // Keep dependencies simple and statically analyzable
  const ctxSig = ctx ? JSON.stringify(ctx) : '';

  useEffect(() => {
    // Clear previous timers
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    // Defer the visibility update to a task to avoid synchronous setState in effect
    showTimerRef.current = setTimeout(() => setVisible(true), 0);

    // Schedule auto-hide if configured
    if (autoHideMs && autoHideMs > 0) {
      hideTimerRef.current = setTimeout(() => setVisible(false), autoHideMs);
    }

    return () => {
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
    // stringify ctx to retrigger when deep-changed, but keep it small
  }, [category, text, autoHideMs, ctxSig]);

  if (!visible) return null;

  const computed = category === 'custom' ? (text ?? '') : Messages.t(category as MessageCategory, ctx);
  return (
    <div
      className={clsx([
        // position & placement
        'absolute -top-[32px] left-1/2 -translate-x-1/2 z-10 w-full',
        // visuals
        'bg-white/90 rounded-xl shadow-lg',
        // spacing & typography
        'px-4 py-2 text-xs text-gray-700',
        // layout behavior
        'max-w-[300px] whitespace-normal break-words text-center',
        className
      ])}
    >
      {computed}
    </div>
  );
};

export default MessageBubble;

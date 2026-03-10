/**
 * ToastRenderer - Toast 消息渲染器
 *
 * 用于渲染轻量提示消息，支持：
 * - 预设文案（通过 category）
 * - 自定义文案（通过 content）
 * - 不同等级的视觉样式
 */

import Messages from '@packages/sprite-core/messages/zh-CN';
import clsx from 'clsx';
import React from 'react';

import type { MessageCategory } from '../../types';
import type { ToastMessage } from '../types';

interface ToastRendererProps {
  message: ToastMessage;
  className?: string;
}

/** 等级样式映射 */
const levelStyles: Record<string, string> = {
  info: 'bg-white/90 text-gray-700',
  success: 'bg-emerald-50/95 text-emerald-800 border border-emerald-200/50',
  warning: 'bg-amber-50/95 text-amber-800 border border-amber-200/50',
  error: 'bg-rose-50/95 text-rose-800 border border-rose-200/50'
};

export function ToastRenderer({ message, className }: ToastRendererProps): JSX.Element {
  // 计算显示文案
  const displayText = React.useMemo(() => {
    // 优先使用自定义内容
    if (message.content) {
      return message.content;
    }
    // 使用预设文案
    if (message.category) {
      return Messages.t(message.category as MessageCategory, message.ctx);
    }
    return '';
  }, [message.content, message.category, message.ctx]);

  const level = message.level || 'info';

  return (
    <div
      className={clsx(
        // 基础样式
        'rounded-xl shadow-lg backdrop-blur-sm',
        'px-4 py-2 text-xs',
        'max-w-[280px] w-48 whitespace-normal break-words text-center',
        // 等级样式
        levelStyles[level],
        className
      )}
    >
      {displayText}
    </div>
  );
}

export default ToastRenderer;

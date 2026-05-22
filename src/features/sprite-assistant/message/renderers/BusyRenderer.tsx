/**
 * BusyRenderer - Busy 消息渲染器
 *
 * 用于渲染忙碌状态，支持：
 * - 进度条显示（有进度值时）
 * - Loading 动画（无进度值时）
 * - 消息提示
 */

import clsx from 'clsx';

import type { BusyMessage } from '../types';

interface BusyRendererProps {
  message: BusyMessage;
  className?: string;
  placement?: 'inline' | 'fixed-top';
}

export function BusyRenderer({ message, className, placement = 'inline' }: BusyRendererProps): JSX.Element {
  const showProgress = message.progress !== undefined;
  const progressValue = showProgress ? Math.max(0, Math.min(100, message.progress!)) : 0;
  const fixedTop = placement === 'fixed-top';

  return (
    <div className={clsx(fixedTop ? 'min-w-52 w-fit max-w-[440px] pointer-events-none' : 'w-52 pointer-events-none', className)}>
      {/* 进度条容器 */}
      <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg border border-indigo-200/50 p-2">
        {/* 消息文本 */}
        {message.content && <div className={clsx('text-xs text-gray-700 mb-1 text-center font-medium', fixedTop ? 'whitespace-normal break-words leading-snug' : 'truncate')}>{message.content}</div>}

        {/* 进度条 */}
        {showProgress && (
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 ease-out rounded-full" style={{ width: `${progressValue}%` }} />
          </div>
        )}

        {/* 无进度时的加载指示器 */}
        {!showProgress && (
          <div className="flex items-center justify-center gap-1.5 h-2">
            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1s' }} />
            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '200ms', animationDuration: '1s' }} />
            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '400ms', animationDuration: '1s' }} />
          </div>
        )}
      </div>
    </div>
  );
}

export default BusyRenderer;

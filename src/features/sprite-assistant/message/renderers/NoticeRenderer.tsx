/**
 * NoticeRenderer - Notice 消息渲染器
 *
 * 用于渲染通知消息，支持：
 * - 不同等级（info/success/warning/error）
 * - 图标显示
 * - 交互按钮
 * - 关闭按钮
 */

import clsx from 'clsx';
import { TbAlertTriangle, TbCircleCheck, TbInfoCircle, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

import type { MessageButton, NoticeMessage } from '../types';

interface NoticeRendererProps {
  message: NoticeMessage;
  onClose?: () => void;
  onButtonClick?: (button: MessageButton) => void;
  className?: string;
  placement?: 'inline' | 'external';
}

/** 等级样式和图标映射 */
const levelConfig: Record<
  string,
  {
    container: string;
    accent: string;
    icon: JSX.Element;
  }
> = {
  info: {
    container: 'bg-sky-50/95 border border-sky-200/80 text-sky-900 shadow-sky-200/60',
    accent: 'text-sky-600',
    icon: <TbInfoCircle className="w-4 h-4" />
  },
  success: {
    container: 'bg-emerald-50/95 border border-emerald-200/80 text-emerald-900 shadow-emerald-200/60',
    accent: 'text-emerald-600',
    icon: <TbCircleCheck className="w-4 h-4" />
  },
  warning: {
    container: 'bg-amber-50/95 border border-amber-200/80 text-amber-900 shadow-amber-200/60',
    accent: 'text-amber-600',
    icon: <TbAlertTriangle className="w-4 h-4" />
  },
  error: {
    container: 'bg-rose-50/95 border border-rose-200/80 text-rose-900 shadow-rose-200/60',
    accent: 'text-rose-600',
    icon: <TbAlertTriangle className="w-4 h-4" />
  }
};

export function NoticeRenderer({ message, onClose, onButtonClick, className, placement = 'inline' }: NoticeRendererProps): JSX.Element {
  const level = message.level || 'info';
  const styles = levelConfig[level];
  const hasButtons = message.buttons && message.buttons.length > 0;
  const external = placement === 'external';

  if (external) {
    return (
      <div className={clsx('relative min-w-56 w-fit max-w-[440px] pointer-events-auto', className)}>
        {/* 主内容区域 */}
        <div className={clsx('rounded-xl px-2 py-2 shadow-lg flex items-start gap-2 text-xs backdrop-blur-sm', styles.container)}>
          {/* 图标 */}
          <div className={clsx('shrink-0 pt-0.5', styles.accent)}>{styles.icon}</div>
          {/* 消息内容 */}
          <div className="flex-1 min-w-0 leading-snug whitespace-normal break-words">{message.content}</div>
        </div>

        {/* 按钮区域 */}
        {(hasButtons || onClose) && (
          <div className={clsx('mx-auto mt-1 flex w-fit max-w-full items-center gap-1 rounded-ee-lg rounded-es-lg px-1 backdrop-blur-sm', styles.container)}>
            {/* 交互按钮 */}
            {hasButtons && (
              <div className="flex min-w-0 flex-wrap items-center justify-center gap-1.5">
                {message.buttons!.map((button) => (
                  <Button key={button.id} size="sm" variant={button.variant || 'secondary'} onClick={() => onButtonClick?.(button)} className="h-6 px-2 text-xs">
                    {button.label}
                  </Button>
                ))}
              </div>
            )}
            {/* 关闭按钮 */}
            {onClose && (
              <button type="button" className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:bg-black/5 transition-colors shrink-0" onClick={onClose}>
                <TbX className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={clsx('w-56 pointer-events-auto', className)}>
      {/* 主内容区域 */}
      <div className={clsx('rounded-xl px-2 py-2 shadow-lg flex items-center gap-2 text-xs backdrop-blur-sm', styles.container)}>
        {/* 图标 */}
        <div className={clsx('shrink-0', styles.accent)}>{styles.icon}</div>
        {/* 消息内容 */}
        <div className="flex-1 leading-none whitespace-nowrap w-0 truncate">{message.content}</div>
      </div>

      {/* 按钮区域 */}
      {(hasButtons || onClose) && (
        <div className={clsx('absolute left-1/2 -translate-x-1/2 flex rounded-ee-lg rounded-es-lg backdrop-blur-sm', styles.container)}>
          {/* 交互按钮 */}
          {hasButtons && (
            <div className="flex items-center gap-1.5 ml-2">
              {message.buttons!.map((button) => (
                <Button key={button.id} size="sm" variant={button.variant || 'secondary'} onClick={() => onButtonClick?.(button)} className="h-6 px-2 text-xs">
                  {button.label}
                </Button>
              ))}
            </div>
          )}
          {/* 关闭按钮 */}
          {onClose && (
            <button type="button" className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:bg-black/5 transition-colors shrink-0" onClick={onClose}>
              <TbX className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default NoticeRenderer;

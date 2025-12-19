import clsx from 'clsx';
import { TbAlertTriangle, TbCircleCheck, TbInfoCircle, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

import type { NoticeButton, NoticeLevel } from '../hooks/useNoticeState';

interface SpriteNoticeProps {
  message: string;
  level?: NoticeLevel;
  buttons?: NoticeButton[];
  onClose?: () => void;
  onButtonClick?: (button: NoticeButton) => void;
}

const levelStyles: Record<NoticeLevel, { container: string; accent: string; icon: JSX.Element }> = {
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

export function SpriteNotice({ message, level = 'info', buttons, onClose, onButtonClick }: SpriteNoticeProps): JSX.Element {
  const styles = levelStyles[level];
  return (
    <div className="absolute -top-[32px] left-1/2 -translate-x-1/2 z-10 w-56 pointer-events-auto">
      <div className={clsx('rounded-xl px-2 py-2 shadow-lg flex items-center gap-2 text-xs backdrop-blur-sm', styles.container)}>
        <div className={clsx('shrink-0', styles.accent)}>{styles.icon}</div>
        <div className="flex-1 leading-none whitespace-nowrap w-0 truncate">{message}</div>
      </div>
      <div className={clsx(['absolute left-1/2 -translate-x-1/2 flex rounded-ee-lg rounded-es-lg backdrop-blur-sm', styles.container])}>
        {buttons && buttons.length > 0 && (
          <div className="flex items-center gap-1.5 ml-2">
            {buttons.map((button) => (
              <Button key={button.id} size="sm" variant={button.variant || 'secondary'} onClick={() => onButtonClick?.(button)} className="h-6 px-2 text-xs">
                {button.label}
              </Button>
            ))}
          </div>
        )}
        {onClose && (
          <button type="button" className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:bg-black/5 transition-colors shrink-0" onClick={onClose}>
            <TbX className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default SpriteNotice;

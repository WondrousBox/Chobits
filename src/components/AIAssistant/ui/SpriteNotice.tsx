import clsx from 'clsx';
import { TbAlertTriangle, TbCircleCheck, TbInfoCircle, TbX } from 'react-icons/tb';

import type { NoticeLevel } from '../hooks/useNoticeState';

interface SpriteNoticeProps {
  message: string;
  level?: NoticeLevel;
  onClose?: () => void;
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

export function SpriteNotice({ message, level = 'info', onClose }: SpriteNoticeProps): JSX.Element {
  const styles = levelStyles[level];
  return (
    <div className="absolute -top-[32px] left-1/2 -translate-x-1/2 z-10 pointer-events-auto">
      <div className={clsx('rounded-xl px-4 py-2 shadow-lg flex items-center gap-2 text-xs backdrop-blur-sm', styles.container)}>
        <div className={clsx('shrink-0', styles.accent)}>{styles.icon}</div>
        <div className="flex-1 leading-none">{message}</div>
        {onClose && (
          <button type="button" className="ml-2 w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:bg-black/5 transition-colors" onClick={onClose}>
            <TbX className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default SpriteNotice;

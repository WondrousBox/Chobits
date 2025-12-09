import { useCallback, useEffect, useRef, useState } from 'react';

export type NoticeLevel = 'info' | 'success' | 'warning' | 'error';

export interface NoticeState {
  message: string;
  level: NoticeLevel;
}

const DEFAULT_DURATION = 4000;

export default function useNoticeState(): {
  notice: NoticeState | null;
  dismiss: () => void;
} {
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = (): void => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const dismiss = useCallback(() => {
    clearTimer();
    setNotice(null);
  }, []);

  useEffect(() => {
    const handleNotice = (_event: unknown, payload?: { message?: string; level?: NoticeLevel; durationMs?: number; persistent?: boolean; routineId?: string }): void => {
      if (!payload?.message) return;
      clearTimer();
      setNotice({
        message: payload.message,
        level: payload.level || 'info'
      });
      // 如果 persistent 为 true 或 durationMs 为 0，则消息常驻不自动消失
      const isPersistent = payload.persistent === true || payload.durationMs === 0;
      if (!isPersistent) {
        const duration = typeof payload.durationMs === 'number' ? payload.durationMs : DEFAULT_DURATION;
        if (duration > 0) {
          timerRef.current = setTimeout(() => {
            setNotice(null);
            timerRef.current = null;
          }, duration);
        }
      }
    };

    window.ipcRenderer?.on('app:notice', handleNotice);
    return () => {
      clearTimer();
      window.ipcRenderer?.off('app:notice', handleNotice);
    };
  }, []);

  return { notice, dismiss };
}

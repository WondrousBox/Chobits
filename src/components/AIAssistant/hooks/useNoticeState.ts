import { useCallback, useEffect, useRef, useState } from 'react';

export type NoticeLevel = 'info' | 'success' | 'warning' | 'error';

export interface NoticeButton {
  id: string;
  label: string;
  action?: string;
  variant?: 'default' | 'secondary' | 'outline' | 'ghost';
}

export interface NoticeState {
  message: string;
  level: NoticeLevel;
  buttons?: NoticeButton[];
  routineId?: string;
}

const DEFAULT_DURATION = 4000;

export default function useNoticeState(): {
  notice: NoticeState | null;
  dismiss: () => void;
  handleButtonClick: (button: NoticeButton) => void;
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

  const handleButtonClick = useCallback(
    async (button: NoticeButton) => {
      // 处理预定义动作
      if (button.action === 'dismiss') {
        dismiss();
        return;
      }

      // 发送按钮点击事件到后端
      if (notice?.routineId) {
        try {
          await window.ipcRenderer?.invoke('dailyCare:handleButtonClick', notice.routineId, button.id, button.action);
        } catch (error) {
          console.warn('[useNoticeState] handleButtonClick failed', error);
        }
      }

      // 如果按钮点击后应该关闭消息（默认行为）
      if (button.action !== 'keep-open') {
        dismiss();
      }
    },
    [notice, dismiss]
  );

  useEffect(() => {
    const handleNotice = (_event: unknown, payload?: { message?: string; level?: NoticeLevel; durationMs?: number; persistent?: boolean; routineId?: string; buttons?: NoticeButton[] }): void => {
      if (!payload?.message) return;
      clearTimer();
      setNotice({
        message: payload.message,
        level: payload.level || 'info',
        buttons: payload.buttons,
        routineId: payload.routineId
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

  return { notice, dismiss, handleButtonClick };
}

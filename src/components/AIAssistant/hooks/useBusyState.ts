import { useCallback, useEffect, useState } from 'react';

export interface BusyState {
  isBusy: boolean;
  progress?: number; // 0-100
  message?: string;
}

export default function useBusyState(): {
  busyState: BusyState;
  setBusy: (progress?: number, message?: string) => void;
  clearBusy: () => void;
  updateProgress: (progress: number, message?: string) => void;
} {
  const [busyState, setBusyState] = useState<BusyState>({ isBusy: false });

  const setBusy = useCallback((progress?: number, message?: string) => {
    setBusyState({
      isBusy: true,
      progress: progress !== undefined ? Math.max(0, Math.min(100, progress)) : undefined,
      message
    });
  }, []);

  const clearBusy = useCallback(() => {
    setBusyState({ isBusy: false });
  }, []);

  const updateProgress = useCallback((progress: number, message?: string) => {
    setBusyState((prev) => {
      if (!prev.isBusy) return prev;
      return {
        ...prev,
        progress: Math.max(0, Math.min(100, progress)),
        message: message !== undefined ? message : prev.message
      };
    });
  }, []);

  // 监听 IPC 事件
  useEffect(() => {
    const onBusyStart = (_: any, payload?: { progress?: number; message?: string }): void => {
      setBusy(payload?.progress, payload?.message);
    };

    const onBusyEnd = (): void => {
      clearBusy();
    };

    const onBusyProgress = (_: any, payload?: { progress: number; message?: string }): void => {
      if (payload?.progress !== undefined) {
        updateProgress(payload.progress, payload.message);
      }
    };

    window.ipcRenderer?.on('sprite:busy:start', onBusyStart);
    window.ipcRenderer?.on('sprite:busy:end', onBusyEnd);
    window.ipcRenderer?.on('sprite:busy:progress', onBusyProgress);

    return () => {
      window.ipcRenderer?.off('sprite:busy:start', onBusyStart);
      window.ipcRenderer?.off('sprite:busy:end', onBusyEnd);
      window.ipcRenderer?.off('sprite:busy:progress', onBusyProgress);
    };
  }, [setBusy, clearBusy, updateProgress]);

  return {
    busyState,
    setBusy,
    clearBusy,
    updateProgress
  };
}

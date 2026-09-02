import { useEffect, useState } from 'react';

import { ensureSpriteCapabilityAccessible, type SpriteCapabilityGuardOptions } from '@/features/sprite/capability-guard';

export function useSpeechRecognitionSettings(options?: SpriteCapabilityGuardOptions) {
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  const checkStatus = async (): Promise<void> => {
    try {
      const status = await window.chobits.sherpa.getStatus();
      setIsRunning(status.running);
    } catch (error) {
      console.error('查询 ASR 状态失败:', error);
      setIsRunning(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await checkStatus();
      } finally {
        if (!cancelled) setIsChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleFocus = (): void => {
      checkStatus();
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const handleToggle = async (checked: boolean): Promise<void> => {
    if (checked && !ensureSpriteCapabilityAccessible(options?.capability, options?.onBlocked)) {
      return;
    }
    setIsLoading(true);
    try {
      if (checked) {
        window.chobits.window['window:open']('asrConfig');
      } else {
        await window.chobits.sherpa.destroyInstance();
        await window.chobits.sherpa.saveASRConfig({ enabled: false });
        setIsRunning(false);
      }
    } catch (error) {
      console.error('切换 ASR 服务失败:', error);
    } finally {
      setIsLoading(false);
      await options?.afterChange?.();
    }
  };

  return { isRunning, isLoading, isChecking, capability: options?.capability ?? null, handleToggle, checkStatus };
}

export type SpeechRecognitionSettingsState = ReturnType<typeof useSpeechRecognitionSettings>;

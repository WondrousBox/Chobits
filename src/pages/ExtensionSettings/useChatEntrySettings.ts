import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

export const CHAT_ENTRY_DESCRIPTION = '开启后，双击桌面精灵会打开跟随精灵的小输入窗，只显示模型、麦克风和发送入口。其他对话选项继续沿用本地缓存。';

export function useChatEntrySettings(): {
  description: string;
  isEnabled: boolean;
  isLoading: boolean;
  isPending: boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
} {
  const [isEnabled, setIsEnabledValue] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    let disposed = false;

    const load = async (): Promise<void> => {
      try {
        const result = await window.chobits.preferences['preferences:get-config']();
        if (!disposed && result.ok && result.config) {
          setIsEnabledValue(Boolean(result.config.miniChatWindowEnabled));
        }
      } catch (error) {
        console.warn('[ChatEntrySettings] failed to load mini chat window setting:', error);
      } finally {
        if (!disposed) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      disposed = true;
    };
  }, []);

  const setEnabled = useCallback(
    async (nextEnabled: boolean): Promise<void> => {
      if (isPending) return;
      const previous = isEnabled;
      setIsEnabledValue(nextEnabled);
      setIsPending(true);
      try {
        const result = await window.chobits.preferences['preferences:set-config']({
          config: { miniChatWindowEnabled: nextEnabled }
        });
        if (!result.ok || !result.config) {
          throw new Error(result.error || '设置迷你输入窗失败');
        }
        setIsEnabledValue(Boolean(result.config.miniChatWindowEnabled));
      } catch (error) {
        setIsEnabledValue(previous);
        toast.error('设置迷你输入窗失败', {
          description: error instanceof Error ? error.message : String(error)
        });
      } finally {
        setIsPending(false);
      }
    },
    [isEnabled, isPending]
  );

  return { description: CHAT_ENTRY_DESCRIPTION, isEnabled, isLoading, isPending, setEnabled };
}

export type ChatEntrySettingsState = ReturnType<typeof useChatEntrySettings>;

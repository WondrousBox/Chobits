import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

export const CHAT_ENTRY_DESCRIPTION = '开启后，双击桌面精灵会打开跟随精灵的小输入窗，只显示模型、麦克风和发送入口。其他对话选项继续沿用本地缓存。';

export function useChatEntrySettings(): {
  description: string;
  enabled: boolean;
  loading: boolean;
  pending: boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
} {
  const [enabled, setEnabledState] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let disposed = false;

    const load = async (): Promise<void> => {
      try {
        const result = await window.YUA.preferences['preferences:getConfig']();
        if (!disposed && result.ok && result.config) {
          setEnabledState(Boolean(result.config.assistantMiniWindowEnabled));
        }
      } catch (error) {
        console.warn('[ChatEntrySettings] failed to load assistant mini window setting:', error);
      } finally {
        if (!disposed) {
          setLoading(false);
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
      if (pending) return;
      const previous = enabled;
      setEnabledState(nextEnabled);
      setPending(true);
      try {
        const result = await window.YUA.preferences['preferences:setConfig']({
          config: { assistantMiniWindowEnabled: nextEnabled }
        });
        if (!result.ok || !result.config) {
          throw new Error(result.error || '设置迷你输入窗失败');
        }
        setEnabledState(Boolean(result.config.assistantMiniWindowEnabled));
      } catch (error) {
        setEnabledState(previous);
        toast.error('设置迷你输入窗失败', {
          description: error instanceof Error ? error.message : String(error)
        });
      } finally {
        setPending(false);
      }
    },
    [enabled, pending]
  );

  return { description: CHAT_ENTRY_DESCRIPTION, enabled, loading, pending, setEnabled };
}

export type ChatEntrySettingsState = ReturnType<typeof useChatEntrySettings>;

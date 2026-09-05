import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

export function useChatEntrySettings(): {
  description: string;
  isEnabled: boolean;
  isLoading: boolean;
  isPending: boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
} {
  const { t } = useTranslation('speech');
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
          throw new Error(result.error || t('chatEntry.setFailed'));
        }
        setIsEnabledValue(Boolean(result.config.miniChatWindowEnabled));
      } catch (error) {
        setIsEnabledValue(previous);
        toast.error(t('chatEntry.setFailed'), {
          description: error instanceof Error ? error.message : String(error)
        });
      } finally {
        setIsPending(false);
      }
    },
    [isEnabled, isPending, t]
  );

  return { description: t('chatEntry.description'), isEnabled, isLoading, isPending, setEnabled };
}

export type ChatEntrySettingsState = ReturnType<typeof useChatEntrySettings>;

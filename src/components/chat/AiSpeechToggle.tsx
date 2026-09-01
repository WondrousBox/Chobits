import type { SpriteSpeakConfig } from '@packages/sprite-core/speak/types';
import { useCallback, useEffect, useState } from 'react';
import { TbVolume, TbVolumeOff } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const CHAT_REALTIME_SCOPES: SpriteSpeakConfig['realtimeSpeech']['scopes'] = {
  mainChat: true,
  // mini 分支已移除资源库侧栏，该 scope 常驻关闭
  resourceChatSidebar: false
};

function canShowAiSpeechToggle(config: SpriteSpeakConfig | null): boolean {
  return Boolean(config?.enabled && config.engine === 'ai-provider');
}

export interface AiSpeechToggleProps {
  className?: string;
  onEnabledChange?: (enabled: boolean) => void;
}

export default function AiSpeechToggle({ className, onEnabledChange }: AiSpeechToggleProps): JSX.Element | null {
  const [config, setConfig] = useState<SpriteSpeakConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const nextConfig = await window.YUA.sprite.getSpeakConfig();
      setConfig(nextConfig);
    } catch (error) {
      console.warn('[AiSpeechToggle] Failed to load speak config:', error);
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const handleFocus = (): void => {
      void refresh();
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [refresh]);

  const visible = canShowAiSpeechToggle(config);
  if (!visible) {
    return null;
  }

  const checked = Boolean(config?.realtimeSpeech.enabled);
  const disabled = loading || saving;

  const handleCheckedChange = async (nextChecked: boolean): Promise<void> => {
    if (!config || saving) return;

    setSaving(true);
    try {
      const updated = await window.YUA.sprite.setSpeakConfig({
        realtimeSpeech: {
          ...config.realtimeSpeech,
          enabled: nextChecked,
          scopes: nextChecked
            ? {
                ...config.realtimeSpeech.scopes,
                ...CHAT_REALTIME_SCOPES
              }
            : config.realtimeSpeech.scopes
        }
      });
      setConfig(updated);
      onEnabledChange?.(nextChecked);
    } catch (error) {
      console.warn('[AiSpeechToggle] Failed to update realtime speech config:', error);
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const content = checked ? 'AI 说话已开启，点击关闭' : 'AI 说话已关闭，点击开启';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant={checked ? 'default' : 'outline'}
          disabled={disabled}
          aria-label={checked ? '关闭 AI 说话' : '开启 AI 说话'}
          aria-pressed={checked}
          className={cn(
            'h-8 w-8 shrink-0 rounded-full shadow-sm backdrop-blur',
            checked ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-background/90 text-muted-foreground hover:text-foreground',
            className
          )}
          onClick={() => void handleCheckedChange(!checked)}
        >
          {checked ? <TbVolume /> : <TbVolumeOff />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{content}</TooltipContent>
    </Tooltip>
  );
}

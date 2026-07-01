import type { SpriteSpeakConfig } from '@packages/sprite-core/speak/types';
import { useCallback, useEffect, useState } from 'react';
import { TbVolume, TbVolumeOff } from 'react-icons/tb';

import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const CHAT_REALTIME_SCOPES: SpriteSpeakConfig['chatRealtimeSpeech']['scopes'] = {
  mainChat: true,
  resourceChatSidebar: true
};

function canShowAiSpeechToggle(config: SpriteSpeakConfig | null): boolean {
  return Boolean(config?.enabled && config.engine === 'ai-provider');
}

export interface AiSpeechToggleProps {
  className?: string;
  compact?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
}

export default function AiSpeechToggle({ className, compact = false, onEnabledChange }: AiSpeechToggleProps): JSX.Element | null {
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

  const checked = Boolean(config?.chatRealtimeSpeech.enabled);
  const disabled = loading || saving;

  const handleCheckedChange = async (nextChecked: boolean): Promise<void> => {
    if (!config || saving) return;

    setSaving(true);
    try {
      const updated = await window.YUA.sprite.setSpeakConfig({
        chatRealtimeSpeech: {
          ...config.chatRealtimeSpeech,
          enabled: nextChecked,
          scopes: nextChecked
            ? {
                ...config.chatRealtimeSpeech.scopes,
                ...CHAT_REALTIME_SCOPES
              }
            : config.chatRealtimeSpeech.scopes
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

  const content = checked ? 'AI 说话已开启' : '开启后 AI 回复会跟随 SSE 流式说话';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2 text-xs text-muted-foreground transition-colors hover:bg-muted',
            checked && 'text-primary',
            disabled && 'cursor-not-allowed opacity-60',
            className
          )}
        >
          {checked ? <TbVolume className="h-3.5 w-3.5" /> : <TbVolumeOff className="h-3.5 w-3.5" />}
          {!compact && <span className="whitespace-nowrap">AI 说话</span>}
          <Switch checked={checked} disabled={disabled} aria-label={checked ? '关闭 AI 说话' : '开启 AI 说话'} onCheckedChange={(value) => void handleCheckedChange(value)} />
        </div>
      </TooltipTrigger>
      <TooltipContent>{content}</TooltipContent>
    </Tooltip>
  );
}

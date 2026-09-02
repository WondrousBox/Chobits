import type * as PopoverPrimitive from '@radix-ui/react-popover';
import { useEffect, useState } from 'react';
import { TbCheck, TbExternalLink, TbLoader2, TbWorldSearch } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const TAVILY_PROVIDER_ID = 'tavily';

interface WebSearchToggleProps {
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  onOpenChange?: (open: boolean) => void;
  contentSide?: PopoverPrimitive.PopoverContentProps['side'];
  contentAlign?: PopoverPrimitive.PopoverContentProps['align'];
  avoidCollisions?: PopoverPrimitive.PopoverContentProps['avoidCollisions'];
}

export default function WebSearchToggle({ isEnabled, contentSide, contentAlign = 'start', avoidCollisions, onOpenChange, onToggle }: WebSearchToggleProps): JSX.Element {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  const loadApiKey = async (): Promise<void> => {
    try {
      // Prefer the API-keys API because it doesn't depend on provider schema keys
      const keys = await window.chobits.ai.getProviderApiKeys(TAVILY_PROVIDER_ID, 'apiKey').catch(() => []);
      const key = Array.isArray(keys) && keys.length > 0 ? keys.find((k: any) => k.isDefault)?.value || keys[0].value : '';
      setApiKey(key);
      setHasKey(!!key);
    } catch {
      /* ignore */
    } finally {
      setIsLoaded(true);
    }
  };

  useEffect(() => {
    void loadApiKey();
  }, []);

  useEffect(() => {
    onOpenChange?.(popoverOpen);
  }, [onOpenChange, popoverOpen]);

  const handleToggle = async (): Promise<void> => {
    if (!isEnabled) {
      if (!hasKey) {
        if (!isLoaded) await loadApiKey();
        if (!hasKey) {
          setPopoverOpen(true);
          return;
        }
      }
      onToggle(true);
    } else {
      onToggle(false);
    }
  };

  const handleSave = async (): Promise<void> => {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    setIsSaving(true);
    setIsSaved(false);
    try {
      await window.chobits.ai.setProviderSecrets(TAVILY_PROVIDER_ID, { apiKey: trimmed });
      setHasKey(true);
      setIsSaved(true);
      setTimeout(() => {
        setIsSaved(false);
        setPopoverOpen(false);
        onToggle(true);
      }, 600);
    } catch {
      /* ignore */
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Popover
      open={popoverOpen}
      onOpenChange={(open) => {
        setPopoverOpen(open);
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn('h-8 w-8 rounded-full', isEnabled && 'bg-primary/10 text-primary')}
              onClick={(e) => {
                e.preventDefault();
                void handleToggle();
              }}
              aria-label={isEnabled ? '关闭联网搜索' : '开启联网搜索'}
            >
              <TbWorldSearch className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{isEnabled ? '关闭联网搜索' : '开启联网搜索'}</TooltipContent>
      </Tooltip>
      <PopoverContent align={contentAlign} side={contentSide} avoidCollisions={avoidCollisions} className="no-drag pointer-events-auto w-80">
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-medium">联网搜索配置</h4>
            <p className="text-xs text-muted-foreground mt-1">配置搜索 API Key 后即可在对话中联网搜索。</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ws-tavily-key" className="text-xs">
              Tavily API Key
            </Label>
            <Input
              id="ws-tavily-key"
              type="password"
              placeholder="tvly-xxxxxxxxxxxxxxxx"
              className="h-8 text-xs"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSave();
              }}
            />
            <p className="text-xs text-muted-foreground">
              免费获取（1000 次/月）：
              <a href="https://app.tavily.com/home" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline ml-1">
                tavily.com <TbExternalLink className="w-3 h-3" />
              </a>
            </p>
          </div>
          <Button size="sm" className="w-full h-8" onClick={handleSave} disabled={isSaving || !apiKey.trim()}>
            {isSaving ? <TbLoader2 className="w-3.5 h-3.5 animate-spin" /> : isSaved ? <TbCheck className="w-3.5 h-3.5" /> : null}
            {isSaving ? '保存中...' : isSaved ? '已保存' : '保存并开启'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

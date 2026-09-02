import { Check, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { SpriteAnimationTrigger } from '@/features/sprite';
import { isCustomSpriteAnimationTrigger } from '@/features/sprite';
import { cn } from '@/lib/utils';

import { getSpriteTriggerPresentation, normalizeSpriteTriggerInput, SPRITE_TRIGGER_GROUP_OPTIONS } from './sprite-trigger-picker-utils';

interface SpriteTriggerPickerProps {
  allowClear?: boolean;
  buttonClassName?: string;
  buttonSize?: ButtonProps['size'];
  buttonVariant?: ButtonProps['variant'];
  customPlaceholder?: string;
  disabled?: boolean;
  emptyLabel?: string;
  onChange: (value: SpriteAnimationTrigger | '') => void;
  popoverClassName?: string;
  value?: SpriteAnimationTrigger | '';
}

export default function SpriteTriggerPicker({
  allowClear = true,
  buttonClassName,
  buttonSize = 'default',
  buttonVariant = 'outline',
  customPlaceholder = '例如：character:daily-login',
  disabled = false,
  emptyLabel = '未分类',
  onChange,
  popoverClassName,
  value = ''
}: SpriteTriggerPickerProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [customValue, setCustomValue] = useState('');
  const presentation = useMemo(() => getSpriteTriggerPresentation(value, emptyLabel), [emptyLabel, value]);

  const applyValue = (nextValue: SpriteAnimationTrigger | ''): void => {
    onChange(nextValue);
    setIsOpen(false);
  };

  const applyCustomValue = (): void => {
    applyValue(normalizeSpriteTriggerInput(customValue));
  };

  return (
    <Popover
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (disabled) return;
        setIsOpen(nextOpen);
        setQuery('');
        if (nextOpen) {
          setCustomValue(isCustomSpriteAnimationTrigger(value) ? value : '');
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant={buttonVariant} size={buttonSize} className={cn('min-w-[160px] justify-between gap-3', buttonClassName)} disabled={disabled}>
          <div className="min-w-0 flex-1 text-left">
            <div className="truncate text-xs font-medium">{presentation.label}</div>
            {presentation.detail && <div className="truncate text-[10px] text-muted-foreground">{presentation.kind === 'builtin' ? `内置 · ${presentation.detail}` : '自定义 trigger'}</div>}
          </div>
          <div className="flex items-center gap-2">
            {presentation.kind !== 'empty' && (
              <Badge variant="outline" className="h-5 shrink-0 rounded-full px-1.5 py-0 text-[10px]">
                {presentation.kind === 'builtin' ? '内置' : '自定义'}
              </Badge>
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn('w-[360px] p-0', popoverClassName)} onOpenAutoFocus={(event) => event.preventDefault()}>
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="text-xs font-medium">动画 Trigger</div>
          {allowClear && (
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => applyValue('')}>
              清空
            </Button>
          )}
        </div>

        <Command shouldFilter>
          <CommandInput className="h-8 border-0" placeholder="搜索内置 trigger..." value={query} onValueChange={setQuery} />
          <CommandList className="max-h-[280px]">
            <CommandEmpty>没有匹配的内置 trigger</CommandEmpty>
            {SPRITE_TRIGGER_GROUP_OPTIONS.map((option) => (
              <CommandGroup key={option.group} heading={option.group}>
                {option.items.map((trigger) => (
                  <CommandItem key={trigger} value={trigger} keywords={[option.group, 'builtin']} onSelect={() => applyValue(trigger)}>
                    <Check className={cn('h-4 w-4', presentation.value === trigger ? 'opacity-100' : 'opacity-0')} />
                    <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                      <span className="truncate">{trigger}</span>
                      <span className="text-[10px] text-muted-foreground">内置</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>

        <div className="border-t px-3 py-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-medium">自定义 Trigger</div>
            <div className="text-[10px] text-muted-foreground">写入任意扩展事件名</div>
          </div>
          <div className="flex gap-2">
            <Input
              value={customValue}
              onChange={(event) => setCustomValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applyCustomValue();
                }
              }}
              placeholder={customPlaceholder}
              className="h-8"
            />
            <Button size="sm" className="shrink-0" onClick={applyCustomValue} disabled={!normalizeSpriteTriggerInput(customValue)}>
              应用
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

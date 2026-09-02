import type { SkillInfo } from '@packages/ai/types';
import type * as PopoverPrimitive from '@radix-ui/react-popover';
import { useEffect, useMemo, useState } from 'react';
import { TbSparkles } from 'react-icons/tb';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { applySkillPickerSelection, deriveSkillPickerQuery, isTypingSlashSkillQuery, shouldEnableSkillPicker } from '@/lib/chat-skill-picker';
import { getSkillTrustPresentation } from '@/lib/skill-trust';

interface SkillPickerButtonProps {
  agentId: string;
  highlightedSkillName?: string;
  isLoading?: boolean;
  onSelect: (nextValue: string) => void;
  onHighlightSkill?: (skillName: string) => void;
  suggestions?: SkillInfo[];
  skills: SkillInfo[];
  value: string;
  onOpenChange?: (open: boolean) => void;
  contentSide?: PopoverPrimitive.PopoverContentProps['side'];
  contentAlign?: PopoverPrimitive.PopoverContentProps['align'];
  avoidCollisions?: PopoverPrimitive.PopoverContentProps['avoidCollisions'];
}

export default function SkillPickerButton({
  agentId,
  highlightedSkillName,
  isLoading = false,
  contentSide,
  contentAlign = 'start',
  avoidCollisions,
  onHighlightSkill,
  onOpenChange,
  onSelect,
  suggestions,
  skills,
  value
}: SkillPickerButtonProps): JSX.Element | null {
  const isEnabled = shouldEnableSkillPicker(agentId);
  const isAutoOpen = isEnabled && isTypingSlashSkillQuery(value);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [query, setQuery] = useState('');

  const isOpen = isEnabled && (isManualOpen || isAutoOpen);

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [onOpenChange, isOpen]);

  useEffect(() => {
    if (!isEnabled) {
      const timer = window.setTimeout(() => setIsManualOpen(false), 0);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => {
      if (isAutoOpen) {
        setQuery(deriveSkillPickerQuery(value));
      } else if (!isManualOpen) {
        setQuery('');
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isAutoOpen, isEnabled, isManualOpen, value]);

  const pickerItems = useMemo(
    () =>
      (isAutoOpen && suggestions?.length ? suggestions : skills).map((skill) => ({
        ...skill,
        keywords: [skill.name, ...skill.aliases, skill.description, skill.whenToUse || ''].filter(Boolean)
      })),
    [isAutoOpen, skills, suggestions]
  );

  if (!isEnabled) {
    return null;
  }

  return (
    <Popover
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setIsManualOpen(false);
          return;
        }

        setQuery(isAutoOpen ? deriveSkillPickerQuery(value) : '');
        setIsManualOpen(true);
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant={isOpen ? 'default' : 'outline'} size="icon" className="h-8 w-8 rounded-full" aria-label="选择 Skill">
              <TbSparkles />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>选择一个 Skill，或直接输入 `/skill-name`</p>
        </TooltipContent>
      </Tooltip>

      <PopoverContent align={contentAlign} side={contentSide} avoidCollisions={avoidCollisions} className="no-drag pointer-events-auto w-96 p-0" onOpenAutoFocus={(event) => event.preventDefault()}>
        <Command shouldFilter>
          <CommandInput placeholder="搜索 skills..." value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{isLoading ? '正在加载 skills...' : '没有匹配的 skill'}</CommandEmpty>
            <CommandGroup heading="Available Skills">
              {pickerItems.map((skill) =>
                (() => {
                  const trust = getSkillTrustPresentation(skill);

                  return (
                    <CommandItem
                      key={skill.name}
                      className={highlightedSkillName === skill.name ? 'bg-accent text-accent-foreground' : undefined}
                      keywords={skill.keywords}
                      value={[skill.name, ...skill.aliases, skill.description, skill.whenToUse || ''].join(' ')}
                      onMouseEnter={() => onHighlightSkill?.(skill.name)}
                      onSelect={() => {
                        onSelect(applySkillPickerSelection(value, skill.name));
                        setIsManualOpen(false);
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="truncate font-medium">{skill.name}</div>
                          {trust && (
                            <Badge variant="outline" className={`shrink-0 rounded-full px-1.5 py-0 text-[10px] ${trust.badgeClassName}`}>
                              {trust.badgeLabel}
                            </Badge>
                          )}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{skill.description}</div>
                        {skill.whenToUse && <div className="line-clamp-2 text-[11px] text-muted-foreground/90">{skill.whenToUse}</div>}
                        {skill.argumentHint && <div className="truncate text-[11px] text-muted-foreground">args: {skill.argumentHint}</div>}
                        {(skill.sourceLabel || skill.sourceDetail) && (
                          <div className="truncate text-[11px] text-muted-foreground">
                            source: {skill.sourceLabel || skill.source}
                            {skill.sourceDetail ? ` · ${skill.sourceDetail}` : ''}
                          </div>
                        )}
                        {trust?.note && <div className="line-clamp-2 text-[11px] text-muted-foreground">{trust.note}</div>}
                        {skill.aliases.length > 0 && <div className="truncate text-[11px] text-muted-foreground">aliases: {skill.aliases.join(', ')}</div>}
                      </div>
                    </CommandItem>
                  );
                })()
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

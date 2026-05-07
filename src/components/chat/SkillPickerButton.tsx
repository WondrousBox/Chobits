import type { SkillInfo } from '@packages/ai/types';
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
  loading?: boolean;
  onSelect: (nextValue: string) => void;
  onHighlightSkill?: (skillName: string) => void;
  suggestions?: SkillInfo[];
  skills: SkillInfo[];
  value: string;
}

export default function SkillPickerButton({ agentId, highlightedSkillName, loading = false, onHighlightSkill, onSelect, suggestions, skills, value }: SkillPickerButtonProps): JSX.Element | null {
  const enabled = shouldEnableSkillPicker(agentId);
  const autoOpen = enabled && isTypingSlashSkillQuery(value);
  const [manualOpen, setManualOpen] = useState(false);
  const [query, setQuery] = useState('');

  const open = enabled && (manualOpen || autoOpen);

  useEffect(() => {
    if (!enabled) {
      setManualOpen(false);
      return;
    }

    if (autoOpen) {
      setQuery(deriveSkillPickerQuery(value));
    } else if (!manualOpen) {
      setQuery('');
    }
  }, [autoOpen, enabled, manualOpen, value]);

  const pickerItems = useMemo(
    () =>
      (autoOpen && suggestions?.length ? suggestions : skills).map((skill) => ({
        ...skill,
        keywords: [skill.name, ...skill.aliases, skill.description, skill.whenToUse || ''].filter(Boolean)
      })),
    [autoOpen, skills, suggestions]
  );

  if (!enabled) {
    return null;
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setManualOpen(false);
          return;
        }

        setQuery(autoOpen ? deriveSkillPickerQuery(value) : '');
        setManualOpen(true);
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant={open ? 'default' : 'outline'} size="icon" className="h-8 w-8 rounded-full" aria-label="选择 Skill">
              <TbSparkles />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>选择一个 Skill，或直接输入 `/skill-name`</p>
        </TooltipContent>
      </Tooltip>

      <PopoverContent align="start" className="w-96 p-0" onOpenAutoFocus={(event) => event.preventDefault()}>
        <Command shouldFilter>
          <CommandInput placeholder="搜索 skills..." value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{loading ? '正在加载 skills...' : '没有匹配的 skill'}</CommandEmpty>
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
                        setManualOpen(false);
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

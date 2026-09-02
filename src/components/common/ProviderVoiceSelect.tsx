import type { ProviderVoiceGroup, ProviderVoiceOption } from '@packages/ai/providers/voice-catalogs';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface ProviderVoiceSelectProps {
  value?: string;
  groups?: ProviderVoiceGroup[];
  onChange: (voiceId: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
}

type VoiceSearchResult = {
  group: ProviderVoiceGroup;
  voice: ProviderVoiceOption;
};

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function voiceMatchesQuery(voice: ProviderVoiceOption, group: ProviderVoiceGroup, query: string): boolean {
  const haystack = [voice.id, voice.label, voice.language, group.label, group.id, ...(voice.keywords || [])].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(query);
}

function findSelectedVoice(groups: ProviderVoiceGroup[], value?: string): VoiceSearchResult | undefined {
  if (!value) return undefined;
  for (const group of groups) {
    const voice = group.voices.find((item) => item.id === value);
    if (voice) return { group, voice };
  }
  return undefined;
}

export default function ProviderVoiceSelect({
  value,
  groups = [],
  onChange,
  placeholder = '选择音色',
  searchPlaceholder = '搜索音色名称或 voiceId...',
  className,
  disabled = false
}: ProviderVoiceSelectProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const selected = useMemo(() => findSelectedVoice(groups, value), [groups, value]);
  const searchResults = useMemo(() => {
    const query = normalizeSearchText(searchQuery);
    if (!query) return [];

    const results: VoiceSearchResult[] = [];
    for (const group of groups) {
      for (const voice of group.voices) {
        if (voiceMatchesQuery(voice, group, query)) {
          results.push({ group, voice });
        }
      }
    }
    return results;
  }, [groups, searchQuery]);

  const handleSelect = (voiceId: string): void => {
    onChange(voiceId);
    setIsOpen(false);
    setSearchQuery('');
  };

  const displayLabel = selected?.voice.label || value || placeholder;
  const displayDetail = selected ? selected.voice.id : value && value !== displayLabel ? value : undefined;

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(nextOpen) => {
        setIsOpen(nextOpen);
        if (!nextOpen) setSearchQuery('');
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn('flex h-9 w-full items-center justify-between gap-2 rounded-md px-3 text-left', className)} disabled={disabled}>
          <span className="min-w-0 flex-1">
            <span className={cn('block truncate text-sm', !value && 'text-muted-foreground')}>{displayLabel}</span>
            {displayDetail && <span className="block truncate text-[10px] leading-3 text-muted-foreground">{displayDetail}</span>}
          </span>
          <ChevronsUpDown className="shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="no-drag pointer-events-auto w-[min(288px,calc(100vw-32px))] p-0">
        <div className="border-b p-2">
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 text-xs"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          />
        </div>

        {groups.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">当前服务商暂无内置音色列表，请手动输入 voiceId。</div>
        ) : searchQuery.trim() ? (
          <div className="max-h-72 overflow-y-auto p-1">
            {searchResults.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">没有匹配的音色</div>
            ) : (
              searchResults.map(({ group, voice }) => (
                <DropdownMenuItem key={`${group.id}:${voice.id}`} onSelect={() => handleSelect(voice.id)}>
                  <Check className={cn('shrink-0', value === voice.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{voice.label}</span>
                    <span className="block truncate text-[10px] leading-3 text-muted-foreground">
                      {group.label} · {voice.id}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))
            )}
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto p-1">
            {groups.map((group) => (
              <DropdownMenuSub key={group.id}>
                <DropdownMenuSubTrigger>
                  <span className="min-w-0 truncate">{group.label}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="no-drag pointer-events-auto max-h-72 min-w-[320px] overflow-y-auto">
                  {group.voices.map((voice) => (
                    <DropdownMenuItem key={voice.id} onSelect={() => handleSelect(voice.id)}>
                      <Check className={cn('shrink-0', value === voice.id ? 'opacity-100' : 'opacity-0')} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{voice.label}</span>
                        <span className="block truncate text-[10px] leading-3 text-muted-foreground">{voice.id}</span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

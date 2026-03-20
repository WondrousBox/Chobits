import { useCallback, useMemo, useState } from 'react';
import { TbSettings } from 'react-icons/tb';

import TintableSvg from '@/components/common/TintableSvg';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';

import type { PresetRow, ProviderRow } from '../hooks/useProvidersPresets';
import { useProvidersPresets } from '../hooks/useProvidersPresets';

export interface ServicePresetSelectProps {
  providerId?: string;
  presetId?: string;
  onChange: (providerId: string, presetId: string) => void;
  className?: string;
  buttonVariant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive';
  buttonSize?: 'default' | 'sm' | 'lg' | 'icon';
  placeholder?: string;
  searchEnabled?: boolean;
  orderPresets?: (presets: PresetRow[], providerId: string) => PresetRow[];
  providerFilter?: (provider: ProviderRow) => boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Reusable dropdown to select a provider + preset pair.
 * Data is sourced from useProvidersPresets(); ordering can be customized via orderPresets.
 */
export default function ServicePresetSelect(props: ServicePresetSelectProps): JSX.Element {
  const {
    providerId,
    presetId,
    onChange,
    className,
    buttonVariant = 'outline',
    buttonSize = 'sm',
    placeholder = '选择服务商 · 预设',
    searchEnabled = true,
    orderPresets,
    providerFilter,
    onOpenChange
  } = props;

  const { providers, presetsMap, getPresets } = useProvidersPresets();
  const [query, setQuery] = useState('');
  const visibleProviders = useMemo(() => {
    if (!providerFilter) return providers;
    return providers.filter((provider) => providerFilter(provider));
  }, [providerFilter, providers]);

  const currentProvider = useMemo(() => providers.find((provider) => provider.id === providerId), [providers, providerId]);
  const currentPresets = useMemo(() => (providerId ? presetsMap[providerId] || [] : []), [presetsMap, providerId]);
  const currentPreset = useMemo(() => currentPresets.find((preset) => preset.id === presetId), [currentPresets, presetId]);
  const resolveOrderedPresets = useCallback(
    (pid: string): PresetRow[] => {
      const presets = presetsMap[pid] || [];
      if (orderPresets) return orderPresets(presets, pid);
      return getPresets(pid);
    },
    [getPresets, orderPresets, presetsMap]
  );

  const displayLabel = (() => {
    if (!providerId || !presetId) return <span className="truncate text-left text-xs text-muted-foreground">{placeholder}</span>;
    const icon = currentProvider?.schema?.icon as string | undefined;
    const presetLabel = currentPreset?.name || presetId;
    if (icon) {
      return (
        <span className="flex items-center gap-2 truncate text-left text-xs text-muted-foreground">
          <TintableSvg src={icon} className="w-4 h-4" alt={currentProvider?.label || providerId} />
          <span className="truncate">{presetLabel}</span>
        </span>
      );
    }
    const providerLabel = currentProvider?.label || providerId || '服务商';
    return (
      <span className="truncate text-left text-xs text-muted-foreground">
        {providerLabel} · {presetLabel}
      </span>
    );
  })();

  const trimmed = query.trim().toLowerCase();
  const filteredResults =
    searchEnabled && trimmed
      ? visibleProviders.flatMap((provider: ProviderRow) =>
          resolveOrderedPresets(provider.id)
            .filter((preset: PresetRow) => {
              const name = (preset.name || '').toString().toLowerCase();
              const id = (preset.id || '').toString().toLowerCase();
              return name.includes(trimmed) || id.includes(trimmed);
            })
            .map((preset: PresetRow) => ({ preset, provider }))
        )
      : [];

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant={buttonVariant} size={buttonSize} className={`rounded-full ${className || ''}`}>
          {displayLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-[260px] no-drag">
        {searchEnabled && (
          <div className="p-2">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索预设..." className="h-8 text-xs" />
          </div>
        )}
        {searchEnabled && trimmed ? (
          <div className="max-h-60 overflow-auto">
            {filteredResults.length === 0 ? (
              <div className="px-2 pb-2 text-xs text-muted-foreground">未找到匹配预设</div>
            ) : (
              filteredResults.map(({ preset, provider }) => (
                <DropdownMenuItem key={`${provider.id}:${preset.id}`} onSelect={() => onChange(provider.id, preset.id)}>
                  <span className="truncate">{preset.name || preset.id}</span>
                  <span className="ml-2 text-muted-foreground text-xs">@{provider.label}</span>
                </DropdownMenuItem>
              ))
            )}
          </div>
        ) : (
          visibleProviders.map((provider) => {
            const presets = resolveOrderedPresets(provider.id);
            return (
              <DropdownMenuSub key={provider.id}>
                <DropdownMenuSubTrigger className="no-drag">
                  <span className="flex items-center gap-2">
                    {provider?.schema?.icon && <TintableSvg src={provider.schema.icon} className="w-4 h-4" alt={provider.label} />}
                    <span>{provider.label}</span>
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="no-drag">
                  {presets.length === 0 && <DropdownMenuItem disabled>暂无预设</DropdownMenuItem>}
                  {presets.length > 0 &&
                    presets.map((preset) => (
                      <DropdownMenuItem key={preset.id} onSelect={() => onChange(provider.id, preset.id)}>
                        {preset.name || preset.id}
                      </DropdownMenuItem>
                    ))}
                  <DropdownMenuItem
                    className="justify-center"
                    onSelect={async () => {
                      try {
                        await window.YUA.window['window:open']('settings' as any, { category: 'ai', aiProviderId: provider.id });
                      } catch {
                        /* ignore */
                      }
                    }}
                  >
                    <TbSettings />
                    添加/管理预设
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            );
          })
        )}
        {!searchEnabled && visibleProviders.length === 0 && <div className="px-2 py-2 text-xs text-muted-foreground">暂无可用预设</div>}
        {searchEnabled && !trimmed && visibleProviders.length === 0 && <div className="px-2 py-2 text-xs text-muted-foreground">暂无可用预设</div>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

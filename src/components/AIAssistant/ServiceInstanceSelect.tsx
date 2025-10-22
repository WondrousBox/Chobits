import React, { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import TintableSvg from '@/components/common/TintableSvg'
import { InstanceRow, ProviderRow, useProvidersInstances } from '@/components/AIAssistant/hooks/useProvidersInstances'
import { TbSettings } from 'react-icons/tb'

export interface ServiceInstanceSelectProps {
  providerId?: string
  instanceId?: string
  onChange: (providerId: string, instanceId: string) => void
  className?: string
  buttonVariant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive'
  buttonSize?: 'default' | 'sm' | 'lg' | 'icon'
  placeholder?: string
  searchEnabled?: boolean
  orderInstances?: (instances: InstanceRow[], providerId: string) => InstanceRow[]
  // Notify open state changes (useful to adjust window size when menu opens in small windows)
  onOpenChange?: (open: boolean) => void
}

/**
 * Reusable dropdown to select (provider, instance) pair.
 * Data is sourced from useProvidersInstances(); ordering can be customized via orderInstances.
 */
export default function ServiceInstanceSelect(props: ServiceInstanceSelectProps) {
  const {
    providerId,
    instanceId,
    onChange,
    className,
    buttonVariant = 'outline',
    buttonSize = 'sm',
    placeholder = '选择 服务商 · 实例',
    searchEnabled = true,
    orderInstances,
    onOpenChange,
  } = props

  const { providers, instancesMap, getInstances } = useProvidersInstances()
  const [query, setQuery] = useState('')

  const currentProvider = useMemo(() => providers.find(p => p.id === providerId), [providers, providerId])
  const currentInstances = useMemo(() => (providerId ? instancesMap[providerId] || [] : []), [instancesMap, providerId])
  const currentInstance = useMemo(() => currentInstances.find(it => it.id === instanceId), [currentInstances, instanceId])

  const displayLabel = (() => {
    if (!providerId || !instanceId) return <span className="truncate text-left text-xs text-muted-foreground">{placeholder}</span>
    const icon = currentProvider?.schema?.icon as string | undefined
    const instanceLabel = currentInstance?.name || instanceId
    if (icon) {
      return (
        <span className="flex items-center gap-2 truncate text-left text-xs text-muted-foreground">
          <TintableSvg src={icon} className="w-4 h-4" alt={currentProvider?.label || providerId} />
          <span className="truncate">{instanceLabel}</span>
        </span>
      )
    }
    const providerLabel = currentProvider?.label || providerId || '服务商'
    return <span className="truncate text-left text-xs text-muted-foreground">{providerLabel} · {instanceLabel}</span>
  })()

  const trimmed = query.trim().toLowerCase()
  const filteredResults = (searchEnabled && trimmed)
    ? providers.flatMap((p: ProviderRow) =>
      (orderInstances ? orderInstances(instancesMap[p.id] || [], p.id) : getInstances(p.id))
        .filter((it: InstanceRow) => {
          const name = (it.name || '').toString().toLowerCase()
          const id = (it.id || '').toString().toLowerCase()
          return name.includes(trimmed) || id.includes(trimmed)
        })
        .map((it: InstanceRow) => ({ p, it }))
    )
    : []

  return (
    <DropdownMenu onOpenChange={onOpenChange}
    >
      <DropdownMenuTrigger asChild>
        <Button variant={buttonVariant} size={buttonSize} className={`rounded-full ${className || ''}`}>
          {displayLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-[260px]">
        {searchEnabled && (
          <div className="p-2">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索实例..." className="h-8 text-xs" />
          </div>
        )}
        {searchEnabled && trimmed ? (
          <div className="max-h-60 overflow-auto">
            {filteredResults.length === 0 ? (
              <div className="px-2 pb-2 text-xs text-muted-foreground">未找到匹配实例</div>
            ) : (
              filteredResults.map(({ p, it }) => (
                <DropdownMenuItem
                  key={`${p.id}:${it.id}`}
                  onSelect={() => onChange(p.id, it.id)}
                >
                  <span className="truncate">{it.name || it.id}</span>
                  <span className="ml-2 text-muted-foreground text-xs">@{p.label}</span>
                </DropdownMenuItem>
              ))
            )}
          </div>
        ) : (
          providers.map((p) => {
            const list = orderInstances ? orderInstances(instancesMap[p.id] || [], p.id) : getInstances(p.id)
            return (
              <DropdownMenuSub key={p.id}>
                <DropdownMenuSubTrigger>
                  <span className="flex items-center gap-2">
                    {p?.schema?.icon && (
                      <TintableSvg src={p.schema.icon} className="w-4 h-4" alt={p.label} />
                    )}
                    <span>{p.label}</span>
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {list.length > 0 && (
                    list.map((it) => (
                      <DropdownMenuItem key={it.id} onSelect={() => onChange(p.id, it.id)}>
                        {it.name || it.id}
                      </DropdownMenuItem>
                    ))
                  )}
                  <DropdownMenuItem
                    className='justify-center'
                    onSelect={async () => {
                      try { await (window as any).YUA.window.openWindow('settings' as any, { category: 'ai', aiProviderId: p.id }) } catch { /* ignore */ }
                    }}
                  >
                    <TbSettings />添加/管理配置
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

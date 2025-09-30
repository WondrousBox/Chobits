import React, { useEffect, useMemo, useState } from 'react'
import { ResourceItem } from '@/types'

import { SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
} from "@/components/ui/sidebar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import ExplorerGrid from './components/ExplorerGrid'
import { Button } from '@/components/ui/button'
import { TbHome, TbPhoto, TbVideo, TbMusic, TbFileText, TbLink, TbFile, TbFileDescription, TbDots } from 'react-icons/tb'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const ResourcePage: React.FC = () => {
  const [list, setList] = useState<ResourceItem[]>([])
  const [workspaces, setWorkspaces] = useState<any[]>([])
  const [wsFilter, setWsFilter] = useState<string>('') // empty means all
  const [typeFilter, setTypeFilter] = useState<string>('') // empty means all types

  const typeOptions: { key: string; label: string; icon: React.ComponentType<{ className?: string }>; }[] = [
    { key: '', label: '全部', icon: TbHome },
    { key: 'image', label: '图片', icon: TbPhoto },
    { key: 'video', label: '视频', icon: TbVideo },
    { key: 'audio', label: '音频', icon: TbMusic },
    { key: 'text', label: '文本', icon: TbFileText },
    { key: 'link', label: '链接', icon: TbLink },
    { key: 'file', label: '文件', icon: TbFile },
    { key: 'document', label: '文档', icon: TbFileDescription },
    { key: 'other', label: '其他', icon: TbDots },
  ]

  const visibleTypes = useMemo(() => {
    const rows = list.filter((r: any) => !wsFilter || r.workspaceId === wsFilter)
    const set = new Set<string>()
    for (const r of rows) {
      if (r?.type) set.add(r.type)
    }
    return set
  }, [list, wsFilter])

  const load = async () => {
    try {
      const rows = await window.YUA.resource['listResource']()
      setList(rows || [])
    } catch (e) { console.warn('load resources failed', e) }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    let mounted = true
      ; (async () => {
        const ws = await window.YUA.workspace['workspace:list']({ filter: { deletedAt: 0 }, limit: 100, offset: 0 })
        if (mounted) {
          setWorkspaces(ws || [])
          try {
            const defaultId = Array.isArray(ws) ? (ws.find((w: any) => w.isDefault === 1)?.id) : undefined
            if (!wsFilter && defaultId) setWsFilter(defaultId)
          } catch { /* noop */ }
        }
      })()
    return () => { mounted = false }
  }, [])

  const filtered = useMemo(() => {
    return list.filter((r: any) => {
      if (wsFilter && r.workspaceId !== wsFilter) return false
      if (typeFilter && r.type !== typeFilter) return false
      return true
    })
  }, [list, wsFilter, typeFilter])

  const handleDelete = async (id: string) => {
    try {
      await window.YUA.resource.deleteResource({ id })
      setList(prev => prev.filter(i => i.id !== id))
    } catch (e) { console.warn('delete resource failed', e) }
  }

  return (<SidebarProvider className='h-full'>
    <Sidebar>
      <SidebarHeader>123132123
        <SidebarTrigger />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Application</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem key="1">
                <SidebarMenuButton asChild>
                  <Button>1231</Button>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>21312313</SidebarFooter>
    </Sidebar>
    <div className='bg-background text-foreground flex-1 h-full'>
      <div className='flex h-full'>
        <div className='w-12 h-full flex flex-col items-center box-border bg-muted space-y-1'>
          <SidebarTrigger />
          <TooltipProvider delayDuration={0}>
            {typeOptions
              .filter(({ key }) => key === '' || visibleTypes.has(key))
              .map(({ key, label, icon: Icon }) => (
              <Tooltip key={key || 'all'}>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={label}
                    size={"icon"}
                    variant={typeFilter === key ? "default" : "outline"}
                    onClick={() => setTypeFilter(prev => (prev === key ? '' : key))}
                  >
                    <Icon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <span>{label}</span>
                </TooltipContent>
              </Tooltip>
            ))}
          </TooltipProvider>
        </div>
        <div className='flex-1 h-full bg-secondary'>
          <div className='flex items-center justify-between h-12 px-2'>
            <div>资源管理 <span className='text-xs text-muted-foreground ml-2'>共 {filtered.length}/{list.length} 个资源</span> </div>
            <div className='flex items-center gap-2'>
              <Select value={wsFilter} onValueChange={setWsFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="工作空间" />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.map(w => <SelectItem key={w.id} value={w.id}>{w.name}{w.isDefault === 1 ? '（默认）' : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className='w-full box-border overflow-y-auto' style={{ height: 'calc(100% - 48px)' }}>
            <div className='flex h-full gap-2'>
              <div className='flex-1 h-full overflow-y-auto'>
                <ExplorerGrid
                  items={filtered}
                  onDelete={handleDelete}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

  </SidebarProvider>
  )
}

export default ResourcePage

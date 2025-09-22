import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import React, { useEffect, useMemo, useState } from 'react'
import { TbCheck, TbDots, TbDotsVertical, TbFolderOpen, TbPlus, TbRefresh, TbScanEye, TbTrash, TbStarFilled } from 'react-icons/tb'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type Workspace = any

const WorkspacePage: React.FC = () => {
  const [list, setList] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [scanningIds, setScanningIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await (window as any).YUA.workspace['workspace:list']({ filter: { deletedAt: 0 }, limit: 200, offset: 0 })
      setList(rows || [])
    } catch (e: any) {
      setError(e?.message || '加载失败')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const setDefault = async (id: string) => {
    try {
      await (window as any).YUA.workspace['workspace:setDefault']({ id })
      load()
    } catch { }
  }
  const commitRename = async () => {
    if (!editingId) return
    const name = editingName.trim()
    if (!name) { setEditingId(null); return }
    try {
      await (window as any).YUA.workspace['workspace:update']({ id: editingId, patch: { name } })
      setEditingId(null)
      load()
    } catch { }
  }
  const openFolder = async (id: string) => { try { await (window as any).YUA.workspace['workspace:open']({ id }) } catch { } }
  const scan = async (id: string) => {
    if (scanningIds.has(id)) return
    setScanningIds(prev => new Set([...prev, id]))
    try { await (window as any).YUA.workspace['workspace:scanStats']({ id }) } catch { }
    finally {
      setScanningIds(prev => { const n = new Set(prev); n.delete(id); return n })
      load()
    }
  }
  const scanAll = async () => {
    const ids = filtered.map(ws => ws.id)
    for (const id of ids) { await scan(id) }
  }
  const remove = async (id: string) => {
    const ws = list.find(w => w.id === id)
    const name = ws?.name || '未命名'
    if (!confirm(`确认删除工作空间: "${name}" ?\n此操作为软删除，可在数据库中恢复。`)) return
    try { await (window as any).YUA.workspace['workspace:delete']({ id }); load() } catch { }
  }

  function formatSize(bytes?: number) {
    if (bytes == null) return '-'
    if (bytes < 1024) return bytes + ' B'
    const units = ['KB', 'MB', 'GB', 'TB']
    let v = bytes / 1024
    let i = 0
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
    return v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2) + ' ' + units[i]
  }
  function formatTime(ts?: number) {
    if (!ts) return '-'
    const d = new Date(ts)
    return d.toLocaleString()
  }

  const filtered = useMemo(() => {
    let rows = list.slice().sort((a: any, b: any) => (b.isDefault || 0) - (a.isDefault || 0) || (a.name || '').localeCompare(b.name || ''))
    if (!search.trim()) return rows
    const q = search.trim().toLowerCase()
    return rows.filter(ws => (ws.name || '').toLowerCase().includes(q) || (ws.rootPath || '').toLowerCase().includes(q))
  }, [list, search])

  // 脱敏用户路径: 将 /Users/<username> 前缀替换为 ~
  const maskPath = (p?: string) => {
    if (!p) return '-'
    if (p.startsWith('~')) return p
    // 支持的前缀形式：
    // macOS: /Users/username
    // Linux: /home/username
    // Windows: C:\\Users\\username 或 C:/Users/username
    const patterns = [
      /^[A-Za-z]:\\\\Users\\\\[^\\]+/,       // Windows 反斜杠
      /^[A-Za-z]:\/Users\/[^/]+/,            // Windows 使用正斜杠形式
      /^\/Users\/[^/]+/,                     // macOS
      /^\/home\/[^/]+/,                      // Linux
    ]
    for (const r of patterns) {
      const m = p.match(r)
      if (m) {
        return '~' + p.slice(m[0].length)
      }
    }
    return p
  }

  return (
    <div className='h-full w-full flex flex-col bg-background text-foreground'>
      <div className='drag-region flex items-center justify-between px-2 py-2 border-b'>
        <div className='font-medium pl-20'>工作空间管理 <span className='ml-2 text-xs text-muted-foreground'>{list.length} 个</span></div>
        <div className='no-drag flex items-center gap-2'>
          <Input
            className='w-48 h-8'
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder='搜索 名称/路径...'
          />
          <Button size="sm" variant={"outline"} onClick={scanAll} disabled={filtered.length === 0 || scanningIds.size > 0}><TbScanEye /> {scanningIds.size > 0 ? '扫描中...' : '全部扫描'}</Button>
          <Button size="icon" className='w-8 h-8' variant={"outline"} onClick={load} disabled={loading}><TbRefresh /></Button>
          <Button size="sm" onClick={() => (window as any).YUA.window.openWindow('workspaceWizard')}><TbPlus /> 新建</Button>
        </div>
      </div>
      <div className='flex-1 overflow-auto p-4 space-y-3'>
        {error && <div className='text-red-500 text-sm'>{error}</div>}
        {filtered.map(ws => (
          <div key={ws.id} className='p-3 rounded border bg-card text-card-foreground flex flex-col gap-2 transition-shadow hover:shadow-md relative'>
            {ws.isDefault === 1 && (
              <div className='absolute top-0 left-0 w-8 h-8'>
                <TbStarFilled className='absolute top-1 left-1 w-4 h-4 text-primary drop-shadow' />
              </div>
            )}
            <div className='flex items-center justify-between'>
              <div className='font-semibold text-sm flex items-center gap-2'>
                {editingId === ws.id ? (
                  <Input
                    autoFocus
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setEditingId(null) } }}
                    className='h-8'
                  />
                ) : (
                  <span className='cursor-pointer' onClick={() => { setEditingId(ws.id); setEditingName(ws.name || '') }}>{ws.name}</span>
                )}
                {/* 默认标记已移动为左上角星标 */}
              </div>
              <div className='flex items-center gap-2'>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" className='w-8 h-8' variant={"outline"}><TbDotsVertical /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {ws.isDefault !== 1 && (
                      <DropdownMenuItem onSelect={() => setDefault(ws.id)}>
                        <TbCheck /> 设为默认
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => openFolder(ws.id)}>
                      <TbFolderOpen /> 打开
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={scanningIds.has(ws.id)}
                      onSelect={() => { if (!scanningIds.has(ws.id)) scan(ws.id) }}
                    >
                      <TbScanEye /> {scanningIds.has(ws.id) ? '扫描中...' : '扫描'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => remove(ws.id)}>
                      <TbTrash /> 删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div className='text-xs opacity-80 break-all'>{maskPath(ws.rootPath)}</div>
            <div className='text-xs flex flex-wrap gap-4 opacity-70'>
              <span>文件数: {ws.fileCount ?? '-'}</span>
              <span>容量: {formatSize(ws.sizeBytes)}</span>
              {ws.lastScanAt && <span>上次扫描: {formatTime(ws.lastScanAt)}</span>}
            </div>
            {ws.description && <div className='text-xs opacity-70'>{ws.description}</div>}
          </div>
        ))}
        {(!loading && filtered.length === 0) && <div className='text-sm text-muted-foreground'>未找到匹配工作空间。{list.length === 0 ? '尚未创建任何工作空间，点击右上角 新建/导入。' : ''}</div>}
      </div>
    </div>
  )
}

export default WorkspacePage


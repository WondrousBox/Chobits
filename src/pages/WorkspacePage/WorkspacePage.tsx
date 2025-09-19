import React, { useEffect, useMemo, useState } from 'react'

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
    const revealFolder = async (id: string) => { try { await (window as any).YUA.workspace['workspace:reveal']({ id }) } catch { } }
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

    return (
        <div className='h-full w-full flex flex-col bg-background text-foreground'>
            <div className='flex items-center justify-between px-4 py-3 border-b'>
                <div className='font-medium'>工作空间管理 <span className='ml-2 text-xs text-muted-foreground'>{list.length} 个</span></div>
                <div className='flex items-center gap-2'>
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder='搜索 名称/路径...'
                        className='px-2 py-1 rounded border text-sm bg-background/60 backdrop-blur-sm'
                        style={{ width: 180 }}
                    />
                    <button className='px-3 py-1 rounded border text-sm' onClick={scanAll} disabled={filtered.length === 0 || scanningIds.size > 0}>{scanningIds.size > 0 ? '扫描中...' : '全部扫描'}</button>
                    <button className='px-3 py-1 rounded bg-primary text-primary-foreground text-sm' onClick={load} disabled={loading}>{loading ? '加载中...' : '刷新'}</button>
                    <button className='px-3 py-1 rounded border text-sm' onClick={() => (window as any).YUA.window.openWindow('workspaceWizard')}>新建/导入</button>
                </div>
            </div>
            <div className='flex-1 overflow-auto p-4 space-y-3'>
                {error && <div className='text-red-500 text-sm'>{error}</div>}
                {filtered.map(ws => (
                    <div key={ws.id} className='p-3 rounded border bg-card text-card-foreground flex flex-col gap-2 transition-shadow hover:shadow-md'>
                        <div className='flex items-center justify-between'>
                            <div className='font-semibold text-sm flex items-center gap-2'>
                                {editingId === ws.id ? (
                                    <input
                                        autoFocus
                                        value={editingName}
                                        onChange={e => setEditingName(e.target.value)}
                                        onBlur={commitRename}
                                        onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setEditingId(null) } }}
                                        className='px-1 py-0.5 text-sm border rounded bg-background'
                                        style={{ width: 140 }}
                                    />
                                ) : (
                                    <span className='cursor-text hover:underline' onClick={() => { setEditingId(ws.id); setEditingName(ws.name || '') }}>{ws.name}</span>
                                )}
                                {ws.isDefault === 1 && <span className='text-xs px-1.5 py-0.5 rounded bg-primary/15 text-primary'>默认</span>}
                            </div>
                            <div className='flex items-center gap-2'>
                                {ws.isDefault !== 1 && <button className='text-xs underline' onClick={() => setDefault(ws.id)}>设为默认</button>}
                                <button className='text-xs underline' onClick={() => openFolder(ws.id)}>打开</button>
                                <button className='text-xs underline' onClick={() => revealFolder(ws.id)}>显示</button>
                                <button className='text-xs underline disabled:opacity-40' disabled={scanningIds.has(ws.id)} onClick={() => scan(ws.id)}>{scanningIds.has(ws.id) ? '扫描中...' : '扫描'}</button>
                                <button className='text-xs underline text-red-500' onClick={() => remove(ws.id)}>删除</button>
                            </div>
                        </div>
                        <div className='text-xs opacity-80 break-all'>{ws.rootPath}</div>
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


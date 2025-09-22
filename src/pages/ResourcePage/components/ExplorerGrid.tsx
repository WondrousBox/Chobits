import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { useState as useReactState } from 'react'
import { TbTrash } from 'react-icons/tb'
import { ResourceItem } from '@/types'
import ResourceGalleryItem from './ResourceGalleryItem'

export interface ExplorerGridProps {
  items: ResourceItem[]
  onDelete?: (id: string) => void
  onDeleteMany?: (ids: string[]) => void
}

type Point = { x: number; y: number }
type Rect = { left: number; top: number; right: number; bottom: number }

function rectsIntersect(a: Rect, b: Rect) {
  return !(a.left > b.right || a.right < b.left || a.top > b.bottom || a.bottom < b.top)
}

export const ExplorerGrid: React.FC<ExplorerGridProps> = ({ items, onDelete, onDeleteMany }) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null)

  const [dragStart, setDragStart] = useState<Point | null>(null)
  const [dragEnd, setDragEnd] = useState<Point | null>(null)
  const isDragging = dragStart && dragEnd

  const idToIndex = useMemo(() => {
    const m = new Map<string, number>()
    items.forEach((it, idx) => m.set(it.id, idx))
    return m
  }, [items])

  const selectionRect: Rect | null = useMemo(() => {
    if (!dragStart || !dragEnd) return null
    const left = Math.min(dragStart.x, dragEnd.x)
    const top = Math.min(dragStart.y, dragEnd.y)
    const right = Math.max(dragStart.x, dragEnd.x)
    const bottom = Math.max(dragStart.y, dragEnd.y)
    return { left, top, right, bottom }
  }, [dragStart, dragEnd])

  const updateItemRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) itemRefs.current.set(id, el)
    else itemRefs.current.delete(id)
  }, [])

  const clearSelection = useCallback(() => setSelected(new Set()), [])

  const setSelectionToRange = useCallback((startIdx: number, endIdx: number, additive = false) => {
    const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx]
    const newSel = new Set(additive ? Array.from(selected) : [])
    for (let i = lo; i <= hi; i++) newSel.add(items[i].id)
    setSelected(newSel)
  }, [items, selected])

  const handleItemClick = useCallback((e: React.MouseEvent, id: string, index: number) => {
    e.stopPropagation()
    if (e.shiftKey && anchorIndex !== null) {
      setSelectionToRange(anchorIndex, index, e.metaKey || e.ctrlKey)
    } else if (e.metaKey || e.ctrlKey) {
      const next = new Set(selected)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      setSelected(next)
      setAnchorIndex(index)
    } else {
      setSelected(new Set([id]))
      setAnchorIndex(index)
    }
  }, [anchorIndex, selected, setSelectionToRange])

  const handleBackgroundPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    const isOnItem = target.closest('[data-explorer-item]')
    if (isOnItem) return
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setDragStart({ x, y })
    setDragEnd({ x, y })
    if (!(e.metaKey || e.ctrlKey)) clearSelection()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [clearSelection])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStart) return
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setDragEnd({ x, y })

    const selRect = {
      left: Math.min(dragStart.x, x) + rect.left,
      top: Math.min(dragStart.y, y) + rect.top,
      right: Math.max(dragStart.x, x) + rect.left,
      bottom: Math.max(dragStart.y, y) + rect.top,
    }

    const base = e.metaKey || e.ctrlKey ? new Set(selected) : new Set<string>()
    itemRefs.current.forEach((el, id) => {
      const r = el.getBoundingClientRect()
      if (rectsIntersect(selRect, { left: r.left, top: r.top, right: r.right, bottom: r.bottom }))
        base.add(id)
    })
    setSelected(base)
  }, [dragStart, selected])

  const endDrag = useCallback((e?: React.PointerEvent) => {
    if (dragStart) {
      setDragStart(null)
      setDragEnd(null)
      if (e) (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    }
  }, [dragStart])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    const itemEl = target.closest('[data-explorer-item]') as HTMLElement | null
    if (!itemEl) return
    const id = itemEl.dataset.id!
    if (!selected.has(id)) {
      setSelected(new Set([id]))
      const idx = idToIndex.get(id) ?? null
      setAnchorIndex(idx)
    }
  }, [selected, idToIndex])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'a' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      setSelected(new Set(items.map(i => i.id)))
    }
    if (e.key === 'Escape') {
      clearSelection()
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selected.size > 0) {
        const ids = Array.from(selected)
        if (onDeleteMany) onDeleteMany(ids)
        else ids.forEach(id => onDelete?.(id))
      }
    }
  }, [items, selected, onDelete, onDeleteMany, clearSelection])

  useEffect(() => {
    // If items change (e.g., deleted), drop selections that no longer exist
    const idSet = new Set(items.map(i => i.id))
    setSelected(prev => new Set(Array.from(prev).filter(id => idSet.has(id))))
  }, [items])

  const selectedCount = selected.size
  const firstSelected = selectedCount > 0 ? Array.from(selected)[0] : undefined
  const [renaming, setRenaming] = useReactState(false)
  const [renameValue, setRenameValue] = useReactState('')

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={containerRef}
          className='relative grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5 p-2 outline-none'
          tabIndex={0}
          onPointerDown={handleBackgroundPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onKeyDown={handleKeyDown}
          onContextMenu={handleContextMenu}
        >
          {items.map((item, idx) => {
            const isSelected = selected.has(item.id)
            return (
              <ResourceGalleryItem
                key={item.id}
                item={item}
                selected={isSelected}
                innerRef={updateItemRef(item.id)}
                onClick={(e)=> handleItemClick(e, item.id, idx)}
              />
            )
          })}

          {isDragging && selectionRect && (
            <div
              className='absolute pointer-events-none border-2 border-primary/60 bg-primary/10 rounded'
              style={{
                left: selectionRect.left,
                top: selectionRect.top,
                width: selectionRect.right - selectionRect.left,
                height: selectionRect.bottom - selectionRect.top,
              }}
            />
          )}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className='min-w-[220px]'>
        <div className='px-2 py-1.5 text-sm text-muted-foreground'>已选择 {selectedCount} 项</div>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={async () => {
            // Move to workspace
            const ws = await window.YUA.workspace['workspace:list']({ filter: { deletedAt: 0 }, limit: 100, offset: 0 })
            if (!ws?.length) { alert('请先在设置中创建工作空间'); return }
            const names = ws.map((w:any, i:number)=> `${i+1}. ${w.name}${w.isDefault===1?'(默认)':''}`).join('\n')
            const pick = prompt(`移动到哪个工作空间?\n${names}`)
            if (!pick) return
            const idx = Number(pick) - 1
            if (isNaN(idx) || idx < 0 || idx >= ws.length) return
            const target = ws[idx]
            const ids = Array.from(selected)
            await window.YUA.resource['moveResourcesToWorkspace']?.({ ids, workspaceId: target.id })
          }}
        >移动到工作空间…</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={async () => {
            if (!firstSelected) return
            await window.YUA.resource.openResource({ id: firstSelected })
          }}
        >打开</ContextMenuItem>
        <ContextMenuItem
          onSelect={async () => {
            if (!firstSelected) return
            await window.YUA.resource.revealResource({ id: firstSelected })
          }}
        >在 Finder 中显示</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            if (!firstSelected) return
            const item = items.find(i => i.id === firstSelected)
            setRenameValue(item?.title || item?.filePath || item?.url || '')
            setRenaming(true)
            // Prompt-based simple rename for now
            const val = window.prompt('重命名为：', renameValue || '')
            setRenaming(false)
            if (val && val.trim()) {
              window.YUA.resource.renameResource({ id: firstSelected, newName: val.trim(), renameFile: true })
            }
          }}
        >重命名…</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className='flex items-center gap-2'
          onSelect={() => {
            const ids = Array.from(selected)
            if (ids.length === 0) return
            if (window?.YUA?.resource?.deleteResources) {
              window.YUA.resource.deleteResources({ ids })
            } else if (onDeleteMany) {
              onDeleteMany(ids)
            } else {
              ids.forEach(id => onDelete?.(id))
            }
          }}
        >
          <TbTrash /> 删除
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => setSelected(new Set(items.map(i => i.id)))}
        >全选</ContextMenuItem>
        <ContextMenuItem
          onSelect={() => clearSelection()}
        >取消选择</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

export default ExplorerGrid

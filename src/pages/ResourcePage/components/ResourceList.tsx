import React from 'react'
import { Button } from '@/components/ui/button'
import { TbTrash } from 'react-icons/tb'
import { ResourceItem } from '@/types'

export interface ResourceListItemProps {
  item: ResourceItem
  onDelete?: (id: string) => void
}

export const ResourceListItem: React.FC<ResourceListItemProps> = ({ item, onDelete }) => {
  return (
    <div className='p-2 flex items-center justify-between'>
      <div className='min-w-0'>
        <div className='font-medium truncate'>{item.title || item.filePath || item.url || item.id}</div>
        <div className='text-sm text-muted-foreground'>
          类型: {item.type} · 创建时间: {item.createdAt ? new Date(item.createdAt).toLocaleString() : '-'}
        </div>
      </div>
      <div className='flex items-center gap-2 shrink-0'>
        <Button variant={'destructive'} size={'sm'} onClick={() => onDelete?.(item.id)}><TbTrash />删除</Button>
      </div>
    </div>
  )
}

export const ResourceCard: React.FC<ResourceListItemProps> = ({ item, onDelete }) => {
  return (
    <div className='border border-border rounded p-3 flex flex-col gap-2'>
      <div className='font-medium truncate'>{item.title || item.filePath || item.url || item.id}</div>
      <div className='text-sm text-muted-foreground'>
        类型: {item.type} · 创建时间: {item.createdAt ? new Date(item.createdAt).toLocaleString() : '-'}
      </div>
      <div className='mt-auto flex items-center justify-end'>
        <Button variant={'destructive'} size={'sm'} onClick={() => onDelete?.(item.id)}><TbTrash />删除</Button>
      </div>
    </div>
  )
}

export interface ResourceListProps {
  items: ResourceItem[]
  onDelete?: (id: string) => void
  variant?: 'list' | 'card'
}

const ResourceList: React.FC<ResourceListProps> = ({ items, onDelete, variant = 'list' }) => {
  if (variant === 'card') {
    return (
      items.map(item => (
        <ResourceCard key={item.id} item={item} onDelete={onDelete} />
      ))
    )
  }

  return (
    <div>
      {items.map(item => (
        <ResourceListItem key={item.id} item={item} onDelete={onDelete} />
      ))}
    </div>
  )
}

export default ResourceList

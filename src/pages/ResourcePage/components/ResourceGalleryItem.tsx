import React from 'react'
import { ResourceItem } from '@/types'

interface GalleryItemProps {
  item: ResourceItem
  selected: boolean
  onClick: (e: React.MouseEvent, item: ResourceItem) => void
  innerRef?: (el: HTMLDivElement | null) => void
}

// Basic preview: if resource has a filePath with image extension, show <img>. Otherwise show a placeholder.
function isImage(path?: string) {
  if (!path) return false
  return /(png|jpe?g|gif|webp|svg)$/i.test(path)
}

const ResourceGalleryItem: React.FC<GalleryItemProps> = ({ item, selected, onClick, innerRef }) => {
  const title = item.title || item.filePath || item.url || item.id
  const imgSrc = isImage(item.filePath) ? window.YUA?.resource?.getFileUrl?.({ path: item.filePath }) || item.filePath : undefined
  return (
    <div
      ref={innerRef}
      data-explorer-item
      data-id={item.id}
      onClick={(e)=> onClick(e, item)}
      className={`group relative aspect-video w-full overflow-hidden rounded-md border bg-card text-card-foreground shadow-sm transition-all cursor-pointer select-none ${selected ? 'ring-2 ring-primary border-primary/50' : 'hover:shadow-md hover:border-primary/30'} bg-gradient-to-br from-background to-muted`}
    >
      {imgSrc ? (
        <img src={imgSrc} alt={title} className='h-full w-full object-cover' draggable={false} />
      ) : (
        <div className='flex h-full w-full items-center justify-center text-xs text-muted-foreground'>
          {item.type}
        </div>
      )}
      <div className='absolute inset-x-0 bottom-0 z-10 flex flex-col gap-0.5 bg-gradient-to-t from-black/70 via-black/20 to-transparent px-1.5 pb-1 pt-6'>
        <span className='truncate text-[11px] font-medium text-white drop-shadow'>{title}</span>
      </div>
      {selected && (
        <div className='absolute right-2 top-2 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] shadow ring-1 ring-black/20'>✓</div>
      )}
    </div>
  )
}

export default ResourceGalleryItem

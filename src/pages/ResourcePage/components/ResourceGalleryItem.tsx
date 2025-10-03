import React, { useState, useCallback } from 'react'
import { makeResSrc, isImageFile, isVideoFile, isAudioFile } from '@/lib/resourceProtocol'
import { ResourceItem } from '@/types'

interface GalleryItemProps {
  item: ResourceItem
  selected: boolean
  onClick: (e: React.MouseEvent, item: ResourceItem) => void
  innerRef?: (el: HTMLDivElement | null) => void
}

// Basic preview: if resource has a filePath with image extension, show <img>. Otherwise show a placeholder.
// legacy helper compatibility (if some other code imports isImage)
function isImage(path?: string) { return isImageFile(path) }

const ResourceGalleryItem: React.FC<GalleryItemProps> = ({ item, selected, onClick, innerRef }) => {
  const title = item.title || item.filePath || item.url || item.id
  const thumbSrc = (item as any).thumbnailPath ? makeResSrc((item as any).thumbnailPath) : undefined

  // (deprecated modal) replaced by dedicated preview window
  const isAudio = isAudioFile(item.filePath)
  const isImageRes = isImageFile(item.filePath)
  const isVideoRes = isVideoFile(item.filePath)

  const handleClick = useCallback((e: React.MouseEvent) => {
    onClick(e, item)
    if (isAudio || isImageRes || isVideoRes) {
      // 统一调用主进程打开资源预览窗口
      window.YUA.window.openWindow('resourcePreview', {
        current: {
          id: item.id,
          title: item.title,
          type: item.type,
          filePath: item.filePath,
          url: item.url
        },
        // list 与 index 将在上层（ExplorerGrid）增强后传入；这里保持兼容
      })
    }
  }, [onClick, item, isAudio, isImageRes, isVideoRes])

  return (
    <div
      ref={innerRef}
      data-explorer-item
      data-id={item.id}
      onClick={handleClick}
      className={`group relative aspect-video w-full overflow-hidden rounded-md border bg-card text-card-foreground shadow-sm transition-all cursor-pointer select-none ${selected ? 'ring-2 ring-primary border-primary/50' : 'hover:shadow-md hover:border-primary/30'} bg-gradient-to-br from-background to-muted`}
    >
      {(thumbSrc || isImageFile(item.filePath)) && (
        <img src={thumbSrc || (item.filePath ? makeResSrc(item.filePath) : '')} alt={title} className='h-full w-full object-cover' draggable={false} />
      )}
      {isVideoFile(item.filePath) && (
        <video
          src={item.filePath ? makeResSrc(item.filePath) : ''}
          className='h-full w-full object-cover'
          muted
          playsInline
          preload='metadata'
        />
      )}
      {isAudio && (
        <div className='flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-900/70 to-slate-700/40 text-white gap-2 text-[11px]'>
          <span className='inline-flex items-center gap-1 opacity-90'>
            {/* Simple music note icon (unicode) to avoid pulling extra libs */}
            <span aria-hidden='true'>🎵</span>
            <span className='font-medium'>点击预览音频</span>
          </span>
        </div>
      )}
      {!isImageFile(item.filePath) && !isVideoFile(item.filePath) && !isAudioFile(item.filePath) && (
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

import React, { useState, useCallback } from 'react'
import { ResourceItem } from '@/types'
import { TbCopy, TbCheck, TbStar, TbHeart, TbEye, TbEyeOff, TbClock, TbFile, TbExternalLink, TbCalendar, TbUser, TbTag, TbPlayerPlay } from 'react-icons/tb'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { formatFileSize, formatDuration, formatTime, getResourceTypeIcon, getStatusColor, getRatingStars, parseTags, parseCategories } from '@/utils/resourceUtils'

interface ListItemProps {
  item: ResourceItem
  selected: boolean
  onClick: (e: React.MouseEvent, item: ResourceItem) => void
  onToggleFavorite?: (id: string) => void
  onToggleVisibility?: (id: string) => void
}

const ResourceListItem: React.FC<ListItemProps> = ({ 
  item, 
  selected, 
  onClick, 
  onToggleFavorite,
  onToggleVisibility 
}) => {
  const [copied, setCopied] = useState(false)
  const tags = parseTags(item.tags)
  const categories = parseCategories(item.categories)

  const handleSourceClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (item.url) {
      try {
        await navigator.clipboard.writeText(item.url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch (err) {
        console.warn('复制链接失败:', err)
      }
    }
  }, [item.url])

  const handleFavoriteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleFavorite?.(item.id)
  }, [item.id, onToggleFavorite])

  const handleVisibilityClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleVisibility?.(item.id)
  }, [item.id, onToggleVisibility])

  const handlePlayClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const isAudio = item.type === 'audio'
    const isImageRes = item.type === 'image'
    const isVideoRes = item.type === 'video'
    
    if (isAudio || isImageRes || isVideoRes) {
      window.YUA.window.openWindow('resourcePreview', {
        current: {
          id: item.id,
          title: item.title,
          type: item.type,
          filePath: item.filePath,
          url: item.url
        },
      })
    }
  }, [item])

  return (
    <div
      onClick={(e) => onClick(e, item)}
      className={`group relative flex items-center gap-4 p-3 rounded-lg border transition-all cursor-pointer select-none ${
        selected 
          ? 'ring-2 ring-primary border-primary/50 bg-primary/5' 
          : 'hover:bg-muted/50 hover:border-primary/30'
      }`}
    >
      {/* 左侧缩略图和类型图标 */}
      <div className='relative flex-shrink-0 w-16 h-16 rounded-md overflow-hidden bg-muted'>
        {item.thumbnailPath ? (
          <img 
            src={item.thumbnailPath} 
            alt={item.title || ''} 
            className='w-full h-full object-cover'
          />
        ) : (
          <div className='w-full h-full flex items-center justify-center text-2xl'>
            {getResourceTypeIcon(item.type)}
          </div>
        )}
        
        {/* 状态指示器 */}
        <div className={`absolute top-1 left-1 w-2 h-2 rounded-full ${getStatusColor(item.status)}`} />
      </div>

      {/* 主要内容区域 */}
      <div className='flex-1 min-w-0'>
        {/* 标题和描述 */}
        <div className='mb-2'>
          <h3 className='font-medium text-sm truncate mb-1'>
            {item.title || item.filePath?.split('/').pop() || item.url || item.id}
          </h3>
          {item.description && (
            <p className='text-xs text-muted-foreground line-clamp-2'>
              {item.description}
            </p>
          )}
        </div>

        {/* 元数据信息 */}
        <div className='flex items-center gap-4 text-xs text-muted-foreground mb-2'>
          {/* 文件大小 */}
          {item.sizeBytes && (
            <span className='flex items-center gap-1'>
              <TbFile className='w-3 h-3' />
              {formatFileSize(item.sizeBytes)}
            </span>
          )}
          
          {/* 时长 */}
          {item.durationMs && (
            <span className='flex items-center gap-1'>
              <TbClock className='w-3 h-3' />
              {formatDuration(item.durationMs)}
            </span>
          )}
          
          {/* 分辨率 */}
          {item.width && item.height && (
            <span>{item.width}×{item.height}</span>
          )}
          
          {/* 收集时间 */}
          {item.collectedAt && (
            <span className='flex items-center gap-1'>
              <TbCalendar className='w-3 h-3' />
              {formatTime(item.collectedAt)}
            </span>
          )}
        </div>

        {/* 来源和作者信息 */}
        {(item.domain || item.sourceName || item.authorName) && (
          <div className='flex items-center gap-2 text-xs text-muted-foreground mb-2'>
            {item.domain && (
              <span className='bg-muted px-2 py-1 rounded text-[10px] font-medium'>
                {item.domain}
              </span>
            )}
            {(item.sourceName || item.authorName) && (
              <span className='flex items-center gap-1'>
                <TbUser className='w-3 h-3' />
                {item.sourceName || item.authorName}
              </span>
            )}
          </div>
        )}

        {/* 标签 */}
        {tags.length > 0 && (
          <div className='flex items-center gap-1 flex-wrap'>
            <TbTag className='w-3 h-3 text-muted-foreground' />
            {tags.slice(0, 5).map((tag, index) => (
              <span key={index} className='bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px]'>
                #{tag}
              </span>
            ))}
            {tags.length > 5 && (
              <span className='text-[10px] text-muted-foreground'>+{tags.length - 5}</span>
            )}
          </div>
        )}
      </div>

      {/* 右侧操作区域 */}
      <div className='flex items-center gap-1'>
        {/* 评分 */}
        {item.rating && item.rating > 0 && (
          <div className='flex items-center gap-1 text-yellow-500 text-sm mr-2'>
            <TbStar className='w-4 h-4 fill-current' />
            <span>{item.rating}</span>
          </div>
        )}

        {/* 播放按钮 */}
        {(item.type === 'audio' || item.type === 'image' || item.type === 'video') && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handlePlayClick}
                  className='p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors'
                >
                  <TbPlayerPlay className='w-4 h-4' />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>播放预览</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* 收藏按钮 */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleFavoriteClick}
                className={`p-1.5 rounded-md transition-colors ${
                  item.favorite === 1 
                    ? 'text-red-500 bg-red-50' 
                    : 'text-muted-foreground hover:text-red-500 hover:bg-red-50'
                }`}
              >
                <TbHeart className={`w-4 h-4 ${item.favorite === 1 ? 'fill-current' : ''}`} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{item.favorite === 1 ? '取消收藏' : '添加收藏'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* 可见性按钮 */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleVisibilityClick}
                className='p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors'
              >
                {item.visibility === 'public' ? (
                  <TbEye className='w-4 h-4' />
                ) : (
                  <TbEyeOff className='w-4 h-4' />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{item.visibility === 'public' ? '设为私有' : '设为公开'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* 复制链接按钮 */}
        {item.url && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleSourceClick}
                  className={`p-1.5 rounded-md transition-colors ${
                    copied 
                      ? 'text-green-500 bg-green-50' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  {copied ? <TbCheck className='w-4 h-4' /> : <TbCopy className='w-4 h-4' />}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{copied ? '已复制!' : '复制链接'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* 外部链接按钮 */}
        {item.url && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    window.open(item.url, '_blank')
                  }}
                  className='p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors'
                >
                  <TbExternalLink className='w-4 h-4' />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>在新窗口中打开</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* 选中状态指示器 */}
      {selected && (
        <div className='absolute left-2 top-2 w-3 h-3 rounded-full bg-primary' />
      )}
    </div>
  )
}

export default ResourceListItem
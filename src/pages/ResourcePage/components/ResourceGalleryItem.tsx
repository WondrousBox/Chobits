import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import prettyBytes from 'pretty-bytes';
import React, { useCallback, useState } from 'react';
import { TbActivity, TbCheck, TbClock, TbCopy, TbEye, TbEyeOff, TbFile, TbFileText, TbHeart, TbLanguage, TbPlayerPlay, TbPlayerStop, TbStar } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { ResourceTaskStatus } from '../hooks/useResourceTaskStatus';
import { ResourceItem } from '../types';
import { isAudioFile, isImageFile, isVideoFile, makeResSrc } from '../utils/resourceProtocol';
import { formatDuration, getFileCoverByPath, getResourceSummary, getStatusColor } from '../utils/resourceUtils';
import { isSubtitleFile, ResourceItemWithSubtitles } from '../utils/subtitleUtils';

interface GalleryItemProps {
  item: ResourceItem | ResourceItemWithSubtitles;
  selected: boolean;
  onClick: (e: React.MouseEvent, item: ResourceItem) => void;
  onToggleFavorite?: (id: string) => void;
  onToggleVisibility?: (id: string) => void;
  innerRef?: (el: HTMLDivElement | null) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>, item: ResourceItem) => void;
  // Ask parent to open preview (centralized in parent)
  onPreview?: (item: ResourceItem) => void;
  // 是否占满容器（自由布局中使用），否则保持视频比例（网格布局中使用）
  fillContainer?: boolean;
  taskStatus?: ResourceTaskStatus;
}

// Basic preview: if resource has a filePath with image extension, show <img>. Otherwise show a placeholder.

const ResourceGalleryItem: React.FC<GalleryItemProps> = ({
  item,
  selected,
  onClick,
  onToggleFavorite,
  onToggleVisibility,
  innerRef,
  draggable,
  onDragStart,
  onPreview,
  fillContainer = false,
  taskStatus
}) => {
  const [copied, setCopied] = useState(false);
  const summary = getResourceSummary(item);
  const thumbSrc = item.thumbnailPath ? makeResSrc(item.thumbnailPath) : undefined;
  const fileCover = getFileCoverByPath(item.filePath);
  const itemWithSubtitles = item as ResourceItemWithSubtitles;
  const subtitleCount = itemWithSubtitles.subtitles?.length || 0;

  // (deprecated modal) replaced by dedicated preview window
  const isAudio = isAudioFile(item.filePath);
  const isImageRes = isImageFile(item.filePath);
  const isVideoRes = isVideoFile(item.filePath);
  const isSubtitle = isSubtitleFile(item.filePath);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      onClick(e, item);
      if (isAudio || isImageRes || isVideoRes || item.type === 'text' || isSubtitle) {
        onPreview?.(item);
      }
    },
    [onClick, item, isAudio, isImageRes, isVideoRes, isSubtitle, onPreview]
  );

  const handleSourceClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation(); // 阻止事件冒泡，避免触发资源选择
      if (item.url) {
        try {
          await navigator.clipboard.writeText(item.url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000); // 2秒后重置状态
        } catch (err) {
          console.warn('复制链接失败:', err);
        }
      }
    },
    [item.url]
  );

  const handleFavoriteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleFavorite?.(item.id);
    },
    [item.id, onToggleFavorite]
  );

  const handleVisibilityClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleVisibility?.(item.id);
    },
    [item.id, onToggleVisibility]
  );

  const handlePlayClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isAudio || isImageRes || isVideoRes || item.type === 'text' || isSubtitle) {
        onPreview?.(item);
      }
    },
    [item, isAudio, isImageRes, isVideoRes, isSubtitle, onPreview]
  );

  const handleTextPreviewClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (item.type === 'text') {
        onPreview?.(item);
      }
    },
    [item, onPreview]
  );

  return (
    <div
      ref={innerRef}
      data-explorer-item
      data-id={item.id}
      onClick={handleClick}
      draggable={!!draggable}
      onDragStart={(e) => onDragStart?.(e as any, item)}
      className={clsx('group relative cursor-pointer select-none', fillContainer ? 'h-full w-full' : 'aspect-video w-full')}
    >
      <div
        className={clsx(
          'relative z-10 h-full w-full overflow-hidden rounded-md bg-card text-card-foreground shadow-sm transition-all bg-gradient-to-br from-background to-muted',
          selected ? 'ring-2 ring-primary' : 'group-hover:shadow-md'
        )}
      >
        {/* 顶部状态栏 */}
        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/80 via-black/40 to-transparent px-2 py-1.5">
          <div className="flex items-center gap-1">
            {/* 来源信息 */}
            {(item.domain || item.sourceName || item.authorName) && (
              <div className="mt-1 flex items-center gap-1 text-[9px] text-white/70">
                {item.domain && <span className="bg-white/20 px-1 py-0.5 rounded text-[8px] font-medium">{item.domain}</span>}
                {(item.sourceName || item.authorName) && <span className="truncate max-w-[120px]">{item.sourceName || item.authorName}</span>}
              </div>
            )}

            {/* 状态指示器 */}
            <span className={`text-[9px] ${getStatusColor(item.status)}`}>{item.status === 'processing' ? '处理中' : item.status === 'ready' ? '就绪' : item.status === 'error' ? '错误' : ''}</span>
          </div>

          <div className="flex items-center gap-1">
            {/* 可见性按钮 - 悬停时显示 */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" className="w-8 h-8 bg-white/20 hover:bg-white/30" onClick={handleVisibilityClick}>
                    {item.visibility === 'public' ? <TbEye className="w-3 h-3" /> : <TbEyeOff className="w-3 h-3" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{item.visibility === 'public' ? '设为私有' : '设为公开'}</TooltipContent>
              </Tooltip>
            </div>

            {/* 复制链接按钮 - 悬停时显示 */}
            {item.url && (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button onClick={handleSourceClick} size="icon" className={`w-8 h-8 transition-colors ${copied ? 'bg-green-500/80 hover:bg-green-500' : 'bg-white/20 hover:bg-white/30'}`}>
                      {copied ? <TbCheck className="w-3 h-3" /> : <TbCopy className="w-3 h-3" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{copied ? '已复制!' : '复制链接'}</TooltipContent>
                </Tooltip>
              </div>
            )}

            {/* 收藏按钮 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  onClick={handleFavoriteClick}
                  className={clsx(['w-8 h-8 transition-colors', item.favorite === 1 ? 'bg-red-500/80 hover:bg-red-500' : ' opacity-0 group-hover:opacity-100 bg-white/20 hover:bg-white/30'])}
                >
                  <TbHeart className={`w-3 h-3 ${item.favorite === 1 ? 'fill-current' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{item.favorite === 1 ? '取消收藏' : '添加收藏'}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* 媒体内容区域 */}
        <div className="relative h-full w-full">
          {/* 图片资源 - 直接显示 */}
          {isImageFile(item.filePath) && <img src={item.filePath ? makeResSrc(item.filePath) : ''} alt={summary.title} className="h-full w-full object-cover" draggable={false} />}

          {/* 其他资源类型 - 尝试使用缩略图，其次使用基于后缀的封面，最后回退到类型图标 */}
          {!isImageFile(item.filePath) &&
            (thumbSrc ? (
              <img src={thumbSrc} alt={summary.title} className="h-full w-full object-cover" draggable={false} />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                <div className="w-8 h-8 [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: fileCover }} />
              </div>
            ))}

          {/* 悬停播放/预览按钮 */}
          {(isAudio || isVideoRes) && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/20">
              <Button
                onClick={item.type === 'text' ? handleTextPreviewClick : handlePlayClick}
                variant="outline"
                className="flex items-center justify-center w-12 h-12 rounded-full shadow-lg transition-all duration-200 hover:scale-110"
              >
                {(item.type === 'audio' || item.type === 'video') && <TbPlayerPlay />}
              </Button>
            </div>
          )}
        </div>

        {/* 底部信息栏 */}
        <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 py-2">
          {/* 标题和描述 */}
          <div className="mb-1">
            <div className="truncate text-[11px] font-medium text-white drop-shadow mb-0.5">{summary.title}</div>
            {summary.subtitle && <div className="truncate text-[9px] text-white/70">{summary.subtitle}</div>}
          </div>

          {/* 元数据信息 */}
          <div className="flex items-center justify-between text-[9px] text-white/80">
            <div className="flex items-center gap-1.5">
              {/* 文件大小 */}
              <span className="flex items-center gap-0.5">
                <TbFile className="w-3 h-3" />
                {prettyBytes(item.sizeBytes || 0)}
              </span>

              {/* 时长 */}
              {item.durationMs && (
                <span className="flex items-center gap-0.5">
                  <TbClock className="w-3 h-3" />
                  {formatDuration(item.durationMs)}
                </span>
              )}

              {/* 分辨率 */}
              {item.width && item.height && (
                <span>
                  {item.width}×{item.height}
                </span>
              )}

              {/* 字幕数量 */}
              {subtitleCount > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <span className="flex items-center gap-1 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                      字幕文件
                      <motion.span key={subtitleCount} initial={{ scale: 1.5, color: '#22c55e' }} animate={{ scale: 1, color: 'currentColor' }} transition={{ duration: 0.5 }}>
                        {subtitleCount}
                      </motion.span>
                    </span>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-0" align="start" side="bottom">
                    <div className="p-2 text-xs font-medium text-muted-foreground border-b bg-muted/50">字幕列表 ({subtitleCount})</div>
                    <ScrollArea className="h-[200px] max-h-[300px]">
                      <div className="p-1 flex flex-col gap-1">
                        {itemWithSubtitles.subtitles?.map((sub) => (
                          <div
                            key={sub.id}
                            className="flex items-center gap-2 p-2 hover:bg-accent rounded-sm cursor-pointer transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPreview?.({
                                ...item,
                                id: sub.id,
                                filePath: sub.filePath,
                                type: 'text',
                                name: sub.filePath.split(/[/\\]/).pop() || 'subtitle'
                              } as any);
                            }}
                          >
                            <TbFileText className="text-lg text-muted-foreground shrink-0" />
                            <div className="min-w-0 flex-1 overflow-hidden">
                              <div className="text-xs truncate" title={sub.filePath.split(/[/\\]/).pop()}>
                                {sub.filePath.split(/[/\\]/).pop()}
                              </div>
                              <div className="text-[10px] text-muted-foreground/70 uppercase leading-none mt-0.5">{sub.extension}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {/* 评分 */}
            {item.rating && item.rating > 0 && (
              <div className="flex items-center gap-0.5 text-yellow-400">
                <TbStar className="w-3 h-3 fill-current" />
                <span>{item.rating}</span>
              </div>
            )}
          </div>

          {/* 标签 */}
          {summary.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {summary.tags.slice(0, 3).map((tag, index) => (
                <span key={index} className="bg-primary/20 text-primary-foreground px-1 py-0.5 rounded text-[8px]">
                  #{tag}
                </span>
              ))}
              {summary.tags.length > 3 && <span className="text-[8px] text-white/60">+{summary.tags.length - 3}</span>}
            </div>
          )}
        </div>

        {/* 选中状态指示器 */}
        {selected && <div className="absolute top-0 left-0 right-0 bottom-0 bg-primary/40 z-50 pointer-events-none"></div>}

        {/* 任务状态悬浮层 */}
        {taskStatus && (
          <div className="absolute top-2 left-2 z-30 flex items-center gap-2 rounded-md bg-background/90 p-1.5 text-xs shadow-md backdrop-blur-sm animate-pulse border border-primary/20 max-w-[80%] group/task">
            <div className="text-primary shrink-0">{taskStatus.icon === 'translation' ? <TbLanguage className="w-4 h-4" /> : <TbActivity className="w-4 h-4" />}</div>
            <div className="flex flex-col min-w-0">
              <span className="font-medium text-primary truncate">{taskStatus.label}</span>
              {taskStatus.subLabel && <span className="text-[10px] text-muted-foreground truncate">{taskStatus.subLabel}</span>}
            </div>
            {taskStatus.progress !== undefined && <span className="text-[10px] font-mono text-muted-foreground ml-1">{taskStatus.progress}%</span>}

            {/* 停止按钮 */}
            {taskStatus.requestId && (
              <div className="ml-1 opacity-0 group-hover/task:opacity-100 transition-opacity">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (taskStatus.requestId) {
                          window.YUA.ai.cancelTranslate(taskStatus.requestId);
                        }
                      }}
                    >
                      <TbPlayerStop className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>停止任务</TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ResourceGalleryItem;

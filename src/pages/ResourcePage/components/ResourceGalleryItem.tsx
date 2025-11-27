import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import prettyBytes from 'pretty-bytes';
import React, { useCallback, useState } from 'react';
import { TbCheck, TbClock, TbCopy, TbEye, TbEyeOff, TbFile, TbFileText, TbHeart, TbPlayerPlay, TbStar } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { ResourceItem } from '../types';
import { isAudioFile, isImageFile, isVideoFile, makeResSrc } from '../utils/resourceProtocol';
import { formatDuration, getResourceSummary, getResourceTypeIcon, getStatusColor } from '../utils/resourceUtils';
import { ResourceItemWithSubtitles } from '../utils/subtitleUtils';

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
}

// Basic preview: if resource has a filePath with image extension, show <img>. Otherwise show a placeholder.

const ResourceGalleryItem: React.FC<GalleryItemProps> = ({ item, selected, onClick, onToggleFavorite, onToggleVisibility, innerRef, draggable, onDragStart, onPreview, fillContainer = false }) => {
  const [copied, setCopied] = useState(false);
  const summary = getResourceSummary(item);
  const thumbSrc = item.thumbnailPath ? makeResSrc(item.thumbnailPath) : undefined;
  const itemWithSubtitles = item as ResourceItemWithSubtitles;
  const subtitleCount = itemWithSubtitles.subtitles?.length || 0;

  // (deprecated modal) replaced by dedicated preview window
  const isAudio = isAudioFile(item.filePath);
  const isImageRes = isImageFile(item.filePath);
  const isVideoRes = isVideoFile(item.filePath);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      onClick(e, item);
      if (isAudio || isImageRes || isVideoRes || item.type === 'text') {
        onPreview?.(item);
      }
    },
    [onClick, item, isAudio, isImageRes, isVideoRes, onPreview]
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
      if (isAudio || isImageRes || isVideoRes || item.type === 'text') {
        onPreview?.(item);
      }
    },
    [item, isAudio, isImageRes, isVideoRes, onPreview]
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
    <motion.div
      ref={innerRef}
      data-explorer-item
      data-id={item.id}
      onClick={handleClick}
      draggable={!!draggable}
      onDragStart={(e) => onDragStart?.(e as any, item)}
      className={clsx('group relative cursor-pointer select-none', fillContainer ? 'h-full w-full' : 'aspect-video w-full')}
      initial="rest"
      whileHover="hover"
      animate="rest"
      variants={{
        rest: { zIndex: 0 },
        hover: { zIndex: 20 }
      }}
    >
      {subtitleCount > 0 && (
        <>
          <motion.div
            variants={{
              rest: { rotate: 2, x: 0, y: 0, scale: 0.96, zIndex: 5 },
              hover: { rotate: 5, x: 0, y: 60, scale: 0.96, zIndex: 5 }
            }}
            className="absolute inset-0 rounded-md border border-border bg-card shadow-sm overflow-hidden cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              if (itemWithSubtitles.subtitles?.[0]) {
                const sub = itemWithSubtitles.subtitles[0];
                onPreview?.({
                  ...item,
                  id: sub.id,
                  filePath: sub.filePath,
                  type: 'text',
                  name: sub.filePath.split(/[/\\]/).pop() || 'subtitle'
                } as any);
              }
            }}
          >
            <div className="flex flex-col items-center justify-center h-full w-full p-2 bg-gradient-to-br from-background to-muted">
              <TbFileText className="text-3xl mb-2 text-muted-foreground/50" />
              <div className="text-[10px] text-center font-medium truncate w-full px-2 text-muted-foreground">{itemWithSubtitles.subtitles?.[0]?.filePath.split(/[/\\]/).pop()}</div>
              <div className="text-[9px] text-muted-foreground/70 uppercase mt-0.5">{itemWithSubtitles.subtitles?.[0]?.extension}</div>
            </div>
          </motion.div>

          {subtitleCount > 1 && (
            <motion.div
              variants={{
                rest: { rotate: -2, x: 0, y: 0, scale: 0.94, zIndex: 0 },
                hover: { rotate: -5, x: 0, y: 110, scale: 0.94, zIndex: 0 }
              }}
              className="absolute inset-0 rounded-md border border-border bg-card shadow-sm overflow-hidden cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                if (itemWithSubtitles.subtitles?.[1]) {
                  const sub = itemWithSubtitles.subtitles[1];
                  onPreview?.({
                    ...item,
                    id: sub.id,
                    filePath: sub.filePath,
                    type: 'text',
                    name: sub.filePath.split(/[/\\]/).pop() || 'subtitle'
                  } as any);
                }
              }}
            >
              <div className="flex flex-col items-center justify-center h-full w-full p-2 bg-gradient-to-br from-background to-muted">
                <TbFileText className="text-3xl mb-2 text-muted-foreground/50" />
                <div className="text-[10px] text-center font-medium truncate w-full px-2 text-muted-foreground">{itemWithSubtitles.subtitles?.[1]?.filePath.split(/[/\\]/).pop()}</div>
                <div className="text-[9px] text-muted-foreground/70 uppercase mt-0.5">{itemWithSubtitles.subtitles?.[1]?.extension}</div>
              </div>
            </motion.div>
          )}
        </>
      )}
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

          {/* 其他资源类型 - 显示类型图标 */}
          {!isImageFile(item.filePath) &&
            (thumbSrc ? (
              <img src={thumbSrc} alt={summary.title} className="h-full w-full object-cover" draggable={false} />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                <div className="text-center">
                  <div className="text-2xl mb-1">{getResourceTypeIcon(item.type)}</div>
                  <div className="text-[10px] capitalize">{item.type}</div>
                </div>
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
              {subtitleCount > 0 && <span className="flex items-center gap-1">字幕文件 {subtitleCount}</span>}
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
      </div>
    </motion.div>
  );
};

export default ResourceGalleryItem;

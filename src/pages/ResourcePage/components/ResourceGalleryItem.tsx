import React, { useState, useCallback } from 'react';
import { makeResSrc, isImageFile, isVideoFile, isAudioFile } from '@/lib/resourceProtocol';
import { ResourceItem } from '@/types';
import { TbCopy, TbCheck, TbStar, TbHeart, TbEye, TbEyeOff, TbClock, TbFile, TbPlayerPlay } from 'react-icons/tb';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatFileSize, formatDuration, formatTime, getResourceTypeIcon, getStatusColor, getRatingStars, getResourceSummary } from '@/utils/resourceUtils';
import { Button } from '@/components/ui/button';

interface GalleryItemProps {
  item: ResourceItem;
  selected: boolean;
  onClick: (e: React.MouseEvent, item: ResourceItem) => void;
  onToggleFavorite?: (id: string) => void;
  onToggleVisibility?: (id: string) => void;
  innerRef?: (el: HTMLDivElement | null) => void;
}

// Basic preview: if resource has a filePath with image extension, show <img>. Otherwise show a placeholder.
// legacy helper compatibility (if some other code imports isImage)
function isImage(path?: string) {
  return isImageFile(path);
}

const ResourceGalleryItem: React.FC<GalleryItemProps> = ({ item, selected, onClick, onToggleFavorite, onToggleVisibility, innerRef }) => {
  const [copied, setCopied] = useState(false);
  const summary = getResourceSummary(item);
  const thumbSrc = (item as any).thumbnailPath ? makeResSrc((item as any).thumbnailPath) : undefined;

  // (deprecated modal) replaced by dedicated preview window
  const isAudio = isAudioFile(item.filePath);
  const isImageRes = isImageFile(item.filePath);
  const isVideoRes = isVideoFile(item.filePath);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      onClick(e, item);
      if (isAudio || isImageRes || isVideoRes || item.type === 'text') {
        // 统一调用主进程打开资源预览窗口
        window.YUA.window.openWindow('resourcePreview', {
          current: {
            id: item.id,
            title: item.title,
            type: item.type,
            filePath: item.filePath,
            url: item.url
          }
          // list 与 index 将在上层（ExplorerGrid）增强后传入；这里保持兼容
        });
      }
    },
    [onClick, item, isAudio, isImageRes, isVideoRes]
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
        window.YUA.window.openWindow('resourcePreview', {
          current: {
            id: item.id,
            title: item.title,
            type: item.type,
            filePath: item.filePath,
            url: item.url
          }
        });
      }
    },
    [item, isAudio, isImageRes, isVideoRes]
  );

  const handleTextPreviewClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (item.type === 'text') {
        window.YUA.window.openWindow('resourcePreview', {
          current: {
            id: item.id,
            title: item.title,
            type: item.type,
            filePath: item.filePath,
            url: item.url
          }
        });
      }
    },
    [item]
  );

  return (
    <div
      ref={innerRef}
      data-explorer-item
      data-id={item.id}
      onClick={handleClick}
      className={`group relative aspect-video w-full overflow-hidden rounded-md border bg-card text-card-foreground shadow-sm transition-all cursor-pointer select-none ${selected ? 'ring-2 ring-primary border-primary/50' : 'hover:shadow-md hover:border-primary/30'} bg-gradient-to-br from-background to-muted`}
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
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" className="w-8 h-8 bg-white/20 hover:bg-white/30" onClick={handleVisibilityClick}>
                    {item.visibility === 'public' ? <TbEye className="w-3 h-3" /> : <TbEyeOff className="w-3 h-3" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{item.visibility === 'public' ? '设为私有' : '设为公开'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* 复制链接按钮 - 悬停时显示 */}
          {item.url && (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button onClick={handleSourceClick} size="icon" className={`w-8 h-8 transition-colors ${copied ? 'bg-green-500/80 hover:bg-green-500' : 'bg-white/20 hover:bg-white/30'}`}>
                      {copied ? <TbCheck className="w-3 h-3" /> : <TbCopy className="w-3 h-3" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{copied ? '已复制!' : '复制链接'}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}

          {/* 收藏按钮 */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" onClick={handleFavoriteClick} className={`w-8 h-8 transition-colors ${item.favorite === 1 ? 'bg-red-500/80 hover:bg-red-500' : 'bg-white/20 hover:bg-white/30'}`}>
                  <TbHeart className={`w-3 h-3 ${item.favorite === 1 ? 'fill-current' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{item.favorite === 1 ? '取消收藏' : '添加收藏'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* 媒体内容区域 */}
      <div className="relative h-full w-full">
        {/* 图片资源 - 直接显示 */}
        {isImageFile(item.filePath) && <img src={item.filePath ? makeResSrc(item.filePath) : ''} alt={summary.title} className="h-full w-full object-cover" draggable={false} />}

        {/* 视频资源 - 优先显示封面图，没有封面图则显示占位符 */}
        {isVideoFile(item.filePath) && (
          <>
            {thumbSrc ? (
              <img src={thumbSrc} alt={summary.title} className="h-full w-full object-cover" draggable={false} />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-purple-900/70 to-purple-700/40 text-white gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1 opacity-90">
                  <span aria-hidden="true">🎬</span>
                  <span className="font-medium">点击预览视频</span>
                </span>
              </div>
            )}
          </>
        )}

        {/* 音频资源 - 显示占位符 */}
        {isAudio && (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-900/70 to-slate-700/40 text-white gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 opacity-90">
              <span aria-hidden="true">🎵</span>
              <span className="font-medium">点击预览音频</span>
            </span>
          </div>
        )}

        {/* 文本资源 - 显示特殊样式 */}
        {item.type === 'text' && (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-900/70 to-blue-700/40 text-white gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 opacity-90">
              <span aria-hidden="true">📄</span>
              <span className="font-medium">点击预览文本</span>
            </span>
          </div>
        )}

        {/* 其他资源类型 - 显示类型图标 */}
        {!isImageFile(item.filePath) && !isVideoFile(item.filePath) && !isAudioFile(item.filePath) && item.type !== 'text' && (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            <div className="text-center">
              <div className="text-2xl mb-1">{getResourceTypeIcon(item.type)}</div>
              <div className="text-[10px] capitalize">{item.type}</div>
            </div>
          </div>
        )}

        {/* 悬停播放/预览按钮 */}
        {(isAudio || isImageRes || isVideoRes || item.type === 'text') && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/20">
            <Button
              onClick={item.type === 'text' ? handleTextPreviewClick : handlePlayClick}
              variant="outline"
              className="flex items-center justify-center w-12 h-12 rounded-full shadow-lg transition-all duration-200 hover:scale-110"
            >
              {item.type === 'text' ? <span className="text-lg">📄</span> : <TbPlayerPlay />}
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
            {item.sizeBytes && (
              <span className="flex items-center gap-0.5">
                <TbFile className="w-3 h-3" />
                {formatFileSize(item.sizeBytes)}
              </span>
            )}

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
      {selected && <div className="absolute right-2 top-2 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] shadow ring-1 ring-black/20">✓</div>}
    </div>
  );
};

export default ResourceGalleryItem;

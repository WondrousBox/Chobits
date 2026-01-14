import { clsx } from 'clsx';
import type { RssMetadata } from 'electron/main/handlers/rss/types';
import React, { useCallback, useMemo } from 'react';
import { TbClock, TbDownload, TbHeart, TbRss, TbUsers } from 'react-icons/tb';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { ResourceItem } from '../types';
import { makeResSrc } from '../utils/resourceProtocol';

interface RssSubscriptionCardProps {
  item: ResourceItem;
  selected: boolean;
  onClick: (e: React.MouseEvent, item: ResourceItem) => void;
  onToggleFavorite?: (id: string) => void;
  onOpenFeed?: (item: ResourceItem) => void;
  innerRef?: (el: HTMLDivElement | null) => void;
}

const RssSubscriptionCard: React.FC<RssSubscriptionCardProps> = ({ item, selected, onClick, onToggleFavorite, onOpenFeed, innerRef }) => {

  // 解析 metadata
  const metadata: RssMetadata = useMemo(() => {
    try {
      return JSON.parse(item.metadata || '{}');
    } catch {
      return {};
    }
  }, [item.metadata]);

  // 获取封面图
  const coverUrl = useMemo(() => {
    if (item.thumbnailPath) return makeResSrc(item.thumbnailPath);
    if (item.previewUrl) return item.previewUrl;
    if (metadata.avatarUrl) return metadata.avatarUrl;
    if (metadata.coverUrl) return metadata.coverUrl;
    return null;
  }, [item.thumbnailPath, item.previewUrl, metadata.avatarUrl, metadata.coverUrl]);

  // 格式化时间
  const formatTime = useCallback((timestamp?: number): string => {
    if (!timestamp) return '从未';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - timestamp;

    if (diff < 60 * 1000) return '刚刚';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))} 分钟前`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))} 小时前`;
    if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / (24 * 60 * 60 * 1000))} 天前`;

    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }, []);

  // 格式化订阅者数量
  const formatSubscriberCount = useCallback((count?: number): string => {
    if (!count) return '';
    if (count >= 100000000) return `${(count / 100000000).toFixed(1)} 亿`;
    if (count >= 10000) return `${(count / 10000).toFixed(1)} 万`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)} K`;
    return count.toString();
  }, []);

  // 获取来源类型标签
  const sourceTypeLabel = useMemo(() => {
    switch (metadata.sourceType) {
      case 'youtube':
        return 'YouTube';
      case 'podcast':
        return 'Podcast';
      case 'bilibili':
        return 'Bilibili';
      case 'twitter':
        return 'Twitter';
      case 'blog':
        return 'Blog';
      default:
        return 'RSS';
    }
  }, [metadata.sourceType]);

  // 打开 Feed 列表
  const handleOpenFeed = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onOpenFeed?.(item);
    },
    [item, onOpenFeed]
  );

  // 切换收藏
  const handleFavoriteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleFavorite?.(item.id);
    },
    [item.id, onToggleFavorite]
  );

  return (
    <div
      ref={innerRef}
      data-explorer-item
      data-id={item.id}
      onClick={(e) => {
        onClick(e, item);
        onOpenFeed?.(item);
      }}
      className={clsx('group relative cursor-pointer select-none aspect-video w-full')}
    >
      <div
        className={clsx(
          'relative z-10 h-full w-full overflow-hidden rounded-lg bg-card text-card-foreground shadow-sm transition-all',
          selected ? 'ring-2 ring-primary' : 'hover:shadow-lg hover:scale-[1.02]'
        )}
      >
        {/* 封面图 */}
        <div className="absolute inset-0">
          {coverUrl ? (
            <img src={coverUrl} alt={item.title || ''} className="h-full w-full object-cover" draggable={false} />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center">
              <TbRss className="w-16 h-16 text-orange-500/50" />
            </div>
          )}
          {/* 渐变遮罩 */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
        </div>

        {/* 顶部状态栏 */}
        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            {/* 来源类型标签 */}
            <Badge variant="secondary" className="bg-black/50 text-white text-[10px] px-1.5 py-0.5">
              {sourceTypeLabel}
            </Badge>

            {/* 启用状态 */}
            {metadata.enabled === false && (
              <Badge variant="outline" className="bg-black/50 text-white/60 text-[10px] px-1.5 py-0.5 border-white/20">
                已暂停
              </Badge>
            )}

            {/* 自动下载标识 */}
            {metadata.autoDownload && (
              <Badge variant="secondary" className="bg-green-500/80 text-white text-[10px] px-1.5 py-0.5">
                <TbDownload className="w-3 h-3" />
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* 收藏按钮 */}
            <Button
              size="icon"
              variant="ghost"
              className={clsx('w-8 h-8 transition-all', item.favorite === 1 ? 'bg-red-500/80 text-white' : 'bg-black/30 hover:bg-black/50 text-white opacity-0 group-hover:opacity-100')}
              onClick={handleFavoriteClick}
            >
              <TbHeart className={clsx('w-4 h-4', item.favorite === 1 && 'fill-current')} />
            </Button>
          </div>
        </div>

        {/* 底部信息 */}
        <div className="absolute inset-x-0 bottom-0 z-20 px-3 py-3">
          {/* 标题 */}
          <h3 className="text-white font-medium text-sm truncate mb-1">{item.title || '未命名订阅'}</h3>

          {/* 描述 */}
          {item.description && <p className="text-white/70 text-xs line-clamp-2 mb-2">{item.description}</p>}

          {/* 元数据 */}
          <div className="flex items-center gap-3 text-white/60 text-[10px]">
            {/* 订阅者数量 */}
            {metadata.subscriberCount && (
              <span className="flex items-center gap-1">
                <TbUsers className="w-3 h-3" />
                {formatSubscriberCount(metadata.subscriberCount)}
              </span>
            )}

            {/* 内容数量 */}
            {metadata.itemCount && (
              <span className="flex items-center gap-1">
                <TbRss className="w-3 h-3" />
                {metadata.itemCount} 条
              </span>
            )}

            {/* 最后更新时间 */}
            <span className="flex items-center gap-1">
              <TbClock className="w-3 h-3" />
              {formatTime(metadata.lastFetchedAt)}
            </span>
          </div>
        </div>

        {/* 选中状态 */}
        {selected && <div className="absolute inset-0 bg-primary/20 z-30 pointer-events-none" />}
      </div>
    </div>
  );
};

export default RssSubscriptionCard;

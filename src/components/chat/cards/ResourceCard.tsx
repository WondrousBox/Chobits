/**
 * 聊天消息中的资源卡片组件
 * 点击卡片可跳转到资源详情页
 */

import { clsx } from 'clsx';
import prettyBytes from 'pretty-bytes';
import React, { useCallback, useEffect, useState } from 'react';
import { TbFile, TbFileText, TbMusic, TbPhoto, TbPlayerPlay, TbVideo, TbWorld } from 'react-icons/tb';

import { ResourceItem } from '@/pages/ResourcePage/types';
import { isAudioFile, isImageFile, isVideoFile, makeResSrc } from '@/pages/ResourcePage/utils/resourceProtocol';
import { getFileCoverByPath, getResourceSummary } from '@/pages/ResourcePage/utils/resourceUtils';

import type { ChatCardType } from '../types';

/** 资源类型图标映射 */
const TYPE_ICONS: Record<ChatCardType, React.ElementType> = {
  resource: TbFile,
  video: TbVideo,
  audio: TbMusic,
  image: TbPhoto,
  document: TbFileText,
  link: TbWorld,
  file: TbFile
};

/** 资源类型颜色映射 */
const TYPE_COLORS: Record<ChatCardType, string> = {
  resource: 'bg-gray-500',
  video: 'bg-purple-500',
  audio: 'bg-pink-500',
  image: 'bg-blue-500',
  document: 'bg-cyan-500',
  link: 'bg-green-500',
  file: 'bg-gray-500'
};

interface ResourceCardProps {
  /** 资源 ID（用于从数据库加载） */
  resourceId?: string;
  /** 内嵌的资源数据 */
  data?: Partial<ResourceItem> & { id: string };
  /** 卡片类型 */
  cardType?: ChatCardType;
  /** 自定义类名 */
  className?: string;
  /** 紧凑模式（用于消息列表） */
  compact?: boolean;
}

/**
 * 资源卡片组件
 * 显示资源缩略图、标题、描述等基本信息，点击可跳转到资源详情
 */
const ResourceCard: React.FC<ResourceCardProps> = ({ resourceId, data, cardType = 'resource', className, compact = false }) => {
  const [resource, setResource] = useState<ResourceItem | null>(data ? (data as ResourceItem) : null);
  const [loading, setLoading] = useState(!data && !!resourceId);
  const [error, setError] = useState<string | null>(null);

  // 从数据库加载资源信息
  useEffect(() => {
    if (data) {
      setResource(data as ResourceItem);
      return;
    }

    if (!resourceId) return;

    const loadResource = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const result = await window.YUA.resource.getResource({ id: resourceId });
        if (result) {
          setResource(result as ResourceItem);
        } else {
          setError('资源不存在');
        }
      } catch (err) {
        console.error('加载资源失败:', err);
        setError('加载失败');
      } finally {
        setLoading(false);
      }
    };

    loadResource();
  }, [resourceId, data]);

  // 点击卡片，跳转到资源详情
  const handleClick = useCallback(() => {
    if (!resource) return;

    // 使用 window.YUA.window['window:open'] 打开资源预览窗口
    // 传递 current 参数来指定要预览的资源
    window.YUA.window['window:open']('resourcePreview', {
      current: resource
    }).catch((err) => {
      console.error('打开资源预览失败:', err);
    });
  }, [resource]);

  // 获取资源摘要信息
  const summary = resource ? getResourceSummary(resource) : null;

  // 获取缩略图源
  const thumbSrc = resource?.thumbnailPath ? makeResSrc(resource.thumbnailPath) : null;
  const isImage = resource?.filePath ? isImageFile(resource.filePath) : false;
  const isVideo = resource?.filePath ? isVideoFile(resource.filePath) : false;
  const isAudio = resource?.filePath ? isAudioFile(resource.filePath) : false;

  // 获取文件封面 SVG
  const fileCover = resource?.filePath ? getFileCoverByPath(resource.filePath) : null;

  // 确定显示的类型图标
  const TypeIcon = TYPE_ICONS[cardType] || TYPE_ICONS.resource;
  const typeColor = TYPE_COLORS[cardType] || TYPE_COLORS.resource;

  // 加载中状态
  if (loading) {
    return (
      <div className={clsx('rounded-lg border bg-muted/50 animate-pulse', compact ? 'p-2 w-72' : 'p-3', className)}>
        <div className="flex items-center gap-3">
          <div className={clsx('rounded bg-muted', compact ? 'w-10 h-10' : 'w-16 h-16')} />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-3 bg-muted rounded w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  // 错误状态
  if (error || !resource) {
    return (
      <div className={clsx('rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive', className)}>
        <span>{error || '资源不存在'}</span>
      </div>
    );
  }

  // 紧凑模式渲染
  if (compact) {
    return (
      <div onClick={handleClick} className={clsx('group flex items-center gap-2 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors p-2 w-72', className)}>
        {/* 缩略图 */}
        <div className="relative w-10 h-10 rounded overflow-hidden bg-muted shrink-0">
          {isImage && resource.filePath ? (
            <img src={makeResSrc(resource.filePath)} alt={summary?.title} className="w-full h-full object-cover" />
          ) : thumbSrc ? (
            <img src={thumbSrc} alt={summary?.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <div className="w-5 h-5 [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: fileCover || '' }} />
            </div>
          )}
          {/* 媒体类型标记 */}
          {(isVideo || isAudio) && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
              <TbPlayerPlay className="w-4 h-4 text-white" />
            </div>
          )}
        </div>

        {/* 信息 */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="text-sm font-medium truncate">{summary?.title}</div>
          <div className="text-xs text-muted-foreground truncate">
            {resource.sizeBytes ? prettyBytes(resource.sizeBytes) : ''}
            {resource.durationMs ? ` · ${Math.floor(resource.durationMs / 1000)}s` : ''}
          </div>
        </div>

        {/* 类型图标 - 固定尺寸不变形 */}
        <div className={clsx('w-6 h-6 rounded-full text-white shrink-0 flex items-center justify-center', typeColor)}>
          <TypeIcon className="w-3.5 h-3.5" />
        </div>
      </div>
    );
  }

  // 完整模式渲染
  return (
    <div onClick={handleClick} className={clsx('group rounded-xl border bg-card overflow-hidden hover:shadow-lg hover:border-primary/50 cursor-pointer transition-all', className)}>
      {/* 媒体区域 */}
      <div className="relative aspect-video bg-gradient-to-br from-background to-muted">
        {/* 图片直接显示 */}
        {isImage && resource.filePath && <img src={makeResSrc(resource.filePath)} alt={summary?.title} className="w-full h-full object-cover" />}

        {/* 其他类型显示缩略图或文件封面 */}
        {!isImage && (
          <>
            {thumbSrc ? (
              <img src={thumbSrc} alt={summary?.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-16 h-16 [&>svg]:w-full [&>svg]:h-full opacity-50" dangerouslySetInnerHTML={{ __html: fileCover || '' }} />
              </div>
            )}
          </>
        )}

        {/* 媒体播放覆盖层 */}
        {(isVideo || isAudio) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
              <TbPlayerPlay className="w-6 h-6 text-gray-800 ml-1" />
            </div>
          </div>
        )}

        {/* 类型标签 */}
        <div className={clsx('absolute top-2 left-2 px-2 py-0.5 rounded text-xs font-medium text-white flex items-center gap-1', typeColor)}>
          <TypeIcon className="w-3 h-3" />
          <span className="capitalize">{cardType}</span>
        </div>

        {/* 时长标签 */}
        {resource.durationMs && (
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/70 text-xs text-white font-mono">
            {Math.floor(resource.durationMs / 60000)}:{String(Math.floor((resource.durationMs % 60000) / 1000)).padStart(2, '0')}
          </div>
        )}
      </div>

      {/* 信息区域 */}
      <div className="p-3">
        <div className="font-medium text-sm truncate mb-1">{summary?.title}</div>
        {summary?.subtitle && <div className="text-xs text-muted-foreground truncate mb-2">{summary.subtitle}</div>}

        {/* 元数据 */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {resource.sizeBytes && (
            <span className="flex items-center gap-1">
              <TbFile className="w-3 h-3" />
              {prettyBytes(resource.sizeBytes)}
            </span>
          )}
          {resource.width && resource.height && (
            <span>
              {resource.width}×{resource.height}
            </span>
          )}
          {resource.domain && <span className="px-1.5 py-0.5 rounded bg-muted text-[10px]">{resource.domain}</span>}
        </div>

        {/* 标签 */}
        {summary?.tags && summary.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {summary.tags.slice(0, 3).map((tag, idx) => (
              <span key={idx} className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]">
                #{tag}
              </span>
            ))}
            {summary.tags.length > 3 && <span className="text-[10px] text-muted-foreground">+{summary.tags.length - 3}</span>}
          </div>
        )}
      </div>
    </div>
  );
};

export default ResourceCard;

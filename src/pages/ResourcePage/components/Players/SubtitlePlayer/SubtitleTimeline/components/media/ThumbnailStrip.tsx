import clsx from 'clsx';
import React from 'react';

import type { MediaThumbnail } from '../../types';
import { MEDIA_CONFIG } from '../../types';

interface ThumbnailStripProps {
  /** 缩略图列表 */
  thumbnails?: MediaThumbnail[];
  /** 片段宽度（像素） */
  width: number;
  /** 片段高度（像素） */
  height: number;
  /** 是否正在加载 */
  loading?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * ThumbnailStrip - 缩略图条组件
 *
 * 在媒体片段中显示视频关键帧缩略图条或图片缩略图
 */
export const ThumbnailStrip: React.FC<ThumbnailStripProps> = ({ thumbnails, width, height, loading = false, className }) => {
  // 没有缩略图时显示占位
  if (!thumbnails || thumbnails.length === 0) {
    return (
      <div className={clsx('absolute inset-0 flex items-center justify-center bg-muted/30', className)}>
        {loading ? (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span>加载中...</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">无预览</span>
        )}
      </div>
    );
  }

  // 计算每个缩略图的宽度
  const thumbnailCount = thumbnails.length;
  const thumbnailWidth = width / thumbnailCount;

  return (
    <div className={clsx('absolute inset-0 flex overflow-hidden', className)}>
      {thumbnails.map((thumb, index) => (
        <div key={`${thumb.timeOffset}-${index}`} className="relative flex-shrink-0 h-full" style={{ width: thumbnailWidth }}>
          <img src={thumb.url} alt={`缩略图 ${index + 1}`} className="w-full h-full object-cover" loading="lazy" decoding="async" />
        </div>
      ))}

      {/* 顶部渐变遮罩（用于显示文字信息时提高可读性） */}
      <div className="absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-black/30 to-transparent pointer-events-none" />
    </div>
  );
};

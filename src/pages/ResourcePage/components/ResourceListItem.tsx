import prettyBytes from 'pretty-bytes';
import React, { useCallback } from 'react';
import { TbFile, TbFileText, TbFileTypeDoc, TbLink, TbMusic, TbPhoto, TbSubtask, TbVideo } from 'react-icons/tb';

import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/time';

import { ResourceItem } from '../types';

// 类型标签配置（包含图标）
const TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  video: { label: '视频', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', icon: TbVideo },
  audio: { label: '音频', color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400', icon: TbMusic },
  image: { label: '图片', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: TbPhoto },
  document: { label: '文档', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', icon: TbFileTypeDoc },
  text: { label: '文本', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400', icon: TbFileText },
  subtitle: { label: '字幕', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400', icon: TbSubtask },
  link: { label: '链接', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: TbLink },
  file: { label: '文件', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400', icon: TbFile },
  other: { label: '其他', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400', icon: TbFile }
};

// 根据文件扩展名推断更精细的类型
const getDetailedType = (item: ResourceItem): string => {
  // 优先使用 item.type
  if (item.type && TYPE_CONFIG[item.type]) {
    return item.type;
  }

  // 根据文件扩展名判断
  const filePath = item.filePath || '';
  const ext = filePath.split('.').pop()?.toLowerCase() || '';

  // 字幕文件
  if (['srt', 'vtt', 'ass', 'ssa', 'sub', 'lrc'].includes(ext)) {
    return 'subtitle';
  }

  // 视频文件
  if (['mp4', 'webm', 'mov', 'mkv', 'avi', 'flv', 'wmv', 'm4v', 'ogv'].includes(ext)) {
    return 'video';
  }

  // 音频文件
  if (['mp3', 'wav', 'm4a', 'flac', 'opus', 'ogg', 'aac', 'wma'].includes(ext)) {
    return 'audio';
  }

  // 图片文件
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tiff'].includes(ext)) {
    return 'image';
  }

  // 文档文件
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp'].includes(ext)) {
    return 'document';
  }

  // 文本文件
  if (['txt', 'md', 'json', 'xml', 'yaml', 'yml', 'csv', 'log', 'ini', 'conf'].includes(ext)) {
    return 'text';
  }

  return item.type || 'other';
};

interface ListItemProps {
  item: ResourceItem;
  selected: boolean;
  /** 是否为刚生成/刚导入的资源，用于临时高亮 */
  isNew?: boolean;
  onClick: (e: React.MouseEvent, item: ResourceItem) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>, item: ResourceItem) => void;
  onPreview?: (item: ResourceItem) => void;
}

const ResourceListItem: React.FC<ListItemProps> = ({
  item,
  selected,
  isNew,
  onClick,
  draggable,
  onDragStart,
  onPreview
}) => {
  // 获取详细类型和配置
  const detailedType = getDetailedType(item);
  const typeConfig = TYPE_CONFIG[detailedType] || TYPE_CONFIG.other;
  const IconComponent = typeConfig.icon;

  // 点击行：选中资源，普通点击时触发预览
  const handleRowClick = useCallback(
    (e: React.MouseEvent) => {
      onClick(e, item);
      // 只有普通点击（没有 Shift/Cmd/Ctrl）才触发预览
      if (!e.shiftKey && !e.metaKey && !e.ctrlKey) {
        onPreview?.(item);
      }
    },
    [onClick, item, onPreview]
  );

  // 获取显示名称
  const displayName = item.title || item.filePath?.split('/').pop() || item.url || item.id;

  return (
    <div
      onClick={handleRowClick}
      draggable={!!draggable}
      onDragStart={(e) => onDragStart?.(e, item)}
      className={cn(
        // Notion 风格表格行
        'group relative flex items-center h-[33px] border-b border-border/20 transition-colors duration-75 cursor-pointer select-none',
        // 选中状态
        selected && 'bg-primary/10',
        // 未选中时 hover 效果
        !selected && 'hover:bg-muted/50',
        // 新增资源高亮
        isNew && 'bg-amber-50/70 dark:bg-amber-950/40'
      )}
    >
      {/* 名称列 - 弹性宽度 */}
      <div className="flex-1 min-w-0 h-full flex items-center px-2 border-r border-border/20 gap-2">
        <IconComponent className="w-4 h-4 shrink-0 text-muted-foreground" />
        <span className="text-sm truncate">{displayName}</span>
      </div>

      {/* 类型列 - 固定宽度 */}
      <div className="w-24 shrink-0 h-full flex items-center px-2 border-r border-border/20">
        <span
          className={cn(
            'inline-flex items-center px-1.5 py-0.5 rounded text-xs',
            typeConfig.color
          )}
        >
          {typeConfig.label}
        </span>
      </div>

      {/* 大小列 - 固定宽度 */}
      <div className="w-20 shrink-0 h-full flex items-center px-2 border-r border-border/20">
        <span className="text-xs text-muted-foreground">
          {item.sizeBytes ? prettyBytes(item.sizeBytes) : '-'}
        </span>
      </div>

      {/* 时间列 - 固定宽度 */}
      <div className="w-28 shrink-0 h-full flex items-center px-2 border-r border-border/20">
        <span className="text-xs text-muted-foreground">
          {item.collectedAt ? formatRelativeTime(item.collectedAt) : '-'}
        </span>
      </div>

      {/* 右侧空白列 - 对齐表头的添加列按钮 */}
      <div className="w-8 shrink-0" />
    </div>
  );
};

export default ResourceListItem;

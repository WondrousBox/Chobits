import prettyBytes from 'pretty-bytes';

import { formatRelativeTime } from '@/lib/time';
import { ResourceItem } from '@/types';

// 格式化时长
export function formatDuration(ms?: number): string {
  if (!ms) return '';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  } else if (minutes > 0) {
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
  } else {
    return `${seconds}s`;
  }
}

// 格式化分辨率
export function formatResolution(width?: number, height?: number): string {
  if (!width || !height) return '';
  return `${width}×${height}`;
}

// 解析标签
export function parseTags(tags?: string): string[] {
  if (!tags) return [];
  try {
    return JSON.parse(tags);
  } catch {
    return [];
  }
}

// 解析分类
export function parseCategories(categories?: string): string[] {
  if (!categories) return [];
  try {
    return JSON.parse(categories);
  } catch {
    return [];
  }
}

// 获取资源类型图标
export function getResourceTypeIcon(type: string): string {
  const iconMap: Record<string, string> = {
    image: '🖼️',
    video: '🎥',
    audio: '🎵',
    text: '📄',
    link: '🔗',
    file: '📁',
    document: '📋',
    other: '📦'
  };
  return iconMap[type] || '📦';
}

// 获取状态颜色
export function getStatusColor(status?: string): string {
  const colorMap: Record<string, string> = {
    new: 'text-blue-500',
    processing: 'text-yellow-500',
    ready: 'text-green-500',
    archived: 'text-gray-500',
    error: 'text-red-500'
  };
  return colorMap[status || 'ready'] || 'text-gray-500';
}

// 获取评分星星
export function getRatingStars(rating?: number): string {
  if (!rating) return '';
  const stars = '★'.repeat(Math.floor(rating));
  const emptyStars = '☆'.repeat(5 - Math.floor(rating));
  return stars + emptyStars;
}

// 检查是否为媒体文件
export function isMediaFile(type: string): boolean {
  return ['image', 'video', 'audio'].includes(type);
}

// 检查是否为文本文件
export function isTextFile(type: string): boolean {
  return ['text', 'document'].includes(type);
}

// 获取资源的主要信息摘要
export function getResourceSummary(item: ResourceItem): {
  title: string;
  subtitle: string;
  metadata: string[];
  tags: string[];
} {
  const title = item.title || item.filePath?.split('/').pop() || item.url || item.id;
  const subtitle = item.description || item.authorName || item.sourceName || '';

  const metadata: string[] = [];
  if (item.sizeBytes) metadata.push(prettyBytes(item.sizeBytes || 0));
  if (item.durationMs) metadata.push(formatDuration(item.durationMs));
  if (item.width && item.height) metadata.push(formatResolution(item.width, item.height));
  if (item.collectedAt) metadata.push(formatRelativeTime(item.collectedAt));

  const tags = parseTags(item.tags);

  return { title, subtitle, metadata, tags };
}

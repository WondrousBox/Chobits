import { NodeViewProps, NodeViewWrapper } from '@tiptap/react';
import { File, FileText, Image, Link2, Music2, Video } from 'lucide-react';
import prettyBytes from 'pretty-bytes';
import { useMemo } from 'react';

import { cn } from '@/lib/utils';

import type { ResourceCardStatus } from '../resourceCard';

const getTypeIcon = (type?: string) => {
  switch (type) {
    case 'image':
      return Image;
    case 'video':
      return Video;
    case 'audio':
      return Music2;
    case 'link':
      return Link2;
    case 'document':
    case 'text':
      return FileText;
    default:
      return File;
  }
};

const getStatusLabel = (status?: ResourceCardStatus, errorMessage?: string): string => {
  if (status === 'uploading') return '上传中...';
  if (status === 'error') return errorMessage || '上传失败';
  return '';
};

export const ResourceCardWrapper = ({ node, selected }: NodeViewProps): JSX.Element => {
  const { title, type, sizeBytes, previewUrl, thumbnailPath, status, errorMessage } = node.attrs as {
    title?: string;
    type?: string;
    sizeBytes?: number;
    previewUrl?: string;
    thumbnailPath?: string;
    status?: ResourceCardStatus;
    errorMessage?: string;
  };

  const Icon = getTypeIcon(type);
  const numericSize = typeof sizeBytes === 'number' ? sizeBytes : Number.parseInt(String(sizeBytes), 10);
  const sizeLabel = Number.isFinite(numericSize) && numericSize > 0 ? prettyBytes(numericSize) : '';
  const statusLabel = getStatusLabel(status, errorMessage);
  const thumbSrc = previewUrl || thumbnailPath || '';

  const metaLine = useMemo(() => {
    const parts = [];
    if (type) parts.push(type);
    if (sizeLabel) parts.push(sizeLabel);
    return parts.join(' · ');
  }, [type, sizeLabel]);

  return (
    <NodeViewWrapper className={cn('not-prose w-full', selected && 'ring-2 ring-primary/40 rounded-lg')}>
      <div className="flex items-center gap-3 rounded-lg border border-border bg-background/70 px-3 py-2 shadow-sm">
        <div className={cn('flex h-12 w-12 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground', !thumbSrc && 'bg-muted/60')}>
          {thumbSrc ? <img src={thumbSrc} alt={title || 'resource'} className="h-full w-full object-cover" draggable={false} /> : <Icon className="h-6 w-6" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">{title || '未命名资源'}</div>
          {metaLine && <div className="text-xs text-muted-foreground">{metaLine}</div>}
          {statusLabel && <div className={cn('text-xs text-muted-foreground', status === 'error' && 'text-destructive')}>{statusLabel}</div>}
        </div>
      </div>
    </NodeViewWrapper>
  );
};

import clsx from 'clsx';
import React, { useCallback, useState } from 'react';
import { TbFileImport, TbPhoto, TbUpload, TbVideo } from 'react-icons/tb';

import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';

import type { MediaSegment, MediaSource } from '../../types';
import { DEFAULT_TRANSFORM } from '../../types';

interface MediaTrackQuickAddProps {
  /** 子元素（轨道容器） */
  children: React.ReactNode;
  /** 目标轨道 ID */
  trackId: string;
  /** 点击位置对应的时间（秒） */
  clickTime: number;
  /** 是否禁用 */
  disabled?: boolean;
  /** 导入回调 */
  onImport: (sources: MediaSource[], segments: Omit<MediaSegment, 'id'>[]) => void;
  /** 菜单打开状态变化 */
  onOpenChange?: (open: boolean) => void;
}

/**
 * MediaTrackQuickAdd - 媒体轨道快速添加组件
 *
 * 提供两种添加媒体的方式：
 * 1. 右键菜单 → 选择文件
 * 2. 拖拽文件到轨道
 */
export const MediaTrackQuickAdd: React.FC<MediaTrackQuickAddProps> = ({ children, trackId, clickTime, disabled = false, onImport, onOpenChange }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);

  // 处理文件路径，创建 MediaSource
  const processFilePaths = useCallback(
    async (filePaths: string[], targetTime: number) => {
      setLoading(true);

      try {
        const mediaSources: MediaSource[] = [];

        for (const filePath of filePaths) {
          const ext = filePath.split('.').pop()?.toLowerCase() || '';
          const videoExtensions = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'];
          const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];

          const isVideo = videoExtensions.includes(ext);
          const isImage = imageExtensions.includes(ext);

          if (!isVideo && !isImage) {
            console.warn(`Skipping unsupported file: ${filePath}`);
            continue;
          }

          // 获取媒体信息
          let info: { width: number; height: number; duration: number } | null = null;
          try {
            info = await window.YUA.media?.['media:getInfo']?.(filePath);
          } catch (err) {
            console.warn(`Could not get info for ${filePath}:`, err);
          }

          const width = info?.width || 1920;
          const height = info?.height || 1080;
          const videoDuration = info?.duration || (isVideo ? 10 : undefined);

          mediaSources.push({
            id: `source-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            path: filePath,
            type: isVideo ? 'video' : 'image',
            duration: videoDuration,
            width,
            height
          });
        }

        if (mediaSources.length > 0) {
          // 创建片段
          const segments: Omit<MediaSegment, 'id'>[] = mediaSources.map((source, index) => {
            const startOffset = index * 0.5; // 多个文件时错开 0.5 秒
            const segmentDuration = source.type === 'video' ? Math.min(source.duration || 5, 5) : 5;

            return {
              sourceId: source.id,
              timelineStart: targetTime + startOffset,
              timelineEnd: targetTime + startOffset + segmentDuration,
              sourceStart: 0,
              sourceEnd: source.type === 'video' ? Math.min(source.duration || 5, segmentDuration) : undefined,
              playbackRate: 1.0,
              muted: false,
              volume: 1.0,
              transform: { ...DEFAULT_TRANSFORM },
              label: source.path.split('/').pop()
            };
          });

          onImport(mediaSources, segments);
        }
      } catch (err) {
        console.error('Error processing files:', err);
      } finally {
        setLoading(false);
      }
    },
    [onImport]
  );

  // 打开文件选择对话框
  const handleSelectFile = useCallback(async () => {
    try {
      const result = await window.YUA.file['file:pickFile']({
        filters: [{ name: 'Media Files', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }],
        multi: true
      });

      if (result && !result.canceled) {
        const filePaths = result.paths || (result.path ? [result.path] : []);
        if (filePaths.length > 0) {
          await processFilePaths(filePaths, clickTime);
        }
      }
    } catch (err) {
      console.error('Error opening file dialog:', err);
    }
  }, [clickTime, processFilePaths]);

  // 拖拽事件处理
  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      // 检查是否是文件拖拽
      if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('text/plain')) {
        setIsDragging(true);
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled) return;

      // 计算拖放位置对应的时间
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const dropTime = clickTime; // 使用传入的 clickTime（由父组件计算）

      // 提取文件路径
      const files = e.dataTransfer.files;
      const filePaths: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Electron 添加了 'path' 属性
        const filePath = (file as File & { path?: string }).path;
        if (filePath) {
          filePaths.push(filePath);
        }
      }

      if (filePaths.length > 0) {
        await processFilePaths(filePaths, dropTime);
      }
    },
    [disabled, clickTime, processFilePaths]
  );

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <ContextMenu onOpenChange={onOpenChange}>
      <ContextMenuTrigger
        asChild
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={clsx(isDragging && 'ring-2 ring-emerald-400 ring-inset')}
      >
        <div className="relative w-full h-full">
          {children}
          {/* 拖拽覆盖层 */}
          {isDragging && (
            <div className="absolute inset-0 bg-emerald-500/20 border-2 border-dashed border-emerald-400 flex items-center justify-center z-20 pointer-events-none">
              <div className="flex flex-col items-center gap-1 bg-background/90 px-3 py-2 rounded-lg shadow">
                <TbUpload className="w-5 h-5 text-emerald-500" />
                <span className="text-xs text-emerald-600">释放以添加媒体</span>
              </div>
            </div>
          )}
          {/* 加载指示器 */}
          {loading && (
            <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-30">
              <div className="flex items-center gap-2 bg-background px-3 py-2 rounded-lg shadow">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">处理中...</span>
              </div>
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuLabel>添加媒体</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleSelectFile} disabled={loading}>
          <TbFileImport className="w-4 h-4 mr-2" />
          选择文件...
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled className="text-muted-foreground">
          <TbVideo className="w-4 h-4 mr-2" />
          从资源库选择
          <span className="ml-auto text-[10px]">即将推出</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

/**
 * useMediaDrop - 处理媒体拖拽的 hook
 *
 * 用于在轨道级别处理拖拽事件
 */
export const useMediaDrop = (options: {
  disabled?: boolean;
  onDrop: (filePaths: string[], dropTime: number) => void;
  pixelsPerSecond: number;
  scrollLeft: number;
  containerRef: React.RefObject<HTMLDivElement>;
}) => {
  const { disabled, onDrop, pixelsPerSecond, scrollLeft, containerRef } = options;
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.types.includes('Files')) {
        setIsDraggingOver(true);
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // 检查是否真的离开了容器
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const { clientX, clientY } = e;
        if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
          setIsDraggingOver(false);
        }
      }
    },
    [containerRef]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);

      if (disabled) return;

      // 计算拖放位置对应的时间
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left + scrollLeft;
      const dropTime = x / pixelsPerSecond;

      // 提取文件路径
      const files = e.dataTransfer.files;
      const filePaths: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = (file as File & { path?: string }).path;
        if (filePath) {
          filePaths.push(filePath);
        }
      }

      if (filePaths.length > 0) {
        onDrop(filePaths, dropTime);
      }
    },
    [disabled, containerRef, scrollLeft, pixelsPerSecond, onDrop]
  );

  return {
    isDraggingOver,
    dragHandlers: {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop
    }
  };
};

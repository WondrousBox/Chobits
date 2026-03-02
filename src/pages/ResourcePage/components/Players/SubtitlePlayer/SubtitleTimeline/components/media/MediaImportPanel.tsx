import clsx from 'clsx';
import React, { useCallback, useState } from 'react';
import { TbFileImport, TbPhoto, TbUpload, TbVideo, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

import { useConfigAdapter, useIdGeneratorAdapter, useMediaAdapter } from '../../context';
import type { MediaSegment, MediaSource, MediaTrackData } from '../../types';
import { DEFAULT_TRANSFORM } from '../../types';

interface MediaImportPanelProps {
  open: boolean;
  onClose: () => void;
  onImport: (sources: MediaSource[], segments?: Omit<MediaSegment, 'id'>[]) => void;
  tracks: MediaTrackData[];
  currentTime?: number;
  duration: number;
  className?: string;
}

/**
 * MediaImportPanel - 媒体导入面板
 *
 * 支持拖拽和选择文件来导入媒体（视频/图片）
 */
export const MediaImportPanel: React.FC<MediaImportPanelProps> = ({ open, onClose, onImport, tracks, currentTime = 0, duration, className }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<MediaSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [targetTrackId, setTargetTrackId] = useState<string | 'new'>('new');
  const [error, setError] = useState<string | null>(null);

  // Get adapters from context
  const mediaAdapter = useMediaAdapter();
  const configAdapter = useConfigAdapter();
  const idGeneratorAdapter = useIdGeneratorAdapter();

  // Get file extensions from config adapter
  const videoExtensions = configAdapter?.videoExtensions || ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'];
  const imageExtensions = configAdapter?.imageExtensions || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];

  // Handle drag events
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Process file paths
  const processFilePaths = useCallback(async (filePaths: string[]) => {
    setLoading(true);
    setError(null);

    try {
      const mediaSources: MediaSource[] = [];

      for (const filePath of filePaths) {
        // Determine file type by extension
        const ext = filePath.split('.').pop()?.toLowerCase() || '';

        const isVideo = videoExtensions.includes(ext);
        const isImage = imageExtensions.includes(ext);

        if (!isVideo && !isImage) {
          console.warn(`Skipping unsupported file: ${filePath}`);
          continue;
        }

        // Get media info via adapter
        let info: { width: number; height: number; duration?: number } | null = null;
        try {
          info = await mediaAdapter?.getMediaInfo?.(filePath) || null;
        } catch (err) {
          console.warn(`Could not get info for ${filePath}:`, err);
        }

        // Use info from adapter or fallback to defaults
        const width = info?.width || configAdapter?.defaultMediaInfo?.width || 1920;
        const height = info?.height || configAdapter?.defaultMediaInfo?.height || 1080;
        const videoDuration = info?.duration || (isVideo ? 10 : undefined);

        // Generate ID using adapter
        const sourceId = idGeneratorAdapter?.generateMediaSourceId?.() || `source-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

        mediaSources.push({
          id: sourceId,
          path: filePath,
          type: isVideo ? 'video' : 'image',
          duration: videoDuration,
          width,
          height
        });
      }

      if (mediaSources.length > 0) {
        setSelectedFiles((prev) => [...prev, ...mediaSources]);
      } else {
        setError('没有找到有效的媒体文件（支持视频和图片)');
      }
    } catch (err) {
      console.error('Error processing files:', err);
      setError(err instanceof Error ? err.message : '处理文件时出错');
    } finally {
      setLoading(false);
    }
  }, [mediaAdapter, configAdapter, idGeneratorAdapter, videoExtensions, imageExtensions]);

  // Handle file drop
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      setError(null);

      // Extract file paths from the dataTransfer
      const files = e.dataTransfer.files;
      if (files.length === 0) return;

      // Extract file paths from the drag event
      const filePaths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Electron adds a 'path' property to File objects
        const filePath = (file as File & { path?: string }).path;
        if (filePath) {
          filePaths.push(filePath);
        }
      }

      if (filePaths.length === 0) {
        setError('无法获取文件路径，请使用"选择文件"按钮');
        return;
      }

      await processFilePaths(filePaths);
    },
    [processFilePaths]
  );

  // Remove a selected file
  const handleRemoveFile = useCallback((sourceId: string) => {
    setSelectedFiles((prev) => prev.filter((s) => s.id !== sourceId));
  }, []);

  // Open file dialog
  const openFileDialog = useCallback(async () => {
    try {
      const result = await mediaAdapter?.pickFiles?.({
        filters: [{ name: 'Media Files', extensions: [...videoExtensions, ...imageExtensions] }],
        multi: true
      });

      if (result && !result.canceled) {
        const filePaths = result.paths || (result.path ? [result.path] : []);
        if (filePaths.length > 0) {
          await processFilePaths(filePaths);
        }
      }
    } catch (err) {
      console.error('Error opening file dialog:', err);
      setError(err instanceof Error ? err.message : '打开文件对话框失败');
    }
  }, [mediaAdapter, videoExtensions, imageExtensions, processFilePaths]);

  // Handle import
  const handleImport = useCallback(() => {
    if (selectedFiles.length === 0) return;

    // Create segments for each source
    const segments: Omit<MediaSegment, 'id'>[] = selectedFiles.map((source, index) => {
      const startOffset = index * 5; // 5 seconds apart by default
      const segmentDuration = source.type === 'video' ? Math.min(source.duration || 5, 5) : 5; // Default 5 seconds

      return {
        sourceId: source.id,
        timelineStart: currentTime + startOffset,
        timelineEnd: currentTime + startOffset + segmentDuration,
        sourceStart: 0,
        sourceEnd: source.type === 'video' ? Math.min(source.duration || 5, segmentDuration) : undefined,
        playbackRate: 1.0,
        muted: false,
        volume: 1.0,
        transform: { ...DEFAULT_TRANSFORM },
        label: source.path.split('/').pop()
      };
    });

    onImport(selectedFiles, segments);
    setSelectedFiles([]);
    onClose();
  }, [selectedFiles, currentTime, onImport, onClose]);

  // Clear selection
  const handleClear = useCallback(() => {
    setSelectedFiles([]);
    setError(null);
  }, []);

  if (!open) return null;

  return (
    <div className={clsx('fixed inset-0 z-50 flex items-center justify-center bg-black/50', className)}>
      <div className="bg-background border rounded-lg shadow-lg w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-medium">导入媒体文件</h3>
          <Button variant="ghost" size="sm" className="w-7 h-7 p-0" onClick={onClose}>
            <TbX className="w-4 h-4" />
          </Button>
        </div>

        {/* Drop zone */}
        <div
          className={clsx(
            'm-4 border-2 border-dashed rounded-lg p-8 text-center transition-colors',
            isDragging ? 'border-primary bg-primary/10' : 'border-muted-foreground/30',
            loading && 'opacity-50 pointer-events-none'
          )}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {loading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">正在处理文件...</span>
            </div>
          ) : (
            <>
              <TbUpload className="w-10 h-10 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-2">拖拽视频或图片文件到此处</p>
              <Button variant="outline" size="sm" onClick={openFileDialog}>
                <TbFileImport className="w-4 h-4 mr-1" />
                选择文件
              </Button>
            </>
          )}
        </div>

        {/* Error message */}
        {error && <div className="mx-4 mb-2 px-3 py-2 bg-destructive/10 text-destructive text-xs rounded">{error}</div>}

        {/* Selected files */}
        {selectedFiles.length > 0 && (
          <div className="mx-4 mb-4">
            <div className="text-xs text-muted-foreground mb-2">已选择的文件 ({selectedFiles.length})</div>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {selectedFiles.map((file) => (
                <div key={file.id} className="flex items-center justify-between px-2 py-1.5 bg-muted/30 rounded text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    {file.type === 'video' ? <TbVideo className="w-4 h-4 shrink-0 text-blue-500" /> : <TbPhoto className="w-4 h-4 shrink-0 text-green-500" />}
                    <span className="truncate">{file.path.split('/').pop()}</span>
                    {file.duration && <span className="text-muted-foreground shrink-0">{file.duration.toFixed(1)}s</span>}
                  </div>
                  <Button variant="ghost" size="sm" className="w-5 h-5 p-0 shrink-0" onClick={() => handleRemoveFile(file.id)}>
                    <TbX className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Track selector */}
        <div className="mx-4 mb-4">
          <div className="text-xs text-muted-foreground mb-2">添加到轨道</div>
          <select value={targetTrackId} onChange={(e) => setTargetTrackId(e.target.value)} className="w-full px-3 py-2 text-sm border rounded bg-background">
            <option value="new">新建轨道</option>
            {tracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.label}
              </option>
            ))}
          </select>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
          <Button variant="ghost" size="sm" onClick={handleClear} disabled={selectedFiles.length === 0}>
            清空选择
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              取消
            </Button>
            <Button size="sm" onClick={handleImport} disabled={selectedFiles.length === 0 || loading}>
              导入 ({selectedFiles.length})
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

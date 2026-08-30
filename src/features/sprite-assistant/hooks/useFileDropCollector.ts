/**
 * useFileDropCollector
 *
 * 文件拖放采集器：处理 DOM 拖放事件，向主进程上报 sprite 文件拖放交互。
 * mini 分支已移除资源库，拖放文件不再入库。
 */
import { useRef, useState } from 'react';

import type { DroppedFileInfo } from '@/components/common/Dropzone';

type FileDropPayloadItem = { name: string; path?: string };

function createFileDropCorrelationId(): string {
  return `file-drop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useFileDropCollector(): {
  isFileDragOver: boolean;
  handleDragEnter: (e: React.DragEvent<HTMLElement>) => void;
  handleDragLeave: (e: React.DragEvent<HTMLElement>) => void;
  handleDrop: (e: React.DragEvent<HTMLElement>) => Promise<void>;
  handleDropFiles: (files: DroppedFileInfo[]) => Promise<void>;
} {
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const dragCounterRef = useRef(0);
  const dragCorrelationIdRef = useRef<string | null>(null);

  const isFilesDrag = (e: React.DragEvent): boolean => Array.from(e.dataTransfer?.types || []).includes('Files');

  const handleDragEnter = (e: React.DragEvent<HTMLElement>): void => {
    if (!isFilesDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    setIsFileDragOver(true);

    // 上报交互：文件拖入 → 触发 fileDragOver 动画
    if (dragCounterRef.current === 1) {
      const correlationId = dragCorrelationIdRef.current ?? createFileDropCorrelationId();
      dragCorrelationIdRef.current = correlationId;
      window.YUA.sprite.interact('file-drag-over', { correlationId });
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLElement>): void => {
    if (!isFilesDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsFileDragOver(false);
      // 上报交互：文件拖出 → 结束 fileDragOver 动画
      const correlationId = dragCorrelationIdRef.current;
      window.YUA.sprite.interact('file-drag-leave', correlationId ? { correlationId } : undefined);
      dragCorrelationIdRef.current = null;
    }
  };

  const reportFileDrop = async (payload: FileDropPayloadItem[]): Promise<void> => {
    const correlationId = dragCorrelationIdRef.current ?? createFileDropCorrelationId();
    dragCorrelationIdRef.current = null;
    await window.YUA.sprite.fileDrop(payload, { correlationId });
  };

  const handleDrop = async (e: React.DragEvent<HTMLElement>): Promise<void> => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsFileDragOver(false);

    const files = Array.from(e.dataTransfer?.files || []) as any[];
    const payload = files.map((f) => ({ name: f.name, path: (f as any).path as string | undefined }));
    await reportFileDrop(payload);
  };

  const handleDropFiles = async (files: DroppedFileInfo[]): Promise<void> => {
    dragCounterRef.current = 0;
    setIsFileDragOver(false);

    const payload = files.map((f) => ({ name: f.name, path: f.path }));
    await reportFileDrop(payload);
  };

  return { isFileDragOver, handleDragEnter, handleDragLeave, handleDrop, handleDropFiles };
}

export default useFileDropCollector;

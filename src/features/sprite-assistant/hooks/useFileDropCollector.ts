/**
 * useFileDropCollector
 *
 * 文件拖放采集器：处理 DOM 拖放事件，上报到主进程，调用资源服务导入。
 * 保留原有资源导入逻辑，新增向主进程上报 sprite:file-drop。
 */
import { useRef, useState } from 'react';

import { getLocalPathForFile, isAbsoluteLocalFilePath } from '@/lib/local-file-path';
import { SelectedResourceFileType } from '@/pages/ResourcePage/types';

import { addResourcesFromDataTransfer, addResourcesFromSelectedFiles } from '../../../pages/ResourcePage/services/resourceService';

type FileDropPayloadItem = { name?: string; path?: string };
type FileDropResourceItem = { id?: string; title?: string; filePath?: string; [key: string]: unknown };

function getLocalPath(file: SelectedResourceFileType): string | undefined {
  if (isAbsoluteLocalFilePath(file.localPath)) return file.localPath;
  if (file.file) {
    return getLocalPathForFile(file.file);
  }
  return isAbsoluteLocalFilePath(file.path) ? file.path : undefined;
}

function createFileDropCorrelationId(): string {
  return `file-drop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function emitFileDropResourcesReady(correlationId: string, attemptedFiles: FileDropPayloadItem[], resources: FileDropResourceItem[] | null | undefined): Promise<void> {
  try {
    const safeResources = resources ?? [];
    const importedFiles = safeResources.map((resource) => ({
      name: resource.title || (resource.filePath ? resource.filePath.split(/[/\\]/).pop() || '' : ''),
      ...(resource.filePath ? { path: resource.filePath } : {})
    }));
    const files = importedFiles.length ? importedFiles : attemptedFiles;
    const attemptedCount = attemptedFiles.length;
    const failedCount = Math.max(0, attemptedCount - safeResources.length);
    const importStatus = failedCount === 0 ? 'success' : safeResources.length ? 'partial' : 'failed';
    const fileActionsMenuPayload = {
      files,
      resources: safeResources,
      source: 'drop',
      correlationId
    };
    await window.YUA.sprite.emitPurposeEvent({
      source: 'purpose-event',
      event: 'fileDrop:resources-ready',
      correlationId,
      payload: {
        purposeSource: 'sprite-drop',
        importStatus,
        attemptedCount,
        failedCount,
        files,
        resources: safeResources,
        fileActionsMenuPayload,
        fileCount: attemptedCount,
        fileNames: attemptedFiles.map((file) => file.name).filter(Boolean),
        resourceIds: safeResources.map((resource) => resource.id).filter(Boolean),
        primaryResourceName: safeResources[0]?.title
      }
    });
  } catch (err) {
    console.warn('[useFileDropCollector] failed to emit file drop resources-ready event', err);
  }
}

export function useFileDropCollector(): {
  isFileDragOver: boolean;
  handleDragEnter: (e: React.DragEvent<HTMLElement>) => void;
  handleDragLeave: (e: React.DragEvent<HTMLElement>) => void;
  handleDrop: (e: React.DragEvent<HTMLElement>) => Promise<void>;
  handleDropFiles: (files: SelectedResourceFileType[]) => Promise<void>;
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

  const handleDrop = async (e: React.DragEvent<HTMLElement>): Promise<void> => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsFileDragOver(false);

    const files = Array.from(e.dataTransfer?.files || []) as File[];
    const payload = files.map((file) => {
      const path = getLocalPathForFile(file);
      return { name: file.name, ...(path ? { path } : {}) };
    });
    const correlationId = dragCorrelationIdRef.current ?? createFileDropCorrelationId();
    dragCorrelationIdRef.current = null;
    await window.YUA.sprite.fileDrop(payload, { correlationId });

    // 资源导入（保留原有逻辑）
    let resources: FileDropResourceItem[] = [];
    try {
      resources = await addResourcesFromDataTransfer(e.dataTransfer!, { source: 'sprite-drop' });
    } catch (error) {
      console.error('[useFileDropCollector] failed to import dropped files', error);
    }
    await emitFileDropResourcesReady(correlationId, payload, resources);
  };

  const handleDropFiles = async (files: SelectedResourceFileType[]): Promise<void> => {
    dragCounterRef.current = 0;
    setIsFileDragOver(false);
    dragCorrelationIdRef.current = null;

    const payload = files.map((f) => {
      const path = getLocalPath(f);
      return { name: f.name, ...(path ? { path } : {}) };
    });
    const correlationId = createFileDropCorrelationId();
    await window.YUA.sprite.fileDrop(payload, { correlationId });

    // 资源导入（保留原有逻辑）
    let resources: FileDropResourceItem[] = [];
    try {
      resources = await addResourcesFromSelectedFiles(files, { source: 'sprite-drop' });
    } catch (error) {
      console.error('[useFileDropCollector] failed to import dropped files', error);
    }
    await emitFileDropResourcesReady(correlationId, payload, resources);
  };

  return { isFileDragOver, handleDragEnter, handleDragLeave, handleDrop, handleDropFiles };
}

export default useFileDropCollector;

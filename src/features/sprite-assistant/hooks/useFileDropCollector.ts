/**
 * useFileDropCollector
 *
 * 文件拖放采集器：处理 DOM 拖放事件，上报到主进程，调用资源服务导入。
 * 保留原有资源导入逻辑，新增向主进程上报 sprite:file-drop。
 */
import { useRef, useState } from 'react';

import { SelectedResourceFileType } from '@/pages/ResourcePage/types';

import { addResourcesFromDataTransfer, addResourcesFromSelectedFiles } from '../../../pages/ResourcePage/services/resourceService';

export function useFileDropCollector(): {
  isFileDragOver: boolean;
  handleDragEnter: (e: React.DragEvent<HTMLElement>) => void;
  handleDragLeave: (e: React.DragEvent<HTMLElement>) => void;
  handleDrop: (e: React.DragEvent<HTMLElement>) => Promise<void>;
  handleDropFiles: (files: SelectedResourceFileType[]) => Promise<void>;
} {
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const isFilesDrag = (e: React.DragEvent): boolean => Array.from(e.dataTransfer?.types || []).includes('Files');

  const handleDragEnter = (e: React.DragEvent<HTMLElement>): void => {
    if (!isFilesDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    setIsFileDragOver(true);

    // 上报交互：文件拖入 → 触发 fileDragOver 动画
    if (dragCounterRef.current === 1) {
      window.YUA.sprite.interact('file-drag-over');
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
      window.YUA.sprite.interact('file-drag-leave');
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLElement>): Promise<void> => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsFileDragOver(false);

    const files = Array.from(e.dataTransfer?.files || []) as any[];
    const payload = files.map((f) => ({ name: f.name, path: (f as any).path as string | undefined }));
    window.YUA.sprite.fileDrop(payload);

    // 资源导入（保留原有逻辑）
    const resources = await addResourcesFromDataTransfer(e.dataTransfer!);
    if (payload.length) {
      window.YUA.window['window:open']('fileActionsMenu', { files: payload, resources, source: 'drop' });
    }
  };

  const handleDropFiles = async (files: SelectedResourceFileType[]): Promise<void> => {
    dragCounterRef.current = 0;
    setIsFileDragOver(false);

    const payload = files.map((f) => ({ name: f.name, path: f.path }));
    window.YUA.sprite.fileDrop(payload);

    // 资源导入（保留原有逻辑）
    const resources = await addResourcesFromSelectedFiles(files);
    if (resources) {
      const resPayload = resources.map((res) => ({
        name: res.title || (res.filePath ? res.filePath.split(/[/\\]/).pop() || '' : ''),
        path: res.filePath
      }));
      if (resPayload.length) {
        window.YUA.window['window:open']('fileActionsMenu', { files: resPayload, resources, source: 'drop' });
      }
    }
  };

  return { isFileDragOver, handleDragEnter, handleDragLeave, handleDrop, handleDropFiles };
}

export default useFileDropCollector;

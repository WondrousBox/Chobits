/**
 * useFileDrop
 * - 负责：Dropzone 的文件拖拽状态（进入/离开/落下）并调用资源服务入库；可回调停止行走与关闭穿透。
 * - 返回：{ isFileDragOver, handleDragEnter, handleDragLeave, handleDrop, handleDropFiles }
 */
import { useRef, useState } from 'react';

import { SelectedResourceFileType } from '@/pages/ResourcePage/types';

import { addResourcesFromDataTransfer, addResourcesFromSelectedFiles } from '../../../pages/ResourcePage/services/resourceService';

export function useFileDrop(
  onStopWalking?: () => void,
  onClickThrough?: (enable: boolean) => void
): {
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
    onStopWalking?.();
    onClickThrough?.(false);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLElement>): void => {
    if (!isFilesDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setIsFileDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLElement>): Promise<void> => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsFileDragOver(false);
    onClickThrough?.(false);
    onStopWalking?.();
    // 回退到原有逻辑
    const resources = await addResourcesFromDataTransfer(e.dataTransfer!);
    const files = Array.from(e.dataTransfer?.files || []) as any[];
    const payload = files.map((f) => ({ name: f.name, path: (f as any).path as string | undefined }));
    if (payload.length) {
      window.YUA.window['window:open']('fileActionsMenu', { files: payload, resources, source: 'drop' });
    }
  };

  const handleDropFiles = async (files: SelectedResourceFileType[]): Promise<void> => {
    dragCounterRef.current = 0;
    setIsFileDragOver(false);
    onClickThrough?.(false);
    onStopWalking?.();
    // 回退
    const resources = await addResourcesFromSelectedFiles(files);
    console.log(resources);

    if (resources) {
      const payload = resources.map((res) => ({ name: res.title || (res.filePath ? res.filePath.split(/[/\\]/).pop() || '' : ''), path: res.filePath }));
      if (payload.length) {
        window.YUA.window['window:open']('fileActionsMenu', { files: payload, resources, source: 'drop' });
      }
    }
  };

  return { isFileDragOver, handleDragEnter, handleDragLeave, handleDrop, handleDropFiles };
}

export default useFileDrop;

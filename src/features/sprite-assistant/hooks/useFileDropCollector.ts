/**
 * useFileDropCollector
 *
 * 文件拖放采集器：处理 DOM 拖放事件，上报到主进程，调用资源服务导入。
 * 保留原有资源导入逻辑，新增向主进程上报 sprite:file-drop。
 */
import { useRef, useState } from 'react';

import { SelectedResourceFileType } from '@/pages/ResourcePage/types';

import { addResourcesFromDataTransfer, addResourcesFromSelectedFiles } from '../../../pages/ResourcePage/services/resourceService';

type FileDropPayloadItem = { name: string; path?: string };
type FileDropResourceItem = { id?: string; title?: string; [key: string]: unknown };
type FileDropInvitePurposeStart = {
  purposeId?: string;
  purposeStatus?: string;
  startStatus?: string;
};

function createFileDropCorrelationId(): string {
  return `file-drop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function startFileDropPurpose(correlationId: string, files: FileDropPayloadItem[], resources: FileDropResourceItem[] | null | undefined): Promise<boolean> {
  try {
    const menuPayload = {
      files,
      resources: resources ?? [],
      source: 'drop',
      correlationId
    };
    const result = await window.YUA.sprite.startPurpose({
      kind: 'file.drop.intake',
      reason: '用户把文件拖给角色处理',
      source: 'user-event',
      presetId: 'file.drop.intake',
      priority: 100,
      correlationId,
      context: {
        files,
        resources: resources ?? [],
        fileActionsMenuPayload: menuPayload,
        fileCount: files.length,
        fileNames: files.map((file) => file.name).filter(Boolean),
        resourceIds: (resources ?? []).map((resource) => resource.id).filter(Boolean),
        primaryResourceName: resources?.[0]?.title
      }
    });
    return result.accepted;
  } catch (err) {
    console.warn('[useFileDropCollector] failed to start file drop purpose', err);
    return false;
  }
}

async function startFileDropInvitePurpose(correlationId: string): Promise<FileDropInvitePurposeStart | null> {
  try {
    const result = await window.YUA.sprite.startPurpose({
      kind: 'file.drop.invite',
      reason: '用户正在把文件拖向角色',
      source: 'user-event',
      presetId: 'file.drop.invite',
      priority: 85,
      interruptPolicy: 'interruptible',
      correlationId,
      coalesceKey: 'file-drop-invite',
      context: {
        source: 'drag-enter'
      }
    });
    return {
      purposeId: result.purpose?.id,
      purposeStatus: result.purpose?.status,
      startStatus: result.status
    };
  } catch (err) {
    console.warn('[useFileDropCollector] failed to start file drop invite purpose', err);
    return null;
  }
}

async function cancelFileDropInvitePurpose(purposeId: string, reason: string): Promise<void> {
  try {
    await window.YUA.sprite.cancelPurpose(purposeId, reason);
  } catch (err) {
    console.warn('[useFileDropCollector] failed to cancel file drop invite purpose', err);
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
  const invitePurposeIdRef = useRef<string | null>(null);

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
      window.YUA.sprite.interact('file-drag-over');
      void startFileDropInvitePurpose(correlationId).then((invite) => {
        if (!invite?.purposeId) {
          return;
        }
        if (invite.startStatus === 'queued' || invite.purposeStatus === 'queued') {
          void cancelFileDropInvitePurpose(invite.purposeId, 'file-drop-invite-queued');
          return;
        }
        if (dragCorrelationIdRef.current === correlationId) {
          invitePurposeIdRef.current = invite.purposeId;
        }
      });
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
      dragCorrelationIdRef.current = null;
      invitePurposeIdRef.current = null;
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLElement>): Promise<void> => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsFileDragOver(false);

    const files = Array.from(e.dataTransfer?.files || []) as any[];
    const payload = files.map((f) => ({ name: f.name, path: (f as any).path as string | undefined }));
    const correlationId = dragCorrelationIdRef.current ?? createFileDropCorrelationId();
    dragCorrelationIdRef.current = null;
    invitePurposeIdRef.current = null;
    window.YUA.sprite.fileDrop(payload);

    // 资源导入（保留原有逻辑）
    const resources = await addResourcesFromDataTransfer(e.dataTransfer!);
    if (payload.length) {
      const started = await startFileDropPurpose(correlationId, payload, resources);
      if (!started) {
        window.YUA.window['window:open']('fileActionsMenu', { files: payload, resources, source: 'drop', correlationId });
      }
    }
  };

  const handleDropFiles = async (files: SelectedResourceFileType[]): Promise<void> => {
    dragCounterRef.current = 0;
    setIsFileDragOver(false);
    dragCorrelationIdRef.current = null;
    invitePurposeIdRef.current = null;

    const payload = files.map((f) => ({ name: f.name, path: f.path }));
    const correlationId = createFileDropCorrelationId();
    window.YUA.sprite.fileDrop(payload);

    // 资源导入（保留原有逻辑）
    const resources = await addResourcesFromSelectedFiles(files);
    if (resources) {
      const resPayload = resources.map((res) => ({
        name: res.title || (res.filePath ? res.filePath.split(/[/\\]/).pop() || '' : ''),
        path: res.filePath
      }));
      if (resPayload.length) {
        const started = await startFileDropPurpose(correlationId, resPayload, resources);
        if (!started) {
          window.YUA.window['window:open']('fileActionsMenu', { files: resPayload, resources, source: 'drop', correlationId });
        }
      }
    }
  };

  return { isFileDragOver, handleDragEnter, handleDragLeave, handleDrop, handleDropFiles };
}

export default useFileDropCollector;

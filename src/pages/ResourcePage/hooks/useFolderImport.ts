import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

interface UseFolderImportProps {
  folderFilter: string;
  wsFilter: string | undefined;
  load: () => Promise<void>;
  loadFolders: (wsId?: string) => Promise<void>;
  // 是否显示成功 toast，默认为 true。当多个组件使用此 hook 时，只需一个显示 toast
  showSuccessToast?: boolean;
}

export function useFolderImport({ folderFilter, wsFilter, load, loadFolders, showSuccessToast = true }: UseFolderImportProps): {
  importFiles: () => Promise<void>;
  importFolders: () => Promise<void>;
  importProgress: {
    visible: boolean;
    current: number;
    total: number;
    percent: number;
    message: string;
  };
} {
  const [importProgress, setImportProgress] = useState<{
    visible: boolean;
    current: number;
    total: number;
    percent: number;
    message: string;
  }>({ visible: false, current: 0, total: 0, percent: 0, message: '' });

  const resourceAPI: any = window.YUA?.resource;

  // Listen for progress events from main process
  useEffect(() => {
    if (!window.ipcRenderer) return;
    const fn = (_event: any, payload: any): void => {
      if (payload.error) {
        toast.error(payload.error);
        setImportProgress((prev) => ({ ...prev, visible: false }));
      } else {
        setImportProgress(payload);
        if (!payload.visible && payload.percent === 100) {
          if (showSuccessToast) {
            // 使用固定 id 去重，防止 preload ipcRenderer.off 无法正确移除监听器导致的重复 toast
            toast.success('导入完成', { id: 'import-complete' });
          }
          load();
          loadFolders(wsFilter);
        }
      }
    };
    window.ipcRenderer.on('resource:import-progress', fn);
    return () => {
      window.ipcRenderer.off('resource:import-progress', fn);
    };
  }, [load, loadFolders, wsFilter, showSuccessToast]);

  const importFiles = useCallback(async () => {
    try {
      const res = await resourceAPI['resource:importLocalFiles']({
        workspaceId: wsFilter,
        folderId: folderFilter || undefined
      });

      if (res?.canceled) return;
      if (!res?.success) {
        const message = res?.error === 'linked-folder-readonly' ? 'Linked folders are read-only right now' : 'Failed to start import';
        toast.error(message);
        return;
      }

      setImportProgress({ visible: true, current: 0, total: 0, percent: 0, message: '准备导入...' });
    } catch (err) {
      console.error('Import files failed', err);
      toast.error('启动导入失败');
    }
  }, [resourceAPI, folderFilter, wsFilter]);

  const importFolders = useCallback(async () => {
    try {
      const res = await resourceAPI['resource:importLocalFolders']({
        workspaceId: wsFilter,
        folderId: folderFilter || undefined
      });

      if (res?.canceled) return;
      if (!res?.success) {
        const message = res?.error === 'linked-folder-readonly' ? 'Linked folders are read-only right now' : 'Failed to start import';
        toast.error(message);
        return;
      }

      setImportProgress({ visible: true, current: 0, total: 0, percent: 0, message: '准备导入...' });
    } catch (err) {
      console.error('Import folders failed', err);
      toast.error('启动导入失败');
    }
  }, [resourceAPI, folderFilter, wsFilter]);

  return {
    importFiles,
    importFolders,
    importProgress
  };
}

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

interface UseFolderImportProps {
  folderFilter: string;
  wsFilter: string | undefined;
  load: () => Promise<void>;
  loadFolders: (wsId?: string) => Promise<void>;
}

export function useFolderImport({ folderFilter, wsFilter, load, loadFolders }: UseFolderImportProps): {
  importFolder: () => Promise<void>;
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
          toast.success('导入完成');
          load();
          loadFolders(wsFilter);
        }
      }
    };
    window.ipcRenderer.on('resource:import-progress', fn);
    return () => {
      window.ipcRenderer.off('resource:import-progress', fn);
    };
  }, [load, loadFolders, wsFilter]);

  const importFolder = useCallback(async () => {
    try {
      // Call main process to handle everything
      const res = await resourceAPI['resource:importLocal']({
        workspaceId: wsFilter,
        folderId: folderFilter || undefined
      });

      if (res?.canceled) return;

      // If not canceled, the main process has started the task and will send progress events
      setImportProgress({ visible: true, current: 0, total: 0, percent: 0, message: '准备导入...' });
    } catch (err) {
      console.error('Import failed', err);
      toast.error('启动导入失败');
    }
  }, [resourceAPI, folderFilter, wsFilter]);

  return {
    importFolder,
    importProgress
  };
}

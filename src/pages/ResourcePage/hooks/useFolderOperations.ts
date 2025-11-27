import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { type UIFolder } from '../components/FolderSidebar';
import { ResourceItem } from '../types';

export const useFolderOperations = (
  folders: UIFolder[],
  wsFilter: string | undefined,
  folderFilter: string,
  setFolderFilter: (value: string) => void,
  list: ResourceItem[],
  load: () => Promise<void>,
  loadFolders: (workspaceId?: string) => Promise<void>
) => {
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameId, setRenameId] = useState<string>('');
  const [renameName, setRenameName] = useState<string>('');
  const folderAPI: any = window.YUA?.folder;

  const handleMoveFolder = useCallback(
    async (id: string, newParentId: string | null) => {
      const cur = folders.find((f) => f.id === id);
      if (!cur) return;
      const targetPid = newParentId ?? null;
      const curPid = cur.parentId ?? null;
      if (curPid === targetPid) return;
      // 如果主进程执行失败（例如 UNIQUE 约束），invoke 会 reject，让上层捕获并提示
      const r = await folderAPI['folder.move']({ id, parentId: targetPid });
      if (!(r as any)?.success) {
        throw new Error('folder-move-failed');
      }
      await loadFolders(wsFilter || undefined);
    },
    [folders, folderAPI, loadFolders, wsFilter]
  );

  const handleOpenFolderLocation = useCallback(async (id: string) => {
    try {
      const ws = await (window as any).YUA?.workspace['workspace:getDefault']();
      const isWin = (window as any).YUA?.isWindows;
      const sep = isWin ? '\\' : '/';
      const base: string = ws?.rootPath || '';
      if (!base) return;
      const needsSep = base.endsWith(sep) ? '' : sep;
      const folderPath = `${base}${needsSep}resources${sep}folders${sep}${id}`;
      await (window as any).YUA?.file['file:openPath'](folderPath);
    } catch (err) {
      console.warn('open folder path failed', err);
    }
  }, []);

  const handleRenameFolder = useCallback(
    (id: string) => {
      const f = folders.find((f) => f.id === id);
      setRenameId(id);
      setRenameName(f?.name || '');
      setRenameOpen(true);
    },
    [folders]
  );

  const handleDeleteFolder = useCallback(
    async (id: string) => {
      try {
        // 计算删除后的选中逻辑：
        // 1. 下一个同级
        // 2. 上一个同级
        // 3. 父级
        // 4. 空
        let nextSelectId = '';
        if (folderFilter === id) {
          const currentFolder = folders.find((f) => f.id === id);
          if (currentFolder) {
            const parentId = currentFolder.parentId || null;
            const siblings = folders.filter((f) => (f.parentId || null) === parentId && f.workspaceId === currentFolder.workspaceId);
            const index = siblings.findIndex((f) => f.id === id);
            if (index !== -1) {
              if (index + 1 < siblings.length) {
                nextSelectId = siblings[index + 1].id;
              } else if (index - 1 >= 0) {
                nextSelectId = siblings[index - 1].id;
              } else if (parentId) {
                nextSelectId = parentId;
              }
            }
          }
        }

        const r = await folderAPI['folder.softDelete']({ ids: [id] });
        if ((r as any)?.success) {
          if (folderFilter === id) setFolderFilter(nextSelectId);
          await loadFolders(wsFilter || undefined);
          toast.success('文件夹已删除', {
            description: '已移动到回收站',
            action: {
              label: '撤回',
              onClick: async () => {
                try {
                  const rr = await folderAPI['folder.restore']({ ids: [id] });
                  if ((rr as any)?.success) {
                    toast.success('已撤回删除');
                    await loadFolders(wsFilter || undefined);
                  } else {
                    toast.error('撤回失败');
                  }
                } catch (err) {
                  toast.error('撤回失败', { description: String((err as any)?.message || err) });
                }
              }
            }
          });
        }
      } catch (e) {
        console.warn('delete folder failed', e);
        toast.error('删除文件夹失败', { description: String((e as any)?.message || e) });
      }
    },
    [folderAPI, folderFilter, loadFolders, wsFilter, setFolderFilter, folders]
  );

  const handleMoveResourcesToFolder = useCallback(
    async (folderId: string | null, ids: string[]) => {
      try {
        if (!ids?.length) return;
        // 阻止跨工作空间：若目标文件夹存在，则检查其 workspaceId 与当前 ws 一致
        if (folderId) {
          try {
            const folder = await folderAPI['folder.get']({ id: folderId });
            if (folder && folder.workspaceId && wsFilter && folder.workspaceId !== wsFilter) {
              toast.error('无法跨工作空间移动到该文件夹');
              return;
            }
          } catch {
            /* ignore get error */
          }
        }

        // 记录撤回需要的"原始 folderId"映射
        const prevMap = new Map<string, string | null>();
        for (const id of ids) {
          const item: any = list.find((i) => i.id === id);
          prevMap.set(id, item?.folderId ?? null);
        }

        // 使用主进程批量 API
        const res = await window.YUA.resource['resource:moveToFolder']({ ids, folderId: folderId || null, workspaceId: wsFilter });
        if (!res?.success) {
          const invalidCount = Array.isArray((res as any)?.invalid) ? (res as any).invalid.length : 0;
          if (invalidCount > 0) {
            toast.error(`有 ${invalidCount} 个资源不属于当前空间，已阻止移动`);
          } else {
            toast.error('移动失败');
          }
          return;
        }
        // 刷新列表与文件夹（计数徽标）
        await Promise.all([load(), loadFolders(wsFilter)]);
        // 不再自动切换到目标文件夹：保持当前视图，避免跳变带来的困惑

        // 成功提示 + 撤回
        const folderName = folderId ? folders.find((f) => f.id === folderId)?.name || '目标文件夹' : '（移出文件夹）';
        const movedCount = (res as any)?.moved ?? ids.length;
        toast.success(`已移动到 ${folderId ? folderName : '全部'}`, {
          description: `共 ${movedCount} 个资源`,
          action: {
            label: '撤回',
            onClick: async () => {
              try {
                // 将资源按"原始 folderId"分组后分别调用批量接口
                const groups = new Map<string, string[]>();
                for (const [rid, prevFid] of prevMap.entries()) {
                  const key = prevFid || '__null__';
                  const arr = groups.get(key) || [];
                  arr.push(rid);
                  groups.set(key, arr);
                }
                for (const [key, groupIds] of groups.entries()) {
                  const backId = key === '__null__' ? null : key;
                  await window.YUA.resource['resource:moveToFolder']({ ids: groupIds, folderId: backId, workspaceId: wsFilter });
                }
                await Promise.all([load(), loadFolders(wsFilter)]);
                toast.success('已撤回移动');
              } catch (err) {
                toast.error('撤回失败', { description: String((err as any)?.message || err) });
              }
            }
          }
        });
      } catch (e) {
        console.warn('move resources to folder failed', e);
      }
    },
    [folderAPI, wsFilter, list, load, loadFolders, folders]
  );

  const handleRenameConfirm = useCallback(async () => {
    try {
      const name = renameName.trim();
      if (!renameId || !name) {
        setRenameOpen(false);
        return;
      }
      const r = await folderAPI['folder.rename']({ id: renameId, name });
      if ((r as any)?.success) await loadFolders(wsFilter || undefined);
    } catch (e) {
      console.warn('rename folder failed', e);
    } finally {
      setRenameOpen(false);
      setRenameId('');
      setRenameName('');
    }
  }, [renameId, renameName, folderAPI, loadFolders, wsFilter]);

  return {
    renameOpen,
    setRenameOpen,
    renameId,
    renameName,
    setRenameName,
    handleMoveFolder,
    handleOpenFolderLocation,
    handleRenameFolder,
    handleDeleteFolder,
    handleMoveResourcesToFolder,
    handleRenameConfirm
  };
};

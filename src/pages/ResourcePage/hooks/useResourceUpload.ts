import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { UIFolder } from '../components/FolderSidebar';
import { addResourcesFromSelectedFiles } from '../services/resourceService';
import { SelectedResourceFileType } from '../types';

interface UseResourceUploadProps {
  folderFilter: string;
  wsFilter: string | undefined;
  folders: UIFolder[];
  load: () => Promise<void>;
  loadFolders: (wsId?: string) => Promise<void>;
}

export function useResourceUpload({ folderFilter, wsFilter, folders, load, loadFolders }: UseResourceUploadProps): {
  onDropFiles: (files: SelectedResourceFileType[]) => Promise<void>;
  uploadProgress: {
    visible: boolean;
    current: number;
    total: number;
    percent: number;
  };
} {
  const [uploadProgress, setUploadProgress] = useState<{
    visible: boolean;
    current: number;
    total: number;
    percent: number;
  }>({ visible: false, current: 0, total: 0, percent: 0 });

  const folderAPI: any = window.YUA?.folder;

  const onDropFiles = useCallback(
    async (files: SelectedResourceFileType[]) => {
      if (!files || files.length === 0) return;

      // Normalize paths and group files by their relative folder path
      const normalize = (p: string | undefined): string => {
        if (!p) return '';
        const s = p.replace(/\\/g, '/');
        // remove leading slash
        return s.startsWith('/') ? s.slice(1) : s;
      };

      const filesWithFolder = files.map((f) => {
        const p = normalize(f.path);
        // compute folder path by removing the final segment if it matches the file name
        let folder = '';
        if (p) {
          const lastSlash = p.lastIndexOf('/');
          if (lastSlash >= 0) {
            folder = p.slice(0, lastSlash);
          } else {
            // no slash — file at top level of dropped selection
            folder = '';
          }
        }
        // If folder is ".", treat it as root (empty string)
        if (folder === '.') folder = '';
        return { file: f, folderPath: folder };
      });

      // Build set of folder paths (unique), and sort by depth (shallow -> deep)
      const folderSet = new Set<string>();
      for (const it of filesWithFolder) {
        if (it.folderPath) {
          // we need every ancestor path as well
          const parts = it.folderPath.split('/').filter(Boolean);
          for (let i = 0; i < parts.length; i++) {
            folderSet.add(parts.slice(0, i + 1).join('/'));
          }
        }
      }

      const folderPaths = Array.from(folderSet).sort((a, b) => a.split('/').length - b.split('/').length);

      // Create required folders in order, reusing existing folders if present
      const folderPathToId: Record<string, string> = {};
      const rootParentId = folderFilter || null;

      try {
        // Ensure top-level: if there are no folderPaths, treat as simple file upload
        if (folderPaths.length === 0) {
          setUploadProgress({ visible: true, current: 0, total: files.length, percent: 0 });
          try {
            await addResourcesFromSelectedFiles(files, { folderId: folderFilter || undefined, workspaceId: wsFilter || undefined }, (current, total, percent) => {
              setUploadProgress({ visible: true, current: current + 1, total, percent });
            });
            toast.success('已添加拖拽的文件');
            await load();
            await loadFolders(wsFilter || undefined);
          } catch (err) {
            console.error('处理拖拽失败', err);
            toast.error('添加失败');
          } finally {
            setUploadProgress((prev) => ({ ...prev, visible: false }));
          }
          return;
        }

        // create folders sequentially
        for (const pathStr of folderPaths) {
          const parts = pathStr.split('/').filter(Boolean);
          let currentParentId = rootParentId;
          const accum: string[] = [];
          for (const part of parts) {
            accum.push(part);
            const key = accum.join('/');
            if (folderPathToId[key]) {
              currentParentId = folderPathToId[key];
              continue;
            }

            // try to find existing folder in current workspace with same name and parent
            const existing = folders.find((f) => f.name === part && (f.parentId ?? null) === (currentParentId ?? null) && (f.workspaceId === wsFilter || !f.workspaceId));
            if (existing) {
              folderPathToId[key] = existing.id;
              currentParentId = existing.id;
              continue;
            }

            // create folder
            try {
              const res = await folderAPI['folder.create']({ name: part, parentId: currentParentId ?? null, workspaceId: wsFilter || undefined });
              if (res && (res as any).success) {
                const id = (res as any).data?.id;
                if (id) {
                  folderPathToId[key] = id;
                  currentParentId = id;
                }
              } else {
                // creation failed — fallback: stop creating deeper folders under this branch
                break;
              }
            } catch (err) {
              console.warn('create folder failed', err);
            }
          }
        }

        // Group files by folderPath
        const groups: Record<string, SelectedResourceFileType[]> = {};
        for (const it of filesWithFolder) {
          const key = it.folderPath || '';
          groups[key] = groups[key] || [];
          groups[key].push(it.file);
        }

        // Upload groups sequentially and update aggregated progress
        const totalFiles = files.length;
        let uploadedSoFar = 0;
        setUploadProgress({ visible: true, current: 0, total: totalFiles, percent: 0 });

        for (const [folderPath, groupFiles] of Object.entries(groups)) {
          const targetFolderId = folderPath ? (folderPathToId[folderPath] ?? rootParentId) : rootParentId;
          // call upload helper for this group
          await addResourcesFromSelectedFiles(groupFiles, { folderId: targetFolderId || undefined, workspaceId: wsFilter || undefined }, (currentIndex, groupTotal, percent) => {
            // currentIndex is 0-based within this group
            const absoluteIndex = uploadedSoFar + currentIndex;
            const overallPercent = Math.round(((absoluteIndex + percent / 100) / totalFiles) * 100);
            setUploadProgress({ visible: true, current: absoluteIndex + 1, total: totalFiles, percent: overallPercent });
          });
          uploadedSoFar += groupFiles.length;
        }

        toast.success('已添加拖拽的文件');
        await load();
        await loadFolders(wsFilter || undefined);
      } catch (err) {
        console.error('处理拖拽失败', err);
        toast.error('添加失败');
      } finally {
        setUploadProgress((prev) => ({ ...prev, visible: false }));
      }
    },
    [folderFilter, wsFilter, load, loadFolders, folders, folderAPI]
  );

  return {
    uploadProgress,
    onDropFiles
  };
}

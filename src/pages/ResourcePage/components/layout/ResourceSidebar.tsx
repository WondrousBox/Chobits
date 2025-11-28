import React from 'react';
import { TbFilter, TbHeart, TbSettings, TbTrash } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';

import FolderSidebar, { type UIFolder } from '../FolderSidebar';
import WorkspaceSwitcher from '../WorkspaceSwitcher';

interface ResourceSidebarProps {
  workspaces: any[];
  wsFilter: string | undefined;
  hasFavorites: boolean;
  favoriteFilter: boolean;
  setFavoriteFilter: (fav: boolean) => void;
  setFolderFilter: (folder: string) => void;
  setTypeFilter: (types: string[]) => void;
  typeFilter: string[];
  folders: UIFolder[];
  folderFilter: string;
  saveCurrentFolder: (folderId: string) => void;
  folderCounts: Record<string, number>;
  allCount: number;
  handleMoveResourcesToFolder: (folderId: string, ids: string[]) => Promise<void>;
  handleMoveFolder: (folderId: string, targetId: string | null) => Promise<void>;
  loadFolders: (wsId?: string) => Promise<void>;
  handleRenameFolder: (id: string) => void;
  handleDeleteFolder: (id: string) => void;
  folderAPI: any;
  showTasks: boolean;
  setShowTasks: (show: boolean) => void;
}

const ResourceSidebar: React.FC<ResourceSidebarProps> = ({
  workspaces,
  wsFilter,
  hasFavorites,
  favoriteFilter,
  setFavoriteFilter,
  setFolderFilter,
  setTypeFilter,
  typeFilter,
  folders,
  folderFilter,
  saveCurrentFolder,
  folderCounts,
  allCount,
  handleMoveResourcesToFolder,
  handleMoveFolder,
  loadFolders,
  handleRenameFolder,
  handleDeleteFolder,
  folderAPI,
  showTasks,
  setShowTasks
}) => {
  return (
    <Sidebar collapsible="none" className="h-full w-80 bg-sidebar">
      <SidebarHeader>
        <WorkspaceSwitcher workspaces={workspaces} currentWorkspaceId={wsFilter} />
        <SidebarMenu className="pl-0 my-0">
          {/* 收藏筛选按钮 - 只在存在收藏内容时显示 */}
          {hasFavorites && (
            <SidebarMenuItem
              key={'favorite'}
              onClick={() => {
                if (favoriteFilter) {
                  // 如果当前是收藏模式，点击后取消收藏筛选
                  setFavoriteFilter(false);
                } else {
                  // 如果当前不是收藏模式，点击后进入收藏模式
                  // 如果当前选择的是"全部"类型，则取消类型筛选
                  setFavoriteFilter(true);
                  setFolderFilter(''); // 取消文件夹选中状态
                  setShowTasks(false); // 取消任务显示
                  if (typeFilter.length === 0) {
                    setTypeFilter([]);
                  }
                }
              }}
            >
              <SidebarMenuButton
                variant={favoriteFilter ? 'outline' : 'default'}
                className={`h-8 transition-colors ${favoriteFilter ? 'bg-red-500 hover:bg-red-600 text-white' : 'hover:text-red-500 hover:bg-red-50'}`}
              >
                <TbHeart className={`${favoriteFilter ? 'fill-current' : ''}`} />
                星标
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem
            key={'tasks'}
            onClick={() => {
              setShowTasks(true);
              setFavoriteFilter(false);
              setFolderFilter('');
              setTypeFilter([]);
            }}
          >
            <SidebarMenuButton
              variant={showTasks ? 'outline' : 'default'}
              className={`h-8 transition-colors ${showTasks ? 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground' : ''}`}
            >
              <TbFilter />
              任务
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem
            key={'settings'}
            onClick={() => {
              window.YUA.window['window:open']('settings');
            }}
          >
            <SidebarMenuButton>
              <TbSettings />
              设置
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      {/* 左侧文件夹 */}
      <SidebarContent>
        <FolderSidebar
          folders={folders}
          selectedId={folderFilter || undefined}
          onSelect={(id) => {
            const folderId = id as string;
            setFolderFilter(folderId);
            saveCurrentFolder(folderId);
            setFavoriteFilter(false);
            setTypeFilter([]);
            setShowTasks(false);
          }}
          counts={folderCounts}
          allCount={allCount}
          workspaceId={wsFilter}
          onDropResources={async (folderId, ids) => {
            await handleMoveResourcesToFolder(folderId || '', ids);
          }}
          onMoveFolder={handleMoveFolder}
          onCreate={async (parentId) => {
            try {
              const d = new Date();
              const name = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              const wsId = wsFilter || undefined;
              const res = await folderAPI['folder.create']({ name, parentId: parentId ?? (folderFilter || null), workspaceId: wsId });
              if ((res as any)?.success) {
                await loadFolders(wsId);
                return (res as any)?.data?.id;
              }
              return undefined;
            } catch (e) {
              console.warn('create folder failed', e);
              return undefined;
            }
          }}
          onInlineRename={async (id, name) => {
            try {
              const wsId = wsFilter || undefined;
              const r = await folderAPI['folder.rename']({ id, name });
              if ((r as any)?.success) {
                await loadFolders(wsId);
              }
            } catch (e) {
              console.warn('inline rename folder failed', e);
            }
          }}
          onRename={handleRenameFolder}
          onDelete={handleDeleteFolder}
        />
      </SidebarContent>
      <SidebarFooter>
        <Button className="w-full" variant="ghost" onClick={() => window.YUA.window['window:open']('recycle')}>
          <TbTrash />
          回收站
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
};

export default ResourceSidebar;

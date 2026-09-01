import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TbPlayerPlay, TbTrash, TbX } from 'react-icons/tb';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { workflowClient } from '@/lib/workflow-client';
import { runWorkflow } from '@/lib/workflow-runner';

import { ResourceItem } from '../../types';
import { UIFolder } from '../FolderSidebar';

interface ResourceFooterProps {
  folderFilter: string;
  setFolderFilter: (id: string) => void;
  saveCurrentFolder: (id: string) => void;
  setFavoriteFilter: (fav: boolean) => void;
  setTypeFilter: (types: string[]) => void;
  currentFolderPath: UIFolder[];
  selectedItems: Set<string>;
  handleDeleteMany: (ids: string[]) => void;
  setSelectedItems: (items: Set<string>) => void;
  filtered: ResourceItem[];
  list: any[];
}

const ResourceFooter: React.FC<ResourceFooterProps> = ({
  folderFilter,
  setFolderFilter,
  saveCurrentFolder,
  setFavoriteFilter,
  setTypeFilter,
  currentFolderPath,
  selectedItems,
  handleDeleteMany,
  setSelectedItems,
  filtered,
  list
}) => {
  const workspaceId = filtered[0]?.workspaceId || list[0]?.workspaceId;
  // 只有多选（超过1个）时才显示选择操作栏
  const showSelectionBar = selectedItems.size > 1;

  // 工作流列表
  const [workflows, setWorkflows] = useState<any[]>([]);
  useEffect(() => {
    workflowClient
      .listDefinitions({ workspaceId })
      .then((defs) => {
        setWorkflows(defs || []);
      })
      .catch(() => { });
  }, [workspaceId]);

  // 获取选中的资源列表
  const selectedResources = useMemo(() => {
    return filtered.filter((item) => selectedItems.has(item.id));
  }, [filtered, selectedItems]);

  // 推断资源的类型
  const getResourceKind = useCallback((item: ResourceItem): 'image' | 'video' | 'audio' | 'document' | 'other' => {
    if (typeof item?.type === 'string' && item.type) {
      const t = item.type.toLowerCase();
      if (t === 'image' || t === 'video' || t === 'audio' || t === 'document' || t === 'other') return t as any;
    }
    const filePath: string = item?.filePath || '';
    const ext = (filePath.split('.').pop() || '').toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
    if (['mp4', 'webm', 'mov', 'mkv', 'ogv'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'm4a', 'flac', 'opus', 'ogg'].includes(ext)) return 'audio';
    if (['pdf', 'doc', 'docx', 'md', 'txt', 'rtf'].includes(ext)) return 'document';
    return 'other';
  }, []);

  // 检查选中的资源是否都是同一类型
  const selectedResourceKind = useMemo(() => {
    if (selectedResources.length === 0) return null;
    const firstKind = getResourceKind(selectedResources[0]);
    const allSameKind = selectedResources.every((item) => getResourceKind(item) === firstKind);
    return allSameKind ? firstKind : null;
  }, [selectedResources, getResourceKind]);

  // 获取工作流的开始节点输入模式
  const getWorkflowInputMode = useCallback((wf: any): 'resource' | 'text' | 'url' | 'file' | 'folder' => {
    if (!wf?.nodes) return 'resource';
    const startNode = wf.nodes.find((n: any) => n.id === 'start' || n.type === 'core/start');
    if (!startNode) return 'resource';
    return (startNode.config?.inputMode as 'resource' | 'text' | 'url' | 'file' | 'folder') || 'resource';
  }, []);

  // 获取工作流在开始节点上声明的适用资源类型
  const getWorkflowResourceKinds = useCallback((wf: any): string[] => {
    if (!wf?.nodes) return ['any'];
    const startNode = wf.nodes.find((n: any) => n.id === 'start' || n.type === 'core/start');
    if (!startNode || !startNode.config) return ['any'];
    const kinds = (startNode.config as any).resourceKinds;
    if (Array.isArray(kinds) && kinds.length > 0) {
      return kinds;
    }
    return ['any'];
  }, []);

  // 过滤出可用的工作流（基于选中资源的类型）
  const availableWorkflows = useMemo(() => {
    if (!selectedResourceKind) return [];
    return workflows.filter((wf) => {
      if (wf.id === 'blank') return false;
      const inputMode = getWorkflowInputMode(wf);
      if (inputMode !== 'resource') return false;
      const kinds = getWorkflowResourceKinds(wf);
      if (!kinds || kinds.length === 0 || kinds.includes('any')) return true;
      return kinds.includes(selectedResourceKind);
    });
  }, [workflows, selectedResourceKind, getWorkflowInputMode, getWorkflowResourceKinds]);

  // 执行工作流（对选中的资源逐个执行）
  const handleRunWorkflow = useCallback(
    async (wf: any) => {
      if (selectedResources.length === 0) return;

      // 对每个选中的资源执行工作流
      for (const item of selectedResources) {
        await runWorkflow({
          defId: wf.id,
          input: { resource: item, resourceId: item.id },
          metadata: {
            resourceId: item.id,
            resourceName: item.title || 'Unknown',
            thumbnailPath: item.thumbnailPath,
            workspaceId: item.workspaceId
          },
          onSuccess: () => { }
        });
      }
      toast.success(`已开始对 ${selectedResources.length} 个资源执行工作流: ${wf.name}`);
    },
    [selectedResources]
  );

  return (
    <div className="relative px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1 text-muted-foreground flex-wrap">
        <span
          className={`cursor-pointer hover:underline ${folderFilter ? 'text-primary' : 'text-foreground'} `}
          onClick={() => {
            setFolderFilter('');
            saveCurrentFolder('');
            setFavoriteFilter(false);
            setTypeFilter([]);
          }}
        >
          全部
        </span>
        {currentFolderPath.map((f) => (
          <React.Fragment key={f.id}>
            <span className="mx-1 text-muted-foreground">/</span>
            <span
              className="cursor-pointer hover:underline text-foreground"
              onClick={() => {
                setFolderFilter(f.id);
                saveCurrentFolder(f.id);
                setFavoriteFilter(false);
                setTypeFilter([]);
              }}
            >
              {f.name}
            </span>
          </React.Fragment>
        ))}
      </div>

      {/* Notion 风格的多选操作栏 */}
      {showSelectionBar && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50">
          <div className="flex items-center gap-3 px-4 py-2 bg-primary text-primary-foreground rounded-lg shadow-lg">
            <span className="text-sm font-medium whitespace-nowrap">已选择 {selectedItems.size} 个项目</span>
            <div className="w-px h-4 bg-primary-foreground/30" />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground"
              onClick={() => handleDeleteMany(Array.from(selectedItems))}
            >
              <TbTrash className="w-4 h-4 mr-1" />
              删除
            </Button>
            {/* 工作流执行按钮（仅当选中相同类型资源时显示） */}
            {availableWorkflows.length > 0 && (
              <>
                <div className="w-px h-4 bg-primary-foreground/30" />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground">
                      <TbPlayerPlay className="w-4 h-4 mr-1" />
                      执行任务
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" className="min-w-[10rem]">
                    {availableWorkflows.map((wf) => (
                      <DropdownMenuItem key={wf.id} onClick={() => handleRunWorkflow(wf)}>
                        {wf.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground" onClick={() => setSelectedItems(new Set())}>
              <TbX className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="text-muted-foreground whitespace-nowrap">
        <span>
          共 {filtered.length}/{list.length} 个资源
        </span>
      </div>
    </div>
  );
};

export default ResourceFooter;

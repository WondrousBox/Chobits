import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbChevronRight, TbDots, TbFile, TbFileDescription, TbLetterT, TbLink, TbMusic, TbPhoto, TbVideo } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

import type { ResourceItem } from '../types';
import { isImageFile, makeResSrc } from '../utils/resourceProtocol';

interface ResourceFileListProps {
  currentResource: ResourceItem;
  onResourceChange: (resource: ResourceItem) => void;
  /** 关闭列表回调（可选，仅在独立侧边栏模式下使用） */
  onClose?: () => void;
}

const ResourceFileList: React.FC<ResourceFileListProps> = ({ currentResource, onResourceChange, onClose }) => {
  const [list, setList] = useState<ResourceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const playlistRef = useRef<HTMLDivElement>(null);

  // 获取资源列表
  useEffect(() => {
    const loadResourceList = async (): Promise<void> => {
      // 尝试根据当前资源的 folderId 获取同文件夹的资源
      if (!currentResource?.folderId && !currentResource?.workspaceId) {
        setList([]);
        return;
      }

      setLoading(true);
      try {
        // 如果当前资源有 workspaceId，只查询该工作空间的资源，提高性能
        const allResources: ResourceItem[] = await window.YUA.resource['resource:list'](currentResource.workspaceId ? { workspaceId: currentResource.workspaceId } : undefined);
        let filteredResources: ResourceItem[] = [];

        if (currentResource.folderId) {
          // 筛选同文件夹的资源
          filteredResources = allResources.filter((r: any) => r.folderId === currentResource.folderId && r.id !== currentResource.id);
        } else if (currentResource.workspaceId) {
          // 如果没有 folderId，筛选同工作空间且没有 folderId 的资源
          filteredResources = allResources.filter((r: any) => r.workspaceId === currentResource.workspaceId && !r.folderId && r.id !== currentResource.id);
        }

        // 将当前资源插入到列表开头
        const fullList = [currentResource, ...filteredResources];
        setList(fullList);
      } catch (e) {
        console.warn('加载资源列表失败', e);
        setList([]);
      } finally {
        setLoading(false);
      }
    };

    loadResourceList();
  }, [currentResource?.id, currentResource?.folderId, currentResource?.workspaceId]);

  // 计算当前索引
  const currentIndex = list.findIndex((item) => item.id === currentResource?.id);

  // 获取资源类型图标
  const getResourceIcon = useCallback((resource: ResourceItem) => {
    switch (resource.type) {
      case 'image':
        return TbPhoto;
      case 'video':
        return TbVideo;
      case 'audio':
        return TbMusic;
      case 'text':
        return TbLetterT;
      case 'document':
        return TbFileDescription;
      case 'link':
        return TbLink;
      case 'file':
        return TbFile;
      default:
        return TbDots;
    }
  }, []);

  // 文件列表滚动到当前项
  useEffect(() => {
    if (playlistRef.current && currentIndex >= 0) {
      const itemElement = playlistRef.current.querySelector(`[data-index="${currentIndex}"]`);
      if (itemElement) {
        itemElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [currentIndex]);

  // 处理点击列表项
  const handleItemClick = useCallback(
    (index: number) => {
      const target = list[index];
      if (target) {
        onResourceChange(target);
      }
    },
    [list, onResourceChange]
  );

  // 如果没有列表，不显示组件
  if (list.length === 0 && !loading) {
    return null;
  }

  if (loading) {
    return (
      <div className="h-full flex flex-col overflow-hidden bg-background border-l">
        <div className="px-3 py-2 border-b text-xs font-medium text-muted-foreground flex items-center justify-between">
          {onClose && (
            <Button size="sm" variant="ghost" className="h-8 w-8" onClick={onClose}>
              <TbChevronRight />
            </Button>
          )}
          <span>文件列表</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">加载中...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background border-l">
      <div className="px-3 py-2 border-b text-xs font-medium text-muted-foreground flex items-center justify-between">
        {onClose && (
          <Button size="sm" variant="ghost" className="h-8 w-8" onClick={onClose}>
            <TbChevronRight />
          </Button>
        )}
        <span>文件列表 ({list.length})</span>
      </div>
      <ScrollArea className="flex-1">
        <div ref={playlistRef} className="p-2 space-y-1">
          {list.map((item, idx) => {
            const Icon = getResourceIcon(item);
            const itemTitle = item.title || item.filePath || item.url || item.id;
            const itemSrc = item.filePath ? makeResSrc(item.filePath) : item.url;
            const isActive = idx === currentIndex;
            const hasThumbnail = item.thumbnailPath || (isImageFile(item.filePath) && itemSrc);

            return (
              <div
                key={item.id}
                data-index={idx}
                onClick={() => handleItemClick(idx)}
                className={`
                  flex items-center gap-2 p-2 rounded cursor-pointer transition-colors
                  ${isActive ? 'bg-primary/20 border border-primary/50' : 'hover:bg-muted/50 border border-transparent'}
                `}
              >
                {/* 缩略图或图标 */}
                <div className="w-12 h-12 flex-shrink-0 rounded bg-muted flex items-center justify-center overflow-hidden">
                  {hasThumbnail && isImageFile(item.filePath) ? (
                    <img src={item.thumbnailPath ? makeResSrc(item.thumbnailPath) : itemSrc} alt={itemTitle} className="w-full h-full object-cover" />
                  ) : (
                    <Icon className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>
                {/* 标题和索引 */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{itemTitle}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {idx + 1} / {list.length}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};

export default ResourceFileList;

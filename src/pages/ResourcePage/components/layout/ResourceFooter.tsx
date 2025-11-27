import React from 'react';
import { TbTrash, TbX } from 'react-icons/tb';

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
  filtered: any[];
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
  return (
    <div className="px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2">
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
      {/* 选中项操作栏（保留位置，排序与视图模式已移入 Popover） */}
      {selectedItems.size > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-primary">已选择 {selectedItems.size} 个项目</span>
            <TbTrash onClick={() => handleDeleteMany(Array.from(selectedItems))} />
            <TbX onClick={() => setSelectedItems(new Set())} />
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

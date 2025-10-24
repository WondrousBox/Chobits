import React from 'react';
import { Button } from '@/components/ui/button';
import { TbFolder, TbFolderOpen, TbPencil, TbTrash, TbPlus } from 'react-icons/tb';

export type UIFolder = {
  id: string;
  name: string;
  parentId?: string | null;
  children?: UIFolder[];
};

function buildTree(flat: UIFolder[]): UIFolder[] {
  const map = new Map<string, UIFolder>();
  const roots: UIFolder[] = [];
  flat.forEach((f) => map.set(f.id, { ...f, children: [] }));
  map.forEach((node) => {
    const pid = node.parentId || null;
    if (pid && map.has(pid)) {
      map.get(pid)!.children!.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

const Row: React.FC<{
  node: UIFolder;
  depth: number;
  selectedId?: string;
  onSelect: (id: string) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
}> = ({ node, depth, selectedId, onSelect, onRename, onDelete }) => {
  const isActive = selectedId === node.id;
  return (
    <div>
      <div
        className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer ${isActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => onSelect(node.id)}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {isActive ? <TbFolderOpen className="w-4 h-4" /> : <TbFolder className="w-4 h-4" />}
          <span className="truncate">{node.name}</span>
        </div>
        <div className="flex items-center gap-1 opacity-80">
          <Button
            size="icon"
            variant="ghost"
            className="w-8 h-8"
            onClick={(e) => {
              e.stopPropagation();
              onRename(node.id);
            }}
          >
            <TbPencil />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="w-8 h-8"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node.id);
            }}
          >
            <TbTrash />
          </Button>
        </div>
      </div>
      {(node.children || []).map((child) => (
        <Row key={child.id} node={child} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} onRename={onRename} onDelete={onDelete} />
      ))}
    </div>
  );
};

const FolderSidebar: React.FC<{
  folders: UIFolder[];
  selectedId?: string;
  onSelect: (id: string | '') => void;
  onCreate: () => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
}> = ({ folders, selectedId, onSelect, onCreate, onRename, onDelete }) => {
  const tree = React.useMemo(() => buildTree(folders), [folders]);
  return (
    <div className="h-full w-60 border-r flex flex-col bg-background">
      <div className="p-2 flex items-center justify-between border-b">
        <div className="font-medium">文件夹</div>
        <Button size="icon" className="w-8 h-8" onClick={onCreate}>
          <TbPlus />
        </Button>
      </div>
      <div className="p-2">
        <div className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer ${!selectedId ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`} onClick={() => onSelect('')}>
          <TbFolderOpen className="w-4 h-4" />
          全部
        </div>
      </div>
      <div className="flex-1 overflow-auto p-1">
        {tree.map((node) => (
          <Row key={node.id} node={node} depth={0} selectedId={selectedId} onSelect={(id) => onSelect(id)} onRename={onRename} onDelete={onDelete} />
        ))}
        {tree.length === 0 && <div className="text-xs text-muted-foreground px-2">暂无文件夹，点击右上角 + 新建</div>}
      </div>
    </div>
  );
};

export default FolderSidebar;

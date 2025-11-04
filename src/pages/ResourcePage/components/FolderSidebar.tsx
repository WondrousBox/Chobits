import React from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { TbFolder, TbFolderOpen, TbPencil, TbTrash, TbPlus, TbDots } from 'react-icons/tb';

export type UIFolder = {
  id: string;
  name: string;
  parentId?: string | null;
  workspaceId?: string;
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
  onDropResources?: (folderId: string, ids: string[]) => void;
  counts?: Record<string, number>;
}> = ({ node, depth, selectedId, onSelect, onRename, onDelete, onDropResources, counts }) => {
  const isActive = selectedId === node.id;
  const [over, setOver] = React.useState(false);
  const count = counts?.[node.id] ?? 0;
  return (
    <div>
      <div
        className={`group flex items-center justify-between px-2 py-1 rounded cursor-pointer ${isActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted'} ${over ? 'ring-1 ring-primary/50 bg-primary/5' : ''}`}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => onSelect(node.id)}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
          e.dataTransfer.dropEffect = 'move';
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          setOver(false);
          try {
            const raw = e.dataTransfer.getData('application/x-resource-ids');
            if (!raw) return;
            const ids: string[] = JSON.parse(raw);
            if (Array.isArray(ids) && ids.length && onDropResources) onDropResources(node.id, ids);
          } catch {
            /* ignore */
          }
        }}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {isActive ? <TbFolderOpen className="w-4 h-4" /> : <TbFolder className="w-4 h-4" />}
          <span className="truncate">{node.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {count > 0 && <span className={`text-[10px] px-1.5 py-0.5 rounded bg-muted ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>{count}</span>}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="w-8 h-8" onClick={(e) => e.stopPropagation()}>
                  <TbDots />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4} onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const ws = await (window as any).YUA?.workspace['workspace:getDefault']();
                      const isWin = (window as any).YUA?.isWindows;
                      const sep = isWin ? '\\' : '/';
                      const base: string = ws?.rootPath || '';
                      if (!base) return;
                      const needsSep = base.endsWith(sep) ? '' : sep;
                      const folderPath = `${base}${needsSep}resources${sep}folders${sep}${node.id}`;
                      await (window as any).YUA?.file['file:openPath'](folderPath);
                    } catch (err) {
                      console.warn('open folder path failed', err);
                    }
                  }}
                >
                  <TbFolderOpen /> 打开文件夹
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onRename(node.id);
                  }}
                >
                  <TbPencil /> 重命名
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(node.id);
                  }}
                >
                  <TbTrash /> 删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
      {(node.children || []).map((child) => (
        <Row key={child.id} node={child} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} onRename={onRename} onDelete={onDelete} onDropResources={onDropResources} counts={counts} />
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
  onDropResources?: (folderId: string | null, ids: string[]) => void;
  counts?: Record<string, number>;
  allCount?: number;
}> = ({ folders, selectedId, onSelect, onCreate, onRename, onDelete, onDropResources, counts, allCount }) => {
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
        <div
          className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer ${!selectedId ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}
          onClick={() => onSelect('')}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(e) => {
            try {
              const raw = e.dataTransfer.getData('application/x-resource-ids');
              if (!raw) return;
              const ids: string[] = JSON.parse(raw);
              if (Array.isArray(ids) && ids.length && onDropResources) onDropResources(null, ids);
            } catch {
              /* ignore */
            }
          }}
        >
          <TbFolderOpen className="w-4 h-4" />
          全部
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{allCount ?? 0}</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-1">
        {tree.map((node) => (
          <Row
            key={node.id}
            node={node}
            depth={0}
            selectedId={selectedId}
            onSelect={(id) => onSelect(id)}
            onRename={onRename}
            onDelete={onDelete}
            onDropResources={(fid, ids) => onDropResources?.(fid, ids)}
            counts={counts}
          />
        ))}
        {tree.length === 0 && <div className="text-xs text-muted-foreground px-2">暂无文件夹，点击右上角 + 新建</div>}
      </div>
    </div>
  );
};

export default FolderSidebar;

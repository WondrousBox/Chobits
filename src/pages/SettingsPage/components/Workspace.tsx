import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import React, { useEffect, useMemo, useState } from 'react';
import { TbCheck, TbDotsVertical, TbFolderOpen, TbPlus, TbRefresh, TbScanEye, TbTrash } from 'react-icons/tb';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { maskPath } from '@/utils/helpers';
import prettyBytes from 'pretty-bytes';
import { formatRelativeTime } from '@/lib/time';

const Workspace: React.FC = () => {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [scanningIds, setScanningIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [confirmName, setConfirmName] = useState('');
  const [deletingBusy, setDeletingBusy] = useState(false);

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const rows = await window.YUA.workspace['workspace:list']({ filter: { deletedAt: 0 }, limit: 200, offset: 0 });
      setList(rows || []);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const setDefault = async (id: string): Promise<void> => {
    try {
      await window.YUA.workspace['workspace:setDefault']({ id });
      load();
    } catch {
      /* ignore */
    }
  };
  const commitRename = async (): Promise<void> => {
    if (!editingId) return;
    const name = editingName.trim();
    if (!name) {
      setEditingId(null);
      return;
    }
    try {
      await window.YUA.workspace['workspace:update']({ id: editingId, patch: { name } });
      setEditingId(null);
      load();
    } catch {
      /* ignore */
    }
  };
  const openFolder = async (id: string): Promise<void> => {
    try {
      await window.YUA.workspace['workspace:open']({ id });
    } catch {
      /* ignore */
    }
  };
  const scan = async (id: string): Promise<void> => {
    if (scanningIds.has(id)) return;
    setScanningIds((prev) => new Set([...prev, id]));
    try {
      await window.YUA.workspace['workspace:scanStats']({ id });
    } catch {
      /* ignore */
    } finally {
      setScanningIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
      load();
    }
  };
  const scanAll = async (): Promise<void> => {
    const ids = filtered.map((ws) => ws.id);
    for (const id of ids) {
      await scan(id);
    }
  };
  const remove = (id: string): void => {
    const ws = list.find((w) => w.id === id);
    setDeleting({ id, name: ws?.name || '未命名' });
    setConfirmName('');
  };

  const confirmDelete = async (): Promise<void> => {
    if (!deleting) return;
    if (confirmName.trim() !== (deleting.name || '').trim()) return;
    setDeletingBusy(true);
    try {
      await window.YUA.workspace['workspace:delete']({ id: deleting.id });
      setDeleting(null);
      setConfirmName('');
      load();
    } catch {
      // ignore
    } finally {
      setDeletingBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const rows = list.slice().sort((a: any, b: any) => (b.isDefault || 0) - (a.isDefault || 0) || (a.name || '').localeCompare(b.name || ''));
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((ws) => (ws.name || '').toLowerCase().includes(q) || (ws.rootPath || '').toLowerCase().includes(q));
  }, [list, search]);

  return (
    <div className="h-full w-full flex flex-col bg-background text-foreground">
      {/* 删除确认对话框 */}
      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
            setConfirmName('');
            setDeletingBusy(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除工作空间</DialogTitle>
            <DialogDescription>此操作不可撤销。请在下方输入工作空间名称以确认删除。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-sm">需要输入的名称：</div>
            <div className="text-sm font-mono bg-accent/40 text-accent-foreground px-2 py-1 rounded select-text">{deleting?.name}</div>
            <Input
              autoFocus
              placeholder="请输入上方名称以确认删除"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && confirmName.trim() === (deleting?.name || '').trim() && !deletingBusy) {
                  confirmDelete();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleting(null);
                setConfirmName('');
                setDeletingBusy(false);
              }}
              disabled={deletingBusy}
            >
              取消
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={!deleting || confirmName.trim() !== (deleting.name || '').trim() || deletingBusy}>
              {deletingBusy ? '删除中...' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="flex items-center gap-2 px-2">
        <Input className="w-48 h-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索 名称/路径..." />
        <Button size="sm" variant={'outline'} onClick={scanAll} disabled={filtered.length === 0 || scanningIds.size > 0}>
          <TbScanEye /> {scanningIds.size > 0 ? '扫描中...' : '全部扫描'}
        </Button>
        <Button size="icon" className="w-8 h-8" variant={'outline'} onClick={load} disabled={loading}>
          <TbRefresh />
        </Button>
        <Button size="sm" onClick={() => window.YUA.window.openWindow('workspaceWizard')}>
          <TbPlus /> 新建
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-2 space-y-3">
        {error && <div className="text-red-500 text-sm">{error}</div>}
        {filtered.map((ws) => (
          <div key={ws.id} className="p-2 rounded border border-ring border-solid bg-card text-card-foreground flex flex-col gap-2 relative">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm flex items-center gap-2">
                {ws.isDefault === 1 && <div className="text-primary bg-primary/20 px-2 py-1 rounded-md text-xs whitespace-nowrap">默认</div>}
                {editingId === ws.id ? (
                  <Input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') {
                        setEditingId(null);
                      }
                    }}
                    className="h-8"
                  />
                ) : (
                  <span
                    className="cursor-pointer"
                    onClick={() => {
                      setEditingId(ws.id);
                      setEditingName(ws.name || '');
                    }}
                  >
                    {ws.name}
                  </span>
                )}
                {/* 默认标记已移动为左上角星标 */}
              </div>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" className="w-8 h-8" variant={'outline'}>
                      <TbDotsVertical />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {ws.isDefault !== 1 && (
                      <DropdownMenuItem onSelect={() => setDefault(ws.id)}>
                        <TbCheck /> 设为默认
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => openFolder(ws.id)}>
                      <TbFolderOpen /> 打开
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={scanningIds.has(ws.id)}
                      onSelect={() => {
                        if (!scanningIds.has(ws.id)) scan(ws.id);
                      }}
                    >
                      <TbScanEye /> {scanningIds.has(ws.id) ? '扫描中...' : '扫描'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => remove(ws.id)}>
                      <TbTrash /> 删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div className="text-xs opacity-80 break-all">{maskPath(ws.rootPath)}</div>
            <div className="text-xs flex flex-wrap gap-4 opacity-70">
              <span>文件数: {ws.fileCount ?? '-'}</span>
              <span>容量: {prettyBytes(ws.sizeBytes || 0)}</span>
              {ws.lastScanAt && <span>上次扫描: {formatRelativeTime(ws.lastScanAt)}</span>}
            </div>
            {ws.description && <div className="text-xs opacity-70">{ws.description}</div>}
          </div>
        ))}
        {!loading && filtered.length === 0 && <div className="text-sm text-muted-foreground">未找到匹配工作空间。{list.length === 0 ? '尚未创建任何工作空间，点击右上角 新建/导入。' : ''}</div>}
      </div>
    </div>
  );
};

export default Workspace;

import prettyBytes from 'pretty-bytes';
import React, { useEffect, useMemo, useState } from 'react';
import { TbCheck, TbDotsVertical, TbFileExport, TbFileImport, TbFolderOpen, TbPlus, TbRefresh, TbScanEye, TbTrash } from 'react-icons/tb';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { maskPath } from '@/lib/helpers';
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
  const [keepWorkspaceFolder, setKeepWorkspaceFolder] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const deletingWorkspace = useMemo(() => list.find((w) => w.id === deleting?.id), [list, deleting?.id]);

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const rows = await window.YUA.workspace['workspace:list']({ limit: 200, offset: 0 });
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
    setKeepWorkspaceFolder(true);
  };

  const confirmDelete = async (): Promise<void> => {
    if (!deleting) return;
    if (confirmName.trim() !== (deleting.name || '').trim()) return;
    setDeletingBusy(true);
    try {
      const result = await window.YUA.workspace['workspace:delete']({ id: deleting.id, keepFolder: keepWorkspaceFolder });
      if (result.success) {
        toast.success('工作空间已删除');
        setDeleting(null);
        setConfirmName('');
        setKeepWorkspaceFolder(true);
        load();
      } else {
        toast.error(result.error || '删除失败');
      }
    } catch (error: any) {
      toast.error(error?.message || '删除失败');
    } finally {
      setDeletingBusy(false);
    }
  };

  const exportWorkspace = async (id: string): Promise<void> => {
    try {
      const ws = list.find((w) => w.id === id);
      if (!ws) return;

      // 让用户选择导出目录
      const result = await window.YUA.file['file:pickDir']({ allowCreate: true });

      if (result.canceled || !result.path) return;

      setExporting(id);
      toast.info('正在导出工作空间...');

      const exportResult = await window.YUA.workspace['workspace:export']({ id, destPath: result.path });

      if (exportResult.success) {
        toast.success('工作空间导出成功！');
      } else {
        toast.error(exportResult.error || '导出失败');
      }
    } catch (error: any) {
      toast.error(error?.message || '导出失败');
    } finally {
      setExporting(null);
    }
  };

  const importWorkspace = async (): Promise<void> => {
    if (importing) return;
    try {
      const pickResult = await window.YUA.file['file:pickDir']({});
      if (pickResult.canceled || !pickResult.path) return;

      const sourcePath = pickResult.path;

      setImporting(true);
      toast.info('正在导入工作空间...');

      console.log('导入参数：', { sourcePath });

      const result = await window.YUA.workspace['workspace:import']({ sourcePath });

      if (result.success) {
        toast.success('工作空间导入成功！');
        load();
      } else {
        toast.error(result.error || '导入失败');
      }
    } catch (error: any) {
      toast.error(error?.message || '导入失败');
      console.error('导入错误：', error);
    } finally {
      setImporting(false);
    }
  };

  const filtered = useMemo(() => {
    const rows = list.slice().sort((a: any, b: any) => (b.isDefault || 0) - (a.isDefault || 0) || (a.name || '').localeCompare(b.name || ''));
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((ws) => (ws.name || '').toLowerCase().includes(q) || (ws.rootPath || '').toLowerCase().includes(q));
  }, [list, search]);

  return (
    <div className="h-full w-full flex flex-col">
      {/* 删除确认对话框 */}
      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
            setConfirmName('');
            setDeletingBusy(false);
            setKeepWorkspaceFolder(true);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除工作空间</DialogTitle>
            <DialogDescription>此操作将永久删除工作空间的所有数据（包括资源、对话、工作流等）且不可撤销。请在下方输入工作空间名称以确认删除。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="p-2 bg-muted rounded-md">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={keepWorkspaceFolder} onChange={(e) => setKeepWorkspaceFolder(e.target.checked)} className="h-4 w-4" />
                只删除数据，保留文件夹
              </label>

              <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    <div className="mt-1 text-sm text-foreground truncate" title={deletingWorkspace?.rootPath || ''}>
                      {deletingWorkspace?.rootPath ? maskPath(deletingWorkspace.rootPath) : '-'}
                    </div>
                    {deletingWorkspace?.lastScanAt && (
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{deletingWorkspace.fileCount ?? '-'} 个文件</span>
                        <span>{prettyBytes(deletingWorkspace.sizeBytes || 0)}</span>
                        <span>扫描于 {formatRelativeTime(deletingWorkspace.lastScanAt)}</span>
                      </div>
                    )}
                  </div>
                  <Button
                    title="查看文件夹位置"
                    size={'sm'}
                    variant={'outline'}
                    onClick={() => {
                      if (deleting?.id) {
                        openFolder(deleting.id);
                      }
                    }}
                  >
                    <TbFolderOpen />
                    查看
                  </Button>
                </div>
              </div>
            </div>

            <div className="h-4"></div>
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

      {/* 工具栏 */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <Input className="w-48 h-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索名称或路径..." />
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={importWorkspace} disabled={importing}>
            <TbFileImport />
            {importing ? '导入中...' : '导入'}
          </Button>
          <Button size="sm" variant="outline" onClick={scanAll} disabled={filtered.length === 0 || scanningIds.size > 0}>
            <TbScanEye />
            {scanningIds.size > 0 ? '扫描中...' : '全部扫描'}
          </Button>
          <Button size="icon" className="w-8 h-8" variant="outline" onClick={load} disabled={loading}>
            <TbRefresh className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => window.YUA.window['window:open']('workspaceWizard')}>
            <TbPlus />
            新建
          </Button>
        </div>
      </div>

      {/* 工作空间列表 */}
      <div className="flex-1 overflow-auto p-4">
        {error && <div className="text-destructive text-sm mb-3">{error}</div>}

        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground px-2 py-1">工作空间列表</div>
          <div className="bg-card border border-border rounded-lg overflow-hidden divide-y divide-border">
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">{loading ? '加载中...' : list.length === 0 ? '尚未创建任何工作空间，点击右上角新建' : '未找到匹配的工作空间'}</div>
            ) : (
              filtered.map((ws) => (
                <div key={ws.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {ws.isDefault === 1 && <span className="text-primary bg-primary/10 px-1.5 py-0.5 rounded text-xs flex-shrink-0">默认</span>}
                      {editingId === ws.id ? (
                        <Input
                          autoFocus
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename();
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className="h-7 text-sm"
                        />
                      ) : (
                        <span
                          className="text-sm font-medium text-foreground cursor-pointer hover:text-primary truncate"
                          onClick={() => {
                            setEditingId(ws.id);
                            setEditingName(ws.name || '');
                          }}
                        >
                          {ws.name}
                        </span>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" className="w-7 h-7 flex-shrink-0" variant="ghost">
                          <TbDotsVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {ws.isDefault !== 1 && (
                          <DropdownMenuItem onSelect={() => setDefault(ws.id)}>
                            <TbCheck className="h-4 w-4 mr-2" />
                            设为默认
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onSelect={() => openFolder(ws.id)}>
                          <TbFolderOpen className="h-4 w-4 mr-2" />
                          打开目录
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={scanningIds.has(ws.id)} onSelect={() => !scanningIds.has(ws.id) && scan(ws.id)}>
                          <TbScanEye className="h-4 w-4 mr-2" />
                          {scanningIds.has(ws.id) ? '扫描中...' : '扫描统计'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem disabled={exporting === ws.id} onSelect={() => exportWorkspace(ws.id)}>
                          <TbFileExport className="h-4 w-4 mr-2" />
                          {exporting === ws.id ? '导出中...' : '导出工作空间'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onSelect={() => remove(ws.id)}>
                          <TbTrash className="h-4 w-4 mr-2" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground truncate">{maskPath(ws.rootPath)}</div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{ws.fileCount ?? '-'} 个文件</span>
                    <span>{prettyBytes(ws.sizeBytes || 0)}</span>
                    {ws.lastScanAt && <span>扫描于 {formatRelativeTime(ws.lastScanAt)}</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Workspace;

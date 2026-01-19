import prettyBytes from 'pretty-bytes';
import React, { useEffect, useMemo, useState } from 'react';
import { TbCheck, TbDotsVertical, TbFileExport, TbFileImport, TbFolderOpen, TbPlus, TbRefresh, TbScanEye, TbTrash } from 'react-icons/tb';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  const [exporting, setExporting] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importDialog, setImportDialog] = useState(false);
  const [importName, setImportName] = useState('');
  const [importSourcePath, setImportSourcePath] = useState(''); // 导出的目录
  const [importDestPath, setImportDestPath] = useState(''); // 新工作空间的保存位置

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

  const openImportDialog = (): void => {
    setImportDialog(true);
    setImportName('');
    setImportSourcePath('');
    setImportDestPath('');
  };

  const selectImportSource = async (): Promise<void> => {
    try {
      const result = await window.YUA.file['file:pickDir']({});

      if (!result.canceled && result.path) {
        setImportSourcePath(result.path);

        // 自动生成目标路径建议（确保不会与源路径相同）
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const suggested = `${result.path}-imported-${timestamp}`;
        setImportDestPath(suggested);
      }
    } catch {
      // ignore
    }
  };

  const selectImportDest = async (): Promise<void> => {
    try {
      const result = await window.YUA.file['file:pickDir']({ allowCreate: true });

      if (!result.canceled && result.path) {
        setImportDestPath(result.path);
      }
    } catch {
      // ignore
    }
  };

  const confirmImport = async (): Promise<void> => {
    if (!importName.trim() || !importSourcePath.trim() || !importDestPath.trim()) return;

    // 验证：源路径和目标路径不能相同
    if (importSourcePath === importDestPath) {
      toast.error('源路径和目标路径不能相同！');
      return;
    }

    setImporting(true);
    toast.info('正在导入工作空间...');

    try {
      console.log('导入参数：', {
        sourcePath: importSourcePath,
        name: importName,
        rootPath: importDestPath
      });

      const result = await window.YUA.workspace['workspace:import']({
        sourcePath: importSourcePath,
        name: importName,
        rootPath: importDestPath
      });

      if (result.success) {
        toast.success('工作空间导入成功！');
        setImportDialog(false);
        setImportName('');
        setImportSourcePath('');
        setImportDestPath('');
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

      {/* 导入对话框 */}
      <Dialog
        open={importDialog}
        onOpenChange={(open) => {
          if (!open) {
            setImportDialog(false);
            setImportName('');
            setImportSourcePath('');
            setImportDestPath('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>导入工作空间</DialogTitle>
            <DialogDescription>从导出的工作空间目录恢复数据</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="importName">工作空间名称</Label>
              <Input id="importName" placeholder="输入工作空间名称" value={importName} onChange={(e) => setImportName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="importSourcePath">导出的工作空间目录（源）</Label>
              <div className="flex gap-2">
                <Input id="importSourcePath" placeholder="选择工作空间导出目录" value={importSourcePath} readOnly onClick={selectImportSource} />
                <Button variant="outline" onClick={selectImportSource}>
                  选择
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="importDestPath">新工作空间保存位置（目标）</Label>
              <div className="flex gap-2">
                <Input id="importDestPath" placeholder="选择新工作空间的保存位置" value={importDestPath} readOnly onClick={selectImportDest} />
                <Button variant="outline" onClick={selectImportDest}>
                  选择
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">💡 提示：请选择一个新的目录，不要与现有工作空间目录冲突</p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setImportDialog(false);
                setImportName('');
                setImportSourcePath('');
                setImportDestPath('');
              }}
              disabled={importing}
            >
              取消
            </Button>
            <Button onClick={confirmImport} disabled={!importName.trim() || !importSourcePath.trim() || !importDestPath.trim() || importing}>
              {importing ? '导入中...' : '导入'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 工具栏 */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <Input className="w-48 h-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索名称或路径..." />
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={openImportDialog}>
            <TbFileImport className="h-4 w-4 mr-1" />
            导入
          </Button>
          <Button size="sm" variant="outline" onClick={scanAll} disabled={filtered.length === 0 || scanningIds.size > 0}>
            <TbScanEye className="h-4 w-4 mr-1" />
            {scanningIds.size > 0 ? '扫描中...' : '全部扫描'}
          </Button>
          <Button size="icon" className="w-8 h-8" variant="outline" onClick={load} disabled={loading}>
            <TbRefresh className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => window.YUA.window['window:open']('workspaceWizard')}>
            <TbPlus className="h-4 w-4 mr-1" />
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

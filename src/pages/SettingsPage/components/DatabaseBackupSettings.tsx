import React, { useCallback, useEffect, useState } from 'react';
import { TbDatabase, TbDatabaseImport, TbLoader2, TbRefresh, TbRestore, TbTrash } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { SettingGroup, SettingItem } from './SettingComponents';

// Backup info from IPC (dates are serialized as strings)
interface BackupInfo {
  path: string;
  fileName: string;
  size: number;
  createdAt: string | Date;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(dateStr: string | Date): string {
  try {
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return String(dateStr);
  }
}

const DatabaseBackupSettings: React.FC = () => {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BackupInfo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupInfo | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showRestartDialog, setShowRestartDialog] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const loadBackups = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await window.YUA.system['database:listBackups']();
      if (result.ok && result.backups) {
        setBackups(result.backups);
      }
    } catch (error) {
      console.error('Failed to load backups:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      const result = await window.YUA.system['database:backup']();
      if (result.ok) {
        await loadBackups();
      } else {
        console.error('Backup failed:', result.error);
      }
    } catch (error) {
      console.error('Backup failed:', error);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      const result = await window.YUA.system['database:deleteBackup'](deleteTarget.path);
      if (result.ok) {
        setBackups((prev) => prev.filter((b) => b.path !== deleteTarget.path));
        setDeleteTarget(null);
      } else {
        console.error('Delete failed:', result.error);
      }
    } catch (error) {
      console.error('Delete failed:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;

    setIsRestoring(true);
    try {
      const result = await window.YUA.system['database:restoreBackup'](restoreTarget.path);
      if (result.ok) {
        setRestoreTarget(null);
        setShowRestartDialog(true);
      } else {
        console.error('Restore failed:', result.error);
      }
    } catch (error) {
      console.error('Restore failed:', error);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleImport = async () => {
    setIsImporting(true);
    try {
      // 打开文件选择对话框
      const result = await window.YUA.file['file:pickFile']({
        filters: [{ name: 'SQLite 数据库', extensions: ['db', 'sqlite', 'sqlite3'] }]
      });

      if (result.canceled || !result.path) {
        return;
      }

      const importResult = await window.YUA.system['database:importBackup'](result.path);

      if (importResult.ok) {
        await loadBackups();
      } else {
        console.error('Import failed:', importResult.error);
      }
    } catch (error) {
      console.error('Import failed:', error);
    } finally {
      setIsImporting(false);
    }
  };

  const handleRestart = async () => {
    try {
      await window.YUA.system['app:relaunch']();
    } catch (error) {
      console.error('Failed to relaunch:', error);
    }
  };

  return (
    <>
      <SettingGroup title="数据库备份">
        <SettingItem
          title="创建备份"
          description="将当前数据库保存为备份文件，备份存储在数据目录的 backups 文件夹中"
          action={
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={loadBackups} disabled={isLoading}>
                {isLoading ? <TbLoader2 className="h-4 w-4 animate-spin" /> : <TbRefresh className="h-4 w-4" />}
              </Button>
              <Button size="sm" variant="outline" onClick={handleImport} disabled={isImporting}>
                {isImporting ? (
                  <>
                    <TbLoader2 className="h-4 w-4 animate-spin mr-1" />
                    导入中...
                  </>
                ) : (
                  <>
                    <TbDatabaseImport className="h-4 w-4 mr-1" />
                    导入
                  </>
                )}
              </Button>
              <Button size="sm" onClick={handleBackup} disabled={isBackingUp}>
                {isBackingUp ? (
                  <>
                    <TbLoader2 className="h-4 w-4 animate-spin mr-1" />
                    备份中...
                  </>
                ) : (
                  <>
                    <TbDatabase className="h-4 w-4 mr-1" />
                    立即备份
                  </>
                )}
              </Button>
            </div>
          }
        />

        {backups.length > 0 && (
          <div className="px-4 py-2 border-t border-border">
            <div className="text-xs text-muted-foreground mb-2">备份列表 ({backups.length})</div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {backups.map((backup) => (
                <div key={backup.path} className="flex items-center justify-between p-2 bg-muted/50 rounded text-xs">
                  <div className="flex-1 min-w-0 mr-2">
                    <div className="font-mono truncate text-foreground">{backup.fileName}</div>
                    <div className="text-muted-foreground">
                      {formatDate(backup.createdAt)} · {formatFileSize(backup.size)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-6 w-6" title="恢复此备份" onClick={() => setRestoreTarget(backup)}>
                      <TbRestore className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" title="删除" onClick={() => setDeleteTarget(backup)}>
                      <TbTrash className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SettingGroup>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="w-96">
          <DialogHeader>
            <DialogTitle>确认删除备份</DialogTitle>
            <DialogDescription>将永久删除此备份文件，此操作不可恢复</DialogDescription>
          </DialogHeader>
          {deleteTarget && <div className="text-xs text-muted-foreground bg-muted p-2 rounded font-mono">{deleteTarget.fileName}</div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <TbLoader2 className="h-4 w-4 animate-spin mr-1" />
                  删除中...
                </>
              ) : (
                '确认删除'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore confirmation dialog */}
      <Dialog open={!!restoreTarget} onOpenChange={() => setRestoreTarget(null)}>
        <DialogContent className="w-96">
          <DialogHeader>
            <DialogTitle>恢复数据库备份</DialogTitle>
            <DialogDescription>将用此备份替换当前数据库，当前数据库将被重命名为 .old 文件。恢复后需要重启应用。</DialogDescription>
          </DialogHeader>
          {restoreTarget && <div className="text-xs text-muted-foreground bg-muted p-2 rounded font-mono">{restoreTarget.fileName}</div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreTarget(null)}>
              取消
            </Button>
            <Button onClick={handleRestore} disabled={isRestoring}>
              {isRestoring ? (
                <>
                  <TbLoader2 className="h-4 w-4 animate-spin mr-1" />
                  恢复中...
                </>
              ) : (
                <>
                  <TbRestore className="h-4 w-4 mr-1" />
                  确认恢复
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restart dialog */}
      <Dialog open={showRestartDialog} onOpenChange={setShowRestartDialog}>
        <DialogContent className="w-96">
          <DialogHeader>
            <DialogTitle>恢复完成</DialogTitle>
            <DialogDescription>数据库已成功恢复。需要重启应用以加载新的数据库。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRestartDialog(false)}>
              稍后重启
            </Button>
            <Button onClick={handleRestart}>
              <TbRestore className="h-4 w-4 mr-1" />
              立即重启
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DatabaseBackupSettings;

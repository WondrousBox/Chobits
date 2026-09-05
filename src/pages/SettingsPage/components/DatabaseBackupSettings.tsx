import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('settings');
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BackupInfo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupInfo | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isRestartDialogOpen, setIsRestartDialogOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const loadBackups = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await window.chobits.system['database:list-backups']();
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载时异步加载备份列表,setState 均在 await 之后
    loadBackups();
  }, [loadBackups]);

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      const result = await window.chobits.system['database:backup']();
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
      const result = await window.chobits.system['database:delete-backup'](deleteTarget.path);
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
      const result = await window.chobits.system['database:restore-backup'](restoreTarget.path);
      if (result.ok) {
        setRestoreTarget(null);
        setIsRestartDialogOpen(true);
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
      const result = await window.chobits.file['file:pick-file']({
        filters: [{ name: t('backup.fileFilter'), extensions: ['db', 'sqlite', 'sqlite3'] }]
      });

      if (!result.ok || !result.path) {
        return;
      }

      const importResult = await window.chobits.system['database:import-backup'](result.path);

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
      await window.chobits.system['app:relaunch']();
    } catch (error) {
      console.error('Failed to relaunch:', error);
    }
  };

  return (
    <>
      <SettingGroup title={t('backup.groupTitle')}>
        <SettingItem
          title={t('backup.create.label')}
          description={t('backup.create.description')}
          action={
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={loadBackups} disabled={isLoading}>
                {isLoading ? <TbLoader2 className="animate-spin" /> : <TbRefresh />}
              </Button>
              <Button size="sm" variant="outline" onClick={handleImport} disabled={isImporting}>
                {isImporting ? (
                  <>
                    <TbLoader2 className="animate-spin" />
                    {t('backup.importing')}
                  </>
                ) : (
                  <>
                    <TbDatabaseImport />
                    {t('backup.import')}
                  </>
                )}
              </Button>
              <Button size="sm" onClick={handleBackup} disabled={isBackingUp}>
                {isBackingUp ? (
                  <>
                    <TbLoader2 className="animate-spin" />
                    {t('backup.backingUp')}
                  </>
                ) : (
                  <>
                    <TbDatabase />
                    {t('backup.backupNow')}
                  </>
                )}
              </Button>
            </div>
          }
        />

        {backups.length > 0 && (
          <div className="px-4 py-2 border-t border-border">
            <div className="text-xs text-muted-foreground mb-2">{t('backup.listTitle', { count: backups.length })}</div>
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
                    <Button size="icon" variant="ghost" className="h-6 w-6" title={t('backup.restoreTooltip')} onClick={() => setRestoreTarget(backup)}>
                      <TbRestore className="text-muted-foreground hover:text-primary" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" title={t('backup.delete')} onClick={() => setDeleteTarget(backup)}>
                      <TbTrash className="text-muted-foreground hover:text-destructive" />
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
            <DialogTitle>{t('backup.deleteDialog.title')}</DialogTitle>
            <DialogDescription>{t('backup.deleteDialog.description')}</DialogDescription>
          </DialogHeader>
          {deleteTarget && <div className="text-xs text-muted-foreground bg-muted p-2 rounded font-mono">{deleteTarget.fileName}</div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <TbLoader2 className="animate-spin" />
                  {t('backup.deleteDialog.deleting')}
                </>
              ) : (
                t('backup.deleteDialog.confirm')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore confirmation dialog */}
      <Dialog open={!!restoreTarget} onOpenChange={() => setRestoreTarget(null)}>
        <DialogContent className="w-96">
          <DialogHeader>
            <DialogTitle>{t('backup.restoreDialog.title')}</DialogTitle>
            <DialogDescription>{t('backup.restoreDialog.description')}</DialogDescription>
          </DialogHeader>
          {restoreTarget && <div className="text-xs text-muted-foreground bg-muted p-2 rounded font-mono">{restoreTarget.fileName}</div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleRestore} disabled={isRestoring}>
              {isRestoring ? (
                <>
                  <TbLoader2 className="animate-spin" />
                  {t('backup.restoreDialog.restoring')}
                </>
              ) : (
                <>
                  <TbRestore />
                  {t('backup.restoreDialog.confirm')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restart dialog */}
      <Dialog open={isRestartDialogOpen} onOpenChange={setIsRestartDialogOpen}>
        <DialogContent className="w-96">
          <DialogHeader>
            <DialogTitle>{t('backup.restartDialog.title')}</DialogTitle>
            <DialogDescription>{t('backup.restartDialog.description')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRestartDialogOpen(false)}>
              {t('backup.restartDialog.later')}
            </Button>
            <Button onClick={handleRestart}>
              <TbRestore />
              {t('backup.restartDialog.now')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DatabaseBackupSettings;

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TbFolderOpen, TbLoader } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { maskPath } from '@/lib/helpers';

import { SettingGroup, SettingItem, SettingPath } from './SettingComponents';

interface MoveProgress {
  current: number;
  total: number;
  currentFile: string;
  percentage: number;
}

function FolderSetting(): JSX.Element {
  const { t } = useTranslation('settings');
  const [pluginsDir, setPluginsDir] = useState<string>('');
  const [downloadDir, setDownloadDir] = useState<string>('');
  const [logsDir, setLogsDir] = useState<string>('');
  const [dataDir, setDataDir] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isMoving, setIsMoving] = useState(false);
  const [moveProgress, setMoveProgress] = useState<MoveProgress | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await window.chobits.system['database:get-path']();
        if (!mounted) return;
        if (res.ok && res.dir) {
          setDataDir(res.dir);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await window.chobits.pluginResource['plugin-resource:get-plugins-dir']();
        if (!mounted) return;
        if (res.ok && res.path) {
          setPluginsDir(res.path);
        }
      } catch {
        // ignore
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await window.chobits.pluginResource['plugin-resource:get-download-dir']();
        if (!mounted) return;
        if (res.ok && res.path) {
          setDownloadDir(res.path);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await window.chobits.system['logs:get-path']();
        if (!mounted) return;
        if (res.ok && res.dir) {
          setLogsDir(res.dir);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // 监听移动进度事件
  useEffect(() => {
    const handleMoveProgress = (progress: MoveProgress): void => {
      setMoveProgress(progress);
    };

    return window.chobits.pluginResource.onMoveProgress(handleMoveProgress);
  }, []);

  const openDatabaseLocation = async (): Promise<void> => {
    window.chobits.system['database:open-location']();
  };

  const openLogsLocation = async (): Promise<void> => {
    window.chobits.system['logs:open-location']();
  };

  const pickPluginsDir = async (): Promise<void> => {
    try {
      const r = await window.chobits.file['file:pick-dir']({ allowCreate: true, defaultPath: pluginsDir });
      if (r.ok && r.path) {
        setIsMoving(true);
        setMoveProgress(null);
        try {
          const res = await window.chobits.pluginResource['plugin-resource:set-plugins-dir']({ dir: r.path });
          if (res.ok) {
            setPluginsDir(r.path);
          } else {
            // 显示错误信息
            console.error('设置插件目录失败:', res.error);
          }
        } finally {
          // 延迟清除进度，让用户看到完成状态
          setTimeout(() => {
            setIsMoving(false);
            setMoveProgress(null);
          }, 500);
        }
      }
    } catch (error) {
      setIsMoving(false);
      setMoveProgress(null);
      console.error('选择插件目录失败:', error);
    }
  };

  const openPluginsLocation = async (): Promise<void> => {
    if (!pluginsDir) return;
    try {
      await window.chobits.file['file:open-path'](pluginsDir);
    } catch {
      // ignore
    }
  };

  const openDownloadLocation = async (): Promise<void> => {
    if (!downloadDir) return;
    try {
      await window.chobits.file['file:open-path'](downloadDir);
    } catch {
      // ignore
    }
  };

  return (
    <SettingGroup title={t('folder.groupTitle')}>
      <SettingItem
        title={t('folder.dataDir.label')}
        description={t('folder.dataDir.description')}
        action={
          <div className="flex items-center gap-2">
            <SettingPath path={maskPath(dataDir)} placeholder="data/" />
            <Button size="sm" variant="outline" onClick={openDatabaseLocation}>
              <TbFolderOpen />
              {t('folder.open')}
            </Button>
          </div>
        }
      />
      <SettingItem
        title={t('folder.logsDir.label')}
        description={t('folder.logsDir.description')}
        action={
          <div className="flex items-center gap-2">
            <SettingPath path={maskPath(logsDir)} placeholder="logs/" />
            <Button size="sm" variant="outline" onClick={openLogsLocation}>
              <TbFolderOpen />
              {t('folder.open')}
            </Button>
          </div>
        }
      />
      <SettingItem
        title={t('folder.downloadDir.label')}
        description={t('folder.downloadDir.description')}
        action={
          <div className="flex items-center gap-2">
            <SettingPath path={maskPath(downloadDir)} placeholder={t('common.notSet')} />
            {downloadDir && (
              <Button size="sm" variant="outline" onClick={openDownloadLocation}>
                <TbFolderOpen />
                {t('folder.open')}
              </Button>
            )}
          </div>
        }
      />
      <SettingItem
        title={t('folder.pluginsDir.label')}
        description={t('folder.pluginsDir.description')}
        action={
          isLoading ? (
            <span className="text-xs text-muted-foreground">{t('common.loading')}</span>
          ) : (
            <div className="flex flex-col gap-2 w-full">
              <div className="flex items-center gap-2">
                <SettingPath path={maskPath(pluginsDir)} placeholder={t('common.notSet')} />
                <Button size="sm" variant="outline" onClick={pickPluginsDir} disabled={isMoving}>
                  {isMoving ? (
                    <>
                      <TbLoader className="animate-spin" />
                      {t('folder.moving')}
                    </>
                  ) : (
                    t('folder.select')
                  )}
                </Button>
                {pluginsDir && !isMoving && (
                  <Button size="sm" variant="outline" onClick={openPluginsLocation}>
                    <TbFolderOpen />
                    {t('folder.open')}
                  </Button>
                )}
              </div>
              {isMoving && moveProgress && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {moveProgress.percentage >= 100 ? t('folder.moveCompleted') : moveProgress.currentFile ? t('folder.movingFile', { file: moveProgress.currentFile }) : t('folder.movingFiles')}
                    </span>
                    <span className="text-muted-foreground font-mono">
                      {moveProgress.current}/{moveProgress.total} ({moveProgress.percentage}%)
                    </span>
                  </div>
                  <Progress value={moveProgress.percentage} className="h-2" />
                </div>
              )}
            </div>
          )
        }
      />
    </SettingGroup>
  );
}

export default FolderSetting;

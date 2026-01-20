import { useEffect, useState } from 'react';
import { TbFolderOpen } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { maskPath } from '@/lib/helpers';

import { SettingGroup, SettingItem, SettingPath } from './SettingComponents';

function FolderSetting(): JSX.Element {
  const [pluginsDir, setPluginsDir] = useState<string>('');
  const [downloadDir, setDownloadDir] = useState<string>('');
  const [logsDir, setLogsDir] = useState<string>('');
  const [dataDir, setDataDir] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await window.YUA.system['database:getPath']();
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
        const res = await window.YUA.pluginResource['plugin-resource:getPluginsDir']();
        if (!mounted) return;
        if (res.ok && res.path) {
          setPluginsDir(res.path);
        }
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false);
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
        const res = await window.YUA.pluginResource['plugin-resource:getDownloadDir']();
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
        const res = await window.YUA.system['logs:getPath']();
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

  const openDatabaseLocation = async (): Promise<void> => {
    window.YUA.system['database:openLocation']();
  };

  const openLogsLocation = async (): Promise<void> => {
    window.YUA.system['logs:openLocation']();
  };

  const pickPluginsDir = async (): Promise<void> => {
    try {
      const r = await window.YUA.file['file:pickDir']({ allowCreate: true, defaultPath: pluginsDir });
      if (!r.canceled && r.path) {
        const res = await window.YUA.pluginResource['plugin-resource:setPluginsDir']({ dir: r.path });
        if (res.ok) {
          setPluginsDir(r.path);
        }
      }
    } catch {
      // ignore
    }
  };

  const openPluginsLocation = async (): Promise<void> => {
    if (!pluginsDir) return;
    try {
      await window.YUA.file['file:openPath'](pluginsDir);
    } catch {
      // ignore
    }
  };

  const openDownloadLocation = async (): Promise<void> => {
    if (!downloadDir) return;
    try {
      await window.YUA.file['file:openPath'](downloadDir);
    } catch {
      // ignore
    }
  };

  return (
    <SettingGroup title="文件夹">
      <SettingItem
        title="数据目录"
        description="应用数据存储位置"
        action={
          <div className="flex items-center gap-2">
            <SettingPath path={maskPath(dataDir)} placeholder="data/" />
            <Button size="sm" variant="outline" onClick={openDatabaseLocation}>
              <TbFolderOpen />
              打开
            </Button>
          </div>
        }
      />
      <SettingItem
        title="日志目录"
        description="应用日志文件位置"
        action={
          <div className="flex items-center gap-2">
            <SettingPath path={maskPath(logsDir)} placeholder="logs/" />
            <Button size="sm" variant="outline" onClick={openLogsLocation}>
              <TbFolderOpen />
              打开
            </Button>
          </div>
        }
      />
      <SettingItem
        title="下载目录"
        description="文件下载保存位置"
        action={
          <div className="flex items-center gap-2">
            <SettingPath path={maskPath(downloadDir)} placeholder="未设置" />
            {downloadDir && (
              <Button size="sm" variant="outline" onClick={openDownloadLocation}>
                <TbFolderOpen />
                打开
              </Button>
            )}
          </div>
        }
      />
      <SettingItem
        title="插件资源目录"
        description="插件引擎和模型文件存储位置"
        action={
          loading ? (
            <span className="text-xs text-muted-foreground">加载中...</span>
          ) : (
            <div className="flex items-center gap-2">
              <SettingPath path={maskPath(pluginsDir)} placeholder="未设置" />
              <Button size="sm" variant="outline" onClick={pickPluginsDir}>
                选择
              </Button>
              {pluginsDir && (
                <Button size="sm" variant="outline" onClick={openPluginsLocation}>
                  <TbFolderOpen />
                  打开
                </Button>
              )}
            </div>
          )
        }
      />
    </SettingGroup>
  );
}

export default FolderSetting;

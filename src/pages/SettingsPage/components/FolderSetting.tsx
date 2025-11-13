import { useEffect, useState } from 'react';
import { TbDatabase, TbDownload, TbFileText, TbFolderOpen, TbPlug } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { maskPath } from '@/lib/helpers';

function FolderSetting(): JSX.Element {
  const [pluginsDir, setPluginsDir] = useState<string>('');
  const [downloadDir, setDownloadDir] = useState<string>('');
  const [loading, setLoading] = useState(true);

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
    <div className="px-2">
      <div className="bg-card border border-border rounded-lg p-2">
        <div className="flex items-center text-foreground gap-1">
          <TbDatabase /> 数据
        </div>
        <div className="flex items-center justify-center gap-2 mt-2">
          <div className="p-2 bg-muted rounded-md text-xs text-muted-foreground flex-1">data/</div>
          <Button size="sm" variant="outline" onClick={openDatabaseLocation}>
            <TbFolderOpen />
            打开
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-2 mt-3">
        <div className="flex items-center text-foreground gap-1">
          <TbFileText /> 日志
        </div>
        <div className="flex items-center justify-center gap-2 mt-2">
          <div className="p-2 bg-muted rounded-md text-xs text-muted-foreground flex-1">logs/</div>
          <Button size="sm" variant="outline" onClick={openLogsLocation}>
            <TbFolderOpen />
            打开
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-2 mt-3">
        <div className="flex items-center text-foreground gap-1">
          <TbDownload /> 下载
        </div>
        <div className="flex items-center justify-center gap-2 mt-2">
          <div className="p-2 bg-muted rounded-md text-xs text-muted-foreground flex-1 break-all font-mono">{maskPath(downloadDir) || '未设置'}</div>
          {downloadDir && (
            <Button size="sm" variant="outline" onClick={openDownloadLocation}>
              <TbFolderOpen />
              打开
            </Button>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-2 mt-3">
        <div className="flex items-center text-foreground gap-1">
          <TbPlug /> 插件资源
        </div>
        <div className="text-xs text-muted-foreground mt-1 mb-2">插件引擎和模型文件存储位置（可能占用较大空间，建议选择非系统盘）</div>
        {loading ? (
          <div className="text-xs text-muted-foreground py-2">读取配置...</div>
        ) : (
          <>
            <div className="flex items-center justify-center gap-2 mt-2">
              <div className="p-2 bg-muted rounded-md text-muted-foreground flex-1 break-all font-mono text-xs">{maskPath(pluginsDir) || '未设置'}</div>
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
          </>
        )}
      </div>
    </div>
  );
}

export default FolderSetting;

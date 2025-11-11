import { useEffect, useState } from 'react';
import { TbDatabase, TbFileText, TbFolderOpen, TbPlug, TbSlash } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

function FolderSetting(): JSX.Element {
  const [pluginsDir, setPluginsDir] = useState<string>('');
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

  return (
    <div className="px-2">
      <div className="bg-card border border-border rounded-lg p-2">
        <div className="flex items-center text-foreground gap-1">
          <TbDatabase /> 数据
        </div>
        <div className="flex items-center justify-center gap-2 mt-2">
          <span className="text-muted-foreground uppercase text-xs">%appData%</span>
          <TbSlash />
          <div className="p-2 bg-muted rounded-md text-sm text-muted-foreground flex-1">data/</div>
          <Button variant="outline" onClick={openDatabaseLocation}>
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
          <span className="text-muted-foreground uppercase text-xs">%appData%</span>
          <TbSlash />
          <div className="p-2 bg-muted rounded-md text-sm text-muted-foreground flex-1">logs/</div>
          <Button variant="outline" onClick={openLogsLocation}>
            <TbFolderOpen />
            打开
          </Button>
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
              <div className="p-2 bg-muted rounded-md text-sm text-muted-foreground flex-1 break-all font-mono text-xs">{pluginsDir || '未设置'}</div>
              <Button variant="outline" onClick={pickPluginsDir}>
                选择
              </Button>
              {pluginsDir && (
                <Button variant="outline" onClick={openPluginsLocation}>
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

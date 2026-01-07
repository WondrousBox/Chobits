import { useEffect, useRef, useState } from 'react';
import { TbFolder, TbFolderOpen, TbLoader } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { maskPath } from '@/lib/helpers';

type SelectModelFolderProps = {
  /** 当插件目录已配置（初次加载发现已存在）或随后被选择/修改时调用 */
  onConfigured?: (dir: string) => void;
};

const SelectModelFolder: React.FC<SelectModelFolderProps> = ({ onConfigured }) => {
  const [pluginsDir, setPluginsDir] = useState<string>('');
  const [pickBusy, setPickBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const prevDirRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await window.YUA.pluginResource['plugin-resource:getPluginsDir']();
        if (!mounted) return;
        if (res.ok && res.path) {
          setPluginsDir(res.path);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // 初次加载不触发 onConfigured，只记录当前目录便于后续比较
  useEffect(() => {
    if (loading) return;
    if (pluginsDir) {
      prevDirRef.current = pluginsDir;
    }
  }, [loading]);

  const pickDir = async (): Promise<void> => {
    setPickBusy(true);
    try {
      const r = await window.YUA.file['file:pickDir']({ allowCreate: true, defaultPath: pluginsDir });
      if (!r.canceled && r.path) {
        const res = await window.YUA.pluginResource['plugin-resource:setPluginsDir']({ dir: r.path });
        if (res.ok) {
          setPluginsDir(r.path);
          // 仅在用户主动选择后触发回调
          prevDirRef.current = r.path;
          onConfigured?.(r.path);
        }
      }
    } finally {
      setPickBusy(false);
    }
  };

  const openFolder = async (): Promise<void> => {
    if (!pluginsDir) return;
    try {
      await window.YUA.file['file:openPath'](pluginsDir);
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <TbLoader className="h-4 w-4 mr-2 animate-spin" />
        读取配置...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 当前路径显示 */}
      <div
        className="group flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={openFolder}
      >
        <div className="flex-shrink-0 w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
          <TbFolder className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="text-xs text-muted-foreground">当前存储位置</div>
          <div className="text-xs font-medium truncate group-hover:text-primary transition-colors" title={pluginsDir}>
            {pluginsDir ? maskPath(pluginsDir) : '未设置'}
          </div>
        </div>
        {pluginsDir && <TbFolderOpen className="h-4 w-4 flex-shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />}
      </div>

      {/* 说明文字 */}
      <p className="text-xs text-muted-foreground leading-relaxed">
        插件资源包含引擎和模型文件，可能占用较大空间，建议选择非系统盘存储。
      </p>

      {/* 操作按钮 */}
      <Button variant="outline" className="w-full" onClick={pickDir} disabled={pickBusy}>
        {pickBusy ? <TbLoader className="h-4 w-4 mr-2 animate-spin" /> : <TbFolder className="h-4 w-4 mr-2" />}
        {!pluginsDir ? '选择存储位置' : '更改存储位置'}
      </Button>
    </div>
  );
};

export default SelectModelFolder;

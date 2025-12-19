import { useEffect, useRef, useState } from 'react';
import { TbBox, TbFolderOpen } from 'react-icons/tb';

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

  if (loading) return <div className="text-xs text-muted-foreground py-2">读取配置...</div>;

  return (
    <div className="space-y-4 text-sm">
      <div className="text-sm text-muted-foreground mb-4 text-center">选择插件资源存储位置（包含引擎和模型文件，可能占用较大空间，建议选择非系统盘）。</div>
      <div className="flex gap-6 items-center justify-center">
        <div
          className="w-36 h-36 flex items-center flex-col justify-center rounded-md cursor-pointer text-sm font-medium transition-colors border border-solid border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground"
          onClick={pickDir}
        >
          <div className="flex items-center justify-center text-primary">
            <TbBox size={40} />
          </div>
          <div className="text-center select-none">{!pluginsDir ? '选择文件夹' : '修改文件夹'}</div>
        </div>
        {pluginsDir && (
          <div
            className="w-36 h-36 flex items-center flex-col justify-center rounded-md cursor-pointer text-sm font-medium transition-colors border border-solid border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground"
            onClick={openFolder}
          >
            <div className="flex items-center justify-center text-primary">
              <TbFolderOpen size={40} />
            </div>
            <div className="text-center select-none">打开所在位置</div>
          </div>
        )}
      </div>
      {pluginsDir && (
        <div className="mt-4 break-all">
          当前位置：
          <span className="font-mono text-primary cursor-pointer" onClick={openFolder}>
            {maskPath(pluginsDir)}
          </span>
        </div>
      )}
    </div>
  );
};

export default SelectModelFolder;

import React, { useEffect, useRef, useState } from 'react';
import { TbArrowRight, TbFolder, TbLoader } from 'react-icons/tb';

import { maskPath } from '@/lib/helpers';

interface SelectModelFolderProps {
  /** 当插件目录已配置（初次加载发现已存在）或随后被选择/修改时调用 */
  onConfigured?: (dir: string) => void;
}

const SelectModelFolder: React.FC<SelectModelFolderProps> = ({ onConfigured }) => {
  const [pluginsDir, setPluginsDir] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const prevDirRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await window.chobits.pluginResource['plugin-resource:get-plugins-dir']();
        if (!mounted) return;
        if (res.ok && res.path) {
          setPluginsDir(res.path);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // 初次加载不触发 onConfigured，只记录当前目录便于后续比较
  useEffect(() => {
    if (isLoading) return;
    if (pluginsDir) {
      prevDirRef.current = pluginsDir;
    }
  }, [isLoading]);

  const pickDir = async (): Promise<void> => {
    const r = await window.chobits.file['file:pick-dir']({ allowCreate: true, defaultPath: pluginsDir });
    if (r.ok && r.path) {
      const res = await window.chobits.pluginResource['plugin-resource:set-plugins-dir']({ dir: r.path });
      if (res.ok) {
        setPluginsDir(r.path);
        // 仅在用户主动选择后触发回调
        prevDirRef.current = r.path;
        onConfigured?.(r.path);
      }
    }
  };

  const openFolder = async (): Promise<void> => {
    if (!pluginsDir) return;
    try {
      await window.chobits.file['file:open-path'](pluginsDir);
    } catch {
      // ignore
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <TbLoader className="h-4 w-4 mr-2 animate-spin" />
        读取配置...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* 当前路径显示 */}
      <div className="group flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors" onClick={openFolder}>
        <div className="flex-shrink-0 w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
          <TbFolder className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="text-xs text-muted-foreground">当前存储位置</div>
          <div className="text-xs font-medium truncate group-hover:text-primary transition-colors" title={pluginsDir}>
            {pluginsDir ? maskPath(pluginsDir) : '未设置'}
          </div>
        </div>
        {pluginsDir && <TbArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />}
      </div>

      {/* 说明文字 */}
      <p className="text-xs text-muted-foreground leading-relaxed">
        插件占用较大空间，建议选择非系统盘存储。
        <span className="text-primary underline cursor-pointer ml-1 whitespace-nowrap" onClick={pickDir}>
          [{!pluginsDir ? '选择存储位置' : '更改存储位置'}]
        </span>
      </p>
    </div>
  );
};

export default SelectModelFolder;

import { TbBox, TbFolderOpen } from 'react-icons/tb';
import React, { useEffect, useRef, useState } from 'react';

type Props = {
  /** 当模型目录已配置（初次加载发现已存在）或随后被选择/修改时调用 */
  onConfigured?: (config: any) => void;
};

const SelectModelFolder: React.FC<Props> = ({ onConfigured }) => {
  const [config, setConfig] = useState<any>(null);
  const [pickBusy, setPickBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const prevRootRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg = await window.YUA.model['model:getConfig']();
        if (!mounted) return;
        setConfig(cfg);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // 初次加载不触发 onConfigured，只记录当前 root 便于后续比较
  useEffect(() => {
    if (loading) return;
    if (config?.rootDir) {
      prevRootRef.current = config.rootDir;
    }
  }, [loading]);

  const pickDir = async () => {
    setPickBusy(true);
    try {
      const r = await window.YUA.file['file:pickDir']({ allowCreate: true });
      if (!r.canceled && r.path) {
        const res = await window.YUA.model['model:setConfig']({ rootDir: r.path });
        if (res.ok) {
          setConfig(res.data);
          // 仅在用户主动选择后触发回调
          prevRootRef.current = res.data?.rootDir;
          onConfigured?.(res.data);
        }
      }
    } finally {
      setPickBusy(false);
    }
  };

  const openFolder = async () => {
    if (!config?.rootDir) return;
    try {
      await window.YUA.file['file:openPath'](config.rootDir);
    } catch { }
  };

  if (loading) return <div className="text-xs text-muted-foreground py-2">读取配置...</div>;

  return (
    <div className="space-y-4 text-sm">
      <div className="text-sm text-muted-foreground mb-4 text-center">选择模型存储位置用于保存下载的模型。</div>
      <div className="flex gap-6 items-center justify-center">
        <div
          className="w-36 h-36 flex items-center flex-col justify-center rounded-md cursor-pointer text-sm font-medium transition-colors border border-solid border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground"
          onClick={pickDir}
        >
          <div className="flex items-center justify-center text-primary">
            <TbBox size={40} />
          </div>
          <div className="text-center select-none">{!config?.rootDir ? '选择模型文件夹' : '修改模型文件夹'}</div>
        </div>
        {config?.rootDir && (
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
      {config?.rootDir && (
        <div className="mt-4 break-all">
          当前位置：<span className="font-mono text-primary">{config?.rootDir}</span>
        </div>
      )}
    </div>
  );
};

export default SelectModelFolder;

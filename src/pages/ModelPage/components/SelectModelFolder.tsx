import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TbFolderOpen } from 'react-icons/tb';
import React, { useEffect, useState } from 'react';

interface SelectModelFolderProps {
  onRootDirChange?: (dir?: string) => void;      // 通知父组件 rootDir 变化
  onNeedRootDir?: () => void;                    // 初次发现未配置时请求父组件保持/打开对话框
}

const SelectModelFolder: React.FC<SelectModelFolderProps> = ({ onRootDirChange, onNeedRootDir }) => {
  const [config, setConfig] = useState<any>(null);
  const [pickBusy, setPickBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg = await window.YUA.model['model:getConfig']();
        if (!mounted) return;
        setConfig(cfg);
        if (cfg?.rootDir) {
          onRootDirChange?.(cfg.rootDir);
        } else {
          onNeedRootDir?.();
        }
      } finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, []);

  const pickDir = async () => {
    setPickBusy(true);
    try {
      const r = await window.YUA.file['file:pickDir']({ allowCreate: true });
      if (!r.canceled && r.path) {
        const res = await window.YUA.model['model:setConfig']({ rootDir: r.path });
        if (res.ok) {
          setConfig(res.data);
          onRootDirChange?.(res.data?.rootDir);
        }
      }
    } finally { setPickBusy(false); }
  };

  if (loading) return <div className='text-xs text-muted-foreground py-2'>读取配置...</div>;

  return (
    <div className='space-y-4 text-sm'>
      <div className='space-y-2'>
        <div>
          {
            !config?.rootDir
              ? '请先选择模型存储目录，用于保存下载的模型文件。'
              : '配置模型存储目录和下载并发数量。'
          }
        </div>
        <div className='flex items-center gap-2'>
          {/* <Input value={config?.rootDir || '选择模型目录'} readOnly /> */}
          <Button className='shrink-0' disabled={pickBusy} onClick={pickDir}><TbFolderOpen />选择模型目录</Button>
        </div>
      </div>
    </div>
  );
};

export default SelectModelFolder;

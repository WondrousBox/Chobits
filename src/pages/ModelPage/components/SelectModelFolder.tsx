import { Input } from '@/components/ui/input';
import { TbBox, TbFolderOpen } from 'react-icons/tb';
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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
      } finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, []);

  // 当 rootDir 存在且发生变化（包括首次获取）时触发回调
  useEffect(() => {
    if (loading) return;
    const current = config?.rootDir;
    if (current && current !== prevRootRef.current) {
      prevRootRef.current = current;
      onConfigured?.(config);
    }
  }, [loading, config, onConfigured]);

  const pickDir = async () => {
    setPickBusy(true);
    try {
      const r = await window.YUA.file['file:pickDir']({ allowCreate: true });
      if (!r.canceled && r.path) {
        const res = await window.YUA.model['model:setConfig']({ rootDir: r.path });
        if (res.ok) {
          setConfig(res.data);
          // 这里不直接调用 onConfigured，因为上面的 useEffect 会检测变化并统一调用
        }
      }
    } finally { setPickBusy(false); }
  };

  const openFolder = async () => {
    if (!config?.rootDir) return;
    try { await window.YUA.file['file:openPath'](config.rootDir); } catch { }
  };

  if (loading) return <div className='text-xs text-muted-foreground py-2'>读取配置...</div>;

  return (
    <div className='space-y-4 text-sm'>
      <div className='text-sm text-muted-foreground mb-4 text-center'>
        {
          !config?.rootDir
            ? '请先选择模型存储目录，用于保存下载的模型。'
            : '配置模型存储目录和下载并发数量。'
        }
      </div>
      <div className='relative overflow-hidden'>
        <motion.div
          className='flex gap-6'
          animate={{ x: config?.rootDir ? 0 : 0 }}
          // 预留如后续需要初始居中 -> 左移，可在无 rootDir 时设置偏移
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        >
          <div
            className='w-36 h-36 flex items-center flex-col justify-center rounded-md cursor-pointer text-sm font-medium transition-colors border border-solid border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground'
            onClick={pickDir}
          >
            <div className='flex items-center justify-center text-primary'>
              <TbBox size={40} />
            </div>
            <div className='text-center select-none'>{!config?.rootDir ? '选择模型文件夹' : '修改模型文件夹'}</div>
          </div>
          <AnimatePresence>
            {config?.rootDir && (
              <motion.div
                key='open-folder'
                initial={{ opacity: 0, y: 12, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.9 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className='w-36 h-36 flex items-center flex-col justify-center rounded-md cursor-pointer text-sm font-medium transition-colors border border-solid border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground'
                onClick={openFolder}
              >
                <div className='flex items-center justify-center text-primary'>
                  <TbFolderOpen size={40} />
                </div>
                <div className='text-center select-none'>打开所在位置</div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        {config?.rootDir && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className='mt-4'
          >
            <Input value={config?.rootDir} readOnly />
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default SelectModelFolder;

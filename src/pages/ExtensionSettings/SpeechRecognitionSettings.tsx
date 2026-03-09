import { AnimatePresence, motion } from 'framer-motion';
import React, { useEffect, useState } from 'react';
import { TbChevronDown, TbEar, TbLoader2, TbPlayerPlay, TbPlayerStop, TbSettings } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

type SpeechRecognitionSettingsProps = {
  expanded: boolean;
  onExpand: () => void;
};

const SpeechRecognitionSettings: React.FC<SpeechRecognitionSettingsProps> = ({ expanded, onExpand }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // 查询 ASR 服务状态
  const checkStatus = async (): Promise<void> => {
    try {
      const status = await window.YUA.sherpa.getStatus();
      setIsRunning(status.running);
    } catch (error) {
      console.error('查询 ASR 状态失败:', error);
      setIsRunning(false);
    }
  };

  // 初始化时查询状态
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await checkStatus();
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 切换 ASR 服务
  const handleToggle = async (checked: boolean): Promise<void> => {
    setLoading(true);
    try {
      if (checked) {
        // 打开 ASR 配置页面来启动服务
        window.YUA.window['window:open']('asrConfig');
        // 延迟检查状态（给用户时间在配置页面启动服务）
        // 这里不直接设置 isRunning，等用户从配置页启动后再检查
      } else {
        // 停止 ASR 服务
        await window.YUA.sherpa.freeInstance();
        setIsRunning(false);
      }
    } catch (error) {
      console.error('切换 ASR 服务失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 监听窗口焦点变化，重新检查 ASR 状态（从 asrConfig 返回后）
  useEffect(() => {
    const handleFocus = (): void => {
      checkStatus();
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${isRunning ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
              <TbEar className="h-6 w-6" />
            </div>
            <div>
              <div className="text-base font-semibold text-foreground">语音识别服务</div>
              <div className="text-sm text-muted-foreground">实时语音识别引擎，将语音转为文字。服务独立运行，不随录音窗口关闭。</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(loading || checking) && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <TbLoader2 className="animate-spin" />
                <span>{checking ? '检查中...' : '处理中...'}</span>
              </div>
            )}
            <Button variant="ghost" size="icon" className={`w-8 h-8 transition-transform ${expanded ? 'rotate-180' : ''}`} onClick={onExpand}>
              <TbChevronDown className="h-4 w-4" />
            </Button>
            <Switch checked={isRunning} onCheckedChange={handleToggle} disabled={loading || checking} />
          </div>
        </div>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="asr-settings-panel"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="mt-4 pt-4 border-t border-border space-y-4">
                {/* 状态指示 */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-500' : 'bg-gray-400'}`} />
                    <span className="text-sm font-medium">{isRunning ? '语音识别服务运行中' : '语音识别服务未启动'}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isRunning ? '服务正在运行，可在录音窗口中使用实时语音识别。关闭录音窗口不会停止服务。' : '启动后将加载语音识别模型。可通过开关或右键菜单控制服务。'}
                  </p>
                </div>

                {/* 操作按钮 */}
                <div className="flex gap-2">
                  {isRunning ? (
                    <Button size="sm" variant="destructive" disabled={loading} onClick={() => handleToggle(false)} className="gap-2">
                      <TbPlayerStop /> 停止服务
                    </Button>
                  ) : (
                    <Button size="sm" variant="default" disabled={loading} onClick={() => handleToggle(true)} className="gap-2">
                      <TbPlayerPlay /> 启动服务
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => window.YUA.window['window:open']('asrConfig')} className="gap-2">
                    <TbSettings /> 识别配置
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default SpeechRecognitionSettings;

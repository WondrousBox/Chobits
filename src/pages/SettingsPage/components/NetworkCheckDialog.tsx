import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TbLoader2, TbWifi, TbWifiOff } from 'react-icons/tb';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import type { NetworkCheckResult } from './types';

interface NetworkCheckDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export const NetworkCheckDialog: React.FC<NetworkCheckDialogProps> = ({ isOpen, onOpenChange }) => {
  const { t } = useTranslation('ai');
  const [networkChecking, setNetworkChecking] = useState(false);
  const [networkResults, setNetworkResults] = useState<NetworkCheckResult[]>([]);

  const checkNetwork = async (): Promise<void> => {
    setNetworkChecking(true);
    setNetworkResults([]);
    try {
      const res = await window.chobits.pluginResource['plugin-resource:check-network']();
      if (res.ok && res.results) {
        setNetworkResults(res.results);
      }
    } catch (error) {
      console.error('Network check failed:', error);
      setNetworkResults([
        { name: 'Hugging Face', url: 'https://huggingface.co', success: false, error: t('networkCheck.checkFailed') },
        { name: 'GitHub', url: 'https://github.com', success: false, error: t('networkCheck.checkFailed') }
      ]);
    } finally {
      setNetworkChecking(false);
    }
  };

  // 当对话框打开时自动开始检测
  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 打开对话框即开始异步检测,检测中的 setState 是有意的进度反馈
      checkNetwork();
    } else {
      // 关闭时重置状态
      setNetworkChecking(false);
      setNetworkResults([]);
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('networkCheck.title')}</DialogTitle>
          <DialogDescription>{t('networkCheck.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-4">
          {networkChecking ? (
            <div className="flex items-center justify-center gap-2 py-8">
              <TbLoader2 className="animate-spin" size={20} />
              <span className="text-sm text-muted-foreground">{t('networkCheck.checking')}</span>
            </div>
          ) : (
            networkResults.map((result) => (
              <div key={result.url} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  {result.success ? <TbWifi className="text-green-500" size={20} /> : <TbWifiOff className="text-red-500" size={20} />}
                  <div>
                    <div className="text-sm font-medium">{result.name}</div>
                    <div className="text-xs text-muted-foreground">{result.url}</div>
                  </div>
                </div>
                <div className="text-sm">
                  {result.success ? <span className="text-green-500">{t('networkCheck.accessible')}</span> : <span className="text-red-500">{result.error || t('networkCheck.inaccessible')}</span>}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

import React, { useEffect, useState } from 'react';
import { TbLoader2, TbWifi, TbWifiOff } from 'react-icons/tb';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import type { NetworkCheckResult } from './types';

interface NetworkCheckDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export const NetworkCheckDialog: React.FC<NetworkCheckDialogProps> = ({ isOpen, onOpenChange }) => {
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
        { name: 'Hugging Face', url: 'https://huggingface.co', success: false, error: '检测失败' },
        { name: 'GitHub', url: 'https://github.com', success: false, error: '检测失败' }
      ]);
    } finally {
      setNetworkChecking(false);
    }
  };

  // 当对话框打开时自动开始检测
  useEffect(() => {
    if (isOpen) {
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
          <DialogTitle>网络连通性检测</DialogTitle>
          <DialogDescription>检测是否能访问插件和模型下载所需的网站</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-4">
          {networkChecking ? (
            <div className="flex items-center justify-center gap-2 py-8">
              <TbLoader2 className="animate-spin" size={20} />
              <span className="text-sm text-muted-foreground">正在检测...</span>
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
                <div className="text-sm">{result.success ? <span className="text-green-500">可访问</span> : <span className="text-red-500">{result.error || '无法访问'}</span>}</div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

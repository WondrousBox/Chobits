import React, { useState } from 'react';
import { TbKey, TbLoader2, TbTrash } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const KeyManagementSettings: React.FC = () => {
  const [isClearing, setIsClearing] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const handleClearAllKeys = async (): Promise<void> => {
    setIsClearing(true);
    try {
      const result = await window.YUA.ai.clearAllSecrets();
      if (result.ok) {
        setShowConfirmDialog(false);
        // 可以在这里添加成功提示
      }
    } catch (error) {
      console.error('清理密钥失败:', error);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="px-2">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <TbKey className="h-6 w-6" />
            </div>
            <div>
              <div className="text-base font-semibold text-foreground">密钥管理</div>
              <div className="text-sm text-muted-foreground">管理存储在系统密钥链中的 API 密钥和敏感信息。</div>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-sm font-medium text-foreground mb-1">清理所有密钥</div>
              <div className="text-xs text-muted-foreground">将清除所有已存储的 Provider 和 Instance 密钥，包括 keytar 和回退文件中的所有数据。此操作不可恢复。</div>
            </div>
            <Button size="sm" variant="destructive" disabled={isClearing} onClick={() => setShowConfirmDialog(true)}>
              {isClearing ? (
                <>
                  <TbLoader2 className="animate-spin" />
                  清理中...
                </>
              ) : (
                <>
                  <TbTrash />
                  一键清理
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="w-96">
          <DialogHeader>
            <DialogTitle>确认清理</DialogTitle>
            <DialogDescription>将永久删除所有存储在系统密钥链中的 API Key</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="destructive" onClick={handleClearAllKeys} disabled={isClearing}>
              {isClearing ? (
                <>
                  <TbLoader2 className="animate-spin" />
                  清理中...
                </>
              ) : (
                '确认清理'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default KeyManagementSettings;

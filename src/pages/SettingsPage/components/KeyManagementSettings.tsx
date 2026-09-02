import React, { useState } from 'react';
import { TbLoader2, TbTrash } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { SettingGroup, SettingItem } from './SettingComponents';

const KeyManagementSettings: React.FC = () => {
  const [isClearing, setIsClearing] = useState(false);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);

  const handleClearAllKeys = async (): Promise<void> => {
    setIsClearing(true);
    try {
      const result = await window.chobits.ai.clearAllSecrets();
      if (result.ok) {
        setIsConfirmDialogOpen(false);
      }
    } catch (error) {
      console.error('清理密钥失败:', error);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <>
      <SettingGroup title="安全">
        <SettingItem
          title="清理所有密钥"
          description="清除系统密钥链中存储的所有 API 密钥，此操作不可恢复"
          action={
            <Button size="sm" variant="destructive" disabled={isClearing} onClick={() => setIsConfirmDialogOpen(true)}>
              {isClearing ? (
                <>
                  <TbLoader2 className="h-4 w-4 animate-spin mr-1" />
                  清理中...
                </>
              ) : (
                <>
                  <TbTrash className="h-4 w-4 mr-1" />
                  一键清理
                </>
              )}
            </Button>
          }
        />
      </SettingGroup>

      <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <DialogContent className="w-96">
          <DialogHeader>
            <DialogTitle>确认清理</DialogTitle>
            <DialogDescription>将永久删除所有存储在系统密钥链中的 API Key</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfirmDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleClearAllKeys} disabled={isClearing}>
              {isClearing ? (
                <>
                  <TbLoader2 className="h-4 w-4 animate-spin mr-1" />
                  清理中...
                </>
              ) : (
                '确认清理'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default KeyManagementSettings;

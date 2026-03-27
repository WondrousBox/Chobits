import React, { useEffect, useState } from 'react';
import { TbBrain, TbLoader2, TbTopologyRing, TbTrash } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { SettingGroup, SettingItem } from './SettingComponents';

const MemoryManagementSettings: React.FC = () => {
  const [isClearing, setIsClearing] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [noteCount, setNoteCount] = useState<number | null>(null);

  useEffect(() => {
    window.YUA.memory
      .stats()
      .then((stats: { totalNotes?: number }) => {
        setNoteCount(stats?.totalNotes ?? 0);
      })
      .catch(() => { });
  }, []);

  const handleClearAll = async (): Promise<void> => {
    setIsClearing(true);
    try {
      await window.YUA.memory.clearAll();
      setShowConfirmDialog(false);
      setNoteCount(0);
    } catch (error) {
      console.error('清除记忆失败:', error);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <>
      <SettingGroup title="记忆">
        <SettingItem
          title="记忆图谱"
          description={noteCount !== null ? `查看记忆主题图谱和知识网络（当前 ${noteCount} 条记忆）` : '查看记忆主题图谱和知识网络'}
          action={
            <Button size="sm" variant="outline" onClick={() => window.YUA.window['window:open']('memoryGraph' as any)}>
              <TbTopologyRing className="h-4 w-4 mr-1" />
              打开图谱
            </Button>
          }
        />
        <SettingItem
          title="清除所有记忆"
          description={noteCount !== null ? `删除所有记忆笔记、主题和关联数据（当前 ${noteCount} 条记忆），此操作不可恢复` : '删除所有记忆笔记、主题和关联数据，此操作不可恢复'}
          action={
            <Button size="sm" variant="destructive" disabled={isClearing} onClick={() => setShowConfirmDialog(true)}>
              {isClearing ? (
                <>
                  <TbLoader2 className="h-4 w-4 animate-spin mr-1" />
                  清除中...
                </>
              ) : (
                <>
                  <TbTrash className="h-4 w-4 mr-1" />
                  清除记忆
                </>
              )}
            </Button>
          }
        />
      </SettingGroup>

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="w-96">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TbBrain className="h-5 w-5 text-destructive" />
              确认清除所有记忆
            </DialogTitle>
            <DialogDescription>将删除所有记忆笔记文件、主题图谱、关键词索引及相关数据库记录，此操作不可恢复。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleClearAll} disabled={isClearing}>
              {isClearing ? (
                <>
                  <TbLoader2 className="h-4 w-4 animate-spin mr-1" />
                  清除中...
                </>
              ) : (
                '确认清除'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MemoryManagementSettings;

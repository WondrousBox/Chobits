import React from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface RenameFolderDialogProps {
  renameOpen: boolean;
  setRenameOpen: (open: boolean) => void;
  renameName: string;
  setRenameName: (name: string) => void;
  handleRenameConfirm: () => void;
}

const RenameFolderDialog: React.FC<RenameFolderDialogProps> = ({ renameOpen, setRenameOpen, renameName, setRenameName, handleRenameConfirm }) => {
  return (
    <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>重命名文件夹</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Input value={renameName} onChange={(e) => setRenameName(e.target.value)} placeholder="输入新名称" />
        </div>
        <DialogFooter>
          <Button size="sm" variant="outline" onClick={() => setRenameOpen(false)}>
            取消
          </Button>
          <Button size="sm" onClick={handleRenameConfirm}>
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RenameFolderDialog;

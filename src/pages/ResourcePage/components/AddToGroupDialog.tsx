import React, { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MasonryLayoutGroup } from '@/types';

interface AddToGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: MasonryLayoutGroup[];
  onAdd: (groupId: string) => void;
}

export const AddToGroupDialog: React.FC<AddToGroupDialogProps> = ({ open, onOpenChange, groups, onAdd }) => {
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');

  const handleAdd = () => {
    if (selectedGroupId) {
      onAdd(selectedGroupId);
      setSelectedGroupId('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>添加到分组</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="group-select">选择分组</Label>
            <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
              <SelectTrigger id="group-select">
                <SelectValue placeholder="选择要添加到的分组" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name || '未命名分组'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button size="sm" onClick={handleAdd} disabled={!selectedGroupId}>
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

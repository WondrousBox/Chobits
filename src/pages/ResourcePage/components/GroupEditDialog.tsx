import React, { useState } from 'react';
import { TbLayoutGrid, TbLayoutList } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { MasonryLayoutGroup } from '@/types';

interface GroupEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group?: MasonryLayoutGroup;
  onSave: (name: string, layout: 'grid' | 'list') => void;
}

export const GroupEditDialog: React.FC<GroupEditDialogProps> = ({ open, onOpenChange, group, onSave }) => {
  const [name, setName] = useState(group?.name || '');
  const [layout, setLayout] = useState<'grid' | 'list'>(group?.layout || 'grid');

  React.useEffect(() => {
    if (open && group) {
      setName(group.name || '');
      setLayout(group.layout || 'grid');
    }
  }, [open, group]);

  const handleSave = () => {
    onSave(name.trim() || '未命名分组', layout);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{group ? '编辑分组' : '新建分组'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="group-name">分组名称</Label>
            <Input id="group-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="输入分组名称" />
          </div>
          <div className="space-y-2">
            <Label>布局方式</Label>
            <RadioGroup value={layout} onValueChange={(v) => setLayout(v as 'grid' | 'list')}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="grid" id="layout-grid" />
                <Label htmlFor="layout-grid" className="flex items-center gap-2 cursor-pointer">
                  <TbLayoutGrid className="w-4 h-4" />
                  宫格布局
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="list" id="layout-list" />
                <Label htmlFor="layout-list" className="flex items-center gap-2 cursor-pointer">
                  <TbLayoutList className="w-4 h-4" />
                  列表布局
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>
        <DialogFooter>
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button size="sm" onClick={handleSave}>
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

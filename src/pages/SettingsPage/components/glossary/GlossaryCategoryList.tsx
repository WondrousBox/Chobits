import { useCallback, useEffect, useState } from 'react';
import { TbCheck, TbChevronDown, TbEdit, TbPlus, TbTrash } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// 数据类型定义
export interface GlossaryCategory {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  isPreset?: boolean; // 是否为预设分类
}

export interface GlossaryCategoryListProps {
  value: string | null;
  onChange: (categoryId: string | null) => void;
}

export default function GlossaryCategoryList({ value, onChange }: GlossaryCategoryListProps): JSX.Element {
  const [categories, setCategories] = useState<GlossaryCategory[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);

  // 对话框状态
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [form, setForm] = useState({ name: '', description: '' });
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);

  // 加载数据
  const loadCategories = useCallback(async () => {
    const cats = await window.YUA.ai.listGlossaryCategories().catch(() => []);
    setCategories(cats || []);
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  // 新建分类
  const openCreateCategory = () => {
    setDialogMode('create');
    setForm({ name: '', description: '' });
    setEditingCategoryId(null);
    setDialogOpen(true);
  };

  // 编辑分类
  const openEditCategory = (cat: GlossaryCategory) => {
    if (cat.isPreset) {
      alert('预设分类不能编辑');
      return;
    }
    setDialogMode('edit');
    setForm({ name: cat.name, description: cat.description || '' });
    setEditingCategoryId(cat.id);
    setDialogOpen(true);
  };

  // 提交分类
  const submitCategory = async () => {
    if (!form.name.trim()) return;
    if (dialogMode === 'create') {
      const newCategory = await window.YUA.ai.createGlossaryCategory({
        name: form.name,
        description: form.description || undefined
      });
      await loadCategories();
      onChange(newCategory.id);
    } else if (editingCategoryId) {
      await window.YUA.ai.updateGlossaryCategory(editingCategoryId, {
        name: form.name,
        description: form.description || undefined
      });
      await loadCategories();
    }
    setDialogOpen(false);
  };

  // 删除分类
  const deleteCategory = async (id: string) => {
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    if (cat.isPreset) {
      alert('预设分类不能删除');
      return;
    }
    if (!confirm(`删除分类「${cat.name}」及其下所有术语表？`)) return;
    await window.YUA.ai.deleteGlossaryCategory(id);
    if (value === id) onChange(null);
    await loadCategories();
  };

  const selectedCategory = categories.find((c) => c.id === value);

  return (
    <>
      <div className="p-3 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground block mb-2">分类</span>
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full h-8 justify-between">
              {selectedCategory?.name || '全部分类'}
              <TbChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0" align="start">
            <Command className="rounded-lg border shadow-md">
              <CommandInput className="h-8" placeholder="搜索分类..." />
              <CommandList>
                <CommandEmpty>未找到匹配的分类</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="__all__"
                    onSelect={() => {
                      onChange(null);
                      setPopoverOpen(false);
                    }}
                    className={cn(value === null && 'bg-accent text-accent-foreground')}
                  >
                    <span className="flex-1">全部分类</span>
                    {value === null && <TbCheck className="h-4 w-4 shrink-0" />}
                  </CommandItem>
                  {categories.map((cat) => (
                    <CommandItem
                      key={cat.id}
                      value={`${cat.name} ${cat.description || ''} ${cat.id}`}
                      onSelect={() => {
                        onChange(cat.id);
                        setPopoverOpen(false);
                      }}
                      className={cn(value === cat.id && 'bg-accent text-accent-foreground')}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <span>{cat.name}</span>
                        {cat.isPreset && <span className="text-xs text-muted-foreground">预设</span>}
                      </div>
                      {value === cat.id && <TbCheck className="h-4 w-4 shrink-0" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
                {categories.length > 0 && <CommandSeparator />}
                {/* 新增分类选项 */}
                <CommandItem
                  value="__create_new__"
                  onSelect={() => {
                    openCreateCategory();
                    setPopoverOpen(false);
                  }}
                >
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <TbPlus className="h-3 w-3" />
                    <span>新增分类</span>
                  </div>
                </CommandItem>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {/* 编辑/删除分类按钮 */}
        {value && selectedCategory && !selectedCategory.isPreset && (
          <div className="flex items-center gap-1 mt-2">
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => openEditCategory(selectedCategory)}>
              <TbEdit className="h-3 w-3 mr-1" />
              编辑
            </Button>
            <Button size="sm" variant="ghost" className="h-6 text-xs text-destructive hover:text-destructive" onClick={() => deleteCategory(value)}>
              <TbTrash className="h-3 w-3 mr-1" />
              删除
            </Button>
          </div>
        )}
      </div>

      {/* 新建/编辑分类对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogMode === 'create' ? '新建分类' : '编辑分类'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>分类名称</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：影视术语" />
            </div>
            <div className="space-y-2">
              <Label>描述（可选）</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="分类描述" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={submitCategory}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

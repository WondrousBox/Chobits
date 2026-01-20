import { useCallback, useEffect, useState } from 'react';
import { TbCheck, TbPencil, TbPlus, TbTrash, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface GlossaryEntry {
  source: string;
  target: string;
  note?: string;
}

interface GlossaryItem {
  id: string;
  categoryId: string;
  name: string;
  description?: string;
  entries: GlossaryEntry[];
  sourceFile?: string;
  sourceFormat?: string;
  createdAt: number;
  updatedAt: number;
}

interface EditingCell {
  entryIndex: number;
  field: 'source' | 'target' | 'note';
}

interface GlossaryEntriesTableProps {
  glossaryId: string | null;
  glossaryName?: string;
  onDataChange?: () => void; // 数据变化时的回调，用于刷新父组件
}

type EditState = {
  [key: string]: string; // entryIndex-field: value
};

export default function GlossaryEntriesTable({ glossaryId, glossaryName, onDataChange }: GlossaryEntriesTableProps): JSX.Element {
  // 术语表数据
  const [glossary, setGlossary] = useState<GlossaryItem | null>(null);
  const [loading, setLoading] = useState(false);

  // 编辑状态
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValues, setEditValues] = useState<EditState>({});

  // 添加术语对话框
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newEntry, setNewEntry] = useState<GlossaryEntry>({ source: '', target: '', note: '' });

  // 加载术语表数据
  const loadGlossary = useCallback(async () => {
    if (!glossaryId) {
      setGlossary(null);
      return;
    }

    setLoading(true);
    try {
      const data = await window.YUA.ai.listGlossaries();
      const found = data.find((g) => g.id === glossaryId);
      setGlossary(found || null);
    } catch (error) {
      console.error('Failed to load glossary:', error);
      setGlossary(null);
    } finally {
      setLoading(false);
    }
  }, [glossaryId]);

  useEffect(() => {
    loadGlossary();
  }, [loadGlossary]);

  // ==================== 单元格编辑 ====================

  const handleCellClick = useCallback(
    (entryIndex: number, field: 'source' | 'target' | 'note') => {
      const key = `${entryIndex}-${field}`;
      const currentValue = glossary?.entries[entryIndex]?.[field] || '';
      setEditValues({ [key]: currentValue });
      setEditingCell({ entryIndex, field });
    },
    [glossary]
  );

  const handleEditChange = useCallback((entryIndex: number, field: 'source' | 'target' | 'note', value: string) => {
    const key = `${entryIndex}-${field}`;
    setEditValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleEditConfirm = useCallback(async () => {
    if (!editingCell || !glossary || !glossaryId) return;

    const { entryIndex, field } = editingCell;
    const entry = glossary.entries[entryIndex];
    const key = `${entryIndex}-${field}`;
    const newValue = editValues[key];

    if (newValue === undefined || newValue.trim() === '') {
      setEditingCell(null);
      setEditValues({});
      return;
    }

    // 创建更新后的条目
    const updatedEntry: GlossaryEntry = {
      source: field === 'source' ? newValue.trim() : entry.source,
      target: field === 'target' ? newValue.trim() : entry.target,
      note: field === 'note' ? newValue.trim() || undefined : entry.note
    };

    try {
      await window.YUA.ai.updateGlossaryEntry(glossaryId, entry.source, updatedEntry);
      await loadGlossary();
      onDataChange?.();
    } catch (error) {
      alert(error instanceof Error ? error.message : '更新术语失败');
    }

    setEditingCell(null);
    setEditValues({});
  }, [editingCell, glossary, glossaryId, editValues, loadGlossary, onDataChange]);

  const handleEditCancel = useCallback(() => {
    setEditingCell(null);
    setEditValues({});
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleEditConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleEditCancel();
      }
    },
    [handleEditConfirm, handleEditCancel]
  );

  // ==================== 删除条目 ====================

  const handleRemoveEntry = useCallback(
    async (source: string) => {
      if (!glossaryId) return;
      if (!confirm(`删除术语「${source}」？`)) return;

      try {
        await window.YUA.ai.removeGlossaryEntry(glossaryId, source);
        await loadGlossary();
        onDataChange?.();
      } catch (error) {
        console.error('Failed to remove entry:', error);
      }
    },
    [glossaryId, loadGlossary, onDataChange]
  );

  // ==================== 添加条目 ====================

  const openAddDialog = useCallback(() => {
    setNewEntry({ source: '', target: '', note: '' });
    setAddDialogOpen(true);
  }, []);

  const submitNewEntry = useCallback(async () => {
    if (!glossaryId || !newEntry.source.trim() || !newEntry.target.trim()) return;

    try {
      await window.YUA.ai.addGlossaryEntries(glossaryId, [
        {
          source: newEntry.source.trim(),
          target: newEntry.target.trim(),
          note: newEntry.note?.trim() || undefined
        }
      ]);
      setAddDialogOpen(false);
      await loadGlossary();
      onDataChange?.();
    } catch (error) {
      console.error('Failed to add entry:', error);
    }
  }, [glossaryId, newEntry, loadGlossary, onDataChange]);

  // ==================== 渲染 ====================

  const renderCell = useCallback(
    (entryIndex: number, field: 'source' | 'target' | 'note', value: string | undefined): JSX.Element => {
      const isEditing = editingCell?.entryIndex === entryIndex && editingCell?.field === field;
      const key = `${entryIndex}-${field}`;
      const editValue = editValues[key] || '';

      if (isEditing) {
        return (
          <TableCell className={field === 'note' ? '' : 'font-medium'}>
            <input
              type="text"
              className="w-full bg-background border border-primary rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              value={editValue}
              onChange={(e) => handleEditChange(entryIndex, field, e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              onBlur={handleEditConfirm}
            />
          </TableCell>
        );
      }

      return (
        <TableCell
          className={field === 'note' ? 'text-muted-foreground cursor-pointer hover:bg-muted/50 transition-colors' : 'font-medium cursor-pointer hover:bg-muted/50 transition-colors'}
          onClick={() => handleCellClick(entryIndex, field)}
        >
          <div className="flex items-center justify-between group">
            <span>{value || '-'}</span>
            <TbPencil className="h-3 w-3 opacity-0 group-hover:opacity-50" />
          </div>
        </TableCell>
      );
    },
    [editingCell, editValues, handleEditChange, handleKeyDown, handleEditConfirm, handleCellClick]
  );

  // 空状态：没有选择术语表
  if (!glossaryId) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="mb-2">请从左侧选择一个术语表</p>
        <p className="text-xs">或创建新的术语表</p>
      </div>
    );
  }

  // 加载状态
  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>加载中...</p>
      </div>
    );
  }

  // 空状态：没有术语
  if (!glossary || glossary.entries.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="mb-2">暂无术语</p>
        <p className="text-xs mb-4">点击「添加术语」或拖拽文件导入</p>
        <Button size="sm" onClick={openAddDialog}>
          <TbPlus className="h-4 w-4 mr-1" />
          添加术语
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">源词</TableHead>
            <TableHead className="w-[200px]">目标词</TableHead>
            <TableHead>备注</TableHead>
            <TableHead className="w-[100px] text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {glossary.entries.map((entry, idx) => (
            <TableRow key={idx}>
              {renderCell(idx, 'source', entry.source)}
              {renderCell(idx, 'target', entry.target)}
              {renderCell(idx, 'note', entry.note)}
              <TableCell>
                <Button size="icon" variant="ghost" className="w-6 h-6 text-destructive hover:text-destructive" onClick={() => handleRemoveEntry(entry.source)}>
                  <TbTrash className="h-3.5 w-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* 编辑提示 */}
      {editingCell && (
        <div className="mt-2 text-xs text-muted-foreground flex items-center gap-3">
          <span>按 Enter 确认，Esc 取消</span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={handleEditCancel}>
              <TbX className="h-3 w-3 mr-1" />
              取消
            </Button>
            <Button size="sm" className="h-6 px-2 text-xs" onClick={handleEditConfirm}>
              <TbCheck className="h-3 w-3 mr-1" />
              确认
            </Button>
          </div>
        </div>
      )}

      {/* 添加术语对话框 */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加术语</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>源词（原文）</Label>
              <Input value={newEntry.source} onChange={(e) => setNewEntry({ ...newEntry, source: e.target.value })} placeholder="如：Avengers" />
            </div>
            <div className="space-y-2">
              <Label>目标词（译文）</Label>
              <Input value={newEntry.target} onChange={(e) => setNewEntry({ ...newEntry, target: e.target.value })} placeholder="如：复仇者联盟" />
            </div>
            <div className="space-y-2">
              <Label>备注（可选）</Label>
              <Input value={newEntry.note || ''} onChange={(e) => setNewEntry({ ...newEntry, note: e.target.value })} placeholder="如：漫威超级英雄团队" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={submitNewEntry} disabled={!newEntry.source.trim() || !newEntry.target.trim()}>
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

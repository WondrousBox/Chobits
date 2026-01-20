import { useCallback, useState } from 'react';
import { TbCheck, TbPencil, TbTrash, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
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
  glossary: GlossaryItem | null;
  onAddEntry: () => void;
  onUpdateEntry: (oldSource: string, newEntry: GlossaryEntry) => Promise<void>;
  onRemoveEntry: (source: string) => Promise<void>;
}

type EditState = {
  [key: string]: string; // entryIndex-field: value
};

export default function GlossaryEntriesTable({ glossary, onAddEntry, onUpdateEntry, onRemoveEntry }: GlossaryEntriesTableProps): JSX.Element {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValues, setEditValues] = useState<EditState>({});

  const handleCellClick = useCallback(
    (entryIndex: number, field: 'source' | 'target' | 'note') => {
      const key = `${entryIndex}-${field}`;
      const currentValue = glossary?.entries[entryIndex]?.[field] || '';
      setEditValues({ [key]: currentValue });
      setEditingCell({ entryIndex, field });
    },
    [glossary]
  );

  const handleEditChange = useCallback(
    (entryIndex: number, field: 'source' | 'target' | 'note', value: string) => {
      const key = `${entryIndex}-${field}`;
      setEditValues({ ...editValues, [key]: value });
    },
    [editValues]
  );

  const handleEditConfirm = useCallback(async () => {
    if (!editingCell || !glossary) return;

    const { entryIndex, field } = editingCell;
    const entry = glossary.entries[entryIndex];
    const key = `${entryIndex}-${field}`;
    const newValue = editValues[key];

    if (newValue === undefined || newValue.trim() === '') {
      // 清空编辑状态
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

    await onUpdateEntry(entry.source, updatedEntry);

    // 清空编辑状态
    setEditingCell(null);
    setEditValues({});
  }, [editingCell, glossary, editValues, onUpdateEntry]);

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

  const renderCell = (entryIndex: number, field: 'source' | 'target' | 'note', value: string | undefined): JSX.Element => {
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
  };

  if (!glossary) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="mb-2">请从左侧选择一个术语表</p>
        <p className="text-xs">或创建新的术语表</p>
      </div>
    );
  }

  if (glossary.entries.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="mb-2">暂无术语</p>
        <p className="text-xs">点击「添加术语」或拖拽文件导入</p>
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
                <Button size="icon" variant="ghost" className="w-6 h-6 text-destructive hover:text-destructive" onClick={() => onRemoveEntry(entry.source)}>
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
    </div>
  );
}

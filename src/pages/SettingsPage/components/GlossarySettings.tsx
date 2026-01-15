import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TbEdit, TbFileImport, TbFolderPlus, TbPlus, TbTrash, TbUpload } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

// 数据类型定义
interface GlossaryEntry {
  source: string;
  target: string;
  note?: string;
}

interface GlossaryCategory {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
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

interface ParseResult {
  success: boolean;
  entries: GlossaryEntry[];
  format: string;
  error?: string;
  suggestedName?: string;
}

export default function GlossarySettings(): JSX.Element {
  // 分类和术语表数据
  const [categories, setCategories] = useState<GlossaryCategory[]>([]);
  const [glossaries, setGlossaries] = useState<GlossaryItem[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedGlossaryId, setSelectedGlossaryId] = useState<string | null>(null);

  // 搜索
  const [search, setSearch] = useState('');

  // 对话框状态
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryDialogMode, setCategoryDialogMode] = useState<'create' | 'edit'>('create');
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '' });
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);

  const [glossaryDialogOpen, setGlossaryDialogOpen] = useState(false);
  const [glossaryDialogMode, setGlossaryDialogMode] = useState<'create' | 'edit'>('create');
  const [glossaryForm, setGlossaryForm] = useState({ name: '', description: '', categoryId: '' });
  const [editingGlossaryId, setEditingGlossaryId] = useState<string | null>(null);

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importContent, setImportContent] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [importPreview, setImportPreview] = useState<ParseResult | null>(null);
  const [importTargetCategory, setImportTargetCategory] = useState('');
  const [importTargetName, setImportTargetName] = useState('');

  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [entryForm, setEntryForm] = useState<GlossaryEntry>({ source: '', target: '', note: '' });

  // 拖拽相关
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // 加载数据
  const loadCategories = useCallback(async () => {
    const cats = await window.YUA.ai.listGlossaryCategories().catch(() => []);
    setCategories(cats || []);
    if (!selectedCategoryId && cats?.length > 0) {
      setSelectedCategoryId(cats[0].id);
    }
  }, [selectedCategoryId]);

  const loadGlossaries = useCallback(async () => {
    const items = await window.YUA.ai.listGlossaries().catch(() => []);
    setGlossaries(items || []);
  }, []);

  useEffect(() => {
    void loadCategories();
    void loadGlossaries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 筛选术语表
  const filteredGlossaries = useMemo(() => {
    let items = glossaries;
    if (selectedCategoryId) {
      items = items.filter((g) => g.categoryId === selectedCategoryId);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((g) => g.name.toLowerCase().includes(q) || g.entries.some((e) => e.source.toLowerCase().includes(q) || e.target.toLowerCase().includes(q)));
    }
    return items;
  }, [glossaries, selectedCategoryId, search]);

  // 当前选中的术语表
  const selectedGlossary = useMemo(() => glossaries.find((g) => g.id === selectedGlossaryId) || null, [glossaries, selectedGlossaryId]);

  // ==================== 分类管理 ====================

  const openCreateCategory = () => {
    setCategoryDialogMode('create');
    setCategoryForm({ name: '', description: '' });
    setEditingCategoryId(null);
    setCategoryDialogOpen(true);
  };

  const openEditCategory = (cat: GlossaryCategory) => {
    setCategoryDialogMode('edit');
    setCategoryForm({ name: cat.name, description: cat.description || '' });
    setEditingCategoryId(cat.id);
    setCategoryDialogOpen(true);
  };

  const submitCategory = async () => {
    if (!categoryForm.name.trim()) return;
    if (categoryDialogMode === 'create') {
      await window.YUA.ai.createGlossaryCategory({ name: categoryForm.name, description: categoryForm.description || undefined });
    } else if (editingCategoryId) {
      await window.YUA.ai.updateGlossaryCategory(editingCategoryId, { name: categoryForm.name, description: categoryForm.description || undefined });
    }
    setCategoryDialogOpen(false);
    await loadCategories();
  };

  const deleteCategory = async (id: string) => {
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    if (['general', 'technical', 'names'].includes(id)) {
      alert('默认分类不能删除');
      return;
    }
    if (!confirm(`删除分类「${cat.name}」及其下所有术语表？`)) return;
    await window.YUA.ai.deleteGlossaryCategory(id);
    if (selectedCategoryId === id) setSelectedCategoryId(null);
    await loadCategories();
    await loadGlossaries();
  };

  // ==================== 术语表管理 ====================

  const openCreateGlossary = () => {
    setGlossaryDialogMode('create');
    setGlossaryForm({ name: '', description: '', categoryId: selectedCategoryId || categories[0]?.id || '' });
    setEditingGlossaryId(null);
    setGlossaryDialogOpen(true);
  };

  const openEditGlossary = (g: GlossaryItem) => {
    setGlossaryDialogMode('edit');
    setGlossaryForm({ name: g.name, description: g.description || '', categoryId: g.categoryId });
    setEditingGlossaryId(g.id);
    setGlossaryDialogOpen(true);
  };

  const submitGlossary = async () => {
    if (!glossaryForm.name.trim() || !glossaryForm.categoryId) return;
    if (glossaryDialogMode === 'create') {
      const newItem = await window.YUA.ai.createGlossary({
        categoryId: glossaryForm.categoryId,
        name: glossaryForm.name,
        description: glossaryForm.description || undefined,
        entries: []
      });
      setSelectedGlossaryId(newItem.id);
    } else if (editingGlossaryId) {
      await window.YUA.ai.updateGlossary(editingGlossaryId, {
        categoryId: glossaryForm.categoryId,
        name: glossaryForm.name,
        description: glossaryForm.description || undefined
      });
    }
    setGlossaryDialogOpen(false);
    await loadGlossaries();
  };

  const deleteGlossary = async (id: string) => {
    const g = glossaries.find((item) => item.id === id);
    if (!g) return;
    if (!confirm(`删除术语表「${g.name}」？`)) return;
    await window.YUA.ai.deleteGlossary(id);
    if (selectedGlossaryId === id) setSelectedGlossaryId(null);
    await loadGlossaries();
  };

  // ==================== 条目管理 ====================

  const openAddEntry = () => {
    setEntryForm({ source: '', target: '', note: '' });
    setEntryDialogOpen(true);
  };

  const submitEntry = async () => {
    if (!selectedGlossaryId || !entryForm.source.trim() || !entryForm.target.trim()) return;
    await window.YUA.ai.addGlossaryEntries(selectedGlossaryId, [
      {
        source: entryForm.source.trim(),
        target: entryForm.target.trim(),
        note: entryForm.note?.trim() || undefined
      }
    ]);
    setEntryDialogOpen(false);
    await loadGlossaries();
  };

  const removeEntry = async (source: string) => {
    if (!selectedGlossaryId) return;
    if (!confirm(`删除术语「${source}」？`)) return;
    await window.YUA.ai.removeGlossaryEntry(selectedGlossaryId, source);
    await loadGlossaries();
  };

  // ==================== 导入功能 ====================

  const parseImportContent = async (content: string, fileName?: string) => {
    const result = await window.YUA.ai.parseGlossaryContent(content, fileName);
    setImportPreview(result);
    if (result.suggestedName) {
      setImportTargetName(result.suggestedName);
    }
  };

  const openImportDialog = () => {
    setImportContent('');
    setImportFileName('');
    setImportPreview(null);
    setImportTargetCategory(selectedCategoryId || categories[0]?.id || '');
    setImportTargetName('');
    setImportDialogOpen(true);
  };

  const handleFileSelect = async (file: File) => {
    const text = await file.text();
    setImportContent(text);
    setImportFileName(file.name);
    await parseImportContent(text, file.name);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      await handleFileSelect(file);
      setImportDialogOpen(true);
    }
  };

  const handlePaste = async () => {
    if (!importContent.trim()) return;
    await parseImportContent(importContent);
  };

  const submitImport = async () => {
    if (!importPreview?.success || !importTargetCategory || !importTargetName.trim()) return;
    await window.YUA.ai.createGlossary({
      categoryId: importTargetCategory,
      name: importTargetName.trim(),
      entries: importPreview.entries,
      sourceFile: importFileName || undefined,
      sourceFormat: importPreview.format
    });
    setImportDialogOpen(false);
    await loadGlossaries();
  };

  // ==================== 拖拽事件处理 ====================

  useEffect(() => {
    const dropZone = dropZoneRef.current;
    if (!dropZone) return;

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
    };

    const handleDropEvent = async (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) {
        await handleFileSelect(file);
        setImportDialogOpen(true);
      }
    };

    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDropEvent as any);

    return () => {
      dropZone.removeEventListener('dragover', handleDragOver);
      dropZone.removeEventListener('dragleave', handleDragLeave);
      dropZone.removeEventListener('drop', handleDropEvent as any);
    };
  }, []);

  return (
    <div className="h-full flex" ref={dropZoneRef}>
      {/* 拖拽覆盖层 */}
      {isDragging && (
        <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary z-50 flex items-center justify-center">
          <div className="text-lg font-medium text-primary">释放文件以导入术语表</div>
        </div>
      )}

      {/* 左侧：分类和术语表列表 */}
      <div className="w-[260px] flex flex-col border-r border-border">
        {/* 分类选择 */}
        <div className="p-3 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium text-muted-foreground flex-1">分类</span>
            <Button size="icon" variant="ghost" className="w-6 h-6" onClick={openCreateCategory} title="新建分类">
              <TbFolderPlus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Select value={selectedCategoryId || ''} onValueChange={(v) => setSelectedCategoryId(v || null)}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder="全部分类" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">全部分类</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  <div className="flex items-center justify-between w-full">
                    <span>{cat.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* 编辑/删除分类按钮 */}
          {selectedCategoryId && selectedCategoryId !== '__all__' && (
            <div className="flex items-center gap-1 mt-2">
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => openEditCategory(categories.find((c) => c.id === selectedCategoryId)!)}>
                <TbEdit className="h-3 w-3 mr-1" />
                编辑
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-xs text-destructive hover:text-destructive" onClick={() => deleteCategory(selectedCategoryId)}>
                <TbTrash className="h-3 w-3 mr-1" />
                删除
              </Button>
            </div>
          )}
        </div>

        {/* 工具栏 */}
        <div className="p-3 flex items-center gap-2">
          <Input className="h-8 flex-1" placeholder="搜索术语..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <Button size="icon" className="w-8 h-8 flex-shrink-0" onClick={openCreateGlossary} title="新建术语表">
            <TbPlus className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" className="w-8 h-8 flex-shrink-0" onClick={openImportDialog} title="导入术语">
            <TbFileImport className="h-4 w-4" />
          </Button>
        </div>

        {/* 术语表列表 */}
        <ScrollArea className="flex-1">
          <div className="px-2 pb-2">
            {filteredGlossaries.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-6">{glossaries.length === 0 ? '暂无术语表' : '无匹配结果'}</div>
            ) : (
              <div className="space-y-0.5">
                {filteredGlossaries.map((g) => (
                  <div
                    key={g.id}
                    className={'group flex items-center justify-between px-3 py-2 cursor-pointer transition-colors rounded-md ' + (g.id === selectedGlossaryId ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50')}
                    onClick={() => setSelectedGlossaryId(g.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium">{g.name}</div>
                      <div className="text-xs text-muted-foreground">{g.entries.length} 个术语</div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="w-6 h-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditGlossary(g);
                        }}
                      >
                        <TbEdit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="w-6 h-6 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteGlossary(g.id);
                        }}
                      >
                        <TbTrash className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* 右侧：术语条目列表 */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="text-sm font-medium text-foreground">{selectedGlossary ? selectedGlossary.name : '请选择术语表'}</div>
          {selectedGlossary && (
            <Button size="sm" onClick={openAddEntry}>
              <TbPlus className="h-4 w-4 mr-1" />
              添加术语
            </Button>
          )}
        </div>
        <div className="flex-1 overflow-auto p-4">
          {selectedGlossary ? (
            selectedGlossary.entries.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="mb-2">暂无术语</p>
                <p className="text-xs">点击「添加术语」或拖拽文件导入</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">源词</TableHead>
                    <TableHead className="w-[200px]">目标词</TableHead>
                    <TableHead>备注</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedGlossary.entries.map((entry, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{entry.source}</TableCell>
                      <TableCell>{entry.target}</TableCell>
                      <TableCell className="text-muted-foreground">{entry.note || '-'}</TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" className="w-6 h-6 text-destructive hover:text-destructive" onClick={() => removeEntry(entry.source)}>
                          <TbTrash className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p className="mb-2">请从左侧选择一个术语表</p>
              <p className="text-xs">或创建新的术语表</p>
            </div>
          )}
        </div>
      </div>

      {/* 隐藏的文件输入 */}
      <input ref={fileInputRef} type="file" className="hidden" accept=".json,.csv,.tsv,.txt" onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])} />

      {/* 新建/编辑分类对话框 */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{categoryDialogMode === 'create' ? '新建分类' : '编辑分类'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>分类名称</Label>
              <Input value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} placeholder="如：影视术语" />
            </div>
            <div className="space-y-2">
              <Label>描述（可选）</Label>
              <Input value={categoryForm.description} onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })} placeholder="分类描述" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={submitCategory}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 新建/编辑术语表对话框 */}
      <Dialog open={glossaryDialogOpen} onOpenChange={setGlossaryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{glossaryDialogMode === 'create' ? '新建术语表' : '编辑术语表'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>术语表名称</Label>
              <Input value={glossaryForm.name} onChange={(e) => setGlossaryForm({ ...glossaryForm, name: e.target.value })} placeholder="如：漫威电影术语" />
            </div>
            <div className="space-y-2">
              <Label>所属分类</Label>
              <Select value={glossaryForm.categoryId} onValueChange={(v) => setGlossaryForm({ ...glossaryForm, categoryId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="选择分类" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>描述（可选）</Label>
              <Input value={glossaryForm.description} onChange={(e) => setGlossaryForm({ ...glossaryForm, description: e.target.value })} placeholder="术语表描述" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGlossaryDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={submitGlossary}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 添加术语对话框 */}
      <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加术语</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>源词（原文）</Label>
              <Input value={entryForm.source} onChange={(e) => setEntryForm({ ...entryForm, source: e.target.value })} placeholder="如：Avengers" />
            </div>
            <div className="space-y-2">
              <Label>目标词（译文）</Label>
              <Input value={entryForm.target} onChange={(e) => setEntryForm({ ...entryForm, target: e.target.value })} placeholder="如：复仇者联盟" />
            </div>
            <div className="space-y-2">
              <Label>备注（可选）</Label>
              <Input value={entryForm.note || ''} onChange={(e) => setEntryForm({ ...entryForm, note: e.target.value })} placeholder="如：漫威超级英雄团队" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEntryDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={submitEntry}>添加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 导入对话框 */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>导入术语</DialogTitle>
            <DialogDescription>支持 JSON、CSV、TSV 或纯文本格式。可以拖拽文件或粘贴内容。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* 文件上传区域 */}
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <TbUpload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">点击选择文件或拖拽到此处</p>
              <p className="text-xs text-muted-foreground mt-1">支持 .json, .csv, .tsv, .txt</p>
            </div>

            {/* 或分隔线 */}
            <div className="flex items-center gap-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">或粘贴内容</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* 粘贴区域 */}
            <div className="space-y-2">
              <Textarea className="h-32 font-mono text-xs" placeholder='粘贴术语内容，如：{"word": "翻译"} 或 word,翻译 或 word = 翻译' value={importContent} onChange={(e) => setImportContent(e.target.value)} />
              <Button size="sm" variant="outline" onClick={handlePaste}>
                解析内容
              </Button>
            </div>

            {/* 解析结果预览 */}
            {importPreview && (
              <div className="space-y-3">
                {importPreview.success ? (
                  <>
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <span>✓ 识别到 {importPreview.entries.length} 个术语</span>
                      <span className="text-xs text-muted-foreground">（格式：{importPreview.format}）</span>
                    </div>
                    {/* 预览前几条 */}
                    <div className="border rounded-md p-2 max-h-32 overflow-auto">
                      <div className="text-xs space-y-1">
                        {importPreview.entries.slice(0, 5).map((e, i) => (
                          <div key={i} className="flex gap-2">
                            <span className="font-medium">{e.source}</span>
                            <span className="text-muted-foreground">→</span>
                            <span>{e.target}</span>
                            {e.note && <span className="text-muted-foreground">({e.note})</span>}
                          </div>
                        ))}
                        {importPreview.entries.length > 5 && <div className="text-muted-foreground">...还有 {importPreview.entries.length - 5} 条</div>}
                      </div>
                    </div>
                    {/* 导入配置 */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>选择分类</Label>
                        <Select value={importTargetCategory} onValueChange={setImportTargetCategory}>
                          <SelectTrigger>
                            <SelectValue placeholder="选择分类" />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>
                                {cat.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>术语表名称</Label>
                        <Input value={importTargetName} onChange={(e) => setImportTargetName(e.target.value)} placeholder="术语表名称" />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-red-500">✗ {importPreview.error}</div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={submitImport} disabled={!importPreview?.success || !importTargetCategory || !importTargetName.trim()}>
              导入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

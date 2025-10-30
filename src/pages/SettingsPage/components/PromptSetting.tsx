import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import PromptTemplateFormDialog, { type PromptTemplateFormValues } from './PromptTemplateFormDialog';
import { TbTrash, TbPlus } from 'react-icons/tb';

type Template = { id: string; name: string; type: 'system' | 'user'; content: string };

export default function PromptSetting(): JSX.Element {
  // Local UI state
  const [tmplSearch, setTmplSearch] = useState('');
  // Unified form dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [formValues, setFormValues] = useState<PromptTemplateFormValues>({ name: '', content: '', type: 'user' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState<string>('');

  const refresh = useCallback(async (): Promise<void> => {
    const tmpl = await window.YUA.ai.listPromptTemplates().catch(() => []);
    setTemplates(tmpl || []);
    // ensure selected
    const list: Template[] = tmpl || [];
    if (!selectedId || !list.find((t) => t.id === selectedId)) {
      const firstId = list[0]?.id ?? null;
      setSelectedId(firstId);
      if (firstId) {
        const first = list.find((t) => t.id === firstId)!;
        setDraftContent(first.content || '');
      } else {
        setDraftContent('');
      }
    }
  }, [selectedId]);

  useEffect(() => {
    // Defer to next tick to avoid setState synchronously in effect lint warning
    const timer = setTimeout(() => {
      void refresh();
    }, 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  const openCreate = (): void => {
    setFormMode('create');
    setEditingId(null);
    setFormValues({ name: '', content: '', type: 'user' });
    setFormOpen(true);
  };

  const submitForm = async (vals: PromptTemplateFormValues): Promise<void> => {
    if (formMode === 'create') {
      await window.YUA.ai.createPromptTemplate({ name: vals.name, content: vals.content, type: vals.type || 'user' });
    } else if (formMode === 'edit' && editingId) {
      await window.YUA.ai.updatePromptTemplate(editingId, { name: vals.name, content: vals.content, type: vals.type || 'user' });
    }
    setFormOpen(false);
    setEditingId(null);
    await refresh();
  };

  const deleteTemplate = async (id: string): Promise<void> => {
    if (!confirm('删除该模板？')) return;
    await window.YUA.ai.deletePromptTemplate(id);
    await refresh();
  };

  const filteredTemplates = useMemo(() => {
    const q = tmplSearch.trim().toLowerCase();
    return (templates || []).filter((t) => !q || t.name.toLowerCase().includes(q) || t.content.toLowerCase().includes(q));
  }, [templates, tmplSearch]);

  const selected = useMemo(() => templates.find((t) => t.id === selectedId) || null, [templates, selectedId]);

  const saveDraft = async (): Promise<void> => {
    if (!selected) return;
    await window.YUA.ai.updatePromptTemplate(selected.id, {
      name: selected.name,
      content: draftContent,
      type: selected.type || 'user'
    });
    await refresh();
  };

  return (
    <div className="h-full grid" style={{ gridTemplateColumns: '260px 1fr' }}>
      {/* Left: title list */}
      <div className="border-r h-full flex flex-col">
        <div className="p-2 flex items-center gap-2 border-b">
          <Input className="h-8" placeholder="搜索…" value={tmplSearch} onChange={(e) => setTmplSearch(e.target.value)} />
          <Button size="icon" className="w-8 h-8" title="新建" onClick={openCreate}>
            <TbPlus />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-1">
            {filteredTemplates.map((t) => (
              <div
                key={t.id}
                className={'flex items-center justify-between px-2 py-1 rounded cursor-pointer select-none ' + (t.id === selectedId ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50')}
                onClick={() => {
                  setSelectedId(t.id);
                  setDraftContent(t.content || '');
                }}
              >
                <div className="truncate text-sm" title={t.name}>
                  {t.name}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="w-7 h-7 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    void deleteTemplate(t.id);
                  }}
                >
                  <TbTrash />
                </Button>
              </div>
            ))}
            {filteredTemplates.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-4">
                <div className="mb-2">无匹配模板</div>
                <Button size={'sm'} onClick={openCreate}>
                  <TbPlus />
                  新建模板
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right: content editor */}
      <div className="h-full flex flex-col">
        <div className="p-3 border-b">
          <div className="text-sm font-medium">{selected ? selected.name : '未选择模板'}</div>
          <div className="text-xs text-muted-foreground">在此直接编辑提示词内容并保存</div>
        </div>
        <div className="p-3 flex-1 flex flex-col gap-3 min-h-0">
          <Textarea
            className="flex-1 min-h-0"
            placeholder={selected ? '编辑模板内容…' : '请选择左侧模板'}
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            disabled={!selected}
          />
          <div className="flex items-center gap-2 justify-end">
            <Button
              onClick={() => {
                if (selected) setDraftContent(selected.content || '');
              }}
              variant="ghost"
              disabled={!selected}
            >
              重置
            </Button>
            <Button onClick={saveDraft} disabled={!selected}>
              保存
            </Button>
          </div>
        </div>
      </div>

      {/* Create dialog (add from left) */}
      <PromptTemplateFormDialog open={formOpen} mode={formMode} title={'新建模板'} initialValues={formValues} onClose={() => setFormOpen(false)} onSubmit={submitForm} />
    </div>
  );
}

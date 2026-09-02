import { useCallback, useEffect, useMemo, useState } from 'react';
import { TbPlus, TbTrash } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';

import PromptTemplateFormDialog, { type PromptTemplateFormValues } from './PromptTemplateFormDialog';

type Template = { id: string; name: string; type: 'system' | 'user'; content: string };

export default function PromptSetting(): JSX.Element {
  const [tmplSearch, setTmplSearch] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [formValues, setFormValues] = useState<PromptTemplateFormValues>({ name: '', content: '', type: 'user' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState<string>('');

  const refresh = useCallback(async (): Promise<void> => {
    const tmpl = await window.chobits.ai.listPromptTemplates().catch(() => []);
    setTemplates(tmpl || []);
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
    const timer = setTimeout(() => {
      void refresh();
    }, 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  const openCreate = (): void => {
    setFormMode('create');
    setEditingId(null);
    setFormValues({ name: '', content: '', type: 'user' });
    setIsFormOpen(true);
  };

  const submitForm = async (vals: PromptTemplateFormValues): Promise<void> => {
    if (formMode === 'create') {
      await window.chobits.ai.createPromptTemplate({ name: vals.name, content: vals.content, type: vals.type || 'user' });
    } else if (formMode === 'edit' && editingId) {
      await window.chobits.ai.updatePromptTemplate(editingId, { name: vals.name, content: vals.content, type: vals.type || 'user' });
    }
    setIsFormOpen(false);
    setEditingId(null);
    await refresh();
  };

  const deleteTemplate = async (id: string): Promise<void> => {
    if (!confirm('删除该模板？')) return;
    await window.chobits.ai.deletePromptTemplate(id);
    await refresh();
  };

  const filteredTemplates = useMemo(() => {
    const q = tmplSearch.trim().toLowerCase();
    return (templates || []).filter((t) => !q || t.name.toLowerCase().includes(q) || t.content.toLowerCase().includes(q));
  }, [templates, tmplSearch]);

  const selected = useMemo(() => templates.find((t) => t.id === selectedId) || null, [templates, selectedId]);

  const saveDraft = async (): Promise<void> => {
    if (!selected) return;
    await window.chobits.ai.updatePromptTemplate(selected.id, {
      name: selected.name,
      content: draftContent,
      type: selected.type || 'user'
    });
    await refresh();
  };

  return (
    <div className="h-full flex">
      {/* 左侧：模板列表 */}
      <div className="w-[220px] flex flex-col border-r border-border">
        <div className="p-3 flex items-center gap-2">
          <Input className="h-8 flex-1" placeholder="搜索..." value={tmplSearch} onChange={(e) => setTmplSearch(e.target.value)} />
          <Button size="icon" className="w-8 h-8 flex-shrink-0" onClick={openCreate}>
            <TbPlus className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="px-2 pb-2">
            {filteredTemplates.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-6">{templates.length === 0 ? '暂无模板' : '无匹配结果'}</div>
            ) : (
              <div className="space-y-0.5">
                {filteredTemplates.map((t) => (
                  <div
                    key={t.id}
                    className={'group flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ' + (t.id === selectedId ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50')}
                    onClick={() => {
                      setSelectedId(t.id);
                      setDraftContent(t.content || '');
                    }}
                  >
                    <span className="truncate text-sm">{t.name}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-6 h-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteTemplate(t.id);
                      }}
                    >
                      <TbTrash className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* 右侧：编辑器 */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="text-sm font-medium text-foreground">{selected ? selected.name : '未选择模板'}</div>
          {selected && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (selected) setDraftContent(selected.content || '');
                }}
              >
                重置
              </Button>
              <Button size="sm" onClick={saveDraft}>
                保存
              </Button>
            </div>
          )}
        </div>
        <div className="flex-1 p-4 min-h-0">
          <Textarea
            className="h-full w-full resize-none shadow-none border-none bg-transparent focus-visible:ring-0 p-0"
            placeholder={selected ? '编辑模板内容...' : '请先选择或创建一个模板'}
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            disabled={!selected}
          />
        </div>
      </div>

      {/* 新建对话框 */}
      <PromptTemplateFormDialog isOpen={isFormOpen} mode={formMode} title="新建模板" initialValues={formValues} onClose={() => setIsFormOpen(false)} onSubmit={submitForm} />
    </div>
  );
}

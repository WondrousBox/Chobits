import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import PromptTemplateFormDialog, { type PromptTemplateFormValues } from './PromptTemplateFormDialog';

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

  const refresh = async (): Promise<void> => {
    const tmpl = await (window as any).YUA.ai.listPromptTemplates().catch(() => []);
    setTemplates(tmpl || []);
  };

  useEffect(() => {
    // Defer to next tick to avoid setState synchronously in effect lint warning
    const timer = setTimeout(() => {
      void refresh();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const openCreate = (): void => {
    setFormMode('create');
    setEditingId(null);
    setFormValues({ name: '', content: '', type: 'user' });
    setFormOpen(true);
  };

  const openEdit = (t: Template): void => {
    setFormMode('edit');
    setEditingId(t.id);
    setFormValues({ name: t.name, content: t.content, type: t.type });
    setFormOpen(true);
  };

  const submitForm = async (vals: PromptTemplateFormValues): Promise<void> => {
    if (formMode === 'create') {
      await (window as any).YUA.ai.createPromptTemplate({ name: vals.name, content: vals.content, type: vals.type || 'user' });
    } else if (formMode === 'edit' && editingId) {
      await (window as any).YUA.ai.updatePromptTemplate(editingId, { name: vals.name, content: vals.content, type: vals.type || 'user' });
    }
    setFormOpen(false);
    setEditingId(null);
    await refresh();
  };

  const deleteTemplate = async (id: string): Promise<void> => {
    if (!confirm('删除该模板？')) return;
    await (window as any).YUA.ai.deletePromptTemplate(id);
    await refresh();
  };

  const insertHere = async (t: Template): Promise<void> => {
    try {
      await navigator.clipboard.writeText(t.content);
      alert('内容已复制，可粘贴到目标位置');
    } catch {
      alert('无法复制到剪贴板，请手动选择后复制');
    }
  };

  const filteredTemplates = useMemo(() => {
    const q = tmplSearch.trim().toLowerCase();
    return (templates || []).filter((t) => !q || t.name.toLowerCase().includes(q) || t.content.toLowerCase().includes(q));
  }, [templates, tmplSearch]);

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Input className="flex-1 h-8" placeholder="搜索名称或内容…" value={tmplSearch} onChange={(e) => setTmplSearch(e.target.value)} />
          {tmplSearch && (
            <Button variant="ghost" size="sm" onClick={() => setTmplSearch('')}>
              清空
            </Button>
          )}
        </div>
        <Button size="sm" onClick={openCreate}>
          新建
        </Button>
      </div>

      <ScrollArea className="h-56 pr-1">
        <div className="space-y-2">
          {filteredTemplates.map((t) => (
            <div key={t.id} className="border rounded-md p-2">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate" title={t.name}>
                    {t.name}
                  </div>
                  <div className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap" title={t.content}>
                    {t.content}
                  </div>
                </div>
                <div className="flex flex-col gap-1 text-xs shrink-0">
                  <Button variant="link" className="h-7 px-0" onClick={() => openEdit(t)}>
                    编辑
                  </Button>
                  <Button variant="link" className="h-7 px-0 text-foreground" onClick={() => insertHere(t)}>
                    插入
                  </Button>
                  <Button
                    variant="link"
                    className="h-7 px-0 text-foreground"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(t.content);
                        alert('已复制');
                      } catch {
                        alert('复制失败');
                      }
                    }}
                  >
                    复制
                  </Button>
                  <Button variant="link" className="h-7 px-0 text-destructive" onClick={() => deleteTemplate(t.id)}>
                    删除
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {filteredTemplates.length === 0 && <div className="text-xs text-muted-foreground text-center py-4">无匹配模板</div>}
        </div>
      </ScrollArea>
      <PromptTemplateFormDialog
        open={formOpen}
        mode={formMode}
        title={formMode === 'create' ? '新建模板' : '编辑模板'}
        initialValues={formValues}
        onClose={() => setFormOpen(false)}
        onSubmit={submitForm}
      />
    </div>
  );
}

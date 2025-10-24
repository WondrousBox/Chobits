import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Template = { id: string; name: string; type: 'system' | 'user'; content: string };

export default function PromptSetting() {
  // Local UI state
  const [tmplSearch, setTmplSearch] = useState('');
  const [newTmpl, setNewTmpl] = useState<{ name: string; type: 'system' | 'user'; content: string }>({ name: '', type: 'user', content: '' });
  const [editingTmpl, setEditingTmpl] = useState<Record<string, { name: string; type: 'system' | 'user'; content: string }>>({});
  const [templates, setTemplates] = useState<Template[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = async () => {
    const tmpl = await (window as any).YUA.ai.listPromptTemplates().catch(() => []);
    setTemplates(tmpl || []);
  };

  useEffect(() => {
    refresh();
  }, []);

  const startEditTemplate = (t: Template) => {
    setEditingTmpl((prev) => ({ ...prev, [t.id]: { name: t.name, type: t.type, content: t.content } }));
  };

  const cancelEditTemplate = (id: string) => {
    setEditingTmpl((prev) => {
      const { [id]: _omit, ...rest } = prev;
      return rest;
    });
  };

  const saveEditTemplate = async (id: string) => {
    const payload = editingTmpl[id];
    if (!payload) return;
    if (!payload.name.trim()) {
      alert('名称必填');
      return;
    }
    await (window as any).YUA.ai.updatePromptTemplate(id, payload);
    await refresh();
    cancelEditTemplate(id);
  };

  const createTemplate = async () => {
    if (!newTmpl.name.trim()) {
      alert('名称必填');
      return;
    }
    await (window as any).YUA.ai.createPromptTemplate(newTmpl);
    setNewTmpl({ name: '', type: 'user', content: '' });
    await refresh();
    setCreateOpen(false);
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm('删除该模板？')) return;
    await (window as any).YUA.ai.deletePromptTemplate(id);
    await refresh();
  };

  const insertHere = async (t: Template) => {
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
        <div className="text-sm font-semibold">提示词模板</div>
        <div className="flex items-center gap-2 mb-2">
          <Input className="flex-1 h-8" placeholder="搜索名称或内容…" value={tmplSearch} onChange={(e) => setTmplSearch(e.target.value)} />
          {tmplSearch && (
            <Button variant="ghost" size="sm" onClick={() => setTmplSearch('')}>
              清空
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-muted-foreground">
            {filteredTemplates.length} / {templates?.length ?? 0}
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            新建
          </Button>
        </div>
      </div>

      <ScrollArea className="h-56 pr-1">
        <div className="space-y-2">
          {filteredTemplates.map((t) => {
            const ed = editingTmpl[t.id];
            return (
              <div key={t.id} className="border rounded-md p-2">
                {ed ? (
                  <div className="grid gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <Select value={ed.type} onValueChange={(val) => setEditingTmpl((prev) => ({ ...prev, [t.id]: { ...ed, type: val as 'system' | 'user' } }))}>
                        <SelectTrigger className="w-[120px] h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="system">系统</SelectItem>
                          <SelectItem value="user">用户</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input className="flex-1 h-8" value={ed.name} onChange={(e) => setEditingTmpl((prev) => ({ ...prev, [t.id]: { ...ed, name: e.target.value } }))} />
                    </div>
                    <Textarea className="min-h-[70px]" value={ed.content} onChange={(e) => setEditingTmpl((prev) => ({ ...prev, [t.id]: { ...ed, content: e.target.value } }))} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveEditTemplate(t.id)}>
                        保存
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => cancelEditTemplate(t.id)}>
                        取消
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">[{t.type === 'system' ? '系统' : '用户'}]</div>
                      <div className="font-medium text-sm truncate" title={t.name}>
                        {t.name}
                      </div>
                      <div className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap" title={t.content}>
                        {t.content}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 text-xs shrink-0">
                      <Button variant="link" className="h-7 px-0" onClick={() => startEditTemplate(t)}>
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
                )}
              </div>
            );
          })}
          {filteredTemplates.length === 0 && <div className="text-xs text-muted-foreground text-center py-4">无匹配模板</div>}
        </div>
      </ScrollArea>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建模板</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 text-xs">
            <Input className="flex-1 h-8" placeholder="模板名称" value={newTmpl.name} onChange={(e) => setNewTmpl((prev) => ({ ...prev, name: e.target.value }))} />
            <Textarea className="min-h-[120px] block w-full box-border" placeholder="模板内容" value={newTmpl.content} onChange={(e) => setNewTmpl((prev) => ({ ...prev, content: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setCreateOpen(false);
                setNewTmpl({ name: '', type: 'user', content: '' });
              }}
            >
              取消
            </Button>
            <Button onClick={createTemplate}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

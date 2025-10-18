import { useEffect, useMemo, useState } from 'react';

type Template = { id: string; name: string; type: 'system' | 'user'; content: string };

export default function PromptSetting() {
  // Local UI state
  const [tmplSearch, setTmplSearch] = useState('');
  const [tmplType, setTmplType] = useState<'all' | 'system' | 'user'>('all');
  const [newTmpl, setNewTmpl] = useState<{ name: string; type: 'system' | 'user'; content: string }>({ name: '', type: 'system', content: '' });
  const [editingTmpl, setEditingTmpl] = useState<Record<string, { name: string; type: 'system' | 'user'; content: string }>>({});
  const [templates, setTemplates] = useState<Template[]>([]);

  const refresh = async () => {
    const tmpl = await (window as any).YUA.ai.listPromptTemplates().catch(() => []);
    setTemplates(tmpl || []);
  };

  useEffect(() => {
    refresh();
  }, []);

  const startEditTemplate = (t: Template) => {
    setEditingTmpl(prev => ({ ...prev, [t.id]: { name: t.name, type: t.type, content: t.content } }));
  };

  const cancelEditTemplate = (id: string) => {
    setEditingTmpl(prev => {
      const { [id]: _omit, ...rest } = prev;
      return rest;
    });
  };

  const saveEditTemplate = async (id: string) => {
    const payload = editingTmpl[id];
    if (!payload) return;
    if (!payload.name.trim()) { alert('名称必填'); return; }
    await (window as any).YUA.ai.updatePromptTemplate(id, payload);
    await refresh();
    cancelEditTemplate(id);
  };

  const createTemplate = async () => {
    if (!newTmpl.name.trim()) { alert('名称必填'); return; }
    await (window as any).YUA.ai.createPromptTemplate(newTmpl);
    setNewTmpl({ name: '', type: 'system', content: '' });
    await refresh();
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
    return (templates || []).filter(t => (tmplType === 'all' || t.type === tmplType) && (
      !q || t.name.toLowerCase().includes(q) || t.content.toLowerCase().includes(q)
    ));
  }, [templates, tmplType, tmplSearch]);

  return (
    <div className="mt-4 border-t pt-2">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">提示词模板</div>
        <div className="text-xs text-gray-500">{filteredTemplates.length} / {templates?.length ?? 0}</div>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex rounded border overflow-hidden text-xs">
          {(['all', 'system', 'user'] as const).map(tp => (
            <button
              key={tp}
              className={`px-2 py-1 ${tmplType === tp ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'}`}
              onClick={() => setTmplType(tp)}
            >{tp === 'all' ? '全部' : tp === 'system' ? '系统' : '用户'}</button>
          ))}
        </div>
        <input
          className="flex-1 rounded border px-2 py-1 text-xs"
          placeholder="搜索名称或内容…"
          value={tmplSearch}
          onChange={e => setTmplSearch(e.target.value)}
        />
        {tmplSearch && <button className="text-xs text-gray-500" onClick={() => setTmplSearch('')}>清空</button>}
      </div>

      <div className="space-y-1 max-h-56 overflow-auto pr-1">
        {filteredTemplates.map(t => {
          const ed = editingTmpl[t.id];
          return (
            <div key={t.id} className="border rounded p-2">
              {ed ? (
                <div className="grid gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <select className="rounded border px-2 py-1" value={ed.type} onChange={e => setEditingTmpl(prev => ({ ...prev, [t.id]: { ...ed, type: e.target.value as 'system' | 'user' } }))}>
                      <option value="system">系统</option>
                      <option value="user">用户</option>
                    </select>
                    <input className="flex-1 rounded border px-2 py-1" value={ed.name} onChange={e => setEditingTmpl(prev => ({ ...prev, [t.id]: { ...ed, name: e.target.value } }))} />
                  </div>
                  <textarea className="rounded border px-2 py-1 min-h-[70px]" value={ed.content} onChange={e => setEditingTmpl(prev => ({ ...prev, [t.id]: { ...ed, content: e.target.value } }))} />
                  <div className="flex gap-2">
                    <button className="px-2 py-1 rounded bg-blue-600 text-white" onClick={() => saveEditTemplate(t.id)}>保存</button>
                    <button className="px-2 py-1 rounded bg-gray-300" onClick={() => cancelEditTemplate(t.id)}>取消</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-500">[{t.type === 'system' ? '系统' : '用户'}]</div>
                    <div className="font-medium text-sm truncate" title={t.name}>{t.name}</div>
                    <div className="text-xs text-gray-600 line-clamp-2 whitespace-pre-wrap" title={t.content}>{t.content}</div>
                  </div>
                  <div className="flex flex-col gap-1 text-xs shrink-0">
                    <button className="text-blue-600" onClick={() => startEditTemplate(t)}>编辑</button>
                    <button className="text-gray-600" onClick={() => insertHere(t)}>插入</button>
                    <button className="text-gray-600" onClick={async () => { try { await navigator.clipboard.writeText(t.content); alert('已复制'); } catch { alert('复制失败'); } }}>复制</button>
                    <button className="text-red-600" onClick={() => deleteTemplate(t.id)}>删除</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filteredTemplates.length === 0 && (
          <div className="text-xs text-gray-500 text-center py-4">无匹配模板</div>
        )}
      </div>

      <div className="mt-3 border-t pt-2">
        <div className="text-sm font-semibold mb-1">新建模板</div>
        <div className="grid gap-2 text-xs">
          <div className="flex items-center gap-2">
            <select className="rounded border px-2 py-1" value={newTmpl.type} onChange={e => setNewTmpl(prev => ({ ...prev, type: e.target.value as 'system' | 'user' }))}>
              <option value="system">系统</option>
              <option value="user">用户</option>
            </select>
            <input className="flex-1 rounded border px-2 py-1" placeholder="模板名称" value={newTmpl.name} onChange={e => setNewTmpl(prev => ({ ...prev, name: e.target.value }))} />
          </div>
          <textarea className="rounded border px-2 py-1 min-h-[70px]" placeholder="模板内容" value={newTmpl.content} onChange={e => setNewTmpl(prev => ({ ...prev, content: e.target.value }))} />
          <div className="flex gap-2">
            <button className="px-2 py-1 rounded bg-blue-600 text-white" onClick={createTemplate}>创建</button>
            <button className="px-2 py-1 rounded bg-gray-300" onClick={() => setNewTmpl({ name: '', type: 'system', content: '' })}>重置</button>
          </div>
        </div>
      </div>
    </div>
  );
}
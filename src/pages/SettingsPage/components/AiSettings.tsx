import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';

type ProviderRow = { id: string; label: string; configured?: boolean; schema?: { fields?: Array<{ key: string; label: string; type: string; required?: boolean; options?: any[] }> } };
type Instance = { id: string; providerId: string; name: string; model?: string; systemPrompt?: string; config?: Record<string, any>; createdAt?: number };
type ModelOpt = { id: string; label?: string };
type Template = { id: string; name: string; type: 'system'|'user'; content: string };

export default function AiSettings() {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [models, setModels] = useState<Record<string, ModelOpt[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [instanceSecrets, setInstanceSecrets] = useState<Record<string, Record<string, string>>>({});
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});
  const [templates, setTemplates] = useState<Template[]>([]);
  // Template manager UI states
  const [tmplSearch, setTmplSearch] = useState('');
  const [tmplType, setTmplType] = useState<'all'|'system'|'user'>('all');
  const [newTmpl, setNewTmpl] = useState<{ name: string; type: 'system'|'user'; content: string }>({ name: '', type: 'system', content: '' });
  const [editingTmpl, setEditingTmpl] = useState<Record<string, { name: string; type: 'system'|'user'; content: string }>>({});

  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<{ name: string; model?: string; systemPrompt?: string; secrets: Record<string,string> }>({ name: '', model: '', systemPrompt: '', secrets: {} });

  const selectedProvider = useMemo(() => providers.find(p => p.id === selectedProviderId) || null, [providers, selectedProviderId]);

  useEffect(() => {
    (async () => {
      const provs = await (window as any).YUA.ai.getProviders();
      setProviders(provs || []);
      setSelectedProviderId(provs?.[0]?.id || null);
      const tmpl = await (window as any).YUA.ai.listPromptTemplates().catch(() => []);
      setTemplates(tmpl || []);
    })();
  }, []);

  useEffect(() => {
    if (!selectedProviderId) return;
    (async () => {
      const list = await (window as any).YUA.ai.listInstances(selectedProviderId);
      setInstances(list || []);
      try {
        const ms = await (window as any).YUA.ai.listModels(selectedProviderId);
        if (Array.isArray(ms) && ms.length) setModels(prev => ({ ...prev, [selectedProviderId]: ms }));
      } catch {}
    })();
  }, [selectedProviderId]);

  const schemaForProvider = (p?: ProviderRow | null) => {
    const shape: Record<string, z.ZodTypeAny> = {};
    (p?.schema?.fields || []).forEach(f => {
      const base = z.string().trim();
      shape[f.key] = f.required ? base.min(1, '必填') : base.optional().transform(v => v ?? '');
    });
    return z.object(shape);
  };

  const refreshInstanceModels = async (instanceId: string) => {
    const inst = instances.find(i => i.id === instanceId);
    if (!inst) return;
    try {
      const ms = await (window as any).YUA.ai.listModels(inst.providerId, inst.id);
      if (Array.isArray(ms) && ms.length) setModels(prev => ({ ...prev, [inst.providerId]: ms }));
    } catch {}
  };

  const loadInstanceSecrets = async (instanceId: string) => {
    const s = await (window as any).YUA.ai.getInstanceSecrets(instanceId).catch(() => ({}));
    setInstanceSecrets(prev => ({ ...prev, [instanceId]: s || {} }));
  };

  const onCreateInstance = async () => {
    if (!selectedProvider) return;
    const nameOk = (draft.name || '').trim().length > 0;
    const schema = schemaForProvider(selectedProvider);
    const parsed = schema.safeParse(draft.secrets);
    if (!nameOk || !parsed.success) {
      const errs: Record<string, string> = {};
      if (!nameOk) errs['name'] = '名称必填';
      if (!parsed.success) parsed.error.issues.forEach(i => { const k = i.path[0] as string; errs[k] = i.message; });
      setErrors(prev => ({ ...prev, __new__: errs }));
      return;
    }
    setErrors(prev => ({ ...prev, __new__: {} }));
    const created = await (window as any).YUA.ai.createInstance({ providerId: selectedProvider.id, name: draft.name, model: draft.model, systemPrompt: draft.systemPrompt, config: {} });
    if (created?.id) await (window as any).YUA.ai.setInstanceSecrets(created.id, draft.secrets);
    const list = await (window as any).YUA.ai.listInstances(selectedProvider.id);
    setInstances(list || []);
    setCreating(false);
    setDraft({ name: '', model: '', systemPrompt: '', secrets: {} });
  };

  const onSaveInstance = async (inst: Instance) => {
    const schema = schemaForProvider(selectedProvider);
    const parsed = schema.safeParse(instanceSecrets[inst.id] || {});
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach(i => { const k = i.path[0] as string; errs[k] = i.message; });
      setErrors(prev => ({ ...prev, [inst.id]: errs }));
      return;
    }
    setErrors(prev => ({ ...prev, [inst.id]: {} }));
    await (window as any).YUA.ai.updateInstance(inst.id, { name: inst.name, model: inst.model, systemPrompt: inst.systemPrompt });
    await (window as any).YUA.ai.setInstanceSecrets(inst.id, instanceSecrets[inst.id] || {});
    const list = await (window as any).YUA.ai.listInstances(inst.providerId);
    setInstances(list || []);
  };

  const onQuickTest = async (inst: Instance) => {
    try {
      await (window as any).YUA.ai.chat({
        providerInstanceId: inst.id,
        messages: [ { role: 'system', content: 'You are a connectivity test.' }, { role: 'user', content: 'ping' } ],
        stream: false,
      });
      alert('测试成功');
    } catch (e: any) {
      alert('测试失败: ' + (e?.message || e));
    }
  };

  const insertTemplateInto = (t: Template, setter: (v: string) => void, current: string) => {
    setter((current || '') + (current ? '\n' : '') + t.content);
  };

  const refreshTemplates = async () => {
    const tmpl = await (window as any).YUA.ai.listPromptTemplates().catch(() => []);
    setTemplates(tmpl || []);
  };

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
    await refreshTemplates();
    cancelEditTemplate(id);
  };

  const createTemplate = async () => {
    if (!newTmpl.name.trim()) { alert('名称必填'); return; }
    await (window as any).YUA.ai.createPromptTemplate(newTmpl);
    setNewTmpl({ name: '', type: 'system', content: '' });
    await refreshTemplates();
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm('删除该模板？')) return;
    await (window as any).YUA.ai.deletePromptTemplate(id);
    await refreshTemplates();
  };

  const insertTemplateSmart = async (t: Template) => {
    const expandedIds = Object.keys(expanded).filter(k => expanded[k]);
    if (creating) {
      setDraft(d => ({ ...d, systemPrompt: (d.systemPrompt || '') + ((d.systemPrompt && d.systemPrompt.length) ? '\n' : '') + t.content }));
      return;
    }
    if (expandedIds.length === 1) {
      const targetId = expandedIds[0];
      setInstances(list => list.map(x => x.id === targetId ? { ...x, systemPrompt: (x.systemPrompt || '') + ((x.systemPrompt && x.systemPrompt.length) ? '\n' : '') + t.content } : x));
      return;
    }
    try {
      await navigator.clipboard.writeText(t.content);
      alert('没有可插入的编辑目标，内容已复制到剪贴板');
    } catch {
      alert('没有可插入的编辑目标，且无法复制到剪贴板');
    }
  };

  const filteredTemplates = useMemo(() => {
    const q = tmplSearch.trim().toLowerCase();
    return templates.filter(t => (tmplType === 'all' || t.type === tmplType) && (
      !q || t.name.toLowerCase().includes(q) || t.content.toLowerCase().includes(q)
    ));
  }, [templates, tmplType, tmplSearch]);

  return (
    <div className="grid grid-cols-4 gap-3">
      {/* Left: Providers */}
      <div className="col-span-1 border rounded p-2 h-[70vh] overflow-auto">
        <div className="text-sm font-semibold mb-2">服务商</div>
        <div className="space-y-1">
          {providers.map(p => (
            <button
              key={p.id}
              className={`w-full text-left px-2 py-1 rounded border ${selectedProviderId===p.id?'bg-blue-50 border-blue-300':'border-transparent hover:bg-gray-50'}`}
              onClick={() => setSelectedProviderId(p.id)}
            >
              <div className="flex items-center justify-between">
                <span>{p.label}</span>
                <span className={`text-xs ${p.configured?'text-green-600':'text-gray-400'}`}>{p.configured?'已配置':'未配置'}</span>
              </div>
            </button>
          ))}
        </div>
        {/* Prompt templates manager (enhanced) */}
        <div className="mt-4 border-t pt-2">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold">提示词模板</div>
            <div className="text-xs text-gray-500">{filteredTemplates.length} / {templates.length}</div>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <div className="flex rounded border overflow-hidden text-xs">
              {(['all','system','user'] as const).map(tp => (
                <button
                  key={tp}
                  className={`px-2 py-1 ${tmplType===tp?'bg-blue-600 text-white':'hover:bg-gray-50'}`}
                  onClick={()=>setTmplType(tp)}
                >{tp==='all'?'全部':tp==='system'?'系统':'用户'}</button>
              ))}
            </div>
            <input
              className="flex-1 rounded border px-2 py-1 text-xs"
              placeholder="搜索名称或内容…"
              value={tmplSearch}
              onChange={e=>setTmplSearch(e.target.value)}
            />
            {tmplSearch && <button className="text-xs text-gray-500" onClick={()=>setTmplSearch('')}>清空</button>}
          </div>

          <div className="space-y-1 max-h-56 overflow-auto pr-1">
            {filteredTemplates.map(t => {
              const ed = editingTmpl[t.id];
              return (
                <div key={t.id} className="border rounded p-2">
                  {ed ? (
                    <div className="grid gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <select className="rounded border px-2 py-1" value={ed.type} onChange={e=>setEditingTmpl(prev=>({ ...prev, [t.id]: { ...ed, type: e.target.value as 'system'|'user' } }))}>
                          <option value="system">系统</option>
                          <option value="user">用户</option>
                        </select>
                        <input className="flex-1 rounded border px-2 py-1" value={ed.name} onChange={e=>setEditingTmpl(prev=>({ ...prev, [t.id]: { ...ed, name: e.target.value } }))} />
                      </div>
                      <textarea className="rounded border px-2 py-1 min-h-[70px]" value={ed.content} onChange={e=>setEditingTmpl(prev=>({ ...prev, [t.id]: { ...ed, content: e.target.value } }))} />
                      <div className="flex gap-2">
                        <button className="px-2 py-1 rounded bg-blue-600 text-white" onClick={()=>saveEditTemplate(t.id)}>保存</button>
                        <button className="px-2 py-1 rounded bg-gray-300" onClick={()=>cancelEditTemplate(t.id)}>取消</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-gray-500">[{t.type==='system'?'系统':'用户'}]</div>
                        <div className="font-medium text-sm truncate" title={t.name}>{t.name}</div>
                        <div className="text-xs text-gray-600 line-clamp-2 whitespace-pre-wrap" title={t.content}>{t.content}</div>
                      </div>
                      <div className="flex flex-col gap-1 text-xs shrink-0">
                        <button className="text-blue-600" onClick={()=>startEditTemplate(t)}>编辑</button>
                        <button className="text-gray-600" onClick={()=>insertTemplateSmart(t)}>插入</button>
                        <button className="text-gray-600" onClick={async()=>{ try { await navigator.clipboard.writeText(t.content); alert('已复制'); } catch { alert('复制失败'); } }}>复制</button>
                        <button className="text-red-600" onClick={()=>deleteTemplate(t.id)}>删除</button>
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
                <select className="rounded border px-2 py-1" value={newTmpl.type} onChange={e=>setNewTmpl(prev=>({ ...prev, type: e.target.value as 'system'|'user' }))}>
                  <option value="system">系统</option>
                  <option value="user">用户</option>
                </select>
                <input className="flex-1 rounded border px-2 py-1" placeholder="模板名称" value={newTmpl.name} onChange={e=>setNewTmpl(prev=>({ ...prev, name: e.target.value }))} />
              </div>
              <textarea className="rounded border px-2 py-1 min-h-[70px]" placeholder="模板内容" value={newTmpl.content} onChange={e=>setNewTmpl(prev=>({ ...prev, content: e.target.value }))} />
              <div className="flex gap-2">
                <button className="px-2 py-1 rounded bg-blue-600 text-white" onClick={createTemplate}>创建</button>
                <button className="px-2 py-1 rounded bg-gray-300" onClick={()=>setNewTmpl({ name:'', type:'system', content:'' })}>重置</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Instances */}
      <div className="col-span-3 border rounded p-3 h-[70vh] overflow-auto">
        {selectedProvider ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">{selectedProvider.label} · 配置实例</div>
              <button className="rounded bg-blue-600 px-3 py-1 text-white" onClick={()=>{ setCreating(true); setDraft({ name:'', model:'', systemPrompt:'', secrets:{} }); }}>新建实例</button>
            </div>

            {creating && (
              <div className="border rounded p-3 space-y-2">
                <div className="grid gap-2">
                  <label className="grid gap-1">
                    <span className="text-sm text-gray-600">名称</span>
                    <input className="rounded border px-2 py-1" value={draft.name} onChange={e=>setDraft(d=>({...d, name:e.target.value}))} />
                    {errors.__new__?.name && <span className="text-xs text-red-600">{errors.__new__?.name}</span>}
                  </label>
                  <label className="grid gap-1">
                    <span className="text-sm text-gray-600">模型</span>
                    <select className="rounded border px-2 py-1" value={draft.model || ''} onChange={e=>setDraft(d=>({...d, model:e.target.value}))}>
                      <option value="">选择模型</option>
                      {(models[selectedProvider.id]||[]).map(m=>(<option key={m.id} value={m.id}>{m.label || m.id}</option>))}
                    </select>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-sm text-gray-600">系统提示词</span>
                    <textarea className="rounded border px-2 py-1 min-h-[80px]" value={draft.systemPrompt||''} onChange={e=>setDraft(d=>({...d, systemPrompt:e.target.value}))} />
                    <div className="flex flex-wrap gap-2 text-xs">
                      {templates.filter(t=>t.type==='system').slice(0,6).map(t=> (
                        <button key={t.id} className="px-2 py-1 border rounded hover:bg-gray-50" onClick={()=>insertTemplateInto(t, (v)=>setDraft(d=>({...d, systemPrompt:v})), draft.systemPrompt||'')}>{t.name}</button>
                      ))}
                    </div>
                  </label>
                  <div className="grid gap-2 md:grid-cols-2">
                    {(selectedProvider.schema?.fields||[]).map(f => (
                      <label key={f.key} className="grid gap-1">
                        <span className="text-sm text-gray-600">{f.label}</span>
                        <input
                          className="rounded border px-2 py-1"
                          type={f.type==='password'?'password':'text'}
                          value={draft.secrets[f.key] || ''}
                          onChange={e=>setDraft(d=>({ ...d, secrets: { ...(d.secrets||{}), [f.key]: e.target.value } }))}
                        />
                        {errors.__new__?.[f.key] && <span className="text-xs text-red-600">{errors.__new__?.[f.key]}</span>}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="rounded bg-blue-600 px-3 py-1 text-white" onClick={onCreateInstance}>保存</button>
                  <button className="rounded bg-gray-300 px-3 py-1" onClick={()=>{ setCreating(false); setErrors(prev=>({ ...prev, __new__: {} })); }}>取消</button>
                </div>
              </div>
            )}

            <div className="grid gap-2">
              {instances.map(inst => (
                <div key={inst.id} className="border rounded p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{inst.name} <span className="text-xs text-gray-500">({inst.model || '未选模型'})</span></div>
                    <div className="flex gap-2">
                      <button className="text-blue-600" onClick={async()=>{ setExpanded(e=>({ ...e, [inst.id]: !e[inst.id] })); if (!instanceSecrets[inst.id]) await loadInstanceSecrets(inst.id); await refreshInstanceModels(inst.id); }}>编辑</button>
                      <button className="text-gray-600" onClick={()=>onQuickTest(inst)}>测试</button>
                      <button className="text-red-600" onClick={async()=>{ if (!confirm('删除该实例？')) return; await (window as any).YUA.ai.deleteInstance(inst.id); const list = await (window as any).YUA.ai.listInstances(inst.providerId); setInstances(list||[]); }}>删除</button>
                    </div>
                  </div>
                  {expanded[inst.id] && (
                    <div className="mt-2 grid gap-3">
                      <label className="grid gap-1">
                        <span className="text-sm text-gray-600">名称</span>
                        <input className="rounded border px-2 py-1" value={inst.name} onChange={e=>setInstances(list=>list.map(x=>x.id===inst.id?{...x, name:e.target.value}:x))} />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-sm text-gray-600">模型</span>
                        <select className="rounded border px-2 py-1" value={inst.model || ''} onChange={e=>setInstances(list=>list.map(x=>x.id===inst.id?{...x, model:e.target.value}:x))}>
                          <option value="">选择模型</option>
                          {(models[inst.providerId]||[]).map(m=>(<option key={m.id} value={m.id}>{m.label || m.id}</option>))}
                        </select>
                      </label>
                      <label className="grid gap-1">
                        <span className="text-sm text-gray-600">系统提示词</span>
                        <textarea className="rounded border px-2 py-1 min-h-[80px]" value={inst.systemPrompt || ''} onChange={e=>setInstances(list=>list.map(x=>x.id===inst.id?{...x, systemPrompt:e.target.value}:x))} />
                        <div className="flex flex-wrap gap-2 text-xs">
                          {templates.filter(t=>t.type==='system').slice(0,6).map(t=> (
                            <button key={t.id} className="px-2 py-1 border rounded hover:bg-gray-50" onClick={()=>setInstances(list=>list.map(x=>x.id===inst.id?{...x, systemPrompt: ((x.systemPrompt||'') + ((x.systemPrompt)?'\n':'') + t.content)}:x))}>{t.name}</button>
                          ))}
                        </div>
                      </label>
                      <div className="grid gap-2 md:grid-cols-2">
                        {(selectedProvider?.schema?.fields||[]).map(f => (
                          <label key={f.key} className="grid gap-1">
                            <span className="text-sm text-gray-600">{f.label}</span>
                            <input
                              className="rounded border px-2 py-1"
                              type={f.type==='password'?'password':'text'}
                              value={instanceSecrets[inst.id]?.[f.key] || ''}
                              onChange={e=>setInstanceSecrets(prev=>({ ...prev, [inst.id]: { ...(prev[inst.id]||{}), [f.key]: e.target.value } }))}
                            />
                            {errors[inst.id]?.[f.key] && <span className="text-xs text-red-600">{errors[inst.id]?.[f.key]}</span>}
                          </label>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button className="rounded bg-blue-600 px-3 py-1 text-white" onClick={()=>onSaveInstance(inst)}>保存</button>
                        <button className="rounded bg-gray-300 px-3 py-1" onClick={()=>setExpanded(e=>({ ...e, [inst.id]: false }))}>收起</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>暂无服务商</div>
        )}
      </div>
    </div>
  );
}

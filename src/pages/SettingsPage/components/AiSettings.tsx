import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import TintableSvg from '@/components/common/TintableSvg';

type ProviderRow = { id: string; label: string; configured?: boolean; schema?: { icon?: string; locales?: Record<string, { label?: string; fields?: Record<string, string> }>; fields?: Array<{ key: string; label: string; type: string; required?: boolean; options?: any[] }> } };
type Instance = { id: string; providerId: string; name: string; model?: string; systemPrompt?: string; config?: Record<string, any>; createdAt?: number };
type ModelOpt = { id: string; label?: string };
type Template = { id: string; name: string; type: 'system' | 'user'; content: string };

export default function AiSettings({ initialProviderId }: { initialProviderId?: string }) {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [models, setModels] = useState<Record<string, ModelOpt[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [instanceSecrets, setInstanceSecrets] = useState<Record<string, Record<string, string>>>({});
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});
  const [templates, setTemplates] = useState<Template[]>([]);

  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<{ name: string; model?: string; systemPrompt?: string; secrets: Record<string, string> }>({ name: '', model: '', systemPrompt: '', secrets: {} });

  const selectedProvider = useMemo(() => providers.find(p => p.id === selectedProviderId) || null, [providers, selectedProviderId]);
  const currentLang = navigator.language?.toLowerCase?.() || 'en';
  const pickLocale = (locales?: Record<string, { label?: string; fields?: Record<string, string> }>) => {
    if (!locales) return undefined;
    const exact = locales[currentLang] || locales[currentLang.replace(/-.+$/, '')];
    const fallback = locales['en'] || Object.values(locales)[0];
    return exact || fallback;
  };

  useEffect(() => {
    (async () => {
      const provs = await window.YUA.ai.getProviders();
      setProviders(provs || []);
      const defaultId = (initialProviderId && (provs || []).some((p: ProviderRow) => p.id === initialProviderId))
        ? initialProviderId
        : (provs?.[0]?.id || null);
      setSelectedProviderId(defaultId);
      const tmpl = await window.YUA.ai.listPromptTemplates().catch(() => []);
      setTemplates(tmpl || []);
    })();
  }, [initialProviderId]);

  // 如果 initialProviderId 在挂载后才到达，且当前未选择，则进行一次性选择
  useEffect(() => {
    if (!initialProviderId || !providers.length) return;
    setSelectedProviderId(prev => prev ?? (providers.some(p => p.id === initialProviderId) ? initialProviderId : prev));
  }, [initialProviderId, providers]);

  useEffect(() => {
    if (!selectedProviderId) return;
    (async () => {
      const list = await window.YUA.ai.listInstances(selectedProviderId);
      setInstances(list || []);
      try {
        const ms = await window.YUA.ai.listModels(selectedProviderId);
        if (Array.isArray(ms) && ms.length) setModels(prev => ({ ...prev, [selectedProviderId]: ms }));
      } catch { }
    })();
  }, [selectedProviderId]);

  // duplicated declarations removed

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
    } catch { }
  };

  const loadInstanceSecrets = async (instanceId: string) => {
    const s = await window.YUA.ai.getInstanceSecrets(instanceId).catch(() => ({}));
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
    const created = await window.YUA.ai.createInstance({ providerId: selectedProvider.id, name: draft.name, model: draft.model, systemPrompt: draft.systemPrompt, config: {} });
    if (created?.id) await window.YUA.ai.setInstanceSecrets(created.id, draft.secrets);
    const list = await window.YUA.ai.listInstances(selectedProvider.id);
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
    await window.YUA.ai.updateInstance(inst.id, { name: inst.name, model: inst.model, systemPrompt: inst.systemPrompt });
    await window.YUA.ai.setInstanceSecrets(inst.id, instanceSecrets[inst.id] || {});
    const list = await window.YUA.ai.listInstances(inst.providerId);
    setInstances(list || []);
  };

  const onQuickTest = async (inst: Instance) => {
    try {
      await window.YUA.ai.chat({
        providerInstanceId: inst.id,
        messages: [{ role: 'system', content: 'You are a connectivity test.' }, { role: 'user', content: 'ping' }],
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
    const tmpl = await window.YUA.ai.listPromptTemplates().catch(() => []);
    setTemplates(tmpl || []);
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

  // prompt setting filtered logic moved into component

  return (
    <div className="h-full w-full flex">
      <div className="h-full w-60 overflow-y-auto border-ring p-2 box-border" style={{ borderRightWidth: 1, borderRightStyle: 'solid' }}>
        <div className="space-y-1">
          {providers.map(p => {
            const loc = pickLocale(p.schema?.locales);
            const label = loc?.label || p.label;
            return (
            <Button
              key={p.id}
              variant={selectedProviderId === p.id ? "default" : "outline"}
              className='w-full'
              onClick={() => setSelectedProviderId(p.id)}
            >
              <div className="w-full flex items-center justify-between">
                <span className="flex items-center gap-2">
                  {p.schema?.icon && (<TintableSvg src={p.schema?.icon || ""} alt={label} className="w-4 h-4" />)}
                  <span>{label}</span>
                </span>
                <span className={`text-xs ${p.configured ? 'text-green-600' : 'text-gray-400'}`}>{p.configured ? '已配置' : '未配置'}</span>
              </div>
            </Button>
            )
          })}
        </div>
      </div>
      {/* Right: Instances */}
      <div className="h-full flex-1 px-2 overflow-y-auto">
        {selectedProvider ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold flex items-center gap-2">
                {selectedProvider.schema?.icon && (<TintableSvg src={selectedProvider.schema?.icon!} alt={selectedProvider.label} className="w-5 h-5" />)}
                <span>{(pickLocale(selectedProvider.schema?.locales)?.label) || selectedProvider.label} · 配置实例</span>
              </div>
              <Button onClick={() => { setCreating(true); setDraft({ name: '', model: '', systemPrompt: '', secrets: {} }); }}>新建实例</Button>
            </div>

            {creating && (
              <div className="border rounded p-3 space-y-2">
                <div className="grid gap-2">
                  <label className="grid gap-1">
                    <span className="text-sm text-gray-600">名称</span>
                    <Input className="rounded border px-2 py-1" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
                    {errors.__new__?.name && <span className="text-xs text-red-600">{errors.__new__?.name}</span>}
                  </label>
                  <label className="grid gap-1">
                    <span className="text-sm text-gray-600">模型</span>
                    <Select value={draft.model || ''} onValueChange={(val) => setDraft(d => ({ ...d, model: val }))}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="选择模型" />
                      </SelectTrigger>
                      <SelectContent>
                        {(models[selectedProvider.id] || []).map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.label || m.id}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-sm text-gray-600">系统提示词</span>
                    <textarea className="rounded border px-2 py-1 min-h-[80px]" value={draft.systemPrompt || ''} onChange={e => setDraft(d => ({ ...d, systemPrompt: e.target.value }))} />
                    <div className="flex flex-wrap gap-2 text-xs">
                      {templates.filter(t => t.type === 'system').slice(0, 6).map(t => (
                        <Button key={t.id} className="px-2 py-1 border rounded hover:bg-gray-50" onClick={() => insertTemplateInto(t, (v) => setDraft(d => ({ ...d, systemPrompt: v })), draft.systemPrompt || '')}>{t.name}</Button>
                      ))}
                    </div>
                  </label>
                  <div className="grid gap-2 md:grid-cols-2">
                    {(selectedProvider.schema?.fields || []).map(f => {
                      const loc = pickLocale(selectedProvider.schema?.locales);
                      const label = (loc?.fields?.[f.key]) || f.label;
                      return (
                      <label key={f.key} className="grid gap-1">
                        <span className="text-sm text-gray-600">{label}</span>
                        <Input
                          className="rounded border px-2 py-1"
                          type={f.type === 'password' ? 'password' : 'text'}
                          value={draft.secrets[f.key] || ''}
                          onChange={e => setDraft(d => ({ ...d, secrets: { ...(d.secrets || {}), [f.key]: e.target.value } }))}
                        />
                        {errors.__new__?.[f.key] && <span className="text-xs text-red-600">{errors.__new__?.[f.key]}</span>}
                      </label>
                      )
                    })}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={"outline"}
                    onClick={() => { setCreating(false); setErrors(prev => ({ ...prev, __new__: {} })); }}>取消</Button>
                  <Button
                    variant={"default"}
                    onClick={onCreateInstance}>保存</Button>
                </div>
              </div>
            )}

            <div className="grid gap-2">
              {instances.map(inst => (
                <div key={inst.id} className="border rounded p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{inst.name} <span className="text-xs text-gray-500">({inst.model || '未选模型'})</span></div>
                    <div className="flex gap-2">
                      <button className="text-blue-600" onClick={async () => { setExpanded(e => ({ ...e, [inst.id]: !e[inst.id] })); if (!instanceSecrets[inst.id]) await loadInstanceSecrets(inst.id); await refreshInstanceModels(inst.id); }}>编辑</button>
                      <button className="text-gray-600" onClick={() => onQuickTest(inst)}>测试</button>
                      <button className="text-red-600" onClick={async () => { if (!confirm('删除该实例？')) return; await window.YUA.ai.deleteInstance(inst.id); const list = await window.YUA.ai.listInstances(inst.providerId); setInstances(list || []); }}>删除</button>
                    </div>
                  </div>
                  {expanded[inst.id] && (
                    <div className="mt-2 grid gap-3">
                      <label className="grid gap-1">
                        <span className="text-sm text-gray-600">名称</span>
                        <Input className="rounded border px-2 py-1" value={inst.name} onChange={e => setInstances(list => list.map(x => x.id === inst.id ? { ...x, name: e.target.value } : x))} />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-sm text-gray-600">模型</span>
                        <Select value={inst.model || ''} onValueChange={(val) => setInstances(list => list.map(x => x.id === inst.id ? { ...x, model: val } : x))}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="选择模型" />
                          </SelectTrigger>
                          <SelectContent>
                            {(models[inst.providerId] || []).map(m => (
                              <SelectItem key={m.id} value={m.id}>{m.label || m.id}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </label>
                      <label className="grid gap-1">
                        <span className="text-sm text-gray-600">系统提示词</span>
                        <textarea className="rounded border px-2 py-1 min-h-[80px]" value={inst.systemPrompt || ''} onChange={e => setInstances(list => list.map(x => x.id === inst.id ? { ...x, systemPrompt: e.target.value } : x))} />
                        <div className="flex flex-wrap gap-2 text-xs">
                          {templates.filter(t => t.type === 'system').slice(0, 6).map(t => (
                            <Button key={t.id} className="px-2 py-1 border rounded hover:bg-gray-50" onClick={() => setInstances(list => list.map(x => x.id === inst.id ? { ...x, systemPrompt: ((x.systemPrompt || '') + ((x.systemPrompt) ? '\n' : '') + t.content) } : x))}>{t.name}</Button>
                          ))}
                        </div>
                      </label>
                      <div className="grid gap-2 md:grid-cols-2">
                        {(selectedProvider?.schema?.fields || []).map(f => {
                          const loc = pickLocale(selectedProvider.schema?.locales);
                          const label = (loc?.fields?.[f.key]) || f.label;
                          return (
                          <label key={f.key} className="grid gap-1">
                            <span className="text-sm text-gray-600">{label}</span>
                            <Input
                              type={f.type === 'password' ? 'password' : 'text'}
                              value={instanceSecrets[inst.id]?.[f.key] || ''}
                              onChange={e => setInstanceSecrets(prev => ({ ...prev, [inst.id]: { ...(prev[inst.id] || {}), [f.key]: e.target.value } }))}
                            />
                            {errors[inst.id]?.[f.key] && <span className="text-xs text-red-600">{errors[inst.id]?.[f.key]}</span>}
                          </label>
                          )
                        })}
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={() => onSaveInstance(inst)}>保存</Button>
                        <Button variant="outline" onClick={() => setExpanded(e => ({ ...e, [inst.id]: false }))}>收起</Button>
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

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import TintableSvg from '@/components/common/TintableSvg';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import InstanceFormDialog, { InstanceFormValues } from './InstanceFormDialog';
import { TbBox } from 'react-icons/tb';

type ProviderRow = {
  id: string;
  label: string;
  configured?: boolean;
  schema?: {
    icon?: string;
    locales?: Record<string, { label?: string; fields?: Record<string, string> }>;
    fields?: Array<{ key: string; label: string; type: string; required?: boolean; options?: any[] }>;
  };
};
type Instance = { id: string; providerId: string; name: string; model?: string; systemPrompt?: string; config?: Record<string, any>; createdAt?: number };
type ModelOpt = { id: string; label?: string; type?: string; context?: number; pricing?: any; tags?: string[]; description?: string };
type Template = { id: string; name: string; type: 'system' | 'user'; content: string };

export default function AiSettings({ initialProviderId }: { initialProviderId?: string }) {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [models, setModels] = useState<Record<string, ModelOpt[]>>({});
  const [instanceSecrets, setInstanceSecrets] = useState<Record<string, Record<string, string>>>({});
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});
  const [templates, setTemplates] = useState<Template[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editing, setEditing] = useState<Instance | null>(null);

  const selectedProvider = useMemo(() => providers.find((p) => p.id === selectedProviderId) || null, [providers, selectedProviderId]);
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
      const defaultId = initialProviderId && (provs || []).some((p: ProviderRow) => p.id === initialProviderId) ? initialProviderId : provs?.[0]?.id || null;
      setSelectedProviderId(defaultId);
      const tmpl = await window.YUA.ai.listPromptTemplates().catch(() => []);
      setTemplates(tmpl || []);
    })();
  }, [initialProviderId]);

  // 如果 initialProviderId 在挂载后才到达，且当前未选择，则进行一次性选择
  useEffect(() => {
    if (!initialProviderId || !providers.length) return;
    setSelectedProviderId((prev) => prev ?? (providers.some((p) => p.id === initialProviderId) ? initialProviderId : prev));
  }, [initialProviderId, providers]);

  useEffect(() => {
    if (!selectedProviderId) return;
    (async () => {
      const list = await window.YUA.ai.listInstances(selectedProviderId);
      setInstances(list || []);
      try {
        const ms = await window.YUA.ai.listModels(selectedProviderId);
        if (Array.isArray(ms) && ms.length) setModels((prev) => ({ ...prev, [selectedProviderId]: ms }));
      } catch { }
    })();
  }, [selectedProviderId]);

  // duplicated declarations removed

  const schemaForProvider = (p?: ProviderRow | null) => {
    const shape: Record<string, z.ZodTypeAny> = {};
    (p?.schema?.fields || []).forEach((f) => {
      const base = z.string().trim();
      shape[f.key] = f.required ? base.min(1, '必填') : base.optional().transform((v) => v ?? '');
    });
    return z.object(shape);
  };

  const refreshInstanceModels = async (instanceId: string) => {
    const inst = instances.find((i) => i.id === instanceId);
    if (!inst) return;
    try {
      const ms = await (window as any).YUA.ai.listModels(inst.providerId, inst.id);
      if (Array.isArray(ms) && ms.length) setModels((prev) => ({ ...prev, [inst.providerId]: ms }));
    } catch { }
  };

  const loadInstanceSecrets = async (instanceId: string) => {
    const s = await window.YUA.ai.getInstanceSecrets(instanceId).catch(() => ({}));
    setInstanceSecrets((prev) => ({ ...prev, [instanceId]: s || {} }));
  };

  const onCreateInstance = async (vals: InstanceFormValues) => {
    if (!selectedProvider) return;
    const nameOk = (vals.name || '').trim().length > 0;
    const schema = schemaForProvider(selectedProvider);
    const parsed = schema.safeParse(vals.secrets);
    if (!nameOk || !parsed.success) {
      const errs: Record<string, string> = {};
      if (!nameOk) errs['name'] = '名称必填';
      if (!parsed.success)
        parsed.error.issues.forEach((i) => {
          const k = i.path[0] as string;
          errs[k] = i.message;
        });
      setErrors((prev) => ({ ...prev, __new__: errs }));
      return;
    }
    setErrors((prev) => ({ ...prev, __new__: {} }));
    const created = await window.YUA.ai.createInstance({ providerId: selectedProvider.id, name: vals.name, model: vals.model, systemPrompt: vals.systemPrompt, config: {} });
    if (created?.id) await window.YUA.ai.setInstanceSecrets(created.id, vals.secrets);
    const list = await window.YUA.ai.listInstances(selectedProvider.id);
    setInstances(list || []);
    setModalOpen(false);
  };

  const onSaveInstance = async (inst: Instance, vals: InstanceFormValues) => {
    const schema = schemaForProvider(selectedProvider);
    const parsed = schema.safeParse(vals.secrets || {});
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        const k = i.path[0] as string;
        errs[k] = i.message;
      });
      setErrors((prev) => ({ ...prev, [inst.id]: errs }));
      return;
    }
    setErrors((prev) => ({ ...prev, [inst.id]: {} }));
    await window.YUA.ai.updateInstance(inst.id, { name: vals.name, model: vals.model, systemPrompt: vals.systemPrompt });
    await window.YUA.ai.setInstanceSecrets(inst.id, vals.secrets || {});
    const list = await window.YUA.ai.listInstances(inst.providerId);
    setInstances(list || []);
    setModalOpen(false);
  };

  const onQuickTest = async (inst: Instance) => {
    try {
      await window.YUA.ai.chat({
        providerInstanceId: inst.id,
        messages: [
          { role: 'system', content: 'You are a connectivity test.' },
          { role: 'user', content: 'ping' }
        ],
        stream: false
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
    // When using dialog, template insertion is handled inside the form dialog; keep this as a fallback utility.
    try {
      await navigator.clipboard.writeText(t.content);
      alert('没有可插入的编辑目标，内容已复制到剪贴板');
    } catch {
      alert('没有可插入的编辑目标，且无法复制到剪贴板');
    }
  };

  // prompt setting filtered logic moved into component

  const modalModels: ModelOpt[] = modalMode === 'edit' ? (editing ? models[editing.providerId] || [] : []) : selectedProvider ? models[selectedProvider.id] || [] : [];

  const modalInitialValues: InstanceFormValues =
    modalMode === 'create'
      ? { name: '', model: '', systemPrompt: '', secrets: {} }
      : {
        name: editing?.name || '',
        model: editing?.model || '',
        systemPrompt: editing?.systemPrompt || '',
        secrets: editing ? instanceSecrets[editing.id] || {} : {}
      };

  const modalErrors: Record<string, string> = modalMode === 'create' ? errors.__new__ || {} : editing ? errors[editing.id] || {} : {};

  return (
    <>
      <div className="h-full w-full flex">
        <div className="h-full w-60 overflow-y-auto border-ring p-2 box-border" style={{ borderRightWidth: 1, borderRightStyle: 'solid' }}>
          <div className="space-y-1">
            {providers.map((p) => {
              const loc = pickLocale(p.schema?.locales);
              const label = loc?.label || p.label;
              return (
                <Button key={p.id} variant={selectedProviderId === p.id ? 'default' : 'outline'} className="w-full" onClick={() => setSelectedProviderId(p.id)}>
                  <div className="w-full flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      {p.schema?.icon && <TintableSvg src={p.schema?.icon || ''} alt={label} className="w-4 h-4" />}
                      <span>{label}</span>
                    </span>
                    <span className={`text-xs ${p.configured ? 'text-green-600' : 'text-gray-400'}`}>{p.configured ? '已配置' : '未配置'}</span>
                  </div>
                </Button>
              );
            })}
          </div>
        </div>
        {/* Right: Instances */}
        <div className="h-full flex-1 px-2 overflow-y-auto">
          {selectedProvider ? (
            <div className="space-y-3">
              {instances.length > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <div></div>
                    <Button
                      size="sm"
                      onClick={() => {
                        setModalMode('create');
                        setEditing(null);
                        setModalOpen(true);
                        setErrors((prev) => ({ ...prev, __new__: {} }));
                      }}
                    >
                      新建实例
                    </Button>
                  </div>
                  <div className="grid gap-2">
                    {instances.map((inst) => (
                      <div key={inst.id} className="border rounded p-3">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">
                            {inst.name} <span className="text-xs text-gray-500">({inst.model || '未选模型'})</span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              className="text-blue-600"
                              onClick={async () => {
                                if (!instanceSecrets[inst.id]) await loadInstanceSecrets(inst.id);
                                await refreshInstanceModels(inst.id);
                                setEditing(inst);
                                setModalMode('edit');
                                setModalOpen(true);
                              }}
                            >
                              编辑
                            </button>
                            <button className="text-gray-600" onClick={() => onQuickTest(inst)}>
                              测试
                            </button>
                            <button
                              className="text-red-600"
                              onClick={async () => {
                                if (!confirm('删除该实例？')) return;
                                await window.YUA.ai.deleteInstance(inst.id);
                                const list = await window.YUA.ai.listInstances(inst.providerId);
                                setInstances(list || []);
                              }}
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <TbBox />
                    </EmptyMedia>
                    <EmptyTitle>没有配置</EmptyTitle>
                    <EmptyDescription>未找到对话设置，点击新建实例来创建</EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button
                      size="sm"
                      onClick={() => {
                        setModalMode('create');
                        setEditing(null);
                        setModalOpen(true);
                        setErrors((prev) => ({ ...prev, __new__: {} }));
                      }}
                    >
                      新建实例
                    </Button>
                  </EmptyContent>
                </Empty>
              )}
            </div>
          ) : (
            <div>暂无服务商</div>
          )}
        </div>
      </div>

      {/* Shared Create/Edit Modal */}
      {selectedProvider && (
        <InstanceFormDialog
          open={modalOpen}
          mode={modalMode}
          title={modalMode === 'create' ? '新建实例' : `编辑实例 · ${editing?.name || ''}`}
          provider={selectedProvider!}
          models={modalModels}
          templates={templates}
          initialValues={modalInitialValues}
          errors={modalErrors}
          onClose={() => setModalOpen(false)}
          onSubmit={(vals) => {
            if (modalMode === 'create') return onCreateInstance(vals);
            if (modalMode === 'edit' && editing) return onSaveInstance(editing, vals);
          }}
        />
      )}
    </>
  );
}

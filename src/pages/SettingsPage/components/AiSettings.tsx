import { useEffect, useMemo, useState } from 'react';
import { TbBox, TbKey, TbSettings } from 'react-icons/tb';
import { z } from 'zod';

import TintableSvg from '@/components/common/TintableSvg';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { resolveProviderIdentity } from '@/lib/ai-provider-identity';

import PresetFormDialog, { PresetFormValues } from './PresetFormDialog';
import ProviderApiKeyManager from './ProviderApiKeyManager';

type ProviderRow = {
  id: string;
  aliases?: string[];
  label: string;
  configured?: boolean;
  schema?: {
    icon?: string;
    locales?: Record<string, { label?: string; fields?: Record<string, string> }>;
    fields?: Array<{ key: string; label: string; type: string; required?: boolean; options?: any[] }>;
  };
};
type Preset = { id: string; providerId: string; name: string; model?: string; systemPrompt?: string; overrides?: Record<string, any>; enabledTools?: string[]; createdAt?: number };
type ModelOpt = { id: string; label?: string; type?: string; context?: number; pricing?: any; tags?: string[]; description?: string; free?: boolean };
// Templates are now loaded within PresetFormDialog

export default function AiSettings({ initialProviderId }: { initialProviderId?: string }): JSX.Element {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [models, setModels] = useState<Record<string, ModelOpt[]>>({});
  const [presetSecrets, setPresetSecrets] = useState<Record<string, Record<string, string>>>({});
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editing, setEditing] = useState<Preset | null>(null);

  // API Key Manager state
  const [apiKeyManagerOpen, setApiKeyManagerOpen] = useState(false);
  const [selectedFieldKey, setSelectedFieldKey] = useState<string | null>(null);

  const selectedProvider = useMemo(() => resolveProviderIdentity(providers, selectedProviderId || undefined) || null, [providers, selectedProviderId]);
  const currentLang = navigator.language?.toLowerCase?.() || 'en';
  const pickLocale = (locales?: Record<string, { label?: string; fields?: Record<string, string> }>): { label?: string; fields?: Record<string, string> } | undefined => {
    if (!locales) return undefined;
    const exact = locales[currentLang] || locales[currentLang.replace(/-.+$/, '')];
    const fallback = locales['en'] || Object.values(locales)[0];
    return exact || fallback;
  };

  useEffect(() => {
    (async () => {
      const provs = await window.YUA.ai.getProviders();
      setProviders(provs || []);
      const defaultProvider = (initialProviderId ? resolveProviderIdentity(provs || [], initialProviderId) : undefined) || provs?.[0] || null;
      setSelectedProviderId(defaultProvider?.id || null);
    })();
  }, [initialProviderId]);

  // 如果 initialProviderId 在挂载后才到达，首个 effect 已根据依赖更新，这里可省略二次设置以避免不必要的状态同步告警

  useEffect(() => {
    if (!selectedProviderId) return;
    (async () => {
      const list = await window.YUA.ai.listPresets(selectedProviderId);
      setPresets(list || []);
      try {
        const ms = await window.YUA.ai.listModels(selectedProviderId);
        if (Array.isArray(ms) && ms.length) setModels((prev) => ({ ...prev, [selectedProviderId]: ms }));
      } catch {
        /* ignore */
      }
    })();
  }, [selectedProviderId]);

  // duplicated declarations removed

  const isFree = (m?: ModelOpt | null): boolean => {
    if (!m) return false;
    return (m as any)?.free === true || (Array.isArray(m.tags) && m.tags.includes('free'));
  };

  const typeDisplay = (t?: string): string => {
    switch ((t || '').toLowerCase()) {
      case 'chat':
        return '对话';
      case 'vision':
        return '视觉';
      case 'image':
        return '图像';
      case 'video':
        return '视频';
      case 'audio':
        return '音频';
      case 'embedding':
        return '向量';
      case 'realtime':
        return '实时';
      case 'tool':
      case 'tooling':
        return '工具';
      default:
        return t || '';
    }
  };

  const typeColorClasses = (t?: string): string => {
    switch ((t || '').toLowerCase()) {
      case 'chat':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'vision':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'image':
        return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'video':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'audio':
        return 'bg-teal-100 text-teal-700 border-teal-200';
      case 'embedding':
        return 'bg-cyan-100 text-cyan-700 border-cyan-200';
      case 'realtime':
        return 'bg-violet-100 text-violet-700 border-violet-200';
      case 'tool':
      case 'tooling':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const renderContextPill = (m?: ModelOpt | null): JSX.Element | null => {
    if (!m?.context) return null;
    const k = Math.round((m.context as number) / 1000);
    if (!k) return null;
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 border border-sky-200">{k}k ctx</span>;
  };

  const schemaForProvider = (p?: ProviderRow | null): z.ZodObject<Record<string, z.ZodTypeAny>> => {
    const shape: Record<string, z.ZodTypeAny> = {};
    (p?.schema?.fields || []).forEach((f) => {
      const base = z.string().trim();
      shape[f.key] = f.required ? base.min(1, '必填') : base.optional().transform((v) => v ?? '');
    });
    return z.object(shape);
  };

  const refreshPresetModels = async (presetId: string): Promise<void> => {
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) return;
    try {
      const ms = await window.YUA.ai.listModels(preset.providerId, preset.id);
      if (Array.isArray(ms) && ms.length) setModels((prev) => ({ ...prev, [preset.providerId]: ms }));
    } catch {
      /* ignore */
    }
  };

  const loadPresetSecrets = async (presetId: string): Promise<void> => {
    const secrets = await window.YUA.ai.getPresetSecrets(presetId).catch(() => ({}));
    setPresetSecrets((prev) => ({ ...prev, [presetId]: secrets || {} }));
  };

  const onCreatePreset = async (vals: PresetFormValues): Promise<void> => {
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
    const created = await window.YUA.ai.createPreset({
      providerId: selectedProvider.id,
      name: vals.name,
      model: vals.model,
      systemPrompt: vals.systemPrompt,
      overrides: {},
      enabledTools: vals.enabledTools
    });
    if (created?.id) await window.YUA.ai.setPresetSecrets(created.id, vals.secrets);
    const list = await window.YUA.ai.listPresets(selectedProvider.id);
    setPresets(list || []);
    setModalOpen(false);
  };

  const onSavePreset = async (preset: Preset, vals: PresetFormValues): Promise<void> => {
    const schema = schemaForProvider(selectedProvider);
    const parsed = schema.safeParse(vals.secrets || {});
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        const k = i.path[0] as string;
        errs[k] = i.message;
      });
      setErrors((prev) => ({ ...prev, [preset.id]: errs }));
      return;
    }
    setErrors((prev) => ({ ...prev, [preset.id]: {} }));
    await window.YUA.ai.updatePreset(preset.id, {
      name: vals.name,
      model: vals.model,
      systemPrompt: vals.systemPrompt,
      enabledTools: vals.enabledTools
    });
    await window.YUA.ai.setPresetSecrets(preset.id, vals.secrets || {});
    const list = await window.YUA.ai.listPresets(preset.providerId);
    setPresets(list || []);
    setModalOpen(false);
  };

  const onQuickTest = async (preset: Preset): Promise<void> => {
    try {
      await window.YUA.ai.chat({
        agentId: 'chat',
        providerPresetId: preset.id,
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

  // prompt setting filtered logic moved into component

  const modalModels: ModelOpt[] = (modalMode === 'edit' ? (editing ? models[editing.providerId] || [] : []) : selectedProvider ? models[selectedProvider.id] || [] : []).filter((m) => {
    return m.type === 'chat';
  });

  const modalInitialValues: PresetFormValues =
    modalMode === 'create'
      ? { name: '', model: '', systemPrompt: '', secrets: {}, enabledTools: [] }
      : {
          name: editing?.name || '',
          model: editing?.model || '',
          systemPrompt: editing?.systemPrompt || '',
          secrets: editing ? presetSecrets[editing.id] || {} : {},
          enabledTools: editing?.enabledTools || []
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
        {/* Right: Presets */}
        <div className="h-full flex-1 px-2 overflow-y-auto">
          {selectedProvider ? (
            <div className="space-y-3">
              {/* API Key Management Section */}
              {(selectedProvider.schema?.fields || []).filter((f) => f.type === 'password').length > 0 && (
                <div className="border rounded-lg p-3 bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <TbKey className="w-4 h-4" />
                      <span className="font-medium text-sm">API Keys 管理</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {(selectedProvider.schema?.fields || [])
                      .filter((f) => f.type === 'password')
                      .map((f) => {
                        const locale = pickLocale(selectedProvider.schema?.locales);
                        const label = locale?.fields?.[f.key] || f.label;
                        return (
                          <div key={f.key} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{label}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => {
                                setSelectedFieldKey(f.key);
                                setApiKeyManagerOpen(true);
                              }}
                            >
                              <TbSettings className="w-3 h-3 mr-1" />
                              管理
                            </Button>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {presets.length > 0 ? (
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
                      新建预设
                    </Button>
                  </div>
                  <div className="grid gap-2">
                    {presets.map((preset) => (
                      <div key={preset.id} className="border rounded p-3">
                        <div className="flex items-center justify-between">
                          <div className="font-medium flex items-center gap-2">
                            <span>{preset.name}</span>
                            <span className="text-xs text-gray-500">({preset.model || '未选模型'})</span>
                            {(() => {
                              const ms = models[preset.providerId] || [];
                              const m = ms.find((x) => x.id === (preset.model || ''));
                              if (!m) return null;
                              return (
                                <span className="flex items-center gap-1">
                                  {isFree(m) && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 border border-green-200">免费</span>}
                                  {m.type && <span className={`text-[10px] px-1.5 py-0.5 rounded border ${typeColorClasses(m.type)}`}>{typeDisplay(m.type)}</span>}
                                  {renderContextPill(m)}
                                </span>
                              );
                            })()}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                if (!presetSecrets[preset.id]) await loadPresetSecrets(preset.id);
                                await refreshPresetModels(preset.id);
                                setEditing(preset);
                                setModalMode('edit');
                                setModalOpen(true);
                              }}
                            >
                              编辑
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => onQuickTest(preset)}>
                              测试
                            </Button>
                            <Button
                              variant={'destructive'}
                              size="sm"
                              onClick={async () => {
                                if (!confirm('删除该预设？')) return;
                                await window.YUA.ai.deletePreset(preset.id);
                                const list = await window.YUA.ai.listPresets(preset.providerId);
                                setPresets(list || []);
                              }}
                            >
                              删除
                            </Button>
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
                    <EmptyTitle>没有预设</EmptyTitle>
                    <EmptyDescription>未找到 AI 预设，点击新建预设来创建</EmptyDescription>
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
                      新建预设
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
        <PresetFormDialog
          open={modalOpen}
          mode={modalMode}
          title={modalMode === 'create' ? '新建预设' : `编辑预设 · ${editing?.name || ''}`}
          provider={selectedProvider!}
          models={modalModels}
          initialValues={modalInitialValues}
          errors={modalErrors}
          onClose={() => setModalOpen(false)}
          onSubmit={(vals) => {
            if (modalMode === 'create') return onCreatePreset(vals);
            if (modalMode === 'edit' && editing) return onSavePreset(editing, vals);
          }}
        />
      )}

      {/* Provider API Key Manager */}
      {selectedProvider && selectedFieldKey && (
        <ProviderApiKeyManager
          open={apiKeyManagerOpen}
          providerId={selectedProvider.id}
          providerLabel={selectedProvider.label}
          fieldKey={selectedFieldKey}
          fieldLabel={pickLocale(selectedProvider.schema?.locales)?.fields?.[selectedFieldKey] || selectedProvider.schema?.fields?.find((f) => f.key === selectedFieldKey)?.label || selectedFieldKey}
          onClose={() => setApiKeyManagerOpen(false)}
        />
      )}
    </>
  );
}

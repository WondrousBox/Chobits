import { useEffect, useMemo, useState } from 'react';
import { TbChevronDown, TbChevronRight, TbPlus } from 'react-icons/tb';
import { z } from 'zod';

import TintableSvg from '@/components/common/TintableSvg';
import { Button } from '@/components/ui/button';
import { resolveProviderIdentity } from '@/lib/ai-provider-identity';
import { selectChatDefaultsForProvider } from '@/lib/chat-selection-defaults';

import PresetFormDialog, { PresetFormValues } from './PresetFormDialog';

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
type Preset = { id: string; providerId: string; name: string; systemPrompt?: string; overrides?: Record<string, any>; enabledTools?: string[]; createdAt?: number };
type ModelOpt = { id: string; label?: string; type?: string; context?: number; pricing?: any; tags?: string[]; description?: string; free?: boolean };
// Templates are now loaded within PresetFormDialog

const createPresetSuffix = (): string => {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(2);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(36).padStart(2, '0'))
      .join('')
      .slice(0, 4)
      .toUpperCase();
  }
  return Math.random().toString(36).slice(2, 6).toUpperCase();
};

export default function AiSettings({ initialProviderId, initialPresetId, focusRevision = 0 }: { initialProviderId?: string; initialPresetId?: string; focusRevision?: number }): JSX.Element {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [models, setModels] = useState<Record<string, ModelOpt[]>>({});
  const [presetSecrets, setPresetSecrets] = useState<Record<string, Record<string, string>>>({});
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});
  const [expandedPresetId, setExpandedPresetId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createFormKey, setCreateFormKey] = useState(0);
  const [providerFocusRevision, setProviderFocusRevision] = useState(0);

  const selectedProvider = useMemo(() => resolveProviderIdentity(providers, selectedProviderId || undefined) || null, [providers, selectedProviderId]);
  const currentLang = navigator.language?.toLowerCase?.() || 'en';
  const pickLocale = (locales?: Record<string, { label?: string; fields?: Record<string, string> }>): { label?: string; fields?: Record<string, string> } | undefined => {
    if (!locales) return undefined;
    const exact = locales[currentLang] || locales[currentLang.replace(/-.+$/, '')];
    const fallback = locales['en'] || Object.values(locales)[0];
    return exact || fallback;
  };

  const refreshProviders = async (preferredProviderId?: string | null): Promise<void> => {
    const provs = await window.YUA.ai.getProviders();
    setProviders(provs || []);

    if (preferredProviderId !== undefined) {
      setExpandedPresetId(null);
      setShowCreateForm(false);
      setErrors((prev) => ({ ...prev, __new__: {} }));
      const preferred = (preferredProviderId ? resolveProviderIdentity(provs || [], preferredProviderId) : undefined) || provs?.[0] || null;
      setSelectedProviderId(preferred?.id || null);
      setProviderFocusRevision((prev) => prev + 1);
    }
  };

  useEffect(() => {
    (async () => {
      await refreshProviders(initialProviderId ?? null);
    })();
  }, [focusRevision, initialProviderId]);

  // 如果 initialProviderId 在挂载后才到达，首个 effect 已根据依赖更新，这里可省略二次设置以避免不必要的状态同步告警

  useEffect(() => {
    if (!selectedProviderId) return;
    (async () => {
      const list = await window.YUA.ai.listPresets(selectedProviderId);
      setPresets(list || []);
      const targetPreset = initialPresetId ? (list || []).find((preset) => preset.id === initialPresetId) : undefined;
      if (targetPreset) {
        setShowCreateForm(false);
        setExpandedPresetId(targetPreset.id);
        await loadPresetSecrets(targetPreset.id);
      }
      try {
        const ms = await window.YUA.ai.listModels(selectedProviderId);
        if (Array.isArray(ms) && ms.length) setModels((prev) => ({ ...prev, [selectedProviderId]: ms }));
      } catch {
        /* ignore */
      }
    })();
  }, [initialPresetId, providerFocusRevision, selectedProviderId]);

  // duplicated declarations removed

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

  const buildPresetName = (provider: ProviderRow): string => {
    const localeLabel = pickLocale(provider.schema?.locales)?.label;
    const base = (localeLabel || provider.label || provider.id).trim() || provider.id;
    return `${base}-${createPresetSuffix()}`;
  };

  const emptyPresetValues = (): PresetFormValues => ({
    secrets: {}
  });

  const presetFormValues = (preset: Preset): PresetFormValues => ({
    secrets: presetSecrets[preset.id] || {}
  });

  const openCreatePresetForm = (): void => {
    setExpandedPresetId(null);
    setShowCreateForm(true);
    setCreateFormKey((prev) => prev + 1);
    setErrors((prev) => ({ ...prev, __new__: {} }));
  };

  const onCreatePreset = async (vals: PresetFormValues): Promise<void> => {
    if (!selectedProvider) return;
    const schema = schemaForProvider(selectedProvider);
    const parsed = schema.safeParse(vals.secrets);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
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
      name: buildPresetName(selectedProvider),
      overrides: {}
    });
    if (created?.id) {
      await window.YUA.ai.setPresetSecrets(created.id, vals.secrets);
      await selectChatDefaultsForProvider({ providerId: selectedProvider.id, presetId: created.id, provider: selectedProvider });
    }
    const list = await window.YUA.ai.listPresets(selectedProvider.id);
    setPresets(list || []);
    await refreshProviders(selectedProvider.id);
    setShowCreateForm(false);
    setExpandedPresetId(null);
    setErrors((prev) => ({ ...prev, __new__: {} }));
  };

  const onSavePreset = async (preset: Preset, vals: PresetFormValues): Promise<void> => {
    if (!selectedProvider) return;
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
    await window.YUA.ai.setPresetSecrets(preset.id, vals.secrets || {});
    await selectChatDefaultsForProvider({ providerId: preset.providerId, presetId: preset.id, provider: selectedProvider });
    const list = await window.YUA.ai.listPresets(preset.providerId);
    setPresets(list || []);
    await refreshProviders(preset.providerId);
    setExpandedPresetId(null);
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

  const onDeletePreset = async (preset: Preset): Promise<void> => {
    if (!confirm('删除该预设？')) return;
    await window.YUA.ai.deletePreset(preset.id);
    const list = await window.YUA.ai.listPresets(preset.providerId);
    setPresets(list || []);
    await refreshProviders(preset.providerId);
    setExpandedPresetId((prev) => (prev === preset.id ? null : prev));
  };

  // prompt setting filtered logic moved into component

  const providerModels: ModelOpt[] = selectedProvider ? models[selectedProvider.id] || [] : [];
  const showInlineCreateForm = !!selectedProvider && (showCreateForm || presets.length === 0);

  return (
    <>
      <div className="h-full w-full flex">
        <div className="h-full w-60 overflow-y-auto border-ring p-2 box-border" style={{ borderRightWidth: 1, borderRightStyle: 'solid' }}>
          <div className="space-y-1">
            {providers.map((p) => {
              const loc = pickLocale(p.schema?.locales);
              const label = loc?.label || p.label;
              return (
                <Button
                  key={p.id}
                  variant={selectedProviderId === p.id ? 'default' : 'outline'}
                  className="w-full"
                  onClick={() => {
                    setExpandedPresetId(null);
                    setShowCreateForm(false);
                    setErrors((prev) => ({ ...prev, __new__: {} }));
                    setSelectedProviderId(p.id);
                  }}
                >
                  <div className="w-full flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      {p.schema?.icon && <TintableSvg src={p.schema?.icon || ''} alt={label} className="w-4 h-4" />}
                      <span>{label}</span>
                    </span>
                    <span className={`text-xs ${p.configured ? 'text-green-600' : 'text-gray-400'}`}>{p.configured ? '已配置' : ''}</span>
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
              {presets.length > 0 && (
                <div className="grid gap-2">
                  {presets.map((preset) => {
                    const isExpanded = expandedPresetId === preset.id;

                    return (
                      <div key={preset.id} className="rounded-xl border bg-background">
                        <div className="flex items-start justify-between gap-3 p-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{preset.name}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                if (isExpanded) {
                                  setExpandedPresetId(null);
                                  return;
                                }
                                if (!presetSecrets[preset.id]) await loadPresetSecrets(preset.id);
                                await refreshPresetModels(preset.id);
                                setShowCreateForm(false);
                                setExpandedPresetId(preset.id);
                              }}
                            >
                              {isExpanded ? <TbChevronDown className="w-4 h-4" /> : <TbChevronRight className="w-4 h-4" />}
                              {isExpanded ? '收起' : '编辑'}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => onQuickTest(preset)}>
                              测试
                            </Button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="border-t p-3">
                            <PresetFormDialog
                              title={`编辑预设 · ${preset.name}`}
                              provider={selectedProvider}
                              models={models[preset.providerId] || []}
                              initialValues={presetFormValues(preset)}
                              errors={errors[preset.id] || {}}
                              submitLabel="保存预设"
                              cancelLabel="收起"
                              onCancel={() => setExpandedPresetId(null)}
                              onDelete={() => void onDeletePreset(preset)}
                              onSubmit={(vals) => onSavePreset(preset, vals)}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {presets.length > 0 && !showCreateForm && (
                <Button size="sm" variant="outline" className="w-fit" onClick={openCreatePresetForm}>
                  <TbPlus className="w-4 h-4" />
                  新增预设
                </Button>
              )}

              {showInlineCreateForm && (
                <PresetFormDialog
                  key={`create-${selectedProvider.id}-${createFormKey}`}
                  title="新增预设"
                  provider={selectedProvider}
                  models={providerModels}
                  initialValues={emptyPresetValues()}
                  errors={errors.__new__ || {}}
                  submitLabel="保存预设"
                  cancelLabel="取消新增"
                  onCancel={
                    presets.length > 0
                      ? () => {
                        setShowCreateForm(false);
                        setErrors((prev) => ({ ...prev, __new__: {} }));
                      }
                      : undefined
                  }
                  onSubmit={onCreatePreset}
                />
              )}
            </div>
          ) : (
            <div>暂无服务商</div>
          )}
        </div>
      </div>
    </>
  );
}

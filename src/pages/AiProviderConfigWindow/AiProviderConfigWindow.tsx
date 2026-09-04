import { MASKED_SECRET_VALUE, splitSecretFormValues } from '@packages/ai/secret-masking';
import { debounce } from 'lodash-es';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import DraggableTitle from '@/components/common/DraggableTitle';
import TintableSvg from '@/components/common/TintableSvg';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { resolveProviderIdentity } from '@/lib/ai-provider-identity';
import { selectChatDefaultsForProvider } from '@/lib/chat-selection-defaults';

type ProviderRow = {
  id: string;
  aliases?: string[];
  label: string;
  defaultConfig?: Record<string, string>;
  schema?: {
    icon?: string;
    locales?: Record<string, { label?: string; fields?: Record<string, string> }>;
    fields?: Array<{ key: string; label: string; type: 'text' | 'password' | 'textarea' | 'select'; required?: boolean; options?: Array<{ label: string; value: string }> }>;
  };
};

type FieldError = Record<string, string>;

type IncomingPayload = {
  providerId?: string;
  presetId?: string;
  fields?: string[];
};

export default function AIProviderConfigWindow(): JSX.Element {
  const [providerId, setProviderId] = useState<string>('zhipu');
  const [presetId, setPresetId] = useState<string | undefined>(undefined);
  const [limitedFields, setLimitedFields] = useState<string[]>([]);

  const [provider, setProvider] = useState<ProviderRow | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  // 已有有效值（内置默认或已保存）的 password 字段：值不进入表单，仅以掩码 placeholder 展示
  const [maskedSecretKeys, setMaskedSecretKeys] = useState<string[]>([]);
  const [errors, setErrors] = useState<FieldError>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const currentLang = navigator.language?.toLowerCase?.() || 'en';
  const pickLocale = useCallback(
    (locales?: Record<string, { label?: string; fields?: Record<string, string> }>): { label?: string; fields?: Record<string, string> } | undefined => {
      if (!locales) return undefined;
      const exact = locales[currentLang] || locales[currentLang.replace(/-.+$/, '')];
      const fallback = locales['zh-CN'] || locales.en || Object.values(locales)[0];
      return exact || fallback;
    },
    [currentLang]
  );

  // 从窗口管理器获取 payload（providerId + presetId + fields），并拉取对应作用域下的已有秘钥
  useEffect(() => {
    let mounted = true;
    const bootstrap = async (): Promise<void> => {
      try {
        const payload = (await window.chobits.window['window:payload:get']('aiProviderConfig' as any)) as IncomingPayload | undefined;
        const requestedProviderId = payload?.providerId || 'zhipu';
        const targetPresetId = payload?.presetId?.trim() || undefined;
        const payloadFields = Array.isArray(payload?.fields) ? payload.fields!.filter(Boolean) : [];

        const providers = (await window.chobits.ai.getProviders()) as ProviderRow[];
        const p = resolveProviderIdentity(providers || [], requestedProviderId) || null;
        const resolvedProviderId = p?.id || requestedProviderId;
        if (!mounted) return;
        setProviderId(resolvedProviderId);
        setPresetId(targetPresetId);
        setLimitedFields(payloadFields);
        setProvider(p);
        if (!p) {
          setIsLoading(false);
          return;
        }

        if (!mounted) return;
        const scopedSecrets = targetPresetId
          ? await window.chobits.ai.getPresetSecrets(targetPresetId).catch(() => ({}))
          : await window.chobits.ai.getProviderSecrets(resolvedProviderId).catch(() => ({}));
        if (!mounted) return;
        // 已保存的值优先，未保存的字段用 provider 内置默认配置预填展示；
        // password 字段不回显真实值，仅记录为掩码展示项，用户输入新值才覆盖
        const { editableValues, maskedKeys } = splitSecretFormValues({ ...(p.defaultConfig || {}), ...((scopedSecrets || {}) as Record<string, string>) }, p.schema?.fields);
        setValues(editableValues);
        setMaskedSecretKeys(maskedKeys);
      } catch {
        // ignore
      } finally {
        if (mounted) setIsLoading(false);
      }

      // 通知主进程：窗口已准备就绪
      try {
        await window.chobits.window['window:open:ready']('aiProviderConfig' as any);
      } catch {
        // ignore
      }
    };

    bootstrap().catch(() => {
      if (mounted) setIsLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const displayFields = useMemo(() => {
    const all = provider?.schema?.fields || [];
    if (!limitedFields.length) return all;
    return all.filter((f) => limitedFields.includes(f.key));
  }, [provider, limitedFields]);

  const displayLabel = useMemo(() => {
    if (!provider) return providerId;
    return pickLocale(provider.schema?.locales)?.label || provider.label;
  }, [pickLocale, provider, providerId]);

  const locale = useMemo(() => pickLocale(provider?.schema?.locales), [pickLocale, provider?.schema?.locales]);

  // 自动保存：根据字段变化节流调用 setProviderSecrets
  const debouncedAutoSave = useMemo(
    () =>
      debounce(
        async (targetProviderId: string, currentValues: Record<string, string>, currentFields: typeof displayFields) => {
          try {
            if (!currentFields.length) return;
            const payload: Record<string, string> = {};
            currentFields.forEach((f) => {
              const fieldValue = currentValues[f.key];
              if (fieldValue == null) return;
              // password 字段留空/掩码即未改动，不写入存储（保留原值或运行时内置默认）
              if (f.type === 'password' && !fieldValue.trim()) return;
              payload[f.key] = fieldValue;
            });
            if (Object.keys(payload).length === 0) return;
            setIsSaving(true);
            if (presetId) {
              await window.chobits.ai.setPresetSecrets(presetId, payload);
              await selectChatDefaultsForProvider({ providerId: targetProviderId, presetId, provider: provider ?? undefined });
            } else {
              await window.chobits.ai.setProviderSecrets(targetProviderId, payload);
              await selectChatDefaultsForProvider({ providerId: targetProviderId, provider: provider ?? undefined });
            }
          } catch (e: any) {
            toast.error('自动保存失败', { description: e?.message || String(e) });
          } finally {
            setIsSaving(false);
          }
        },
        500,
        { leading: false, trailing: true }
      ),
    [presetId, provider]
  );

  const handleChange = (key: string, val: string): void => {
    setValues((prev) => {
      const next = { ...prev, [key]: val };
      // 清理本地错误
      setErrors((prevErr) => {
        const updated = { ...prevErr };
        delete updated[key];
        return updated;
      });
      // 触发自动保存（只对当前字段集）
      debouncedAutoSave(providerId, next, displayFields);
      return next;
    });
  };

  // 关闭窗口前刷掉最后一次 debounce
  const handleClose = useCallback(() => {
    try {
      debouncedAutoSave.flush();
    } catch {
      // ignore
    }
    window.close();
  }, [debouncedAutoSave]);

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center text-sm">
        <span>载入中...</span>
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="w-full h-full flex items-center justify-center text-sm">
        <span>未找到服务商：{providerId}</span>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <DraggableTitle title={<span>{presetId ? '🔑 预设秘钥配置' : '🔑 服务商配置'}</span>} />
      <div className="w-full h-[calc(100%-36px)] px-4 box-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {provider.schema?.icon && <TintableSvg src={provider.schema.icon} alt={displayLabel} className="w-6 h-6" />}
            <div className="flex flex-col">
              <span className="font-semibold text-sm">{displayLabel}</span>
              <span className="text-xs text-muted-foreground">{presetId ? '配置当前预设所需的秘钥；仅当前预设会使用这些配置' : '配置访问该服务所需的秘钥（兼容旧入口）'}</span>
            </div>
          </div>
          {presetId && <span className="text-[11px] rounded-full border px-2 py-0.5 text-muted-foreground">预设秘钥</span>}
        </div>
        <div className="space-y-3">
          {displayFields.length === 0 ? (
            <div className="text-xs text-muted-foreground">当前没有可配置字段。</div>
          ) : (
            displayFields.map((f) => {
              const value = values[f.key] || '';
              const error = errors[f.key];
              const label = locale?.fields?.[f.key] || f.label || f.key;
              const isPassword = f.type === 'password';
              const isTextarea = f.type === 'textarea';
              const isSelect = f.type === 'select';
              return (
                <div key={f.key} className="space-y-1">
                  <Label className="text-xs">
                    {label}
                    {f.required && <span className="text-red-500 ml-1">*</span>}
                  </Label>
                  {isTextarea ? (
                    <Textarea className="h-20 text-xs" value={value} onChange={(e) => handleChange(f.key, e.target.value)} placeholder={label} />
                  ) : isSelect ? (
                    <Select value={value} onValueChange={(nextValue) => handleChange(f.key, nextValue)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder={`选择${label}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {(f.options || []).map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={isPassword ? 'password' : 'text'}
                      className="h-8 text-xs"
                      value={value}
                      onChange={(e) => handleChange(f.key, e.target.value)}
                      placeholder={isPassword && !value && maskedSecretKeys.includes(f.key) ? MASKED_SECRET_VALUE : label}
                    />
                  )}
                  {error && <div className="text-xs text-red-500 mt-0.5">{error}</div>}
                </div>
              );
            })
          )}
        </div>

        <div className="flex justify-end gap-2 mt-2">
          {isSaving && <div className="mr-auto text-xs text-muted-foreground">正在自动保存...</div>}
          <Button variant="outline" size="sm" disabled={isSaving} onClick={handleClose}>
            取消
          </Button>
        </div>
      </div>
    </div>
  );
}

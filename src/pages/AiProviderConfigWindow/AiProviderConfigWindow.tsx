import { debounce } from 'lodash-es';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import TintableSvg from '@/components/common/TintableSvg';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type ProviderRow = {
  id: string;
  label: string;
  schema?: {
    icon?: string;
    locales?: Record<string, { label?: string; fields?: Record<string, string> }>;
    fields?: Array<{ key: string; label: string; type: string; required?: boolean; options?: any[] }>;
  };
};

type FieldError = Record<string, string>;

type IncomingPayload = {
  providerId?: string;
  fields?: string[];
};

export default function AiProviderConfigWindow(): JSX.Element {
  const [providerId, setProviderId] = useState<string>('zhipu');
  const [limitedFields, setLimitedFields] = useState<string[]>([]);

  const [provider, setProvider] = useState<ProviderRow | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<FieldError>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 从窗口管理器获取 payload（providerId + fields），并拉取 Provider 信息与已有秘钥
  useEffect(() => {
    let mounted = true;
    const bootstrap = async (): Promise<void> => {
      try {
        const payload = (await window.YUA.window['window:payload:get']('aiProviderConfig' as any)) as IncomingPayload | undefined;
        const pid = payload?.providerId || 'zhipu';
        const flds = Array.isArray(payload?.fields) ? payload.fields!.filter(Boolean) : [];
        if (!mounted) return;
        setProviderId(pid);
        setLimitedFields(flds);

        const provs = (await window.YUA.ai.getProviders()) as ProviderRow[];
        const p = provs.find((x) => x.id === pid) || null;
        if (!mounted) return;
        setProvider(p);
        if (!p) {
          setLoading(false);
          return;
        }

        const secrets = await window.YUA.ai.getProviderSecrets(pid).catch(() => ({}));
        if (!mounted) return;
        setValues(secrets || {});
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }

      // 通知主进程：窗口已准备就绪
      try {
        await window.YUA.window['window:open:ready']('aiProviderConfig' as any);
      } catch {
        // ignore
      }
    };

    bootstrap().catch(() => {
      if (mounted) setLoading(false);
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
    const locales = provider.schema?.locales || {};
    const currentLang = navigator.language?.toLowerCase?.() || 'en';
    const exact = locales[currentLang] || locales[currentLang.replace(/-.+$/, '')];
    const fallback = locales['zh-CN'] || locales['en'] || Object.values(locales)[0];
    return (exact && exact.label) || (fallback && fallback.label) || provider.label;
  }, [provider, providerId]);

  // 自动保存：根据字段变化节流调用 setProviderSecrets
  const debouncedAutoSave = useMemo(
    () =>
      debounce(
        async (pid: string, currentValues: Record<string, string>, currentFields: typeof displayFields) => {
          try {
            if (!currentFields.length) return;
            const payload: Record<string, string> = {};
            currentFields.forEach((f) => {
              if (currentValues[f.key] != null) {
                payload[f.key] = currentValues[f.key];
              }
            });
            if (Object.keys(payload).length === 0) return;
            setSaving(true);
            await window.YUA.ai.setProviderSecrets(pid, payload);
          } catch (e: any) {
            toast.error('自动保存失败', { description: e?.message || String(e) });
          } finally {
            setSaving(false);
          }
        },
        500,
        { leading: false, trailing: true }
      ),
    []
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

  if (loading) {
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
      <DragAbleTitle title={<span>🔑 服务商配置</span>} />
      <div className="w-full h-[calc(100%-36px)] px-4 box-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {provider.schema?.icon && <TintableSvg src={provider.schema.icon} alt={displayLabel} className="w-6 h-6" />}
            <div className="flex flex-col">
              <span className="font-semibold text-sm">{displayLabel}</span>
              <span className="text-xs text-muted-foreground">配置访问该服务所需的秘钥</span>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          {displayFields.length === 0 ? (
            <div className="text-xs text-muted-foreground">当前没有可配置字段。</div>
          ) : (
            displayFields.map((f) => {
              const value = values[f.key] || '';
              const error = errors[f.key];
              const label = f.label || f.key;
              const isPassword = f.type === 'password';
              const isTextarea = f.type === 'textarea';
              return (
                <div key={f.key} className="space-y-1">
                  <Label className="text-xs">
                    {label}
                    {f.required && <span className="text-red-500 ml-1">*</span>}
                  </Label>
                  {isTextarea ? (
                    <Textarea className="h-20 text-xs" value={value} onChange={(e) => handleChange(f.key, e.target.value)} placeholder={label} />
                  ) : (
                    <Input type={isPassword ? 'password' : 'text'} className="h-8 text-xs" value={value} onChange={(e) => handleChange(f.key, e.target.value)} placeholder={label} />
                  )}
                  {error && <div className="text-xs text-red-500 mt-0.5">{error}</div>}
                </div>
              );
            })
          )}
        </div>

        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" size="sm" disabled={saving} onClick={handleClose}>
            取消
          </Button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DialogDescription } from '@radix-ui/react-dialog';
import TintableSvg from '@/components/common/TintableSvg';

// Lightweight local types to avoid cross-file coupling
export type ProviderRow = {
  id: string;
  label: string;
  schema?: {
    icon?: string;
    locales?: Record<string, { label?: string; fields?: Record<string, string> }>;
    fields?: Array<{ key: string; label: string; type: string; required?: boolean; options?: any[] }>;
  };
};
export type ModelOpt = { id: string; label?: string; type?: string; context?: number; pricing?: any; tags?: string[]; description?: string };
export type Template = { id: string; name: string; type: 'system' | 'user'; content: string };

export type InstanceFormValues = {
  name: string;
  model?: string;
  systemPrompt?: string;
  secrets: Record<string, string>;
};

export function InstanceFormDialog(props: {
  open: boolean;
  mode: 'create' | 'edit';
  title?: string;
  provider: ProviderRow;
  models: ModelOpt[];
  initialValues: InstanceFormValues;
  errors?: Record<string, string>;
  onClose: () => void;
  onSubmit: (values: InstanceFormValues) => void;
}): JSX.Element {
  const { open, mode, title, provider, models, initialValues, errors, onClose, onSubmit } = props;
  const [values, setValues] = useState<InstanceFormValues>(initialValues);
  const [templates, setTemplates] = useState<Template[]>([]);

  // Initialize form values when dialog is opened via onOpenChange to avoid lint warning on setState in effect

  // Fetch prompt templates internally when dialog opens
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const tmpl = await (window as any).YUA.ai.listPromptTemplates().catch(() => []);
        setTemplates(tmpl || []);
      } catch {
        setTemplates([]);
      }
    })();
  }, [open]);

  const currentLang = (typeof navigator !== 'undefined' ? navigator.language?.toLowerCase?.() : 'en') || 'en';
  const pickLocale = (locales?: Record<string, { label?: string; fields?: Record<string, string> }>): { label?: string; fields?: Record<string, string> } | undefined => {
    if (!locales) return undefined;
    const exact = locales[currentLang] || locales[currentLang.replace(/-.+$/, '')];
    const fallback = locales['en'] || Object.values(locales)[0];
    return exact || fallback;
  };

  const locale = pickLocale(provider.schema?.locales);

  // Note: appendTemplate previously supported chip-append. No longer used.

  const renderModelExtra = (m: ModelOpt): JSX.Element | null => {
    const meta: any = m;
    const ctx = meta?.context ? `${Math.round(meta.context / 1000)}k` : '';
    const extra = [meta?.type, ctx && `${ctx} ctx`].filter(Boolean).join(' · ');
    return extra ? <span className="text-xs text-gray-500 ml-1">({extra})</span> : null;
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
        } else {
          setValues(initialValues);
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl" hideClose={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {provider.schema?.icon && <TintableSvg src={provider.schema?.icon || ''} alt={provider.label} className="w-10 h-10" />}
            <span>{title || pickLocale(provider.schema?.locales)?.label || provider.label}</span>
          </DialogTitle>
          <DialogDescription className="h-0"></DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-sm text-muted-foreground">名称</span>
            <Input value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} />
            {!!errors?.name && <span className="text-xs text-red-600">{errors.name}</span>}
          </label>
          {(provider.schema?.fields || []).map((f) => {
            const label = locale?.fields?.[f.key] || f.label;
            return (
              <label key={f.key} className="grid gap-1">
                <span className="text-sm text-muted-foreground">{label}</span>
                <Input
                  type={f.type === 'password' ? 'password' : 'text'}
                  value={values.secrets?.[f.key] || ''}
                  onChange={(e) => setValues((v) => ({ ...v, secrets: { ...(v.secrets || {}), [f.key]: e.target.value } }))}
                />
                {!!errors?.[f.key] && <span className="text-xs text-red-600">{errors[f.key]}</span>}
              </label>
            );
          })}
          <label className="grid gap-1">
            <span className="text-sm text-muted-foreground">模型</span>
            <Select value={values.model || ''} onValueChange={(val) => setValues((v) => ({ ...v, model: val }))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择模型" />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <span>{m.label || m.id}</span>
                    {renderModelExtra(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-1">
            <span className="text-sm text-muted-foreground">系统提示词</span>
            <Select
              value={templates.find((t) => t.type === 'system' && t.content === (values.systemPrompt || ''))?.id || ''}
              onValueChange={(val) => {
                const t = templates.find((x) => x.id === val);
                if (t) setValues((v) => ({ ...v, systemPrompt: t.content }));
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={templates.length ? '选择模板' : '暂无模板，请先创建提示词模板'} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>

        <div className="grid gap-1">{!!values.systemPrompt && <pre className="rounded border p-2 bg-muted/30 min-h-[60px] whitespace-pre-wrap text-xs">{values.systemPrompt}</pre>}</div>

        <DialogFooter>
          <div className="flex w-full justify-end gap-2">
            <Button variant={'outline'} onClick={onClose}>
              取消
            </Button>
            <Button variant={'default'} onClick={() => onSubmit(values)}>
              保存
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default InstanceFormDialog;

import { DialogDescription } from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';

import TintableSvg from '@/components/common/TintableSvg';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
export type ModelOpt = { id: string; label?: string; type?: string; context?: number; pricing?: any; tags?: string[]; description?: string; free?: boolean };
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
  const { open, title, provider, models, initialValues, errors, onClose, onSubmit } = props;
  const [values, setValues] = useState<InstanceFormValues>(initialValues);
  const [templates, setTemplates] = useState<Template[]>([]);

  // Initialize form values when dialog is opened via onOpenChange to avoid lint warning on setState in effect

  // Fetch prompt templates internally when dialog opens
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const tmpl = await window.YUA.ai.listPromptTemplates().catch(() => []);
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

  const isFree = (m: ModelOpt): boolean => {
    return (m as any)?.free === true || (Array.isArray(m.tags) && m.tags.includes('free'));
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

  const renderContextPill = (m: ModelOpt): JSX.Element | null => {
    const k = m?.context ? Math.round((m.context as number) / 1000) : 0;
    if (!k) return null;
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 border border-sky-200">{k}k ctx</span>;
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

  const filteredSortedModels = (() => {
    const base = models;
    return [...base].sort((a, b) => {
      const fa = isFree(a) ? 1 : 0;
      const fb = isFree(b) ? 1 : 0;
      if (fb !== fa) return fb - fa; // 免费优先
      const la = (a.label || a.id || '').toLowerCase();
      const lb = (b.label || b.id || '').toLowerCase();
      return la.localeCompare(lb);
    });
  })();

  const selectedModel = models.find((m) => m.id === (values.model || ''));

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
                {filteredSortedModels.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <div className="flex items-center gap-2">
                      <span>{m.label || m.id}</span>
                      {isFree(m) && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 border border-green-200">免费</span>}
                      {m.type && <span className={`text-[10px] px-1.5 py-0.5 rounded border ${typeColorClasses(m.type)}`}>{typeDisplay(m.type)}</span>}
                      {renderContextPill(m)}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!!selectedModel && (
              <div className="mt-1 text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                {isFree(selectedModel) && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 border border-green-200">免费</span>}
                {selectedModel.type && <span className={`text-[10px] px-1.5 py-0.5 rounded border ${typeColorClasses(selectedModel.type)}`}>{typeDisplay(selectedModel.type)}</span>}
                {renderContextPill(selectedModel)}
                {selectedModel.description && <span className="truncate max-w-full">{selectedModel.description}</span>}
                {Array.isArray(selectedModel.tags) && selectedModel.tags.length > 0 && (
                  <span className="flex items-center gap-1 flex-wrap">
                    {selectedModel.tags.slice(0, 6).map((t) => (
                      <span key={t} className="text-[10px] px-1 py-0.5 rounded border border-gray-200 text-gray-600 bg-gray-50">
                        {t}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            )}
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

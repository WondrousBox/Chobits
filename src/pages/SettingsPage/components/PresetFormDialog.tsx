import { MASKED_SECRET_VALUE } from '@packages/ai/secret-masking';
import { useState } from 'react';
import { TbChevronDown, TbChevronRight } from 'react-icons/tb';

import TintableSvg from '@/components/common/TintableSvg';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

export type PresetFormValues = {
  secrets: Record<string, string>;
};

export function PresetFormDialog(props: {
  title?: string;
  provider: ProviderRow;
  models: ModelOpt[];
  initialValues: PresetFormValues;
  // 已有有效值（内置默认或已保存）的 password 字段：值不进入表单，仅以掩码 placeholder 展示
  maskedSecretKeys?: string[];
  errors?: Record<string, string>;
  submitLabel?: string;
  cancelLabel?: string;
  onCancel?: () => void;
  onDelete?: () => void;
  onSubmit: (values: PresetFormValues) => void | Promise<void>;
}): JSX.Element {
  const { title, provider, models, initialValues, maskedSecretKeys, errors, submitLabel = '保存', cancelLabel = '取消', onCancel, onDelete, onSubmit } = props;
  const [values, setValues] = useState<PresetFormValues>(() => initialValues);
  const [modelsExpanded, setModelsExpanded] = useState(false);

  const currentLang = (typeof navigator !== 'undefined' ? navigator.language?.toLowerCase?.() : 'en') || 'en';
  const pickLocale = (locales?: Record<string, { label?: string; fields?: Record<string, string> }>): { label?: string; fields?: Record<string, string> } | undefined => {
    if (!locales) return undefined;
    const exact = locales[currentLang] || locales[currentLang.replace(/-.+$/, '')];
    const fallback = locales['en'] || Object.values(locales)[0];
    return exact || fallback;
  };

  const locale = pickLocale(provider.schema?.locales);

  const isFree = (m: ModelOpt): boolean => {
    return (m as { free?: boolean; tags?: string[] })?.free === true || (Array.isArray(m.tags) && m.tags.includes('free'));
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
    const k = m.context ? Math.round((m.context as number) / 1000) : 0;
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

  const filteredSortedModels = [...models].sort((a, b) => {
    const fa = isFree(a) ? 1 : 0;
    const fb = isFree(b) ? 1 : 0;
    if (fb !== fa) return fb - fa;
    const la = (a.label || a.id || '').toLowerCase();
    const lb = (b.label || b.id || '').toLowerCase();
    return la.localeCompare(lb);
  });

  return (
    <div className="rounded-xl border bg-background p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {provider.schema?.icon && <TintableSvg src={provider.schema.icon || ''} alt={provider.label} className="w-8 h-8 shrink-0" />}
          <div className="min-w-0">
            <div className="font-medium truncate">{title || pickLocale(provider.schema?.locales)?.label || provider.label}</div>
            <div className="text-xs text-muted-foreground truncate">填写并保存后会立即生效</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {(provider.schema?.fields || []).map((field) => {
          const label = locale?.fields?.[field.key] || field.label;
          const isMaskedSecret = field.type === 'password' && !values.secrets?.[field.key] && (maskedSecretKeys || []).includes(field.key);

          return (
            <label key={field.key} className="grid gap-1">
              <span className="text-sm text-muted-foreground">{label}</span>
              <Input
                type={field.type === 'password' ? 'password' : 'text'}
                value={values.secrets?.[field.key] || ''}
                placeholder={isMaskedSecret ? MASKED_SECRET_VALUE : undefined}
                onChange={(e) => setValues((v) => ({ ...v, secrets: { ...(v.secrets || {}), [field.key]: e.target.value } }))}
              />
              {!!errors?.[field.key] && <span className="text-xs text-red-600">{errors[field.key]}</span>}
            </label>
          );
        })}
      </div>

      <div className="space-y-2">
        <Button
          type="button"
          variant="ghost"
          className="flex w-full items-center justify-between px-2 py-2 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => setModelsExpanded((expanded) => !expanded)}
        >
          <span>可用模型 ({filteredSortedModels.length})</span>
          <span className="flex items-center gap-1 text-xs">
            {modelsExpanded ? <TbChevronDown className="w-4 h-4" /> : <TbChevronRight className="w-4 h-4" />}
            {modelsExpanded ? '收起' : '展开'}
          </span>
        </Button>

        {modelsExpanded && (
          <div className="rounded-lg border bg-muted/30 p-3">
            {filteredSortedModels.length === 0 ? (
              <div className="text-sm text-muted-foreground">当前还没有可读取到的模型列表</div>
            ) : (
              <div className="grid gap-2 max-h-60 overflow-y-auto">
                {filteredSortedModels.map((model) => (
                  <div key={model.id} className="rounded-lg border bg-background/80 p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{model.label || model.id}</span>
                      {isFree(model) && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 border border-green-200">免费</span>}
                      {model.type && <span className={`text-[10px] px-1.5 py-0.5 rounded border ${typeColorClasses(model.type)}`}>{typeDisplay(model.type)}</span>}
                      {renderContextPill(model)}
                    </div>
                    {!!model.description && <div className="mt-1 text-xs text-muted-foreground">{model.description}</div>}
                    {Array.isArray(model.tags) && model.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {model.tags.slice(0, 6).map((tag) => (
                          <span key={tag} className="text-[10px] px-1 py-0.5 rounded border border-gray-200 text-gray-600 bg-gray-50">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 text-xs text-muted-foreground">这里只做查看，实际使用时在聊天里选择模型。</div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div>
          {onDelete && (
            <Button variant="destructive" onClick={onDelete}>
              删除
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              {cancelLabel}
            </Button>
          )}
          <Button variant="default" onClick={() => onSubmit(values)}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default PresetFormDialog;

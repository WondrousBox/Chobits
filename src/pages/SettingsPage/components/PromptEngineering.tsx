import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';

export default function PromptEngineering(): JSX.Element {
  const [template, setTemplate] = useState<string>('你是一位专业助手。请根据以下指令回答：\n\n${instruction}');
  const [variablesJson, setVariablesJson] = useState<string>('{\n  "instruction": "介绍一下你自己"\n}');

  const parsedVars = useMemo(() => {
    try {
      const obj = JSON.parse(variablesJson || '{}');
      return { ok: true as const, obj };
    } catch (e: any) {
      return { ok: false as const, error: String(e?.message || e) };
    }
  }, [variablesJson]);

  const render = (): string => {
    if (!parsedVars.ok) return template;
    let out = template;
    for (const [k, v] of Object.entries(parsedVars.obj || {})) {
      out = out.replaceAll(new RegExp(`\\$\\{${k}\\}`, 'g'), String(v));
    }
    return out;
  };

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">提示词工程</div>
      <div className="text-xs text-muted-foreground">在这里试验带变量的提示词模板，后续将支持与实例联动调试。</div>
      <div className="grid gap-2">
        <label className="grid gap-1">
          <span className="text-xs text-foreground">模板</span>
          <textarea className="rounded border px-2 py-1 min-h-[120px]" value={template} onChange={(e) => setTemplate(e.target.value)} />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-foreground">变量（JSON）</span>
          <textarea className="rounded border px-2 py-1 min-h-[100px] font-mono text-xs" value={variablesJson} onChange={(e) => setVariablesJson(e.target.value)} />
          {!parsedVars.ok && <span className="text-[11px] text-red-600">JSON 解析错误：{parsedVars.error}</span>}
        </label>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setTemplate('');
              setVariablesJson('{}');
            }}
          >
            清空
          </Button>
        </div>
        <label className="grid gap-1">
          <span className="text-xs text-foreground">渲染结果（只做变量替换预览）</span>
          <pre className="rounded border p-2 bg-muted/30 min-h-[80px] whitespace-pre-wrap text-xs">{render()}</pre>
        </label>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { TbAdjustments } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import type { SpriteAnimationMeta, SpriteAnimationTrigger } from '@/features/sprite-assistant';
import { getPrimarySpriteAnimationTrigger, getSpriteAnimationTriggerAliases } from '@/features/sprite-assistant';

import { createSpriteAnimationMetaDraft, formatSpriteAnimationConditionInput, formatSpriteTriggerAliasesInput, parseSpriteAnimationConditionInput } from './sprite-animation-meta-utils';
import SpriteAnimationConditionBuilder from './SpriteAnimationConditionBuilder';
import SpriteTriggerPicker from './SpriteTriggerPicker';

type SpriteAnimationMetaDraft = Pick<SpriteAnimationMeta, 'condition' | 'primaryTrigger' | 'triggerAliases' | 'priority'>;

interface SpriteAnimationMetaPopoverProps {
  disabled?: boolean;
  meta: SpriteAnimationMeta;
  onSave: (meta: SpriteAnimationMetaDraft) => Promise<void> | void;
}

function getMetaDraftSnapshot(meta: { condition?: unknown; primaryTrigger?: string | null; triggerAliases?: readonly string[] | null; priority?: number }): string {
  return JSON.stringify({
    condition: meta.condition ?? null,
    primaryTrigger: meta.primaryTrigger ?? '',
    triggerAliases: [...(meta.triggerAliases ?? [])],
    priority: meta.priority
  });
}

export default function SpriteAnimationMetaPopover({ disabled = false, meta, onSave }: SpriteAnimationMetaPopoverProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [primaryTrigger, setPrimaryTrigger] = useState<SpriteAnimationTrigger | ''>(getPrimarySpriteAnimationTrigger(meta) || '');
  const [triggerAliasesInput, setTriggerAliasesInput] = useState<string>(formatSpriteTriggerAliasesInput(getSpriteAnimationTriggerAliases(meta)));
  const [priorityInput, setPriorityInput] = useState<string>(meta.priority !== undefined ? String(meta.priority) : '');
  const [conditionInput, setConditionInput] = useState<string>(formatSpriteAnimationConditionInput(meta.condition));

  const hydrateFromMeta = (): void => {
    setPrimaryTrigger(getPrimarySpriteAnimationTrigger(meta) || '');
    setTriggerAliasesInput(formatSpriteTriggerAliasesInput(getSpriteAnimationTriggerAliases(meta)));
    setPriorityInput(meta.priority !== undefined ? String(meta.priority) : '');
    setConditionInput(formatSpriteAnimationConditionInput(meta.condition));
  };

  const parsedCondition = useMemo(() => parseSpriteAnimationConditionInput(conditionInput), [conditionInput]);

  const draft = useMemo(
    () =>
      createSpriteAnimationMetaDraft({
        conditionInput,
        primaryTrigger,
        triggerAliasesInput,
        priority: priorityInput
      }),
    [conditionInput, primaryTrigger, priorityInput, triggerAliasesInput]
  );

  const hasChanges =
    getMetaDraftSnapshot({
      condition: meta.condition,
      primaryTrigger: getPrimarySpriteAnimationTrigger(meta),
      triggerAliases: getSpriteAnimationTriggerAliases(meta),
      priority: meta.priority
    }) !==
    getMetaDraftSnapshot({
      condition: draft.condition,
      primaryTrigger: draft.primaryTrigger,
      triggerAliases: draft.triggerAliases,
      priority: draft.priority
    });

  const resolvedTriggers = [draft.primaryTrigger, ...(draft.triggerAliases ?? [])].filter(Boolean).join(', ') || '未设置';

  const handleSave = async (): Promise<void> => {
    if (saving || !hasChanges) return;
    setSaving(true);
    try {
      await onSave(draft);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) hydrateFromMeta();
      }}
    >
      <PopoverTrigger asChild>
        <Button size="icon" variant="secondary" className="h-8 w-8 bg-background/90" disabled={disabled} title="编辑 trigger 元数据">
          <TbAdjustments className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] space-y-3 p-4" onOpenAutoFocus={(event) => event.preventDefault()}>
        <div className="space-y-1">
          <div className="text-sm font-medium">{meta.title || meta.id}</div>
          <div className="text-[11px] text-muted-foreground">ID: {meta.id}</div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">主 Trigger</Label>
          <SpriteTriggerPicker value={primaryTrigger} onChange={setPrimaryTrigger} buttonClassName="w-full" emptyLabel="未分类" />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">别名 Trigger</Label>
          <Textarea
            value={triggerAliasesInput}
            onChange={(event) => setTriggerAliasesInput(event.target.value)}
            placeholder="多个 trigger 用逗号或换行分隔，例如 workflow:complete, persona:daily-login"
            className="min-h-[78px] resize-y text-xs"
          />
        </div>

        <SpriteAnimationConditionBuilder conditionInput={conditionInput} onChange={setConditionInput} />

        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">优先级</Label>
          <Input type="number" step="1" value={priorityInput} onChange={(event) => setPriorityInput(event.target.value)} placeholder="0" className="h-8 text-center" />
          <div className="text-[10px] text-muted-foreground">同一 trigger 命中多个动画时，数值越大越优先。</div>
        </div>

        <div className="rounded-md border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
          <div className="font-medium text-foreground">实际命中</div>
          <div className="mt-1 break-words">{resolvedTriggers}</div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              hydrateFromMeta();
            }}
            disabled={saving}
          >
            重置
          </Button>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={saving || !hasChanges || !!parsedCondition.error}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

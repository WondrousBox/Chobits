import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TbPlus, TbTrash } from 'react-icons/tb';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import {
  appendSpriteAnimationConditionBuilderChild,
  buildSpriteAnimationConditionFromBuilderDraft,
  createSpriteAnimationConditionBuilderCompareValueForField,
  createSpriteAnimationConditionBuilderNode,
  getSpriteAnimationConditionBuilderDraft,
  getSpriteAnimationConditionFieldOption,
  getSpriteAnimationConditionOperatorOptions,
  removeSpriteAnimationConditionBuilderNodeAtPath,
  replaceSpriteAnimationConditionBuilderNodeAtPath,
  SPRITE_ANIMATION_CONDITION_FIELD_OPTIONS,
  SPRITE_ANIMATION_CONDITION_PRESETS,
  type SpriteAnimationConditionBuilderDraft,
  type SpriteAnimationConditionBuilderNode,
  updateSpriteAnimationConditionBuilderNodeAtPath
} from './sprite-animation-condition-builder-utils';
import { formatSpriteAnimationConditionInput, parseSpriteAnimationConditionInput } from './sprite-animation-meta-utils';

interface SpriteAnimationConditionBuilderProps {
  conditionInput: string;
  onChange: (value: string) => void;
}

function updateConditionInput(conditionInput: string, onChange: (value: string) => void, updater: (draft: SpriteAnimationConditionBuilderDraft) => SpriteAnimationConditionBuilderDraft): void {
  const { draft } = getSpriteAnimationConditionBuilderDraft(parseSpriteAnimationConditionInput(conditionInput).condition);
  const nextDraft = updater(draft);
  onChange(formatSpriteAnimationConditionInput(buildSpriteAnimationConditionFromBuilderDraft(nextDraft)));
}

export default function SpriteAnimationConditionBuilder({ conditionInput, onChange }: SpriteAnimationConditionBuilderProps): JSX.Element {
  const { t } = useTranslation('sprite');
  const parsedCondition = useMemo(() => parseSpriteAnimationConditionInput(conditionInput, t), [conditionInput, t]);
  const builderState = useMemo(() => getSpriteAnimationConditionBuilderDraft(parsedCondition.condition), [parsedCondition.condition]);

  const applyDraftUpdate = (updater: (draft: SpriteAnimationConditionBuilderDraft) => SpriteAnimationConditionBuilderDraft): void => {
    updateConditionInput(conditionInput, onChange, updater);
  };

  const renderNode = (node: SpriteAnimationConditionBuilderNode, path: number[], removable: boolean): JSX.Element => {
    const typeLabel = t(`sprite:conditionBuilder.nodeTypes.${node.type}`);
    const fieldOption = node.type === 'compare' ? getSpriteAnimationConditionFieldOption(node.field) : undefined;

    return (
      <div key={path.join('-') || 'root'} className="rounded-md border bg-muted/20 p-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Badge variant="outline" className="shrink-0">
              {typeLabel}
            </Badge>
            <Select
              value={node.type}
              onValueChange={(value) => applyDraftUpdate((draft) => replaceSpriteAnimationConditionBuilderNodeAtPath(draft, path, value as SpriteAnimationConditionBuilderNode['type']))}
            >
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="compare">{t('sprite:conditionBuilder.nodeTypeOptions.compare')}</SelectItem>
                <SelectItem value="group">{t('sprite:conditionBuilder.nodeTypeOptions.group')}</SelectItem>
                <SelectItem value="not">{t('sprite:conditionBuilder.nodeTypeOptions.not')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {removable && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              onClick={() => applyDraftUpdate((draft) => removeSpriteAnimationConditionBuilderNodeAtPath(draft, path))}
              title={t('sprite:conditionBuilder.removeNode')}
            >
              <TbTrash />
            </Button>
          )}
        </div>

        {node.type === 'compare' && fieldOption && (
          <div className="grid gap-2 md:grid-cols-[140px_120px_1fr_auto]">
            <Select
              value={fieldOption.key}
              onValueChange={(value) => {
                const option = SPRITE_ANIMATION_CONDITION_FIELD_OPTIONS.find((entry) => entry.key === value);
                if (!option) return;

                applyDraftUpdate((draft) =>
                  updateSpriteAnimationConditionBuilderNodeAtPath(draft, path, (currentNode) => {
                    if (currentNode.type !== 'compare') return currentNode;
                    return {
                      type: 'compare',
                      field: option.key === 'custom' ? '' : option.field,
                      operator: option.operators[0],
                      value: option.kind === 'enum' ? (option.valueOptions?.[0]?.value ?? '') : option.key === 'custom' ? '' : createSpriteAnimationConditionBuilderCompareValueForField(option.field)
                    };
                  })
                );
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SPRITE_ANIMATION_CONDITION_FIELD_OPTIONS.map((option) => (
                  <SelectItem key={option.key} value={option.key}>
                    {t(`sprite:conditionBuilder.fields.${option.key}.label`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={node.operator}
              onValueChange={(value) =>
                applyDraftUpdate((draft) =>
                  updateSpriteAnimationConditionBuilderNodeAtPath(draft, path, (currentNode) => {
                    if (currentNode.type !== 'compare') return currentNode;
                    return {
                      ...currentNode,
                      operator: value as typeof currentNode.operator
                    };
                  })
                )
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getSpriteAnimationConditionOperatorOptions(node.field).map((operator) => (
                  <SelectItem key={operator} value={operator}>
                    {operator}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="space-y-2">
              {fieldOption.key === 'custom' && (
                <Input
                  value={node.field}
                  onChange={(event) =>
                    applyDraftUpdate((draft) =>
                      updateSpriteAnimationConditionBuilderNodeAtPath(draft, path, (currentNode) => {
                        if (currentNode.type !== 'compare') return currentNode;
                        return {
                          ...currentNode,
                          field: event.target.value
                        };
                      })
                    )
                  }
                  placeholder={t('sprite:conditionBuilder.fields.custom.fieldPathPlaceholder')}
                  className="h-8 text-xs"
                />
              )}

              {fieldOption.kind === 'enum' && fieldOption.valueOptions ? (
                <Select
                  value={node.value || fieldOption.valueOptions?.[0]?.value || ''}
                  onValueChange={(value) =>
                    applyDraftUpdate((draft) =>
                      updateSpriteAnimationConditionBuilderNodeAtPath(draft, path, (currentNode) => {
                        if (currentNode.type !== 'compare') return currentNode;
                        return {
                          ...currentNode,
                          value
                        };
                      })
                    )
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {fieldOption.valueOptions?.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {fieldOption.valueOptionsKey ? t(`sprite:conditionBuilder.${fieldOption.valueOptionsKey}.${option.value}`) : option.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={node.value}
                  onChange={(event) =>
                    applyDraftUpdate((draft) =>
                      updateSpriteAnimationConditionBuilderNodeAtPath(draft, path, (currentNode) => {
                        if (currentNode.type !== 'compare') return currentNode;
                        return {
                          ...currentNode,
                          value: event.target.value
                        };
                      })
                    )
                  }
                  placeholder={fieldOption.placeholderKey ? t(`sprite:conditionBuilder.${fieldOption.placeholderKey}`) : t('sprite:conditionBuilder.compareValuePlaceholder')}
                  className="h-8 text-xs"
                />
              )}
            </div>

            <div className="flex items-start justify-end pt-1">
              <div className="text-[10px] text-muted-foreground">{node.field || 'custom'}</div>
            </div>
          </div>
        )}

        {node.type === 'group' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-[11px] text-muted-foreground">{t('sprite:conditionBuilder.groupMatch')}</Label>
              <Select
                value={node.match}
                onValueChange={(value) =>
                  applyDraftUpdate((draft) =>
                    updateSpriteAnimationConditionBuilderNodeAtPath(draft, path, (currentNode) => {
                      if (currentNode.type !== 'group') return currentNode;
                      return {
                        ...currentNode,
                        match: value as 'all' | 'any'
                      };
                    })
                  )
                }
              >
                <SelectTrigger className="h-8 w-[180px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('sprite:conditionBuilder.match.all')}</SelectItem>
                  <SelectItem value="any">{t('sprite:conditionBuilder.match.any')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">{node.children.map((child, childIndex) => renderNode(child, [...path, childIndex], true))}</div>

            <div className="flex flex-wrap gap-2">
              {(['compare', 'group', 'not'] as const).map((type) => (
                <Button
                  key={type}
                  size="sm"
                  variant="outline"
                  className="h-8 gap-2 text-xs"
                  onClick={() => applyDraftUpdate((draft) => appendSpriteAnimationConditionBuilderChild(draft, path, createSpriteAnimationConditionBuilderNode(type)))}
                >
                  <TbPlus />
                  {t(`sprite:conditionBuilder.add.${type}`)}
                </Button>
              ))}
            </div>
          </div>
        )}

        {node.type === 'not' && (
          <div className="space-y-2">
            <div className="text-[11px] text-muted-foreground">{t('sprite:conditionBuilder.notDescription')}</div>
            {renderNode(node.child, [...path, 0], false)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-[11px] text-muted-foreground">{t('sprite:conditionBuilder.presetsTitle')}</Label>
        <div className="flex flex-wrap gap-2">
          {SPRITE_ANIMATION_CONDITION_PRESETS.map((preset) => (
            <Button key={preset.id} size="sm" variant="outline" className="h-7 gap-2 px-2.5 text-[11px]" onClick={() => onChange(formatSpriteAnimationConditionInput(preset.condition))}>
              <span>{t(`sprite:conditionBuilder.presets.${preset.id}`)}</span>
              <span className="text-muted-foreground">{preset.description}</span>
            </Button>
          ))}
          <Button size="sm" variant="ghost" className="h-7 px-2.5 text-[11px]" onClick={() => onChange('')}>
            {t('sprite:conditionBuilder.clearConditions')}
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-dashed px-3 py-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-medium">{t('sprite:conditionBuilder.title')}</div>
            <div className="text-[10px] text-muted-foreground">{t('sprite:conditionBuilder.description')}</div>
          </div>
          <Badge variant={builderState.supported ? 'secondary' : 'outline'} className="shrink-0">
            {builderState.supported ? t('sprite:conditionBuilder.status.supported') : t('sprite:conditionBuilder.status.unsupported')}
          </Badge>
        </div>

        {builderState.supported ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-[11px] text-muted-foreground">{t('sprite:conditionBuilder.rootMatch')}</Label>
              <Select value={builderState.draft.match} onValueChange={(value) => applyDraftUpdate((draft) => ({ ...draft, match: value as 'all' | 'any' }))}>
                <SelectTrigger className="h-8 w-[180px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('sprite:conditionBuilder.match.all')}</SelectItem>
                  <SelectItem value="any">{t('sprite:conditionBuilder.match.any')}</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-[10px] text-muted-foreground">{t('sprite:conditionBuilder.rootMatchHint')}</div>
            </div>

            <div className="space-y-2">{builderState.draft.children.map((child, index) => renderNode(child, [index], true))}</div>

            <div className="flex flex-wrap gap-2">
              {(['compare', 'group', 'not'] as const).map((type) => (
                <Button
                  key={type}
                  size="sm"
                  variant="outline"
                  className="h-8 gap-2 text-xs"
                  onClick={() => applyDraftUpdate((draft) => appendSpriteAnimationConditionBuilderChild(draft, null, createSpriteAnimationConditionBuilderNode(type)))}
                >
                  <TbPlus />
                  {t(`sprite:conditionBuilder.addRoot.${type}`)}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">{t('sprite:conditionBuilder.unsupportedHint')}</div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px] text-muted-foreground">{t('sprite:conditionBuilder.advancedJson')}</Label>
        <Textarea
          value={conditionInput}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t('sprite:conditionBuilder.jsonPlaceholder')}
          className="min-h-[132px] resize-y font-mono text-[11px]"
        />
        <div className={`text-[10px] ${parsedCondition.error ? 'text-destructive' : 'text-muted-foreground'}`}>{parsedCondition.error || t('sprite:conditionBuilder.jsonHint')}</div>
      </div>
    </div>
  );
}

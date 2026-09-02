import { useMemo } from 'react';
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
  const parsedCondition = useMemo(() => parseSpriteAnimationConditionInput(conditionInput), [conditionInput]);
  const builderState = useMemo(() => getSpriteAnimationConditionBuilderDraft(parsedCondition.condition), [parsedCondition.condition]);

  const applyDraftUpdate = (updater: (draft: SpriteAnimationConditionBuilderDraft) => SpriteAnimationConditionBuilderDraft): void => {
    updateConditionInput(conditionInput, onChange, updater);
  };

  const renderNode = (node: SpriteAnimationConditionBuilderNode, path: number[], removable: boolean): JSX.Element => {
    const typeLabel = node.type === 'compare' ? '条件' : node.type === 'group' ? '分组' : '取反';

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
                <SelectItem value="compare">普通条件</SelectItem>
                <SelectItem value="group">嵌套分组</SelectItem>
                <SelectItem value="not">NOT 条件</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {removable && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              onClick={() => applyDraftUpdate((draft) => removeSpriteAnimationConditionBuilderNodeAtPath(draft, path))}
              title="删除条件节点"
            >
              <TbTrash className="h-4 w-4" />
            </Button>
          )}
        </div>

        {node.type === 'compare' && (
          <div className="grid gap-2 md:grid-cols-[140px_120px_1fr_auto]">
            <Select
              value={getSpriteAnimationConditionFieldOption(node.field).key}
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
                    {option.label}
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
              {getSpriteAnimationConditionFieldOption(node.field).key === 'custom' && (
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
                  placeholder="角色状态路径，例如 dimensions.focus"
                  className="h-8 text-xs"
                />
              )}

              {getSpriteAnimationConditionFieldOption(node.field).kind === 'enum' && getSpriteAnimationConditionFieldOption(node.field).valueOptions ? (
                <Select
                  value={node.value || getSpriteAnimationConditionFieldOption(node.field).valueOptions?.[0]?.value || ''}
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
                    {getSpriteAnimationConditionFieldOption(node.field).valueOptions?.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
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
                  placeholder={getSpriteAnimationConditionFieldOption(node.field).placeholder || '输入比较值'}
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
              <Label className="text-[11px] text-muted-foreground">组匹配方式</Label>
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
                  <SelectItem value="all">全部满足（AND）</SelectItem>
                  <SelectItem value="any">任一满足（OR）</SelectItem>
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
                  <TbPlus className="h-3.5 w-3.5" />
                  添加{type === 'compare' ? '条件' : type === 'group' ? '分组' : 'NOT'}
                </Button>
              ))}
            </div>
          </div>
        )}

        {node.type === 'not' && (
          <div className="space-y-2">
            <div className="text-[11px] text-muted-foreground">对子条件取反，适合“不是某种心情 / 不满足某个阶段”之类的规则。</div>
            {renderNode(node.child, [...path, 0], false)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-[11px] text-muted-foreground">常用角色状态条件</Label>
        <div className="flex flex-wrap gap-2">
          {SPRITE_ANIMATION_CONDITION_PRESETS.map((preset) => (
            <Button key={preset.id} size="sm" variant="outline" className="h-7 gap-2 px-2.5 text-[11px]" onClick={() => onChange(formatSpriteAnimationConditionInput(preset.condition))}>
              <span>{preset.label}</span>
              <span className="text-muted-foreground">{preset.description}</span>
            </Button>
          ))}
          <Button size="sm" variant="ghost" className="h-7 px-2.5 text-[11px]" onClick={() => onChange('')}>
            清空条件
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-dashed px-3 py-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-medium">可视化 Builder</div>
            <div className="text-[10px] text-muted-foreground">现在已支持 nested group 和 NOT 条件；遇到 `in/notIn` 或更特殊的 schema 时会继续回退到 JSON。</div>
          </div>
          <Badge variant={builderState.supported ? 'secondary' : 'outline'} className="shrink-0">
            {builderState.supported ? 'Builder 已接管' : '复杂规则，回退 JSON'}
          </Badge>
        </div>

        {builderState.supported ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-[11px] text-muted-foreground">根匹配方式</Label>
              <Select value={builderState.draft.match} onValueChange={(value) => applyDraftUpdate((draft) => ({ ...draft, match: value as 'all' | 'any' }))}>
                <SelectTrigger className="h-8 w-[180px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部满足（AND）</SelectItem>
                  <SelectItem value="any">任一满足（OR）</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-[10px] text-muted-foreground">多个根条件时生效，单个根节点会自动收敛成对应条件。</div>
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
                  <TbPlus className="h-3.5 w-3.5" />
                  添加根{type === 'compare' ? '条件' : type === 'group' ? '分组' : 'NOT'}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
            当前规则包含 Builder 暂未覆盖的 schema。你可以继续在 JSON 中编辑，或者点击上方 preset / builder 按钮覆盖为更结构化的规则。
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px] text-muted-foreground">高级 JSON</Label>
        <Textarea
          value={conditionInput}
          onChange={(event) => onChange(event.target.value)}
          placeholder={
            '留空表示无条件。示例：{\n  "type": "all",\n  "conditions": [\n    { "type": "compare", "field": "favor", "operator": "gte", "value": 80 },\n    {\n      "type": "not",\n      "condition": { "type": "compare", "field": "mood", "operator": "eq", "value": "sleepy" }\n    }\n  ]\n}'
          }
          className="min-h-[132px] resize-y font-mono text-[11px]"
        />
        <div className={`text-[10px] ${parsedCondition.error ? 'text-destructive' : 'text-muted-foreground'}`}>
          {parsedCondition.error || '支持 compare / all / any / not；field 可写 favor、level、mood、achievements、dimensions.focus 等角色状态路径。'}
        </div>
      </div>
    </div>
  );
}

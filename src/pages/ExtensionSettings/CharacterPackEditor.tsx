import type { CharacterPackEditorDraft } from '@packages/sprite-core/character-pack-manager';
import {
  buildDefaultCharacterMessageEditorFields,
  CHARACTER_MESSAGE_SPECS,
  CHARACTER_PROGRESS_KIND_LABEL_SPECS,
  CHARACTER_PROGRESS_MESSAGE_SPECS,
  type CharacterMessageSpec,
  type CharacterPackEditorMessageField,
  type CharacterProgressKindLabelKey,
  type CharacterProgressMessageKey
} from '@packages/sprite-core/messages/default-character';
import { type Dispatch, type ReactNode, type SetStateAction, useCallback } from 'react';
import { TbPlus, TbTrash } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

import { type CharacterPackEditorState, joinEditorLines, slugifyCharacterPackId, splitEditorLines, withCharacterPackEditorDraft } from './character-pack-editor-model';

interface CharacterPackEditorContentProps {
  editor: CharacterPackEditorState;
  setEditor: Dispatch<SetStateAction<CharacterPackEditorState | null>>;
  className?: string;
  extra?: ReactNode;
}

export function CharacterPackEditorContent({ editor, setEditor, className, extra }: CharacterPackEditorContentProps): JSX.Element {
  const updateEditorPack = useCallback(
    (patch: Partial<CharacterPackEditorDraft['pack']>): void => {
      setEditor((current) =>
        withCharacterPackEditorDraft(current, (draft) => ({
          ...draft,
          pack: {
            ...draft.pack,
            ...patch
          }
        }))
      );
    },
    [setEditor]
  );

  const updateEditorCharacter = useCallback(
    (patch: Partial<CharacterPackEditorDraft['character']>): void => {
      setEditor((current) =>
        withCharacterPackEditorDraft(current, (draft) => ({
          ...draft,
          character: {
            ...draft.character,
            ...patch
          }
        }))
      );
    },
    [setEditor]
  );

  const updateEditorMessages = useCallback(
    (patch: Partial<NonNullable<CharacterPackEditorDraft['messages']>>): void => {
      setEditor((current) =>
        withCharacterPackEditorDraft(current, (draft) => ({
          ...draft,
          messages: {
            ...buildDefaultCharacterMessageEditorFields({
              name: draft.character.name,
              firstPerson: draft.character.firstPerson,
              addressUser: draft.character.addressUser
            }),
            ...(draft.messages ?? {}),
            ...patch
          }
        }))
      );
    },
    [setEditor]
  );

  const updateEditorExample = useCallback(
    (index: number, patch: Partial<CharacterPackEditorDraft['character']['speechExamples'][number]>): void => {
      setEditor((current) =>
        withCharacterPackEditorDraft(current, (draft) => {
          const speechExamples = draft.character.speechExamples.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry));
          return {
            ...draft,
            character: {
              ...draft.character,
              speechExamples
            }
          };
        })
      );
    },
    [setEditor]
  );

  const removeEditorExample = useCallback(
    (index: number): void => {
      setEditor((current) =>
        withCharacterPackEditorDraft(current, (draft) => ({
          ...draft,
          character: {
            ...draft.character,
            speechExamples: draft.character.speechExamples.filter((_, entryIndex) => entryIndex !== index)
          }
        }))
      );
    },
    [setEditor]
  );

  const addEditorExample = useCallback((): void => {
    setEditor((current) =>
      withCharacterPackEditorDraft(current, (draft) => ({
        ...draft,
        character: {
          ...draft.character,
          speechExamples: [...draft.character.speechExamples, { situation: '', response: '' }]
        }
      }))
    );
  }, [setEditor]);

  const messages =
    editor.draft.messages ??
    buildDefaultCharacterMessageEditorFields({
      name: editor.draft.character.name,
      firstPerson: editor.draft.character.firstPerson,
      addressUser: editor.draft.character.addressUser
    });

  const updateProgressKindLabel = useCallback(
    (key: CharacterProgressKindLabelKey, value: string): void => {
      updateEditorMessages({
        progressKindLabels: {
          ...messages.progressKindLabels,
          [key]: value
        }
      });
    },
    [messages.progressKindLabels, updateEditorMessages]
  );

  const updateProgressMessage = useCallback(
    (key: CharacterProgressMessageKey, value: string): void => {
      updateEditorMessages({
        progress: {
          ...messages.progress,
          [key]: value
        }
      });
    },
    [messages.progress, updateEditorMessages]
  );

  const renderMessageTextarea = (field: CharacterPackEditorMessageField, label: string, placeholder?: string): JSX.Element => (
    <div key={field} className="space-y-2">
      <Label>{label}</Label>
      <Textarea className="min-h-20" placeholder={placeholder} value={joinEditorLines(messages[field])} onChange={(event) => updateEditorMessages({ [field]: splitEditorLines(event.target.value) })} />
    </div>
  );

  return (
    <div className={className}>
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>角色包 ID</Label>
            <Input value={editor.draft.pack.id} onChange={(event) => updateEditorPack({ id: slugifyCharacterPackId(event.target.value) })} disabled={editor.saveMode === 'edit'} />
          </div>
          <div className="space-y-2">
            <Label>角色包名称</Label>
            <Input value={editor.draft.pack.name} onChange={(event) => updateEditorPack({ name: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>版本</Label>
            <Input value={editor.draft.pack.version} onChange={(event) => updateEditorPack({ version: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>作者</Label>
            <Input value={editor.draft.pack.author} onChange={(event) => updateEditorPack({ author: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>许可证</Label>
            <Input value={editor.draft.pack.license} onChange={(event) => updateEditorPack({ license: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>平台</Label>
            <Input value={editor.draft.pack.platform.join(', ')} onChange={(event) => updateEditorPack({ platform: splitEditorLines(event.target.value.replace(/[,，]/g, '\n')) })} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>角色包描述</Label>
            <Textarea className="min-h-20" value={editor.draft.pack.description} onChange={(event) => updateEditorPack({ description: event.target.value })} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>标签</Label>
            <Input value={editor.draft.pack.tags.join(', ')} onChange={(event) => updateEditorPack({ tags: splitEditorLines(event.target.value.replace(/[,，]/g, '\n')) })} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>角色 ID</Label>
            <Input value={editor.draft.character.id} onChange={(event) => updateEditorCharacter({ id: slugifyCharacterPackId(event.target.value) })} />
          </div>
          <div className="space-y-2">
            <Label>角色名称</Label>
            <Input value={editor.draft.character.name} onChange={(event) => updateEditorCharacter({ name: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>角色标语</Label>
            <Input value={editor.draft.character.tagline} onChange={(event) => updateEditorCharacter({ tagline: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>别名</Label>
            <Input value={editor.draft.character.nameAliases.join(', ')} onChange={(event) => updateEditorCharacter({ nameAliases: splitEditorLines(event.target.value.replace(/[,，]/g, '\n')) })} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>角色背景</Label>
            <Textarea className="min-h-24" value={editor.draft.character.background} onChange={(event) => updateEditorCharacter({ background: event.target.value })} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>核心性格</Label>
            <Textarea
              className="min-h-32"
              value={joinEditorLines(editor.draft.character.coreTraits)}
              onChange={(event) => updateEditorCharacter({ coreTraits: splitEditorLines(event.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label>行为边界</Label>
            <Textarea
              className="min-h-32"
              value={joinEditorLines(editor.draft.character.boundaries)}
              onChange={(event) => updateEditorCharacter({ boundaries: splitEditorLines(event.target.value) })}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>说话语气</Label>
            <Input value={editor.draft.character.speechTone} onChange={(event) => updateEditorCharacter({ speechTone: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>语言</Label>
            <Input value={editor.draft.character.language} onChange={(event) => updateEditorCharacter({ language: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>自称</Label>
            <Input value={editor.draft.character.firstPerson} onChange={(event) => updateEditorCharacter({ firstPerson: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>称呼用户</Label>
            <Input value={editor.draft.character.addressUser} onChange={(event) => updateEditorCharacter({ addressUser: event.target.value })} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>口癖和表达习惯</Label>
            <Textarea className="min-h-24" value={joinEditorLines(editor.draft.character.quirks)} onChange={(event) => updateEditorCharacter({ quirks: splitEditorLines(event.target.value) })} />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>对话示例</Label>
            <Button type="button" size="sm" variant="outline" onClick={addEditorExample}>
              <TbPlus />
              添加示例
            </Button>
          </div>
          <div className="space-y-2">
            {editor.draft.character.speechExamples.map((example, index) => (
              <div key={index} className="grid grid-cols-1 gap-2 rounded-md border border-border/60 p-2 md:grid-cols-[1fr_2fr_auto]">
                <Input placeholder="场景" value={example.situation} onChange={(event) => updateEditorExample(index, { situation: event.target.value })} />
                <Input placeholder="回应" value={example.response} onChange={(event) => updateEditorExample(index, { response: event.target.value })} />
                <Button type="button" size="sm" variant="outline" onClick={() => removeEditorExample(index)}>
                  <TbTrash />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>事件台词</Label>
            <div className="text-xs text-muted-foreground">
              每行一条，会随机选一句。可使用 {'{count}'}、{'{progress}'} 这类占位符。
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {CHARACTER_MESSAGE_SPECS.map((spec) => renderMessageTextarea(spec.field, spec.label, (spec as CharacterMessageSpec).placeholder))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>进度播报</Label>
            <div className="text-xs text-muted-foreground">用于下载、导入、转写和工作流等待时的语音播报。</div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {CHARACTER_PROGRESS_KIND_LABEL_SPECS.map((spec) => (
              <div key={spec.key} className="space-y-2">
                <Label>{spec.label}</Label>
                <Input value={messages.progressKindLabels[spec.key]} onChange={(event) => updateProgressKindLabel(spec.key, event.target.value)} />
              </div>
            ))}
            {CHARACTER_PROGRESS_MESSAGE_SPECS.map((spec) => (
              <div key={spec.key} className="space-y-2">
                <Label>{spec.label}</Label>
                <Input value={messages.progress[spec.key]} onChange={(event) => updateProgressMessage(spec.key, event.target.value)} />
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>角色说明</Label>
            <Textarea className="min-h-24" value={editor.draft.character.metaDescription} onChange={(event) => updateEditorCharacter({ metaDescription: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>角色标签</Label>
            <Textarea className="min-h-24" value={joinEditorLines(editor.draft.character.metaTags)} onChange={(event) => updateEditorCharacter({ metaTags: splitEditorLines(event.target.value) })} />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border/60 p-3">
          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground">保存后立即切换</div>
            <div className="text-xs text-muted-foreground">会刷新当前角色人格、能力状态和动画资源。</div>
          </div>
          <Switch checked={editor.activateAfterSave} onCheckedChange={(checked) => setEditor((current) => (current ? { ...current, activateAfterSave: checked } : current))} />
        </div>

        {extra}
      </div>
    </div>
  );
}

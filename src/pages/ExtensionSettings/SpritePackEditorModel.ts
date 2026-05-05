import type { CharacterPackEditorDraft, CharacterPackEditorSaveOptions, CharacterPackSource, CharacterPackSummary } from '@packages/sprite-core/character-pack-manager';

export const SPRITE_PACK_EDITOR_WINDOW_KEY = 'characterPackEditor';
export const SPRITE_PACK_EDITOR_EVENT_CHANNEL = 'chobits:sprite-pack-editor';

export type SpritePackEditorPresentation = 'window' | 'modal' | 'compact';

export interface SpritePackEditorState {
  mode: 'create' | 'edit';
  intent: 'create' | 'edit';
  draft: CharacterPackEditorDraft;
  basePack?: CharacterPackSummary;
  targetPack?: CharacterPackSummary;
  activateAfterSave: boolean;
}

export interface SpritePackEditorWindowPayload {
  mode?: 'create' | 'edit';
  packId?: string;
  source?: CharacterPackSource;
}

export interface SpritePackEditorSavedEvent {
  type: 'saved';
  packId?: string;
  packName?: string;
  activated?: boolean;
}

export function splitEditorLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function joinEditorLines(value: string[] | undefined): string {
  return (value ?? []).join('\n');
}

export function slugifyCharacterPackId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/[^a-z0-9]+$/, '');
  return normalized || 'custom-character';
}

function getUniquePackId(candidate: string, packs: CharacterPackSummary[]): string {
  const baseId = slugifyCharacterPackId(candidate);
  const existingIds = new Set(packs.filter((pack) => pack.source === 'installed').map((pack) => pack.id));
  if (!existingIds.has(baseId)) {
    return baseId;
  }

  for (let index = 2; index < 1000; index += 1) {
    const nextId = `${baseId}-${index}`;
    if (!existingIds.has(nextId)) {
      return nextId;
    }
  }

  return `${baseId}-${Date.now().toString(36)}`;
}

export function withSpritePackEditorDraft(editor: SpritePackEditorState | null, update: (draft: CharacterPackEditorDraft) => CharacterPackEditorDraft): SpritePackEditorState | null {
  if (!editor) return editor;
  return {
    ...editor,
    draft: update(editor.draft)
  };
}

export function buildCreateSpritePackEditorState(basePack: CharacterPackSummary | null | undefined, packs: CharacterPackSummary[]): SpritePackEditorState {
  const seed = basePack?.name ? `${basePack.name} 自定义版` : '我的自定义角色';
  const id = getUniquePackId(`custom-${Date.now().toString(36)}`, packs);
  return {
    mode: 'create',
    intent: 'create',
    draft: {
      pack: {
        id,
        name: seed,
        version: '1.0.0',
        author: 'Local User',
        description: '本地创建的自定义角色包',
        license: 'Custom',
        tags: ['custom'],
        platform: [window.YUA.platform]
      },
      character: {
        id,
        name: seed,
        nameAliases: [],
        tagline: '我的桌面伙伴',
        background: '你是一个居住在用户电脑桌面上的智能精灵，会陪伴用户工作、学习和生活。',
        coreTraits: ['温暖真诚', '认真负责', '有一点自己的小个性'],
        boundaries: ['真诚帮助，不表演。', '像人一样自然说话。', '遇到问题先尝试解决，实在卡住再询问用户。'],
        speechTone: '温和、自然、略带活泼',
        language: 'zh-CN',
        firstPerson: '我',
        addressUser: '你',
        quirks: ['偶尔用轻快的语气回应', '完成任务时会简短确认结果'],
        speechExamples: [
          { situation: '打招呼', response: '嗨，今天想做点什么？' },
          { situation: '完成任务', response: '搞定啦。' }
        ],
        metaDescription: '本地创建的自定义角色',
        metaTags: ['custom', 'assistant']
      }
    },
    basePack: basePack ?? undefined,
    activateAfterSave: true
  };
}

export async function loadSpritePackEditorStateForPack(pack: CharacterPackSummary, packs: CharacterPackSummary[]): Promise<SpritePackEditorState> {
  const draft = await window.YUA.persona.getCharacterPackEditorDraft(pack.id, pack.source);
  if (!draft) {
    throw new Error(`读取角色包草稿失败: ${pack.name}`);
  }

  if (pack.source !== 'installed') {
    const nextId = getUniquePackId(`${draft.pack.id}-custom`, packs);
    return {
      mode: 'create',
      intent: 'edit',
      draft: {
        ...draft,
        pack: {
          ...draft.pack,
          id: nextId,
          name: `${draft.pack.name} 自定义版`,
          author: draft.pack.author || 'Local User'
        },
        character: {
          ...draft.character,
          id: getUniquePackId(`${draft.character.id}-custom`, packs),
          name: `${draft.character.name} 自定义版`
        }
      },
      basePack: pack,
      activateAfterSave: true
    };
  }

  return {
    mode: 'edit',
    intent: 'edit',
    draft,
    targetPack: pack,
    basePack: pack,
    activateAfterSave: pack.isActive
  };
}

export function validateSpritePackEditorDraft(draft: CharacterPackEditorDraft): string | null {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(draft.pack.id.trim())) {
    return '角色包 ID 只能使用小写字母、数字、点、横线或下划线。';
  }
  if (!draft.pack.name.trim()) return '角色包名称不能为空。';
  if (!draft.pack.version.trim()) return '版本不能为空。';
  if (!draft.pack.author.trim()) return '作者不能为空。';
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(draft.character.id.trim())) {
    return '角色 ID 只能使用小写字母、数字、点、横线或下划线。';
  }
  if (!draft.character.name.trim()) return '角色名称不能为空。';
  if (!draft.character.tagline.trim()) return '角色标语不能为空。';
  if (!draft.character.background.trim()) return '角色背景不能为空。';
  if (!draft.character.speechTone.trim()) return '说话语气不能为空。';
  return null;
}

export function getSpritePackEditorTitle(editor: SpritePackEditorState | null): string {
  return editor?.intent === 'edit' ? '编辑角色包' : '创建自定义角色包';
}

export function getSpritePackEditorDescription(editor: SpritePackEditorState | null): string {
  if (!editor) {
    return '';
  }

  if (editor.mode === 'edit') {
    return '保存后会更新本地角色包目录。';
  }

  if (editor.intent === 'edit' && editor.basePack) {
    return `内置角色包会保存为本地可编辑版本，动画会使用新的独立动画包。来源：${editor.basePack.name}`;
  }

  return editor.basePack ? `将基于 ${editor.basePack.name} 创建角色，动画会使用新的独立动画包。` : '保存后会写入本地角色包目录。';
}

export async function saveSpritePackEditorState(
  editor: SpritePackEditorState,
  packs: CharacterPackSummary[]
): Promise<NonNullable<Awaited<ReturnType<typeof window.YUA.persona.saveCharacterPackEditorDraft>>>> {
  const validationError = validateSpritePackEditorDraft(editor.draft);
  if (validationError) {
    throw new Error(validationError);
  }

  const idConflict = editor.mode === 'create' && packs.some((pack) => pack.source === 'installed' && pack.id === editor.draft.pack.id);
  if (idConflict) {
    throw new Error('已存在同 ID 的本地角色包，请换一个角色包 ID。');
  }

  const options: CharacterPackEditorSaveOptions = {
    basePackId: editor.basePack?.id,
    basePackSource: editor.basePack?.source,
    replaceExisting: editor.mode === 'edit',
    activate: editor.activateAfterSave
  };

  const result = await window.YUA.persona.saveCharacterPackEditorDraft(editor.draft, options);
  if (!result?.ok) {
    throw new Error((result as { error?: string } | null)?.error || '保存角色包失败');
  }

  return result;
}

export function emitSpritePackEditorEvent(event: SpritePackEditorSavedEvent): void {
  try {
    const channel = new BroadcastChannel(SPRITE_PACK_EDITOR_EVENT_CHANNEL);
    channel.postMessage(event);
    channel.close();
  } catch {
    // BroadcastChannel is best-effort; saving itself already succeeded.
  }
}

export function subscribeSpritePackEditorEvents(handler: (event: SpritePackEditorSavedEvent) => void): () => void {
  try {
    const channel = new BroadcastChannel(SPRITE_PACK_EDITOR_EVENT_CHANNEL);
    const listener = (event: MessageEvent<SpritePackEditorSavedEvent>): void => {
      if (event.data?.type === 'saved') {
        handler(event.data);
      }
    };
    channel.addEventListener('message', listener);
    return () => {
      channel.removeEventListener('message', listener);
      channel.close();
    };
  } catch {
    return () => undefined;
  }
}

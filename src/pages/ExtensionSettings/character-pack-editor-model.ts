import type { CharacterPackEditorDraft, CharacterPackEditorSaveOptions, CharacterPackSource, CharacterPackSummary } from '@packages/sprite-core/character-pack-manager';
import { buildDefaultCharacterMessageEditorFields } from '@packages/sprite-core/messages/default-character';
import type { TFunction } from 'i18next';

export const CHARACTER_PACK_EDITOR_WINDOW_KEY = 'characterPackEditor';
export const CHARACTER_PACK_EDITOR_EVENT_CHANNEL = 'chobits:character-pack-editor';

export type CharacterPackEditorPresentation = 'window' | 'modal' | 'compact';

export interface CharacterPackEditorState {
  /** 保存行为：'edit' 替换已安装的包，'create' 新建本地包 */
  saveMode: 'create' | 'edit';
  /** 用户操作意图：编辑内置包时会以 'edit' 意图走 'create' 保存（另存为本地副本） */
  editorIntent: 'create' | 'edit';
  draft: CharacterPackEditorDraft;
  basePack?: CharacterPackSummary;
  targetPack?: CharacterPackSummary;
  activateAfterSave: boolean;
}

export interface CharacterPackEditorWindowPayload {
  mode?: 'create' | 'edit';
  packId?: string;
  source?: CharacterPackSource;
}

export interface CharacterPackEditorSavedEvent {
  type: 'saved';
  packId?: string;
  packName?: string;
  wasActivated?: boolean;
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

export function withCharacterPackEditorDraft(editor: CharacterPackEditorState | null, update: (draft: CharacterPackEditorDraft) => CharacterPackEditorDraft): CharacterPackEditorState | null {
  if (!editor) return editor;
  return {
    ...editor,
    draft: update(editor.draft)
  };
}

export function buildCreateCharacterPackEditorState(t: TFunction, basePack: CharacterPackSummary | null | undefined, packs: CharacterPackSummary[]): CharacterPackEditorState {
  const seed = basePack?.name ? t('character:editor.defaults.customVersionName', { name: basePack.name }) : t('character:editor.defaults.seedName');
  const id = getUniquePackId(`custom-${Date.now().toString(36)}`, packs);
  const firstPerson = t('character:editor.defaults.firstPerson');
  const addressUser = t('character:editor.defaults.addressUser');
  return {
    saveMode: 'create',
    editorIntent: 'create',
    draft: {
      pack: {
        id,
        name: seed,
        version: '1.0.0',
        author: 'Local User',
        description: t('character:editor.defaults.packDescription'),
        license: 'Custom',
        tags: ['custom'],
        platform: [window.chobits.platform]
      },
      character: {
        id,
        name: seed,
        nameAliases: [],
        tagline: t('character:editor.defaults.tagline'),
        background: t('character:editor.defaults.background'),
        coreTraits: [t('character:editor.defaults.coreTraitWarm'), t('character:editor.defaults.coreTraitResponsible'), t('character:editor.defaults.coreTraitPersonality')],
        boundaries: [t('character:editor.defaults.boundaryHonest'), t('character:editor.defaults.boundaryNatural'), t('character:editor.defaults.boundarySolve')],
        speechTone: t('character:editor.defaults.speechTone'),
        language: 'zh-CN',
        firstPerson,
        addressUser,
        quirks: [t('character:editor.defaults.quirkTone'), t('character:editor.defaults.quirkConfirm')],
        speechExamples: [
          { situation: t('character:editor.defaults.exampleGreetingSituation'), response: t('character:editor.defaults.exampleGreetingResponse') },
          { situation: t('character:editor.defaults.exampleTaskSituation'), response: t('character:editor.defaults.exampleTaskResponse') }
        ],
        metaDescription: t('character:editor.defaults.metaDescription'),
        metaTags: ['custom']
      },
      messages: buildDefaultCharacterMessageEditorFields({
        name: seed,
        firstPerson,
        addressUser
      })
    },
    basePack: basePack ?? undefined,
    activateAfterSave: true
  };
}

export async function loadCharacterPackEditorStateForPack(t: TFunction, pack: CharacterPackSummary, packs: CharacterPackSummary[]): Promise<CharacterPackEditorState> {
  const draft = await window.chobits.character.getCharacterPackEditorDraft(pack.id, pack.source);
  if (!draft) {
    throw new Error(t('character:editor.error.draftLoadFailed', { name: pack.name }));
  }

  if (pack.source !== 'installed') {
    const nextId = getUniquePackId(`${draft.pack.id}-custom`, packs);
    return {
      saveMode: 'create',
      editorIntent: 'edit',
      draft: {
        ...draft,
        pack: {
          ...draft.pack,
          id: nextId,
          name: t('character:editor.defaults.customVersionName', { name: draft.pack.name }),
          author: draft.pack.author || 'Local User'
        },
        character: {
          ...draft.character,
          id: getUniquePackId(`${draft.character.id}-custom`, packs),
          name: t('character:editor.defaults.customVersionName', { name: draft.character.name })
        }
      },
      basePack: pack,
      activateAfterSave: true
    };
  }

  return {
    saveMode: 'edit',
    editorIntent: 'edit',
    draft,
    targetPack: pack,
    basePack: pack,
    activateAfterSave: pack.isActive
  };
}

export function validateCharacterPackEditorDraft(t: TFunction, draft: CharacterPackEditorDraft): string | null {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(draft.pack.id.trim())) {
    return t('character:editor.validation.packIdInvalid');
  }
  if (!draft.pack.name.trim()) return t('character:editor.validation.packNameRequired');
  if (!draft.pack.version.trim()) return t('character:editor.validation.versionRequired');
  if (!draft.pack.author.trim()) return t('character:editor.validation.authorRequired');
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(draft.character.id.trim())) {
    return t('character:editor.validation.characterIdInvalid');
  }
  if (!draft.character.name.trim()) return t('character:editor.validation.characterNameRequired');
  if (!draft.character.tagline.trim()) return t('character:editor.validation.taglineRequired');
  if (!draft.character.background.trim()) return t('character:editor.validation.backgroundRequired');
  if (!draft.character.speechTone.trim()) return t('character:editor.validation.speechToneRequired');
  return null;
}

export function getCharacterPackEditorTitle(t: TFunction, editor: CharacterPackEditorState | null): string {
  return editor?.editorIntent === 'edit' ? t('character:editor.titleEdit') : t('character:editor.titleCreate');
}

export function getCharacterPackEditorDescription(t: TFunction, editor: CharacterPackEditorState | null): string {
  if (!editor) {
    return '';
  }

  if (editor.saveMode === 'edit') {
    return t('character:editor.descriptionEdit');
  }

  if (editor.editorIntent === 'edit' && editor.basePack) {
    return t('character:editor.descriptionBuiltinCopy', { name: editor.basePack.name });
  }

  return editor.basePack ? t('character:editor.descriptionBasedOn', { name: editor.basePack.name }) : t('character:editor.descriptionCreate');
}

export async function saveCharacterPackEditorState(
  t: TFunction,
  editor: CharacterPackEditorState,
  packs: CharacterPackSummary[]
): Promise<NonNullable<Awaited<ReturnType<typeof window.chobits.character.saveCharacterPackEditorDraft>>>> {
  const validationError = validateCharacterPackEditorDraft(t, editor.draft);
  if (validationError) {
    throw new Error(validationError);
  }

  const idConflict = editor.saveMode === 'create' && packs.some((pack) => pack.source === 'installed' && pack.id === editor.draft.pack.id);
  if (idConflict) {
    throw new Error(t('character:editor.error.idConflict'));
  }

  const options: CharacterPackEditorSaveOptions = {
    basePackId: editor.basePack?.id,
    basePackSource: editor.basePack?.source,
    replaceExisting: editor.saveMode === 'edit',
    activate: editor.activateAfterSave
  };

  const result = await window.chobits.character.saveCharacterPackEditorDraft(editor.draft, options);
  if (!result?.ok) {
    throw new Error((result as { error?: string } | null)?.error || t('character:editor.error.saveFailed'));
  }

  return result;
}

export function emitCharacterPackEditorEvent(event: CharacterPackEditorSavedEvent): void {
  try {
    const channel = new BroadcastChannel(CHARACTER_PACK_EDITOR_EVENT_CHANNEL);
    channel.postMessage(event);
    channel.close();
  } catch {
    // BroadcastChannel is best-effort; saving itself already succeeded.
  }
}

export function subscribeCharacterPackEditorEvents(handler: (event: CharacterPackEditorSavedEvent) => void): () => void {
  try {
    const channel = new BroadcastChannel(CHARACTER_PACK_EDITOR_EVENT_CHANNEL);
    const listener = (event: MessageEvent<CharacterPackEditorSavedEvent>): void => {
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

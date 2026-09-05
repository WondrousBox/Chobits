import type { SpriteCapabilityState } from '@packages/sprite-core/capability-registry';
import type { CharacterPackSummary } from '@packages/sprite-core/character-pack-manager';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TbLoader2 } from 'react-icons/tb';
import { toast } from 'sonner';

import DraggableTitle from '@/components/common/DraggableTitle';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getSpriteCapabilityLockedReason, getSpriteCapabilityState } from '@/features/sprite/capability-guard';
import { useSpriteCapabilitySnapshot } from '@/features/sprite/hooks/useSpriteCapabilitySnapshot';

import {
  buildCreateCharacterPackEditorState,
  CHARACTER_PACK_EDITOR_WINDOW_KEY,
  type CharacterPackEditorState,
  type CharacterPackEditorWindowPayload,
  emitCharacterPackEditorEvent,
  getCharacterPackEditorDescription,
  getCharacterPackEditorTitle,
  loadCharacterPackEditorStateForPack,
  saveCharacterPackEditorState
} from './character-pack-editor-model';
import CharacterGalleryManager from './CharacterGalleryManager';
import { CharacterPackEditorContent } from './CharacterPackEditor';
import { SpriteAnimationManager } from './SpriteManager';

function resolveEditorTargetPack(payload: CharacterPackEditorWindowPayload | null | undefined, packs: CharacterPackSummary[]): CharacterPackSummary | null {
  if (!payload?.packId) {
    return null;
  }

  return packs.find((pack) => pack.id === payload.packId && (!payload.source || pack.source === payload.source)) ?? packs.find((pack) => pack.id === payload.packId) ?? null;
}

export default function CharacterPackEditorWindow(): JSX.Element {
  const [packs, setPacks] = useState<CharacterPackSummary[]>([]);
  const [editor, setEditor] = useState<CharacterPackEditorState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'gallery' | 'animations'>('profile');
  const { snapshot: capabilitySnapshot } = useSpriteCapabilitySnapshot();
  const { t } = useTranslation('character');

  const loadEditor = useCallback(
    async (payload?: CharacterPackEditorWindowPayload | null): Promise<void> => {
      setIsLoading(true);
      setError(null);
      try {
        const nextPacks = (await window.chobits.character.listCharacterPacks()) ?? [];
        const targetPack = resolveEditorTargetPack(payload, nextPacks);
        const shouldEdit = payload?.mode === 'edit' || !!payload?.packId;
        if (shouldEdit) {
          if (!targetPack) {
            throw new Error(t('editorWindow.errorNotFound'));
          }
          setEditor(await loadCharacterPackEditorStateForPack(t, targetPack, nextPacks));
        } else {
          const basePack = nextPacks.find((pack) => pack.isActive) ?? nextPacks.find((pack) => pack.source === 'builtin') ?? nextPacks[0] ?? undefined;
          setEditor(buildCreateCharacterPackEditorState(t, basePack, nextPacks));
        }
        setPacks(nextPacks);
      } catch (loadError) {
        console.error('Failed to load character pack editor window:', loadError);
        const message = loadError instanceof Error && loadError.message ? loadError.message : t('editorWindow.loadFailed');
        setError(message);
        toast.error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    const handler = (payload?: CharacterPackEditorWindowPayload): void => {
      void loadEditor(payload);
    };

    const unsubscribeOpenReady = window.chobits.window.onOpenReady(handler);

    const bootstrap = async (): Promise<void> => {
      try {
        const payload = (await window.chobits.window['window:payload:get'](CHARACTER_PACK_EDITOR_WINDOW_KEY as any)) as CharacterPackEditorWindowPayload | undefined;
        await loadEditor(payload);
      } catch (bootstrapError) {
        console.warn('[CharacterPackEditorWindow] payload bootstrap failed', bootstrapError);
        await loadEditor(null);
      } finally {
        try {
          await window.chobits.window['window:open:ready'](CHARACTER_PACK_EDITOR_WINDOW_KEY as any);
        } catch {
          // ignore
        }
      }
    };

    void bootstrap();

    return () => {
      unsubscribeOpenReady();
    };
  }, [loadEditor]);

  const title = useMemo(() => getCharacterPackEditorTitle(t, editor), [editor, t]);
  const description = useMemo(() => getCharacterPackEditorDescription(t, editor), [editor, t]);
  const assetAuthoringCapability = useMemo(() => getSpriteCapabilityState(capabilitySnapshot, 'spriteManage'), [capabilitySnapshot]);

  const handleCapabilityBlocked = useCallback(
    (capability: SpriteCapabilityState): void => {
      // capability-registry 的 name 为中文数据，按 id 映射到 i18n 文案，未命中时回退原始 name
      const capabilityName = t(`speech:capability.${capability.id}`, { defaultValue: capability.name });
      toast.warning(t('capability.locked', { name: capabilityName }), {
        description: getSpriteCapabilityLockedReason(capability, t)
      });
    },
    [t]
  );

  const handleClose = useCallback((): void => {
    void window.chobits.window['window:close:self']();
  }, []);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!editor) return;

    setIsSaving(true);
    try {
      const result = await saveCharacterPackEditorState(t, editor, packs);
      emitCharacterPackEditorEvent({
        type: 'saved',
        packId: result.pack?.id,
        packName: result.pack?.name ?? editor.draft.pack.name,
        wasActivated: result.wasActivated
      });
      const savedPackName = result.pack?.name ?? editor.draft.pack.name;
      toast.success(editor.activateAfterSave ? t('editor.toast.savedAndActivated', { name: savedPackName }) : t('editor.toast.saved', { name: savedPackName }));
      handleClose();
    } catch (saveError) {
      console.error('Failed to save character pack editor window:', saveError);
      const message = saveError instanceof Error && saveError.message ? saveError.message : t('editor.error.saveFailed');
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }, [editor, handleClose, packs, t]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <DraggableTitle title={<div className="truncate text-xs font-medium">{title || t('editorWindow.fallbackTitle')}</div>} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-border/60 px-6 py-5">
          <div className="text-lg font-semibold text-foreground">{title || t('editorWindow.fallbackTitle')}</div>
          {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <TbLoader2 className="h-4 w-4 animate-spin" />
              {t('editorWindow.loading')}
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{error}</div>
          ) : editor ? (
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'profile' | 'gallery' | 'animations')} className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 border-b border-border/60 px-6 py-3">
                <TabsList>
                  <TabsTrigger value="profile">{t('editorWindow.tabProfile')}</TabsTrigger>
                  <TabsTrigger value="gallery">{t('editorWindow.tabGallery')}</TabsTrigger>
                  <TabsTrigger value="animations">{t('editorWindow.tabAnimations')}</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="profile" className="m-0 min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <CharacterPackEditorContent editor={editor} setEditor={setEditor} />
              </TabsContent>
              <TabsContent value="gallery" className="m-0 min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <CharacterGalleryManager
                  packId={editor.targetPack?.id ?? editor.basePack?.id}
                  source={editor.targetPack?.source ?? editor.basePack?.source}
                  assetAuthoringCapability={assetAuthoringCapability}
                  onCapabilityBlocked={handleCapabilityBlocked}
                />
              </TabsContent>
              <TabsContent value="animations" className="m-0 min-h-0 flex-1 overflow-y-auto px-4 py-5">
                <SpriteAnimationManager assetAuthoringCapability={assetAuthoringCapability} onCapabilityBlocked={handleCapabilityBlocked} />
              </TabsContent>
            </Tabs>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t('editorWindow.empty')}</div>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border/60 px-6 py-4">
          <Button variant="outline" onClick={handleClose} disabled={isSaving}>
            {activeTab === 'profile' ? t('common:action.cancel') : t('editorWindow.close')}
          </Button>
          {activeTab === 'profile' && (
            <Button onClick={() => void handleSave()} disabled={!editor || isLoading || isSaving}>
              {isSaving && <TbLoader2 className="animate-spin" />}
              {t('editor.action.save')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

import type { SpriteCapabilityState } from '@packages/sprite-core/capability-registry';
import type { CharacterPackSummary } from '@packages/sprite-core/character-pack-manager';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

  const loadEditor = useCallback(async (payload?: CharacterPackEditorWindowPayload | null): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const nextPacks = (await window.chobits.character.listCharacterPacks()) ?? [];
      const targetPack = resolveEditorTargetPack(payload, nextPacks);
      const shouldEdit = payload?.mode === 'edit' || !!payload?.packId;
      if (shouldEdit) {
        if (!targetPack) {
          throw new Error('未找到要编辑的角色包。');
        }
        setEditor(await loadCharacterPackEditorStateForPack(targetPack, nextPacks));
      } else {
        const basePack = nextPacks.find((pack) => pack.isActive) ?? nextPacks.find((pack) => pack.source === 'builtin') ?? nextPacks[0] ?? undefined;
        setEditor(buildCreateCharacterPackEditorState(basePack, nextPacks));
      }
      setPacks(nextPacks);
    } catch (loadError) {
      console.error('Failed to load character pack editor window:', loadError);
      const message = loadError instanceof Error && loadError.message ? loadError.message : '读取角色包编辑器失败';
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = (_event: Electron.IpcRendererEvent | null, payload?: CharacterPackEditorWindowPayload): void => {
      void loadEditor(payload);
    };

    window.ipcRenderer?.on('on:window:open:ready', handler);

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
      window.ipcRenderer?.off('on:window:open:ready', handler);
    };
  }, [loadEditor]);

  const title = useMemo(() => getCharacterPackEditorTitle(editor), [editor]);
  const description = useMemo(() => getCharacterPackEditorDescription(editor), [editor]);
  const assetAuthoringCapability = useMemo(() => getSpriteCapabilityState(capabilitySnapshot, 'spriteManage'), [capabilitySnapshot]);

  const handleCapabilityBlocked = useCallback((capability: SpriteCapabilityState): void => {
    toast.warning(`${capability.name} 尚未解锁`, {
      description: getSpriteCapabilityLockedReason(capability)
    });
  }, []);

  const handleClose = useCallback((): void => {
    void window.chobits.window['window:close:self']();
  }, []);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!editor) return;

    setIsSaving(true);
    try {
      const result = await saveCharacterPackEditorState(editor, packs);
      emitCharacterPackEditorEvent({
        type: 'saved',
        packId: result.pack?.id,
        packName: result.pack?.name ?? editor.draft.pack.name,
        wasActivated: result.wasActivated
      });
      toast.success(editor.activateAfterSave ? `${result.pack?.name ?? editor.draft.pack.name} 已保存并切换` : `${result.pack?.name ?? editor.draft.pack.name} 已保存`);
      handleClose();
    } catch (saveError) {
      console.error('Failed to save character pack editor window:', saveError);
      const message = saveError instanceof Error && saveError.message ? saveError.message : '保存角色包失败';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }, [editor, handleClose, packs]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      <DraggableTitle title={<div className="truncate text-xs font-medium">{title || '角色包编辑'}</div>} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-border/60 px-6 py-5">
          <div className="text-lg font-semibold text-foreground">{title || '角色包编辑'}</div>
          {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <TbLoader2 className="h-4 w-4 animate-spin" />
              正在读取角色包...
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{error}</div>
          ) : editor ? (
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'profile' | 'gallery' | 'animations')} className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 border-b border-border/60 px-6 py-3">
                <TabsList>
                  <TabsTrigger value="profile">角色资料</TabsTrigger>
                  <TabsTrigger value="gallery">角色图集</TabsTrigger>
                  <TabsTrigger value="animations">精灵动画</TabsTrigger>
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
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">没有可编辑的角色包。</div>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-border/60 px-6 py-4">
          <Button variant="outline" onClick={handleClose} disabled={isSaving}>
            {activeTab === 'profile' ? '取消' : '关闭'}
          </Button>
          {activeTab === 'profile' && (
            <Button onClick={() => void handleSave()} disabled={!editor || isLoading || isSaving}>
              {isSaving && <TbLoader2 className="animate-spin" />}
              保存角色包
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

import type { SpriteCapabilityState } from '@packages/sprite-core/capability-registry';
import type { CharacterGalleryItem, CharacterGalleryItemDraft, CharacterGalleryItemKind, CharacterGalleryReferenceRole, CharacterGalleryViewAngle } from '@packages/sprite-core/character-gallery';
import type { CharacterPackSource } from '@packages/sprite-core/character-pack-manager';
import type { TFunction } from 'i18next';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TbChevronLeft, TbChevronRight, TbEdit, TbPencil, TbPhotoPlus, TbRefresh, TbTrash } from 'react-icons/tb';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ensureSpriteCapabilityAccessible } from '@/features/sprite/capability-guard';
import { SpriteCapabilityLockedNotice } from '@/features/sprite/capability-ui';
import { makeResSrc } from '@/lib/resource-protocol';
import { cn } from '@/lib/utils';

import { joinEditorLines, splitEditorLines } from './character-pack-editor-model';

interface CharacterGalleryManagerProps {
  packId?: string;
  source?: CharacterPackSource;
  assetAuthoringCapability?: SpriteCapabilityState | null;
  onCapabilityBlocked?: (capability: SpriteCapabilityState) => void;
}

interface CharacterGalleryListState {
  pack: {
    id: string;
    name: string;
    source: CharacterPackSource;
    rootDir: string;
    isWritable: boolean;
  };
  indexPath: string;
  items: CharacterGalleryItem[];
}

type GalleryDialogMode = 'add' | 'edit';

interface GalleryDraftState {
  title: string;
  description: string;
  kind: CharacterGalleryItemKind;
  action: string;
  view: CharacterGalleryViewAngle | '';
  emotion: string;
  propName: string;
  customLabel: string;
  tags: string;
  referenceRole: CharacterGalleryReferenceRole;
  promptHint: string;
  negativePrompt: string;
  preserveIdentity: boolean;
  referenceStrength: string;
}

const KIND_OPTIONS: Array<{ value: CharacterGalleryItemKind; labelKey: string }> = [
  { value: 'pose', labelKey: 'kind.pose' },
  { value: 'action', labelKey: 'kind.action' },
  { value: 'expression', labelKey: 'kind.expression' },
  { value: 'prop', labelKey: 'kind.prop' },
  { value: 'outfit', labelKey: 'kind.outfit' },
  { value: 'reference', labelKey: 'kind.reference' },
  { value: 'background', labelKey: 'kind.background' },
  { value: 'custom', labelKey: 'kind.custom' }
];

const VIEW_OPTIONS: Array<{ value: CharacterGalleryViewAngle; labelKey: string }> = [
  { value: 'front', labelKey: 'view.front' },
  { value: 'back', labelKey: 'view.back' },
  { value: 'left', labelKey: 'view.left' },
  { value: 'right', labelKey: 'view.right' },
  { value: 'three-quarter-left', labelKey: 'view.threeQuarterLeft' },
  { value: 'three-quarter-right', labelKey: 'view.threeQuarterRight' },
  { value: 'top', labelKey: 'view.top' },
  { value: 'bottom', labelKey: 'view.bottom' },
  { value: 'custom', labelKey: 'view.custom' }
];

const REFERENCE_ROLE_OPTIONS: Array<{ value: CharacterGalleryReferenceRole; labelKey: string }> = [
  { value: 'character', labelKey: 'referenceRole.character' },
  { value: 'pose', labelKey: 'referenceRole.pose' },
  { value: 'style', labelKey: 'referenceRole.style' },
  { value: 'prop', labelKey: 'referenceRole.prop' },
  { value: 'background', labelKey: 'referenceRole.background' },
  { value: 'storyboard', labelKey: 'referenceRole.storyboard' },
  { value: 'custom', labelKey: 'referenceRole.custom' }
];

function emptyDraft(): GalleryDraftState {
  return {
    title: '',
    description: '',
    kind: 'reference',
    action: '',
    view: '',
    emotion: '',
    propName: '',
    customLabel: '',
    tags: '',
    referenceRole: 'character',
    promptHint: '',
    negativePrompt: '',
    preserveIdentity: true,
    referenceStrength: '0.8'
  };
}

function draftFromItem(item: CharacterGalleryItem): GalleryDraftState {
  return {
    title: item.title,
    description: item.description ?? '',
    kind: item.kind,
    action: item.semantic?.action ?? '',
    view: item.semantic?.view ?? '',
    emotion: item.semantic?.emotion ?? '',
    propName: item.semantic?.propName ?? '',
    customLabel: item.semantic?.customLabel ?? '',
    tags: joinEditorLines(item.tags),
    referenceRole: item.ai?.referenceRole ?? 'character',
    promptHint: item.ai?.promptHint ?? '',
    negativePrompt: item.ai?.negativePrompt ?? '',
    preserveIdentity: item.ai?.preserveIdentity ?? true,
    referenceStrength: String(item.ai?.referenceStrength ?? 0.8)
  };
}

function toItemDraft(draft: GalleryDraftState): CharacterGalleryItemDraft {
  const referenceStrength = Number(draft.referenceStrength);
  return {
    title: draft.title.trim(),
    ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    kind: draft.kind,
    semantic: {
      ...(draft.action.trim() ? { action: draft.action.trim() } : {}),
      ...(draft.view ? { view: draft.view } : {}),
      ...(draft.emotion.trim() ? { emotion: draft.emotion.trim() } : {}),
      ...(draft.propName.trim() ? { propName: draft.propName.trim() } : {}),
      ...(draft.customLabel.trim() ? { customLabel: draft.customLabel.trim() } : {})
    },
    tags: splitEditorLines(draft.tags.replace(/[,，]/g, '\n')),
    ai: {
      referenceRole: draft.referenceRole,
      preserveIdentity: draft.preserveIdentity,
      referenceStrength: Number.isFinite(referenceStrength) ? Math.min(1, Math.max(0, referenceStrength)) : 0.8,
      ...(draft.promptHint.trim() ? { promptHint: draft.promptHint.trim() } : {}),
      ...(draft.negativePrompt.trim() ? { negativePrompt: draft.negativePrompt.trim() } : {})
    }
  };
}

function getKindLabel(t: TFunction, kind: CharacterGalleryItemKind): string {
  const option = KIND_OPTIONS.find((entry) => entry.value === kind);
  return option ? t(option.labelKey) : kind;
}

function makeFullSrc(item: CharacterGalleryItem): string {
  return makeResSrc(item.source.localPath);
}

function makeThumbSrc(item: CharacterGalleryItem): string {
  return makeResSrc(item.thumbnail?.localPath || item.source.localPath);
}

function fileName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || filePath;
}

function itemSearchText(item: CharacterGalleryItem): string {
  return [
    item.title,
    item.id,
    item.description,
    item.kind,
    item.semantic?.action,
    item.semantic?.view,
    item.semantic?.emotion,
    item.semantic?.propName,
    item.semantic?.customLabel,
    item.ai?.referenceRole,
    item.ai?.promptHint,
    ...(item.tags ?? [])
  ]
    .filter((value): value is string => typeof value === 'string')
    .join('\n')
    .toLowerCase();
}

function IconTooltipButton({
  'aria-label': ariaLabel,
  className,
  label,
  children,
  ...props
}: React.ComponentProps<typeof Button> & {
  label: string;
}): JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button {...props} aria-label={ariaLabel ?? label} className={cn(props.size === 'sm' ? 'w-8 h-8' : undefined, className)}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export default function CharacterGalleryManager({ packId, source, assetAuthoringCapability, onCapabilityBlocked }: CharacterGalleryManagerProps): JSX.Element {
  const [state, setState] = useState<CharacterGalleryListState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<CharacterGalleryItem | null>(null);
  const [dialogMode, setDialogMode] = useState<GalleryDialogMode | null>(null);
  const [draft, setDraft] = useState<GalleryDraftState>(emptyDraft);
  const [pendingFilePath, setPendingFilePath] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const { t } = useTranslation('character');
  const canWrite = !!state?.pack.isWritable && assetAuthoringCapability?.status !== 'locked';
  const lockedTitle =
    assetAuthoringCapability?.status === 'locked' ? t('capability.locked', { name: assetAuthoringCapability.name }) : state?.pack.isWritable === false ? t('gallery.builtinLockedTitle') : undefined;

  const refresh = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const result = await window.chobits.character.listCharacterGallery({ packId, source });
      setState(result);
    } catch (error) {
      console.warn('[CharacterGalleryManager] list failed', error);
      toast.error(t('gallery.toast.loadFailed'), {
        description: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setIsLoading(false);
    }
  }, [packId, source, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 依赖变化时异步刷新图集列表,加载态切换是有意的
    void refresh();
  }, [refresh]);

  const filteredItems = useMemo(() => {
    const items = state?.items ?? [];
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) => itemSearchText(item).includes(normalized));
  }, [query, state?.items]);

  const selectedIndex = useMemo(() => filteredItems.findIndex((item) => item.id === selected?.id), [filteredItems, selected?.id]);
  const previewItem = selectedIndex >= 0 ? filteredItems[selectedIndex] : selected;

  const ensureCanWrite = useCallback((): boolean => {
    if (!ensureSpriteCapabilityAccessible(assetAuthoringCapability, onCapabilityBlocked)) {
      return false;
    }
    if (state?.pack.isWritable === false) {
      toast.warning(t('gallery.toast.builtinReadonly'), {
        description: t('gallery.toast.builtinReadonlyDescription')
      });
      return false;
    }
    return true;
  }, [assetAuthoringCapability, onCapabilityBlocked, state?.pack.isWritable, t]);

  const openAddDialog = useCallback(async (): Promise<void> => {
    if (!ensureCanWrite()) return;
    const pick = await window.chobits.file['file:pick-file']({
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      multi: false
    });
    if (!pick.ok || !pick.path) return;
    setPendingFilePath(pick.path);
    setDraft({
      ...emptyDraft(),
      title: fileName(pick.path).replace(/\.[^.]+$/i, '')
    });
    setDialogMode('add');
  }, [ensureCanWrite]);

  const openEditDialog = useCallback(
    (item: CharacterGalleryItem): void => {
      if (!ensureCanWrite()) return;
      setSelected(item);
      setPendingFilePath(null);
      setDraft(draftFromItem(item));
      setDialogMode('edit');
    },
    [ensureCanWrite]
  );

  const closeDialog = useCallback((): void => {
    setDialogMode(null);
    setPendingFilePath(null);
    setIsSaving(false);
  }, []);

  const selectPreviewItem = useCallback((item: CharacterGalleryItem): void => {
    setSelected(item);
    setIsPreviewOpen(true);
  }, []);

  const closePreviewDialog = useCallback((open: boolean): void => {
    setIsPreviewOpen(open);
  }, []);

  const movePreview = useCallback(
    (delta: number): void => {
      if (!filteredItems.length) return;
      const currentIndex = selectedIndex >= 0 ? selectedIndex : 0;
      const nextIndex = (currentIndex + delta + filteredItems.length) % filteredItems.length;
      setSelected(filteredItems[nextIndex]);
      setIsPreviewOpen(true);
    },
    [filteredItems, selectedIndex]
  );

  const saveDialog = useCallback(async (): Promise<void> => {
    if (!ensureCanWrite() || !dialogMode) return;
    if (!draft.title.trim()) {
      toast.warning(t('gallery.toast.titleRequired'));
      return;
    }

    setIsSaving(true);
    try {
      if (dialogMode === 'add') {
        if (!pendingFilePath) throw new Error(t('gallery.toast.missingFile'));
        await window.chobits.character.importCharacterGalleryItem({
          packId,
          source,
          filePath: pendingFilePath,
          draft: toItemDraft(draft)
        });
        toast.success(t('gallery.toast.added'));
      } else if (selected) {
        const result = await window.chobits.character.updateCharacterGalleryItem({
          packId,
          source,
          itemId: selected.id,
          patch: toItemDraft(draft)
        });
        if (!result?.ok) throw new Error(t('gallery.toast.saveFailed'));
        toast.success(t('gallery.toast.saved'));
      }
      await refresh();
      closeDialog();
    } catch (error) {
      toast.error(t('gallery.toast.saveFailed'), {
        description: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setIsSaving(false);
    }
  }, [closeDialog, dialogMode, draft, ensureCanWrite, packId, pendingFilePath, refresh, selected, source, t]);

  const replaceImage = useCallback(
    async (item: CharacterGalleryItem): Promise<void> => {
      if (!ensureCanWrite()) return;
      const pick = await window.chobits.file['file:pick-file']({
        filters: [
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        multi: false
      });
      if (!pick.ok || !pick.path) return;
      const result = await window.chobits.character.replaceCharacterGalleryItemImage({
        packId,
        source,
        itemId: item.id,
        filePath: pick.path,
        origin: {
          type: 'derived',
          parentId: item.id,
          sourceName: fileName(pick.path)
        }
      });
      if (!result?.ok) {
        toast.error(t('gallery.toast.replaceFailed'));
        return;
      }
      await refresh();
      setSelected(result.item ?? item);
      toast.success(t('gallery.toast.replaced'));
    },
    [ensureCanWrite, packId, refresh, source, t]
  );

  const removeItem = useCallback(
    async (item: CharacterGalleryItem): Promise<boolean> => {
      if (!ensureCanWrite()) return false;
      const result = await window.chobits.character.removeCharacterGalleryItem({
        packId,
        source,
        itemId: item.id,
        deleteFile: true
      });
      if (!result?.ok) {
        toast.error(t('gallery.toast.removeFailed'));
        return false;
      }
      if (selected?.id === item.id) {
        setSelected(null);
        setIsPreviewOpen(false);
      }
      await refresh();
      toast.success(t('gallery.toast.removed'));
      return true;
    },
    [ensureCanWrite, packId, refresh, selected?.id, source, t]
  );

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <SpriteCapabilityLockedNotice capability={assetAuthoringCapability} hint={t('gallery.lockedHint')} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-foreground">{t('gallery.title')}</div>
            <div className="text-xs text-muted-foreground">{state ? t('gallery.itemCount', { name: state.pack.name, count: state.items.length }) : t('gallery.loading')}</div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-8 w-56" placeholder={t('gallery.searchPlaceholder')} />
            <Button type="button" size="sm" onClick={() => void openAddDialog()} disabled={!canWrite} title={lockedTitle}>
              <TbPhotoPlus />
              {t('gallery.action.import')}
            </Button>
            <IconTooltipButton label={t('gallery.action.refresh')} type="button" size="sm" variant="outline" onClick={() => void refresh()} disabled={isLoading}>
              <TbRefresh />
            </IconTooltipButton>
          </div>
        </div>

        {state?.pack.isWritable === false && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">{t('gallery.builtinNotice')}</div>
        )}

        {filteredItems.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className="group flex flex-col overflow-hidden rounded-md border border-border/60 bg-muted/20 text-left transition-colors hover:border-primary/50 hover:bg-muted/40"
                onClick={() => selectPreviewItem(item)}
              >
                <div className="flex aspect-square items-center justify-center overflow-hidden bg-muted/60">
                  <img src={makeThumbSrc(item)} alt={item.title} loading="lazy" className="max-h-full max-w-full object-contain" draggable={false} />
                </div>
                <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <span className="truncate text-xs text-foreground">{item.title}</span>
                  <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">
                    {getKindLabel(t, item.kind)}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border/60 px-3 py-8 text-center text-xs text-muted-foreground">{isLoading ? t('gallery.loadingItems') : t('gallery.empty')}</div>
        )}

        <Dialog open={isPreviewOpen && !!previewItem} onOpenChange={closePreviewDialog}>
          <DialogContent className="flex h-[min(860px,90vh)] w-[min(1120px,calc(100vw-32px))] max-w-none flex-col gap-0 overflow-hidden p-0">
            {previewItem ? (
              <>
                <DialogHeader className="border-b border-border/60 px-5 py-4 pr-14">
                  <div className="min-w-0">
                    <DialogTitle className="truncate text-base">{previewItem.title}</DialogTitle>
                    <DialogDescription className="truncate">{fileName(previewItem.source.localPath)}</DialogDescription>
                  </div>
                </DialogHeader>

                <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_340px] lg:overflow-hidden">
                  <div className="relative flex min-h-[280px] items-center justify-center bg-muted/60 p-4 lg:min-h-0">
                    <img src={makeFullSrc(previewItem)} alt={previewItem.title} className="max-h-[62vh] w-full object-contain lg:max-h-full" draggable={false} />
                    {filteredItems.length > 1 ? (
                      <>
                        <IconTooltipButton
                          label={t('gallery.action.prev')}
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="absolute left-4 top-1/2 -translate-y-1/2 shadow"
                          onClick={() => movePreview(-1)}
                        >
                          <TbChevronLeft />
                        </IconTooltipButton>
                        <IconTooltipButton
                          label={t('gallery.action.next')}
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="absolute right-4 top-1/2 -translate-y-1/2 shadow"
                          onClick={() => movePreview(1)}
                        >
                          <TbChevronRight />
                        </IconTooltipButton>
                      </>
                    ) : null}
                  </div>

                  <div className="min-h-0 space-y-4 border-t border-border/60 p-4 lg:overflow-y-auto lg:border-l lg:border-t-0">
                    <div>
                      <div className="text-base font-medium text-foreground">{previewItem.title}</div>
                      <div className="mt-1 break-all text-xs text-muted-foreground">{previewItem.id}</div>
                    </div>
                    {previewItem.description ? <div className="text-sm text-muted-foreground">{previewItem.description}</div> : null}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded border px-2 py-1">{t('gallery.detail.kind', { value: getKindLabel(t, previewItem.kind) })}</div>
                      <div className="rounded border px-2 py-1">{t('gallery.detail.view', { value: previewItem.semantic?.view ?? t('gallery.notSet') })}</div>
                      <div className="rounded border px-2 py-1">{t('gallery.detail.action', { value: previewItem.semantic?.action ?? t('gallery.notSet') })}</div>
                      <div className="rounded border px-2 py-1">{t('gallery.detail.emotion', { value: previewItem.semantic?.emotion ?? t('gallery.notSet') })}</div>
                      <div className="rounded border px-2 py-1">{t('gallery.detail.reference', { value: previewItem.ai?.referenceRole ?? 'character' })}</div>
                      <div className="rounded border px-2 py-1">{t('gallery.detail.strength', { value: previewItem.ai?.referenceStrength ?? '0.8' })}</div>
                    </div>
                    {previewItem.tags?.length ? <div className="text-xs text-muted-foreground">{t('gallery.detail.tags', { tags: previewItem.tags.join(', ') })}</div> : null}
                    {previewItem.ai?.promptHint ? <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{previewItem.ai.promptHint}</div> : null}
                    <div className="space-y-2 border-t pt-3">
                      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setIsPreviewOpen(false);
                            openEditDialog(previewItem);
                          }}
                          disabled={!canWrite}
                          title={lockedTitle}
                        >
                          <TbPencil />
                          {t('gallery.action.editMetadata')}
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => void replaceImage(previewItem)} disabled={!canWrite} title={lockedTitle}>
                          <TbEdit />
                          {t('gallery.action.replaceImage')}
                        </Button>
                        <IconTooltipButton
                          label={t('gallery.action.removeImage')}
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => void removeItem(previewItem)}
                          disabled={!canWrite}
                          title={lockedTitle}
                        >
                          <TbTrash />
                        </IconTooltipButton>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog open={!!dialogMode} onOpenChange={(open) => (!open ? closeDialog() : undefined)}>
          <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{dialogMode === 'add' ? t('gallery.dialog.addTitle') : t('gallery.dialog.editTitle')}</DialogTitle>
              <DialogDescription>{pendingFilePath ? fileName(pendingFilePath) : selected?.id}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('gallery.field.name')}</Label>
                <Input value={draft.title} onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t('gallery.field.kind')}</Label>
                <Select value={draft.kind} onValueChange={(value) => setDraft((prev) => ({ ...prev, kind: value as CharacterGalleryItemKind }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KIND_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('gallery.field.action')}</Label>
                <Input value={draft.action} onChange={(event) => setDraft((prev) => ({ ...prev, action: event.target.value }))} placeholder="idle / walk-left / jump / point" />
              </div>
              <div className="space-y-2">
                <Label>{t('gallery.field.view')}</Label>
                <Select value={draft.view || 'none'} onValueChange={(value) => setDraft((prev) => ({ ...prev, view: value === 'none' ? '' : (value as CharacterGalleryViewAngle) }))}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('gallery.notSet')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('gallery.notSet')}</SelectItem>
                    {VIEW_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('gallery.field.emotion')}</Label>
                <Input value={draft.emotion} onChange={(event) => setDraft((prev) => ({ ...prev, emotion: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t('gallery.field.propName')}</Label>
                <Input value={draft.propName} onChange={(event) => setDraft((prev) => ({ ...prev, propName: event.target.value }))} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t('gallery.field.description')}</Label>
                <Textarea value={draft.description} onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t('gallery.field.tags')}</Label>
                <Input value={draft.tags} onChange={(event) => setDraft((prev) => ({ ...prev, tags: event.target.value }))} placeholder={t('gallery.field.tagsPlaceholder')} />
              </div>
              <div className="space-y-2">
                <Label>{t('gallery.field.referenceRole')}</Label>
                <Select value={draft.referenceRole} onValueChange={(value) => setDraft((prev) => ({ ...prev, referenceRole: value as CharacterGalleryReferenceRole }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REFERENCE_ROLE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('gallery.field.referenceStrength')}</Label>
                <Input type="number" min={0} max={1} step={0.05} value={draft.referenceStrength} onChange={(event) => setDraft((prev) => ({ ...prev, referenceStrength: event.target.value }))} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t('gallery.field.promptHint')}</Label>
                <Textarea className="min-h-20" value={draft.promptHint} onChange={(event) => setDraft((prev) => ({ ...prev, promptHint: event.target.value }))} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t('gallery.field.negativePrompt')}</Label>
                <Textarea className="min-h-20" value={draft.negativePrompt} onChange={(event) => setDraft((prev) => ({ ...prev, negativePrompt: event.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog} disabled={isSaving}>
                {t('common:action.cancel')}
              </Button>
              <Button type="button" onClick={() => void saveDialog()} disabled={isSaving}>
                {isSaving ? t('gallery.action.saving') : t('common:action.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

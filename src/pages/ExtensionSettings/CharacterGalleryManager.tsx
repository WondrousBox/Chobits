import type { SpriteCapabilityState } from '@packages/sprite-core/capability-registry';
import type {
  CharacterGalleryAIEditContext,
  CharacterGalleryItem,
  CharacterGalleryItemDraft,
  CharacterGalleryItemKind,
  CharacterGalleryReferenceRole,
  CharacterGalleryViewAngle
} from '@packages/sprite-core/character-gallery';
import type { CharacterPackSource } from '@packages/sprite-core/character-pack-manager';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TbEdit, TbPencil, TbPhotoPlus, TbRefresh, TbSend, TbTrash } from 'react-icons/tb';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ensureSpriteCapabilityAccessible, SpriteCapabilityLockedNotice } from '@/features/sprite-assistant/capability-ui';
import { cn } from '@/lib/utils';
import { makeResSrc } from '@/pages/ResourcePage/utils/resourceProtocol';

import CharacterImageStudio from './CharacterImageStudio';
import { joinEditorLines, splitEditorLines } from './SpritePackEditorModel';

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
    writable: boolean;
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

const KIND_OPTIONS: Array<{ value: CharacterGalleryItemKind; label: string }> = [
  { value: 'pose', label: '姿势' },
  { value: 'action', label: '动作' },
  { value: 'expression', label: '表情' },
  { value: 'prop', label: '道具' },
  { value: 'outfit', label: '服装' },
  { value: 'reference', label: '参考' },
  { value: 'background', label: '背景' },
  { value: 'custom', label: '自定义' }
];

const VIEW_OPTIONS: Array<{ value: CharacterGalleryViewAngle; label: string }> = [
  { value: 'front', label: '正面' },
  { value: 'back', label: '背面' },
  { value: 'left', label: '左侧' },
  { value: 'right', label: '右侧' },
  { value: 'three-quarter-left', label: '左前 3/4' },
  { value: 'three-quarter-right', label: '右前 3/4' },
  { value: 'top', label: '俯视' },
  { value: 'bottom', label: '仰视' },
  { value: 'custom', label: '自定义角度' }
];

const REFERENCE_ROLE_OPTIONS: Array<{ value: CharacterGalleryReferenceRole; label: string }> = [
  { value: 'character', label: '角色一致性' },
  { value: 'pose', label: '姿势参考' },
  { value: 'style', label: '画风参考' },
  { value: 'prop', label: '道具参考' },
  { value: 'background', label: '背景参考' },
  { value: 'storyboard', label: '分镜参考' },
  { value: 'custom', label: '自定义' }
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

function getKindLabel(kind: CharacterGalleryItemKind): string {
  return KIND_OPTIONS.find((option) => option.value === kind)?.label ?? kind;
}

function makeGallerySrc(item: CharacterGalleryItem): string {
  return makeResSrc(item.thumbnail?.localPath || item.source.localPath);
}

function makeFullSrc(item: CharacterGalleryItem): string {
  return makeResSrc(item.source.localPath);
}

function fileName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || filePath;
}

function IconTooltipButton({
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
        <Button {...props} className={cn(props.size === 'sm' ? 'w-8 h-8' : undefined, className)}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export default function CharacterGalleryManager({ packId, source, assetAuthoringCapability, onCapabilityBlocked }: CharacterGalleryManagerProps): JSX.Element {
  const [state, setState] = useState<CharacterGalleryListState | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<CharacterGalleryItem | null>(null);
  const [dialogMode, setDialogMode] = useState<GalleryDialogMode | null>(null);
  const [draft, setDraft] = useState<GalleryDraftState>(emptyDraft);
  const [pendingFilePath, setPendingFilePath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiContext, setAiContext] = useState<CharacterGalleryAIEditContext | null>(null);
  const canWrite = !!state?.pack.writable && assetAuthoringCapability?.status !== 'locked';
  const lockedTitle =
    assetAuthoringCapability?.status === 'locked' ? `${assetAuthoringCapability.name} 尚未解锁` : state?.pack.writable === false ? '内置角色包需要另存为本地版本后才能编辑图集' : undefined;

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const result = await window.YUA.persona.listCharacterGallery({ packId, source });
      setState(result);
    } catch (error) {
      console.warn('[CharacterGalleryManager] list failed', error);
      toast.error('读取角色图集失败', {
        description: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setLoading(false);
    }
  }, [packId, source]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredItems = useMemo(() => {
    const items = state?.items ?? [];
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items;
    return items.filter((item) =>
      [item.title, item.id, item.description, item.kind, item.semantic?.action, item.semantic?.view, item.semantic?.emotion, item.semantic?.propName, item.semantic?.customLabel, ...(item.tags ?? [])]
        .filter((value): value is string => typeof value === 'string')
        .join('\n')
        .toLowerCase()
        .includes(normalized)
    );
  }, [query, state?.items]);

  const ensureCanWrite = useCallback((): boolean => {
    if (!ensureSpriteCapabilityAccessible(assetAuthoringCapability, onCapabilityBlocked)) {
      return false;
    }
    if (state?.pack.writable === false) {
      toast.warning('内置角色包不可直接编辑', {
        description: '请先在角色资料中保存成本地自定义角色包，再维护角色图集。'
      });
      return false;
    }
    return true;
  }, [assetAuthoringCapability, onCapabilityBlocked, state?.pack.writable]);

  const openAddDialog = useCallback(async (): Promise<void> => {
    if (!ensureCanWrite()) return;
    const pick = await window.YUA.file['file:pickFile']({
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      multi: false
    });
    if (pick.canceled || !pick.path) return;
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
    setSaving(false);
  }, []);

  const saveDialog = useCallback(async (): Promise<void> => {
    if (!ensureCanWrite() || !dialogMode) return;
    if (!draft.title.trim()) {
      toast.warning('图集条目需要一个名称');
      return;
    }

    setSaving(true);
    try {
      if (dialogMode === 'add') {
        if (!pendingFilePath) throw new Error('缺少要导入的图片文件');
        await window.YUA.persona.importCharacterGalleryItem({
          packId,
          source,
          filePath: pendingFilePath,
          draft: toItemDraft(draft)
        });
        toast.success('图片已加入角色图集');
      } else if (selected) {
        const result = await window.YUA.persona.updateCharacterGalleryItem({
          packId,
          source,
          itemId: selected.id,
          patch: toItemDraft(draft)
        });
        if (!result?.ok) throw new Error('保存图集条目失败');
        toast.success('图集条目已保存');
      }
      await refresh();
      closeDialog();
    } catch (error) {
      toast.error('保存图集条目失败', {
        description: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setSaving(false);
    }
  }, [closeDialog, dialogMode, draft, ensureCanWrite, packId, pendingFilePath, refresh, selected, source]);

  const replaceImage = useCallback(
    async (item: CharacterGalleryItem): Promise<void> => {
      if (!ensureCanWrite()) return;
      const pick = await window.YUA.file['file:pickFile']({
        filters: [
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        multi: false
      });
      if (pick.canceled || !pick.path) return;
      const result = await window.YUA.persona.replaceCharacterGalleryItemImage({
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
        toast.error('替换图集图片失败');
        return;
      }
      await refresh();
      setSelected(result.item ?? item);
      toast.success('图集图片已替换');
    },
    [ensureCanWrite, packId, refresh, source]
  );

  const removeItem = useCallback(
    async (item: CharacterGalleryItem): Promise<void> => {
      if (!ensureCanWrite()) return;
      const result = await window.YUA.persona.removeCharacterGalleryItem({
        packId,
        source,
        itemId: item.id,
        deleteFile: true
      });
      if (!result?.ok) {
        toast.error('删除图集条目失败');
        return;
      }
      if (selected?.id === item.id) {
        setSelected(null);
      }
      await refresh();
      toast.success('图集条目已删除');
    },
    [ensureCanWrite, packId, refresh, selected?.id, source]
  );

  const buildAIContext = useCallback(async (): Promise<void> => {
    const target = selected ?? filteredItems[0];
    if (!target) {
      toast.warning('请先选择一张图集图片');
      return;
    }
    const prompt = aiPrompt.trim() || target.ai?.promptHint || `以「${target.title}」作为角色参考，保持角色身份一致，生成新的动作或分镜。`;
    const context = await window.YUA.persona.buildCharacterGalleryAIEditContext({
      packId,
      source,
      draft: {
        itemIds: [target.id],
        prompt,
        negativePrompt: target.ai?.negativePrompt
      }
    });
    setAiContext(context);
    toast.success('已整理 AI 编辑上下文');
  }, [aiPrompt, filteredItems, packId, selected, source]);

  const copyAIContext = useCallback(async (): Promise<void> => {
    if (!aiContext) return;
    await navigator.clipboard.writeText(JSON.stringify(aiContext, null, 2));
    toast.success('AI 上下文已复制');
  }, [aiContext]);

  const handleAIImageChanged = useCallback(
    async (item?: CharacterGalleryItem): Promise<void> => {
      await refresh();
      if (item) {
        setSelected(item);
      }
    },
    [refresh]
  );

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <SpriteCapabilityLockedNotice capability={assetAuthoringCapability} hint="角色图集属于角色包资产管理，未解锁时可以查看，但不能导入、编辑、替换或删除图片。" />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-foreground">角色参考图集</div>
            <div className="text-xs text-muted-foreground">{state ? `${state.pack.name} · ${state.items.length} 张图片` : '读取角色包图集...'}</div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-8 w-56" placeholder="搜索名称、动作、角度、标签" />
            <IconTooltipButton label="刷新图集" type="button" size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
              <TbRefresh />
            </IconTooltipButton>
            <Button type="button" size="sm" onClick={() => void openAddDialog()} disabled={!canWrite} title={lockedTitle}>
              <TbPhotoPlus />
              添加图片
            </Button>
          </div>
        </div>

        {state?.pack.writable === false && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
            当前是内置角色包，图集仅可预览。保存为本地自定义角色包后可以导入、替换和编辑图片。
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-h-[360px] rounded-md border border-border/60 p-3">
            {loading ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">正在读取图集...</div>
            ) : filteredItems.length > 0 ? (
              <div className="grid content-start gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {filteredItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`group overflow-hidden rounded-md border bg-card text-left transition ${selected?.id === item.id ? 'border-primary ring-1 ring-primary' : 'border-border/60 hover:border-primary/50'}`}
                    onClick={() => setSelected(item)}
                  >
                    <div className="relative aspect-square bg-muted">
                      <img src={makeGallerySrc(item)} alt={item.title} className="h-full w-full object-contain" draggable={false} />
                      <div className="absolute left-2 top-2 rounded bg-background/90 px-2 py-0.5 text-[10px] font-medium text-foreground shadow">{getKindLabel(item.kind)}</div>
                    </div>
                    <div className="space-y-1 p-2">
                      <div className="truncate text-sm font-medium text-foreground">{item.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{item.semantic?.action || item.semantic?.view || item.semantic?.emotion || item.tags?.join(', ') || item.id}</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex h-64 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                <div>{query.trim() ? '没有匹配的图集图片' : '这个角色包还没有图集图片'}</div>
                <Button type="button" size="sm" onClick={() => void openAddDialog()} disabled={!canWrite} title={lockedTitle}>
                  <TbPhotoPlus />
                  添加第一张
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-md border border-border/60 p-3">
            {selected ? (
              <>
                <div className="overflow-hidden rounded-md border bg-muted">
                  <img src={makeFullSrc(selected)} alt={selected.title} className="max-h-[360px] w-full object-contain" draggable={false} />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">{selected.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground break-all">{fileName(selected.source.localPath)}</div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded border px-2 py-1">类型：{getKindLabel(selected.kind)}</div>
                  <div className="rounded border px-2 py-1">角度：{selected.semantic?.view ?? '未设置'}</div>
                  <div className="rounded border px-2 py-1">动作：{selected.semantic?.action ?? '未设置'}</div>
                  <div className="rounded border px-2 py-1">参考：{selected.ai?.referenceRole ?? 'character'}</div>
                </div>
                {selected.tags?.length ? <div className="text-xs text-muted-foreground">标签：{selected.tags.join(', ')}</div> : null}
                {selected.ai?.promptHint ? <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{selected.ai.promptHint}</div> : null}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => openEditDialog(selected)} disabled={!canWrite} title={lockedTitle}>
                    <TbPencil />
                    编辑元数据
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => void replaceImage(selected)} disabled={!canWrite} title={lockedTitle}>
                    <TbEdit />
                    替换图片
                  </Button>
                  <IconTooltipButton label="删除图片" type="button" size="sm" variant="destructive" onClick={() => void removeItem(selected)} disabled={!canWrite} title={lockedTitle}>
                    <TbTrash />
                  </IconTooltipButton>
                </div>
                <div className="space-y-2 border-t pt-3">
                  <Label className="text-xs text-muted-foreground">发送给 AI 的编辑意图</Label>
                  <Textarea className="min-h-20" value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} placeholder="例如：保持角色一致，生成向右奔跑的分镜参考。" />
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={() => void buildAIContext()}>
                      <TbSend />
                      整理上下文
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => void copyAIContext()} disabled={!aiContext}>
                      复制 JSON
                    </Button>
                  </div>
                  {aiContext && <Textarea className="max-h-48 min-h-28 font-mono text-xs" value={JSON.stringify(aiContext, null, 2)} readOnly />}
                </div>
              </>
            ) : (
              <div className="flex h-full min-h-[360px] items-center justify-center text-sm text-muted-foreground">选择一张图片查看详情</div>
            )}
          </div>
        </div>

        <CharacterImageStudio canWrite={canWrite} lockedTitle={lockedTitle} packId={packId} selected={selected} source={source} onChanged={handleAIImageChanged} />

        <Dialog open={!!dialogMode} onOpenChange={(open) => (!open ? closeDialog() : undefined)}>
          <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{dialogMode === 'add' ? '添加图集图片' : '编辑图集图片'}</DialogTitle>
              <DialogDescription>{pendingFilePath ? fileName(pendingFilePath) : selected?.id}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>名称</Label>
                <Input value={draft.title} onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>类型</Label>
                <Select value={draft.kind} onValueChange={(value) => setDraft((prev) => ({ ...prev, kind: value as CharacterGalleryItemKind }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KIND_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>动作</Label>
                <Input value={draft.action} onChange={(event) => setDraft((prev) => ({ ...prev, action: event.target.value }))} placeholder="idle / walk-left / jump / point" />
              </div>
              <div className="space-y-2">
                <Label>角度</Label>
                <Select value={draft.view || 'none'} onValueChange={(value) => setDraft((prev) => ({ ...prev, view: value === 'none' ? '' : (value as CharacterGalleryViewAngle) }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="未设置" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">未设置</SelectItem>
                    {VIEW_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>表情</Label>
                <Input value={draft.emotion} onChange={(event) => setDraft((prev) => ({ ...prev, emotion: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>道具名</Label>
                <Input value={draft.propName} onChange={(event) => setDraft((prev) => ({ ...prev, propName: event.target.value }))} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>描述</Label>
                <Textarea value={draft.description} onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>标签</Label>
                <Input value={draft.tags} onChange={(event) => setDraft((prev) => ({ ...prev, tags: event.target.value }))} placeholder="多个标签用逗号或换行分隔" />
              </div>
              <div className="space-y-2">
                <Label>AI 参考角色</Label>
                <Select value={draft.referenceRole} onValueChange={(value) => setDraft((prev) => ({ ...prev, referenceRole: value as CharacterGalleryReferenceRole }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REFERENCE_ROLE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>参考强度</Label>
                <Input type="number" min={0} max={1} step={0.05} value={draft.referenceStrength} onChange={(event) => setDraft((prev) => ({ ...prev, referenceStrength: event.target.value }))} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>AI 提示补充</Label>
                <Textarea className="min-h-20" value={draft.promptHint} onChange={(event) => setDraft((prev) => ({ ...prev, promptHint: event.target.value }))} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>负面提示</Label>
                <Textarea className="min-h-20" value={draft.negativePrompt} onChange={(event) => setDraft((prev) => ({ ...prev, negativePrompt: event.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog} disabled={saving}>
                取消
              </Button>
              <Button type="button" onClick={() => void saveDialog()} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

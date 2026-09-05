import type { SpriteCapabilityState } from '@packages/sprite-core/capability-registry';
import type {
  SpriteMovementConfig,
  SpriteMovementDirection,
  SpriteMovementMode,
  SpriteMovementTrigger,
  SpriteWindowAnimationDirection,
  SpriteWindowAnimationPresetId
} from '@packages/sprite-core/types';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TbPencil, TbPlayerPlay, TbTrash, TbX } from 'react-icons/tb';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { SpriteAnimation, SpriteAnimationPlaylistMode, SpriteAnimationPlaylistModeMap, SpriteAnimationTrigger } from '@/features/sprite';
import { getPrimarySpriteAnimationTrigger, getSpriteAnimationTriggerAliases, getSpriteAnimationTriggers, normalizeSpriteAnimationPlaylistModeMap, SPRITE_EVENT_TYPES } from '@/features/sprite';
import { ensureSpriteCapabilityAccessible } from '@/features/sprite/capability-guard';
import { SpriteCapabilityLockedNotice } from '@/features/sprite/capability-ui';
import { makeResSrc } from '@/lib/resource-protocol';
import { isWindowAnimationPresetId, WINDOW_ANIMATION_PRESET_DIRECTIONS, WINDOW_ANIMATION_PRESETS } from '@/lib/window-animation-presets';

import CharacterPackManager from './CharacterPackManager';
import { createSpriteAnimationMetaDraft, formatSpriteAnimationConditionInput, formatSpriteTriggerAliasesInput, parseSpriteAnimationConditionInput } from './components/sprite-animation-meta-utils';
import SpriteAnimationConditionBuilder from './components/SpriteAnimationConditionBuilder';
import SpriteAnimationMetaPopover from './components/SpriteAnimationMetaPopover';
import SpriteTriggerPicker from './components/SpriteTriggerPicker';
import SpriteWindowAnimationPositionEditor from './components/SpriteWindowAnimationPositionEditor';

type SpriteLoopMode = 'none' | 'finite' | 'infinite';
const DEFAULT_WINDOW_ANIMATION_PRESET_ID: SpriteWindowAnimationPresetId = 'fly-in';
const DEFAULT_WINDOW_ANIMATION_DIRECTION: SpriteWindowAnimationDirection = 'left';
const DEFAULT_WINDOW_ANIMATION_DURATION = 650;

function getInitialLoopMode(animation: Pick<SpriteAnimation, 'loop' | 'loopCount'>): SpriteLoopMode {
  if (animation.loopCount != null && animation.loopCount > 0) return 'finite';
  return animation.loop === true ? 'infinite' : 'none';
}

function baseName(p: string): string {
  const withoutQuery = p.split(/[?#]/)[0] || p;
  const parts = withoutQuery.replace(/\\/g, '/').split('/');
  const last = parts[parts.length - 1] || '';
  return last;
}

function getPositiveNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : fallback;
}

function getNonNegativeNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

function SpriteAnimationConfigEditor({
  animation,
  assetAuthoringCapability,
  onCapabilityBlocked,
  onClose,
  onSaved
}: {
  animation: SpriteAnimation;
  assetAuthoringCapability?: SpriteCapabilityState | null;
  onCapabilityBlocked?: (capability: SpriteCapabilityState) => void;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}): JSX.Element {
  const { t } = useTranslation('sprite');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [title, setTitle] = useState(animation.meta.title || animation.meta.id);
  const [primaryTrigger, setPrimaryTrigger] = useState<SpriteAnimationTrigger | ''>(getPrimarySpriteAnimationTrigger(animation.meta) || '');
  const [triggerAliasesInput, setTriggerAliasesInput] = useState(formatSpriteTriggerAliasesInput(getSpriteAnimationTriggerAliases(animation.meta)));
  const [priorityInput, setPriorityInput] = useState(animation.meta.priority !== undefined ? String(animation.meta.priority) : '');
  const [conditionInput, setConditionInput] = useState(formatSpriteAnimationConditionInput(animation.meta.condition));
  const [widthInput, setWidthInput] = useState(String(animation.width ?? 180));
  const [heightInput, setHeightInput] = useState(String(animation.height ?? 240));
  const [paddingInput, setPaddingInput] = useState(String(animation.padding ?? 100));
  const [loopMode, setLoopMode] = useState<SpriteLoopMode>(getInitialLoopMode(animation));
  const [loopCountInput, setLoopCountInput] = useState(String(animation.loopCount ?? 1));
  const [autoIdle, setAutoIdle] = useState(animation.autoIdle ?? true);
  const [movement, setMovement] = useState<SpriteMovementConfig>(animation.movement ?? { enabled: false, mode: 'direction', direction: 'random', speed: 60 });
  const canAuthorAnimations = assetAuthoringCapability?.status !== 'locked';
  const parsedCondition = parseSpriteAnimationConditionInput(conditionInput, t);
  const metaDraft = createSpriteAnimationMetaDraft(
    {
      conditionInput,
      primaryTrigger,
      triggerAliasesInput,
      priority: priorityInput
    },
    t
  );
  const width = getPositiveNumber(widthInput, animation.width ?? 180);
  const height = getPositiveNumber(heightInput, animation.height ?? 240);
  const padding = getNonNegativeNumber(paddingInput, animation.padding ?? 100);
  const loopCount = loopMode === 'finite' ? getPositiveNumber(loopCountInput, animation.loopCount ?? 1) : undefined;
  const sourceLabel = animation.source?.localPath ? baseName(animation.source.localPath) : animation.source?.src ? baseName(animation.source.src) : '';
  const movementMode = movement.mode ?? 'direction';
  const windowAnimationPresetId = isWindowAnimationPresetId(movement.windowAnimationPresetId) ? movement.windowAnimationPresetId : DEFAULT_WINDOW_ANIMATION_PRESET_ID;
  const selectedWindowAnimationPreset = WINDOW_ANIMATION_PRESETS.find((preset) => preset.id === windowAnimationPresetId);
  const windowAnimationSupportsDirection = selectedWindowAnimationPreset?.supportsDirection ?? false;

  const handleSave = async (): Promise<void> => {
    if (isSaving || parsedCondition.error) return;
    if (!ensureSpriteCapabilityAccessible(assetAuthoringCapability, onCapabilityBlocked)) return;

    setIsSaving(true);
    setSaveError(null);
    try {
      const result = await window.chobits.sprite.updateConfig(animation.meta.id, {
        width,
        height,
        padding,
        loop: loopMode !== 'none',
        loopCount,
        autoIdle,
        movement: movement.enabled ? movement : undefined,
        meta: {
          title: title.trim() || animation.meta.id,
          primaryTrigger: metaDraft.primaryTrigger,
          triggerAliases: metaDraft.triggerAliases,
          priority: metaDraft.priority,
          condition: metaDraft.condition
        }
      });
      if (!result?.ok) {
        const message = t('sprite:configEditor.toast.saveFailed');
        setSaveError(message);
        toast.error(message);
        return;
      }
      await onSaved();
      onClose();
      toast.success(t('sprite:configEditor.toast.saved'));
    } catch (error) {
      const message = t('sprite:configEditor.toast.saveFailed');
      setSaveError(error instanceof Error ? error.message : message);
      toast.error(message, { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-[100vh] w-[100vw] max-w-[unset] overflow-none fixed top-0 left-0 z-[40] bg-background">
      <div className="p-2 box-border flex justify-between items-center">
        {t('sprite:configEditor.title')}
        <Button size="icon" variant="ghost" onClick={onClose}>
          <TbX />
        </Button>
      </div>
      <div className="overflow-y-auto p-4 space-y-4" style={{ height: 'calc(100% - 52px)' }}>
        <SpriteCapabilityLockedNotice capability={assetAuthoringCapability} hint={t('sprite:configEditor.capabilityHint')} />
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="space-y-2">
            <div className="rounded-md border p-2">
              {animation.source?.localPath || animation.source?.src ? (
                <video
                  className="aspect-[3/4] w-full rounded bg-transparent object-contain"
                  src={animation.source.localPath ? makeResSrc(animation.source.localPath) : animation.source.src}
                  controls
                  muted
                  playsInline
                />
              ) : (
                <div className="aspect-[3/4] w-full rounded bg-muted" />
              )}
            </div>
            <div className="text-xs text-muted-foreground break-all">ID: {animation.meta.id}</div>
            {sourceLabel && (
              <div className="text-xs text-muted-foreground truncate" title={sourceLabel}>
                {sourceLabel}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_240px]">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('sprite:form.name')}</Label>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('sprite:form.primaryTrigger')}</Label>
                <SpriteTriggerPicker value={primaryTrigger} onChange={setPrimaryTrigger} buttonClassName="w-full" emptyLabel={t('sprite:triggerPicker.uncategorized')} />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('sprite:form.width')}</Label>
                <Input type="number" value={widthInput} onChange={(event) => setWidthInput(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('sprite:form.height')}</Label>
                <Input type="number" value={heightInput} onChange={(event) => setHeightInput(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('sprite:configEditor.windowPadding')}</Label>
                <Input type="number" value={paddingInput} onChange={(event) => setPaddingInput(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('sprite:form.priority')}</Label>
                <Input type="number" value={priorityInput} onChange={(event) => setPriorityInput(event.target.value)} placeholder="0" />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <div className="text-sm font-medium">{t('sprite:configEditor.loop.label')}</div>
                  <div className="text-xs text-muted-foreground">{t('sprite:configEditor.loop.description')}</div>
                </div>
                <div className="grid min-w-[220px] gap-2 sm:grid-cols-[1fr_88px]">
                  <Select value={loopMode} onValueChange={(value) => setLoopMode(value as SpriteLoopMode)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('sprite:configEditor.loop.options.none')}</SelectItem>
                      <SelectItem value="finite">{t('sprite:configEditor.loop.options.finite')}</SelectItem>
                      <SelectItem value="infinite">{t('sprite:configEditor.loop.options.infinite')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="number" min={1} step={1} value={loopCountInput} onChange={(event) => setLoopCountInput(event.target.value)} disabled={loopMode !== 'finite'} />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <div className="text-sm font-medium">{t('sprite:configEditor.autoIdle.label')}</div>
                  <div className="text-xs text-muted-foreground">{t('sprite:configEditor.autoIdle.description')}</div>
                </div>
                <Switch checked={autoIdle} onCheckedChange={setAutoIdle} />
              </div>
            </div>

            <div className="space-y-2 rounded-md border px-3 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{t('sprite:configEditor.movement.label')}</div>
                  <div className="text-xs text-muted-foreground">{t('sprite:configEditor.movement.description')}</div>
                </div>
                <Switch checked={movement.enabled} onCheckedChange={(checked) => setMovement((prev) => ({ ...prev, enabled: checked }))} />
              </div>
              {movement.enabled && (
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t('sprite:configEditor.movement.modeLabel')}</Label>
                    <Select
                      value={movementMode}
                      onValueChange={(value) =>
                        setMovement((prev) => ({
                          ...prev,
                          mode: value as SpriteMovementMode,
                          trigger: value === 'windowAnimation' ? 'animation' : prev.trigger
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="direction">{t('sprite:configEditor.movement.modes.direction')}</SelectItem>
                        <SelectItem value="walkTo">{t('sprite:configEditor.movement.modes.walkTo')}</SelectItem>
                        <SelectItem value="windowAnimation">{t('sprite:configEditor.movement.modes.windowAnimation')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {movementMode === 'windowAnimation' ? (
                    <div className="space-y-3 md:col-span-3">
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">{t('sprite:configEditor.movement.preset')}</Label>
                          <Select value={windowAnimationPresetId} onValueChange={(value) => setMovement((prev) => ({ ...prev, windowAnimationPresetId: value as SpriteWindowAnimationPresetId }))}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {WINDOW_ANIMATION_PRESETS.map((preset) => (
                                <SelectItem key={preset.id} value={preset.id}>
                                  {t(`sprite:animation.presets.${preset.id}`)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {windowAnimationSupportsDirection && (
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">{t('sprite:configEditor.movement.direction')}</Label>
                            <Select
                              value={movement.windowAnimationDirection ?? DEFAULT_WINDOW_ANIMATION_DIRECTION}
                              onValueChange={(value) => setMovement((prev) => ({ ...prev, windowAnimationDirection: value as SpriteWindowAnimationDirection }))}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {WINDOW_ANIMATION_PRESET_DIRECTIONS.map((direction) => (
                                  <SelectItem key={direction.value} value={direction.value}>
                                    {t(`sprite:animation.directions.${direction.value}`)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">{t('sprite:configEditor.movement.duration')}</Label>
                          <Input
                            type="number"
                            min={0}
                            step={50}
                            value={movement.windowAnimationDuration ?? DEFAULT_WINDOW_ANIMATION_DURATION}
                            onChange={(event) => setMovement((prev) => ({ ...prev, windowAnimationDuration: Math.max(0, Number(event.target.value) || DEFAULT_WINDOW_ANIMATION_DURATION) }))}
                          />
                        </div>
                      </div>
                      <SpriteWindowAnimationPositionEditor
                        value={movement.windowAnimationPlayPosition}
                        onChange={(value) => setMovement((prev) => ({ ...prev, windowAnimationPlayPosition: value }))}
                      />
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">{t('sprite:configEditor.movement.direction')}</Label>
                        <Select value={movement.direction ?? 'random'} onValueChange={(value) => setMovement((prev) => ({ ...prev, direction: value as SpriteMovementDirection }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="left">{t('sprite:configEditor.movement.directions.left')}</SelectItem>
                            <SelectItem value="right">{t('sprite:configEditor.movement.directions.right')}</SelectItem>
                            <SelectItem value="up">{t('sprite:configEditor.movement.directions.up')}</SelectItem>
                            <SelectItem value="down">{t('sprite:configEditor.movement.directions.down')}</SelectItem>
                            <SelectItem value="up-left">{t('sprite:configEditor.movement.directions.up-left')}</SelectItem>
                            <SelectItem value="up-right">{t('sprite:configEditor.movement.directions.up-right')}</SelectItem>
                            <SelectItem value="down-left">{t('sprite:configEditor.movement.directions.down-left')}</SelectItem>
                            <SelectItem value="down-right">{t('sprite:configEditor.movement.directions.down-right')}</SelectItem>
                            <SelectItem value="random">{t('sprite:configEditor.movement.directions.random')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">{t('sprite:configEditor.movement.speed')}</Label>
                        <Input type="number" value={movement.speed ?? 60} onChange={(event) => setMovement((prev) => ({ ...prev, speed: getPositiveNumber(event.target.value, 60) }))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">{t('sprite:configEditor.movement.triggerLabel')}</Label>
                        <Select value={movement.trigger ?? 'animation'} onValueChange={(value) => setMovement((prev) => ({ ...prev, trigger: value as SpriteMovementTrigger }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="animation">{t('sprite:configEditor.movement.triggers.animation')}</SelectItem>
                            <SelectItem value="behavior">{t('sprite:configEditor.movement.triggers.behavior')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('sprite:form.triggerAliases')}</Label>
              <Input value={triggerAliasesInput} onChange={(event) => setTriggerAliasesInput(event.target.value)} placeholder={t('sprite:form.triggerAliasesPlaceholder')} />
            </div>

            <SpriteAnimationConditionBuilder conditionInput={conditionInput} onChange={setConditionInput} />

            {saveError && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{saveError}</div>}

            <div className="flex items-center justify-end gap-2 border-t pt-4">
              <Button variant="ghost" onClick={onClose} disabled={isSaving}>
                {t('sprite:actions.cancel')}
              </Button>
              <Button onClick={() => void handleSave()} disabled={!canAuthorAnimations || isSaving || !!parsedCondition.error}>
                {isSaving ? t('sprite:actions.saving') : t('sprite:configEditor.saveProperties')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const PLAYLIST_MODE_OPTIONS: SpriteAnimationPlaylistMode[] = ['list-loop', 'list-once'];

// 小型预览组件：只有在 hover 时才真正挂载 <video>，离开时卸载，避免同时占用大量资源
// 精灵预览：静止首帧，hover 播放循环
function SpritePreview({ src, type, width, height }: { src: string; type: string; width: number; height: number }): JSX.Element {
  const { t } = useTranslation('sprite');
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  // 初始：停在首帧
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    try {
      v.currentTime = 0;
    } catch {
      /* noop */
    }
  }, [src]);

  const handleEnter = useCallback(() => {
    const v = videoRef.current;
    if (v) {
      v.loop = true;
      v.play().catch(() => {
        /* noop */
      });
    }
  }, []);

  const handleLeave = useCallback(() => {
    const v = videoRef.current;
    if (v) {
      v.pause();
      try {
        v.currentTime = 0;
      } catch {
        /* noop */
      }
    }
  }, []);

  return (
    <div
      className="group relative inline-block rounded-md overflow-hidden select-none transition cursor-pointer"
      style={{ width, height }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      aria-label={t('sprite:manager.previewHover')}
    >
      <video
        ref={videoRef}
        width={width}
        height={height}
        muted
        playsInline
        // 不自动播放，只有 hover / always 时才 play()
        preload="metadata"
        className="h-full w-full object-cover bg-muted pointer-events-none"
      >
        <source src={src} type={type} />
      </video>
    </div>
  );
}

export function SpriteAnimationManager({
  className,
  assetAuthoringCapability,
  onCapabilityBlocked
}: {
  className?: string;
  assetAuthoringCapability?: SpriteCapabilityState | null;
  onCapabilityBlocked?: (capability: SpriteCapabilityState) => void;
}): JSX.Element {
  const { t } = useTranslation('sprite');
  const [list, setList] = useState<SpriteAnimation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [addingMap, setAddingMap] = useState<Record<string, boolean>>({}); // 某分类中的添加状态
  const [categories, setCategories] = useState<string[]>([]); // 事件分类列表
  const [activeAddCat, setActiveAddCat] = useState<string | null>(null); // 当前触发的添加分类（用于弹窗后回填）
  const [query, setQuery] = useState(''); // 搜索框
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({}); // 分类折叠状态
  const [globalCat, setGlobalCat] = useState<SpriteAnimationTrigger | ''>(''); // 全局导入选择的分类
  // 工具弹窗状态
  // 精灵导入状态
  const [editingSprite, setEditingSprite] = useState<SpriteAnimation | null>(null);
  const [defaultAnimationPlaylistMode, setDefaultAnimationPlaylistMode] = useState<SpriteAnimationPlaylistMode>('list-loop');
  const [animationPlaylistModes, setAnimationPlaylistModes] = useState<SpriteAnimationPlaylistModeMap>({});
  // 默认的内置分类：使用全部预设事件类型（不包含 custom）
  const BUILTIN = React.useMemo(() => SPRITE_EVENT_TYPES.filter((c) => c !== 'custom'), []);
  const canAuthorAnimations = assetAuthoringCapability?.status !== 'locked';
  const authoringLockedTitle = assetAuthoringCapability?.status === 'locked' ? t('sprite:manager.capabilityLocked', { name: assetAuthoringCapability.name }) : undefined;

  const ensureCanAuthorAnimations = useCallback((): boolean => ensureSpriteCapabilityAccessible(assetAuthoringCapability, onCapabilityBlocked), [assetAuthoringCapability, onCapabilityBlocked]);

  // 初始化读取播放列表状态
  useEffect(() => {
    window.chobits.sprite
      .getAnimationPlaylistMode()
      .then(setDefaultAnimationPlaylistMode)
      .catch(() => {});

    window.chobits.sprite
      .getInitialState()
      .then((state) => {
        const config = state?.config;
        if (config?.animationPlaylistMode) {
          setDefaultAnimationPlaylistMode(config.animationPlaylistMode);
        }
        setAnimationPlaylistModes(normalizeSpriteAnimationPlaylistModeMap(config?.animationPlaylistModes));
      })
      .catch(() => {});

    return window.chobits.sprite.onConfig((config) => {
      if (config.animationPlaylistMode) {
        setDefaultAnimationPlaylistMode(config.animationPlaylistMode);
      }
      setAnimationPlaylistModes(normalizeSpriteAnimationPlaylistModeMap(config.animationPlaylistModes));
    });
  }, []);

  const updateAnimationPlaylistMode = useCallback(async (mode: SpriteAnimationPlaylistMode, trigger?: SpriteAnimationTrigger) => {
    if (trigger) {
      setAnimationPlaylistModes((prev) => ({ ...prev, [trigger]: mode }));
      const next = await window.chobits.sprite.setAnimationPlaylistMode(mode, trigger);
      setAnimationPlaylistModes((prev) => ({ ...prev, [trigger]: next }));
      return;
    }

    setDefaultAnimationPlaylistMode(mode);
    const next = await window.chobits.sprite.setAnimationPlaylistMode(mode);
    setDefaultAnimationPlaylistMode(next);
  }, []);

  const getCategoryPlaylistMode = useCallback(
    (cat: string): SpriteAnimationPlaylistMode => {
      if (cat === 'uncategorized') return defaultAnimationPlaylistMode;
      return animationPlaylistModes[cat] ?? defaultAnimationPlaylistMode;
    },
    [animationPlaylistModes, defaultAnimationPlaylistMode]
  );

  const refresh = React.useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const items = await window.chobits.sprite.list();
      setList(items || []);
      // 统计分类（meta.primaryTrigger / normalized trigger）
      const setCat = new Set<string>();
      for (const it of items || []) {
        const primaryTrigger = getPrimarySpriteAnimationTrigger(it.meta);
        if (primaryTrigger) setCat.add(primaryTrigger);
      }
      // 合并内置分类，保持稳定顺序
      const merged = [...BUILTIN, ...Array.from(setCat).filter((c) => !BUILTIN.includes(c))];
      setCategories(merged);
    } catch (e) {
      console.warn('sprite:list failed', e);
    } finally {
      setIsLoading(false);
    }
  }, [BUILTIN]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载时异步刷新动画列表,加载态切换是有意的
    refresh();
  }, [refresh]);

  const handleImport = async (primaryTrigger?: SpriteAnimationTrigger): Promise<void> => {
    if (!ensureCanAuthorAnimations()) return;

    // 使用局部 catKey，避免并发导入时 activeAddCat 被后一次覆盖导致前一次 finally 复位错误
    const catKey = primaryTrigger ?? activeAddCat ?? '';
    setActiveAddCat(catKey || null);
    setAddingMap((m) => ({ ...m, [catKey]: true }));
    try {
      const pick = await window.chobits.file['file:pick-file']({
        filters: [
          { name: 'Videos', extensions: ['webm', 'mp4', 'mov', 'mkv', 'ogg', 'ogv'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        multi: false
      });
      if (!pick.ok || !pick.path) return;
      const title = baseName(pick.path);
      const id = 'sprite-' + Math.random().toString(36).slice(2, 10);
      await window.chobits.sprite.register({
        filePath: pick.path,
        meta: {
          id,
          title,
          primaryTrigger: catKey || undefined
        }
      });
      await refresh();
    } catch (e) {
      console.warn('sprite:register failed', e);
    } finally {
      setAddingMap((m) => ({ ...m, [catKey]: false }));
      setActiveAddCat(null);
    }
  };

  const handleRemove = async (id: string): Promise<void> => {
    if (!ensureCanAuthorAnimations()) return;

    try {
      await window.chobits.sprite.remove(id, true);
      await refresh();
    } catch (e) {
      console.warn('sprite:remove failed', e);
    }
  };

  const [testingId, setTestingId] = useState<string | null>(null);

  const handleUpdatePrimaryTrigger = useCallback(
    async (id: string, primaryTrigger: SpriteAnimationTrigger | ''): Promise<void> => {
      if (!ensureCanAuthorAnimations()) return;

      await window.chobits.sprite.updateMeta(id, {
        primaryTrigger: primaryTrigger || undefined
      });
      await refresh();
    },
    [ensureCanAuthorAnimations, refresh]
  );

  const handleUpdateAnimationMeta = useCallback(
    async (id: string, meta: Pick<SpriteAnimation['meta'], 'condition' | 'primaryTrigger' | 'triggerAliases' | 'priority'>): Promise<void> => {
      if (!ensureCanAuthorAnimations()) return;

      await window.chobits.sprite.updateMeta(id, meta);
      await refresh();
    },
    [ensureCanAuthorAnimations, refresh]
  );

  const handleTestPlay = async (item: SpriteAnimation): Promise<void> => {
    setTestingId(item.meta.id);
    try {
      await window.chobits.sprite.testAnimation(item.meta.id);
    } catch (e) {
      console.warn('sprite:trigger-by-id failed', e);
    } finally {
      setTimeout(() => setTestingId(null), 1500);
    }
  };

  const handleEditSprite = useCallback(
    async (item: SpriteAnimation): Promise<void> => {
      if (!ensureCanAuthorAnimations()) return;
      setEditingSprite(item);
    },
    [ensureCanAuthorAnimations]
  );

  // 按分类分组
  const filteredList = React.useMemo(() => {
    if (!query.trim()) return list;
    const q = query.trim().toLowerCase();
    return list.filter((it) => {
      return (
        it.meta.title.toLowerCase().includes(q) ||
        it.meta.id.toLowerCase().includes(q) ||
        getSpriteAnimationTriggers(it.meta).some((trigger) => trigger.toLowerCase().includes(q)) ||
        it.meta.tags?.some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [list, query]);

  const grouped: Record<string, SpriteAnimation[]> = {};
  for (const it of filteredList) {
    const cat = getPrimarySpriteAnimationTrigger(it.meta) || 'uncategorized';
    (grouped[cat] ||= []).push(it);
  }
  // 基于原始 categories 顺序，只保留当前有条目的分类 (隐藏空分类)。如果搜索导致全部被过滤，fallback 显示“无结果”。
  const allCategories = categories.filter((c) => grouped[c]?.length); // 已有分类且非空
  if (grouped['uncategorized']?.length && !allCategories.includes('uncategorized')) allCategories.push('uncategorized');
  const hasAny = allCategories.length > 0;

  const toggleCollapse = (cat: string): void => setCollapsed((m) => ({ ...m, [cat]: !m[cat] }));

  return (
    <div className={className}>
      <SpriteCapabilityLockedNotice capability={assetAuthoringCapability} hint={t('sprite:manager.capabilityHint')} className="mx-2 mb-4" />

      <div className="flex justify-between items-center px-2 mb-4">
        <div className="text-sm text-muted-foreground">{t('sprite:manager.registeredCount', { count: list.length })}</div>
        <div className="flex flex-wrap gap-2 items-center justify-end">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('sprite:manager.searchPlaceholder')} className="h-8 w-48" />
          <SpriteTriggerPicker value={globalCat} onChange={setGlobalCat} buttonSize="sm" buttonClassName="w-[220px]" emptyLabel={t('sprite:triggerPicker.uncategorized')} />
          <Select value={defaultAnimationPlaylistMode} onValueChange={(value) => void updateAnimationPlaylistMode(value as SpriteAnimationPlaylistMode)}>
            <SelectTrigger className="h-8 w-[132px]" title={t('sprite:manager.defaultPlaylistMode')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLAYLIST_MODE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {t(`sprite:manager.playlistModes.${option}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => handleImport(globalCat || undefined)} disabled={!canAuthorAnimations || !!addingMap[globalCat || '']} title={authoringLockedTitle}>
            {addingMap[globalCat || ''] ? t('sprite:manager.importing') : t('sprite:manager.importVideo')}
          </Button>
          <Button size="sm" variant="outline" onClick={refresh} disabled={isLoading}>
            {t('sprite:actions.refresh')}
          </Button>
        </div>
      </div>
      {/* 精灵导入工具弹窗 */}
      {editingSprite && (
        <SpriteAnimationConfigEditor
          animation={editingSprite}
          assetAuthoringCapability={assetAuthoringCapability}
          onCapabilityBlocked={onCapabilityBlocked}
          onClose={() => setEditingSprite(null)}
          onSaved={refresh}
        />
      )}
      {/* 防止窗口增高时 Grid 行被平均拉伸：content-start(items-start) 让多余空间留在容器底部 */}
      <div className="pr-1">
        {hasAny ? (
          allCategories.map((cat) => (
            <div key={cat} className="mb-4 last:mb-0 border border-border/40 rounded-md">
              <div className="flex items-center justify-between px-2 py-1 bg-muted/40 rounded-t-md">
                <div className="flex items-center gap-2">
                  <Button
                    size={'icon'}
                    className="w-8 h-8"
                    onClick={() => toggleCollapse(cat)}
                    aria-label={collapsed[cat] ? t('sprite:manager.expandCategory') : t('sprite:manager.collapseCategory')}
                    variant={'outline'}
                  >
                    {collapsed[cat] ? '+' : '-'}
                  </Button>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat === 'uncategorized' ? t('sprite:triggerPicker.uncategorized') : cat}</div>
                  <div className="text-[10px] text-muted-foreground/70">({grouped[cat]?.length || 0})</div>
                </div>
                <div className="flex items-center gap-2">
                  {cat !== 'uncategorized' && (
                    <Select value={getCategoryPlaylistMode(cat)} onValueChange={(value) => void updateAnimationPlaylistMode(value as SpriteAnimationPlaylistMode, cat as SpriteAnimationTrigger)}>
                      <SelectTrigger className="h-8 w-[120px]" title={t('sprite:manager.categoryPlaylistMode', { name: cat })}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PLAYLIST_MODE_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {t(`sprite:manager.playlistModes.${option}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {cat !== 'uncategorized' && (
                    <Button size="sm" variant="ghost" onClick={() => window.chobits.sprite.trigger(cat)} title={t('sprite:manager.triggerCategory', { name: cat })}>
                      <TbPlayerPlay />
                      {t('sprite:actions.test')}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleImport(cat === 'uncategorized' ? undefined : (cat as SpriteAnimationTrigger))}
                    disabled={!canAuthorAnimations || addingMap[cat]}
                    title={authoringLockedTitle}
                  >
                    {addingMap[cat] ? t('sprite:manager.importing') : t('sprite:actions.add')}
                  </Button>
                </div>
              </div>
              {!collapsed[cat] && (
                <div className="p-2">
                  <div className="grid gap-4 content-start items-start justify-items-center" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
                    {grouped[cat]?.map((item) => {
                      const src = item.source?.localPath ? makeResSrc(item.source.localPath) : item.source?.src || '';
                      const type = item.source?.type || 'video/webm';
                      const primaryTrigger = getPrimarySpriteAnimationTrigger(item.meta);
                      const triggerAliases = getSpriteAnimationTriggerAliases(item.meta);
                      const priority = item.meta.priority;
                      const PW = 180,
                        PH = 240; // 基础预览尺寸（列最小宽 200 时刚好贴合）
                      return (
                        <div key={item.meta.id} className="group bg-card border border-border rounded-lg flex flex-col gap-2 w-full max-w-[240px] shadow-sm hover:shadow-md transition-shadow">
                          <div className="relative rounded-md overflow-hidden flex justify-center">
                            {src ? <SpritePreview src={src} type={type} width={PW} height={PH} /> : <div style={{ width: PW, height: PH }} className="rounded-md bg-muted" />}
                            {/* 顶部操作按钮（hover 显示） */}
                            <div className="absolute top-1 right-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                              {/* 测试播放按钮 */}
                              <Button
                                size="icon"
                                variant="secondary"
                                className="w-8 h-8"
                                onClick={() => handleTestPlay(item)}
                                disabled={testingId === item.meta.id}
                                title={t('sprite:manager.testPlay')}
                              >
                                <TbPlayerPlay />
                              </Button>
                              <SpriteTriggerPicker
                                value={primaryTrigger || ''}
                                onChange={(nextValue) => {
                                  void handleUpdatePrimaryTrigger(item.meta.id, nextValue);
                                }}
                                disabled={!canAuthorAnimations}
                                buttonSize="sm"
                                buttonClassName="h-8 min-w-[150px] bg-background/90"
                                emptyLabel={t('sprite:manager.setTrigger')}
                                popoverClassName="w-[340px]"
                              />
                              <SpriteAnimationMetaPopover
                                meta={item.meta}
                                disabled={!canAuthorAnimations}
                                onSave={async (nextMeta) => {
                                  await handleUpdateAnimationMeta(item.meta.id, nextMeta);
                                }}
                              />

                              {item.meta.deletable !== false && item.source?.localPath && (
                                <Button
                                  size="icon"
                                  variant="secondary"
                                  className="w-8 h-8"
                                  onClick={() => void handleEditSprite(item)}
                                  disabled={!canAuthorAnimations}
                                  title={canAuthorAnimations ? t('sprite:manager.editProperties') : authoringLockedTitle}
                                >
                                  <TbPencil />
                                </Button>
                              )}
                              {item.meta.deletable !== false && (
                                <Button size="icon" variant="destructive" className="w-8 h-8" onClick={() => handleRemove(item.meta.id)} disabled={!canAuthorAnimations} title={authoringLockedTitle}>
                                  <TbTrash />
                                </Button>
                              )}
                            </div>
                            {/* 信息覆盖层：默认显示，hover 隐藏 */}
                            <div className="pointer-events-none absolute inset-0 flex flex-col justify-end p-3 bg-gradient-to-t from-black/70 via-black/30 to-transparent text-white opacity-100 group-hover:opacity-0 transition-opacity duration-200">
                              <div className="text-sm font-semibold truncate"> {item.meta.title || item.meta.id} </div>
                              <div className="text-[10px] opacity-80 truncate">ID: {item.meta.id}</div>
                              <div className="text-[10px] opacity-80 truncate">
                                {item.width}x{item.height} · {item.source?.type}
                              </div>
                              {primaryTrigger && <div className="mt-1 text-[10px] inline-block px-1 py-[1px] rounded bg-primary/70 text-white w-fit">{primaryTrigger}</div>}
                              {triggerAliases.length > 0 && <div className="mt-1 text-[10px] opacity-80 truncate">aliases: {triggerAliases.join(', ')}</div>}
                              {priority !== undefined && <div className="mt-1 text-[10px] opacity-80 truncate">priority: {priority}</div>}
                              {item.meta.condition && <div className="mt-1 text-[10px] opacity-80 truncate">condition: character-gated</div>}
                              {/* 结束覆盖层 */}
                            </div>
                            {/* 结束相对容器 */}
                          </div>
                        </div>
                      );
                    })}
                    {/* 分类尾部添加卡片 */}
                    <Button
                      className="h-[240px] w-[180px]"
                      onClick={() => handleImport(cat === 'uncategorized' ? undefined : (cat as SpriteAnimationTrigger))}
                      disabled={!canAuthorAnimations || addingMap[cat]}
                      variant="ghost"
                      title={authoringLockedTitle}
                    >
                      + {t('sprite:actions.add')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-center text-xs text-muted-foreground py-8">{t('sprite:manager.noResults')}</div>
        )}
      </div>
    </div>
  );
}

export default function SpriteManager({
  className,
  assetAuthoringCapability,
  onCapabilityBlocked
}: {
  className?: string;
  assetAuthoringCapability?: SpriteCapabilityState | null;
  onCapabilityBlocked?: (capability: SpriteCapabilityState) => void;
}): JSX.Element {
  return (
    <div className={className}>
      <CharacterPackManager
        editorPresentation="window"
        editorExtra={<SpriteAnimationManager className="border-t border-border/60 pt-4" assetAuthoringCapability={assetAuthoringCapability} onCapabilityBlocked={onCapabilityBlocked} />}
      />
    </div>
  );
}

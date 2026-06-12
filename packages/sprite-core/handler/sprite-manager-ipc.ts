/**
 * SpriteManager IPC 统一入口
 *
 * 将 SpriteManager 实例绑定到 Electron IPC 通道：
 *
 * 上行(渲染→主进程)：
 *   sprite:interact         — 交互上报
 *   sprite:drag             — 拖拽事件
 *   sprite:anim-complete    — 动画完成
 *   sprite:file-drop        — 文件拖放
 *   sprite:ready            — 渲染进程就绪
 *   sprite:get-initial-state — 获取初始状态
 *   sprite:persona:getState  — 获取人格状态
 *   sprite:persona:grantReward — 统一应用人格奖励
 *   sprite:persona:addXP     — 增加经验（兼容入口）
 *   sprite:persona:changeFavor — 修改好感度（兼容入口）
 *   sprite:persona:recordLogin — 记录登录
 *   sprite:persona:unlockAchievement — 解锁成就（兼容入口）
 *   sprite:config:getAutoWalk — 获取自动行走开关
 *   sprite:config:setAutoWalk — 设置自动行走开关
 *   sprite:spontaneous:getPreferences — 获取主动发言偏好
 *   sprite:spontaneous:updatePreferences — 更新主动发言偏好
 *   sprite:spontaneous:listHistory — 查询主动发言历史
 *
 * 下行(主进程→渲染)：
 *   sprite:play             — 播放动画命令
 *   sprite:state            — 状态变化
 *   sprite:message          — 消息(toast/notice/busy)
 *   sprite:walk             — 行走状态
 *   sprite:config           — 配置变化
 *   sprite:busy:update      — 忙碌进度
 *   sprite:busy:clear       — 清除忙碌
 */

import { app, BrowserWindow, ipcMain, screen } from 'electron';

import { getDailyCareService } from '../../../electron/main/daily';
import type { DailyCareRoutineDispatch } from '../../../electron/main/daily/types';
import { getMainSchedulerService } from '../../../electron/main/scheduler';
import { loadShortcutEnabledConfig, saveShortcutEnabledConfig } from '../../../electron/main/shortcut-store';
import { AppEvent, eventManager } from '../../event';
import { getRecorderStatusSnapshot } from '../../recorder/ipc-main';
import { disableASRRuntime, getASRConfigSnapshot, getASRStatusSnapshot } from '../../sherpa/ipc-main';
import { SPRITE_CAPABILITY_SIGNALS, type SpriteCapabilityResolutionContext } from '../capability-registry';
import { assertSpriteCapabilityUnlocked, getSpriteCapabilitySnapshot, initSpriteCapabilityRuntime } from '../capability-runtime';
import { getCharacterCapabilityContextFlags } from '../character-capability-flags';
import type { CharacterGalleryAIEditDraft } from '../character-gallery';
import {
  buildCharacterGalleryAIEditContext,
  getCharacterGalleryCanvasLayout,
  importCharacterGalleryItem,
  initCharacterGalleryManager,
  listCharacterGalleryItems,
  removeCharacterGalleryItem,
  replaceCharacterGalleryItemImage,
  saveCharacterGalleryCanvasLayout,
  updateCharacterGalleryItem
} from '../character-gallery-manager';
import {
  activateCharacterPack,
  type CharacterPackEditorDraft,
  type CharacterPackEditorSaveOptions,
  type CharacterPackSource,
  type CharacterPackSummary,
  exportCharacterPack,
  getActiveCharacterPack,
  getCharacterPackEditorDraft,
  getCharacterPackImportPreviewCacheRootDir,
  initCharacterPackManager,
  inspectCharacterPackFromArchive,
  installCharacterPackFromArchive,
  listCharacterPacks,
  removeCharacterPack,
  saveCharacterPackEditorDraft
} from '../character-pack-manager';
import { type CharacterPersonaRuntimeSyncResult, reloadCharacterPersonaRuntime, syncCharacterPersonaRuntime } from '../character-runtime';
import { buildCharacterPersonaPrompt, getCharacterDefinition, getCharacterInfo, getCharacterToolLabels, initCharacterService, type ToolLabelDefinition } from '../character-service';
import type { PersonaRewardGrant } from '../config/persona-rules';
import { isSpriteInteractionIntent, type SpriteInteractionPayload } from '../interaction-contract';
import type { SpritePurposeRoutinePlanner, SpritePurposeWindowAdapter, SpriteSpontaneousUtteranceExecutor, SpriteWindowAnimationAdapter } from '../manager';
import { SpriteManager } from '../manager';
import { getPersonaRuleDimensionSchema } from '../persona-rules';
import type { SpritePurposeHistoryQuery, SpritePurposeRetrospectiveQuery, SpritePurposeRuntimeEventInput, StartSpritePurposeRequest } from '../purpose';
import type { SpeakRequest, SpriteSpeakConfig } from '../speak/types';
import type {
  SpriteAnimationPlaylistMode,
  SpriteAnimationTrigger,
  SpriteBubbleMode,
  SpriteEffectBridgePayload,
  SpriteEffectClearPayload,
  SpriteEffectPayload,
  SpriteFeedbackRequest,
  SpriteMovementPreviewConfig,
  SpriteTriggerRequest
} from '../types';
import { isBubbleWindowMode, MESSAGE_IPC_CHANNELS, SPRITE_EFFECT_IPC_CHANNELS } from '../types';
import { WindowController } from '../window-controller';
import type { WindowControllerAvoidRegion } from '../window-controller-model';
import { notifySpriteCapabilityChanged } from './capability-events';
import { getDefaultSpritesDir, listSprites, setSpriteAssetsChangeHandler } from './sprite-assets';
import { initSpriteEventListener, type SpriteEventListenerOptions } from './sprite-event-listener';

export interface SpriteManagerDeps {
  addAllowedResourceRoot: (root: string) => void;
  registerCharacterPersonaPromptProvider?: (provider: () => string | null) => void | Promise<void>;
  spontaneousUtteranceExecutor?: SpriteSpontaneousUtteranceExecutor;
  purposeWindowAdapter?: SpritePurposeWindowAdapter;
  windowAnimationAdapter?: SpriteWindowAnimationAdapter;
  purposeRoutinePlanner?: SpritePurposeRoutinePlanner;
  spriteEventListener?: SpriteEventListenerOptions;
  syncCharacterToolLabels?: (labels: Record<string, ToolLabelDefinition> | undefined) => void | Promise<void>;
}

type SpritePersonaRewardGrantRequest = Partial<Pick<PersonaRewardGrant, 'xp' | 'favor' | 'dimensions'>> & {
  source?: string;
  achievementId?: string;
};

type SpriteBubbleWindowManager = {
  get: (key: string) => BrowserWindow | null;
  create: (key: string) => Promise<BrowserWindow | null>;
  hide: (key: string) => Promise<BrowserWindow | null>;
};

const SPRITE_BUBBLE_WINDOW_KEYS = ['spriteBubbleFixedTop'] as const;
type SpriteBubbleWindowKey = (typeof SPRITE_BUBBLE_WINDOW_KEYS)[number];
const SPRITE_EFFECT_WINDOW_KEY = 'spriteEffect';

function getSpriteBubbleWindowKeyForMode(mode: SpriteBubbleMode): SpriteBubbleWindowKey | null {
  if (mode === 'fixed-top') return 'spriteBubbleFixedTop';
  return null;
}

function clearSpriteBubbleWindow(window: BrowserWindow | null): void {
  if (!window || window.isDestroyed()) return;
  try {
    window.webContents.send(MESSAGE_IPC_CHANNELS.BRIDGE, { kind: 'clear', payload: { type: 'all' } });
  } catch {
    /* ignore */
  }
}

function clearSpriteEffectWindow(window: BrowserWindow | null): void {
  if (!window || window.isDestroyed()) return;
  try {
    window.webContents.send(SPRITE_EFFECT_IPC_CHANNELS.BRIDGE, {
      kind: 'clear',
      payload: { type: 'all' },
      source: 'app'
    });
  } catch {
    /* ignore */
  }
}

function syncSpriteBubbleWindows(windowManager: SpriteBubbleWindowManager | null, activeMode: SpriteBubbleMode, clearAll: boolean): void {
  if (!windowManager) return;
  const activeKey = getSpriteBubbleWindowKeyForMode(activeMode);

  for (const key of SPRITE_BUBBLE_WINDOW_KEYS) {
    const window = windowManager.get(key);
    if (clearAll) {
      clearSpriteBubbleWindow(window);
    }
    if (clearAll || !activeKey || key !== activeKey) {
      void windowManager.hide(key).catch(() => undefined);
    }
  }

  const effectWindow = windowManager.get(SPRITE_EFFECT_WINDOW_KEY);
  if (clearAll) {
    clearSpriteEffectWindow(effectWindow);
  }
  if (clearAll || !isBubbleWindowMode(activeMode)) {
    void windowManager.hide(SPRITE_EFFECT_WINDOW_KEY).catch(() => undefined);
  }
}

async function resolveSpriteBubbleWindowManager(): Promise<SpriteBubbleWindowManager | null> {
  try {
    const mod = await import('@aim-packages/window-manager');
    return mod.windowManager as unknown as SpriteBubbleWindowManager;
  } catch {
    return null;
  }
}

export function buildDailyCarePurposeRequest(event: DailyCareRoutineDispatch): StartSpritePurposeRequest {
  const nightGuard = event.routine.kind === 'nightGuard';
  const urgent = event.routine.severity === 'urgent';
  const warning = event.routine.severity === 'warning';
  const kind = nightGuard ? 'daily.rest-reminder' : 'daily.care.reminder';
  return {
    kind,
    reason: event.message || event.routine.title,
    source: 'system-event',
    presetId: kind,
    priority: nightGuard ? (urgent ? 90 : 75) : warning ? 70 : 55,
    coalesceKey: `daily-care:${event.routine.id}`,
    context: {
      routineId: event.routine.id,
      routineTitle: event.routine.title,
      routineKind: event.routine.kind,
      severity: event.routine.severity,
      message: event.message,
      manual: event.manual,
      triggeredAt: event.triggeredAt,
      tags: event.routine.tags,
      metadata: event.routine.metadata,
      source: event.routine.source
    }
  };
}

function bindDailyCarePurposeBridge(mgr: SpriteManager): void {
  const dailyCareService = getDailyCareService();
  dailyCareService?.onRoutineDispatched?.((event) => {
    if (event.suppressed) {
      return;
    }
    void mgr.startPurpose(buildDailyCarePurposeRequest(event));
  });
}

export async function initSpriteManagerIPC(win: BrowserWindow, deps: SpriteManagerDeps): Promise<void> {
  const spriteBubbleWindowManager = await resolveSpriteBubbleWindowManager();
  let spriteManagerRef: SpriteManager | null = null;

  // 初始化 SpriteManager
  const mgr = SpriteManager.init({
    win: win as any,
    dataDir: app.getPath('userData'),
    getScreenSize: () => screen.getPrimaryDisplay().workAreaSize,
    appName: 'Chobits',
    spontaneousUtteranceExecutor: deps.spontaneousUtteranceExecutor,
    purposeWindowAdapter: deps.purposeWindowAdapter,
    windowAnimationAdapter: deps.windowAnimationAdapter,
    purposeRoutinePlanner: deps.purposeRoutinePlanner,
    behaviorScheduler: getMainSchedulerService(),
    // 额外接收消息桥的窗口：当前气泡窗口模式对应的独立窗口。
    getMessageRecipients: () => {
      const mode = spriteManagerRef?.getBubbleMode() ?? 'inline';
      const key = getSpriteBubbleWindowKeyForMode(mode);
      if (!key) return [];
      const bubble = spriteBubbleWindowManager?.get(key) ?? null;
      return bubble && !bubble.isDestroyed() ? [bubble as any] : [];
    },
    getConfigRecipients: () => {
      const recipients: BrowserWindow[] = [];
      const mode = spriteManagerRef?.getBubbleMode() ?? 'inline';
      const bubbleKey = getSpriteBubbleWindowKeyForMode(mode);
      if (bubbleKey) {
        const bubble = spriteBubbleWindowManager?.get(bubbleKey) ?? null;
        if (bubble && !bubble.isDestroyed()) {
          recipients.push(bubble);
        }
      }

      const effectWindow = spriteBubbleWindowManager?.get(SPRITE_EFFECT_WINDOW_KEY) ?? null;
      if (effectWindow && !effectWindow.isDestroyed()) {
        recipients.push(effectWindow);
      }
      return recipients as any[];
    }
  });
  spriteManagerRef = mgr;

  // 初始化 WindowController 并注入
  const windowCtrl = new WindowController({
    getWindow: () => (win.isDestroyed() ? null : (win as any)),
    getScreenSize: () => screen.getPrimaryDisplay().workAreaSize,
    getCursorScreenPoint: () => screen.getCursorScreenPoint(),
    getPadding: () => mgr.getEffectivePadding(),
    getSpriteSize: () => {
      const cfg = mgr.getSpriteConfig();
      return { width: cfg.width, height: cfg.height };
    },
    onWalkStart: (direction) => {
      mgr.transitionTo('walking');
      try {
        if (!win.isDestroyed()) {
          win.webContents.send('sprite:walk', { active: true, direction });
        }
      } catch {
        /* ignore */
      }
    },
    onWalkEnd: () => {
      if (mgr.getState() === 'walking') {
        mgr.transitionTo('idle');
      }
      try {
        if (!win.isDestroyed()) {
          win.webContents.send('sprite:walk', { active: false });
        }
      } catch {
        /* ignore */
      }
    }
  });
  mgr.setWindowController(windowCtrl);
  initSpriteCapabilityRuntime({
    resolveContext: () => resolveCapabilityContext()
  });
  initCharacterGalleryManager({
    addAllowedResourceRoot: deps.addAllowedResourceRoot
  });

  async function syncCharacterToolLabels(): Promise<void> {
    try {
      await deps.syncCharacterToolLabels?.(getCharacterToolLabels());
    } catch {
      // External tool label bridge not available — skip sync.
    }
  }

  function initCharacterDimensions(): void {
    const dimSchema = getPersonaRuleDimensionSchema();
    if (dimSchema) {
      mgr.initDimensions(dimSchema.map((d) => ({ id: d.id, initialValue: d.initialValue })));
    }
  }

  async function syncCharacterRuntime(options?: { reload?: boolean; initDimensions?: boolean }): Promise<CharacterPersonaRuntimeSyncResult> {
    const result = options?.reload ? reloadCharacterPersonaRuntime() : syncCharacterPersonaRuntime();
    await syncCharacterToolLabels();
    if (options?.initDimensions) {
      initCharacterDimensions();
    }
    return result;
  }

  function resolveActivePersonaSlot(): { id: string; identity: { name?: string; description?: string } } {
    const character = getCharacterDefinition();
    const characterId = character?.id?.trim();

    return {
      id: characterId ? `character:${characterId}` : 'default',
      identity: {
        name: character?.name,
        description: character?.meta?.description
      }
    };
  }

  async function syncActivePersonaStateSlot(options?: { forceReload?: boolean }): Promise<{ slotId: string; restored: boolean; switched: boolean }> {
    const slot = resolveActivePersonaSlot();
    const currentSlotId = mgr.getActivePersonaStateId();

    if (!options?.forceReload && currentSlotId === slot.id) {
      mgr.configurePersonaStateSlot(slot.id, slot.identity);
      return {
        slotId: slot.id,
        restored: true,
        switched: false
      };
    }

    const result = await mgr.switchPersonaStateSlot(slot.id, slot.identity);
    return {
      slotId: slot.id,
      restored: result.restored,
      switched: currentSlotId !== slot.id
    };
  }

  async function loadAndApplyRuntimeAnimations(options?: { refreshCurrentState?: boolean }): Promise<number> {
    const sprites = await listSprites();
    mgr.replaceAnimations(sprites, {
      refreshCurrentState: options?.refreshCurrentState
    });
    return sprites.length;
  }

  setSpriteAssetsChangeHandler((event) => {
    void loadAndApplyRuntimeAnimations({ refreshCurrentState: true }).catch((err) => {
      console.error('[SpriteManagerIPC] Failed to reload animations after sprite asset change:', event, err);
    });
  });

  async function reloadCharacterRuntimeChain(options?: { notifyCapabilitySource?: string }): Promise<{
    runtime: CharacterPersonaRuntimeSyncResult;
    personaSlot: { slotId: string; restored: boolean; switched: boolean };
    animationsLoaded: number;
  }> {
    const runtime = await syncCharacterRuntime({ reload: true });
    const personaSlot = await syncActivePersonaStateSlot({ forceReload: false });
    initCharacterDimensions();
    const animationsLoaded = await loadAndApplyRuntimeAnimations({ refreshCurrentState: true });
    enforceCapabilityBoundRuntime();

    if (options?.notifyCapabilitySource) {
      notifySpriteCapabilityChanged({ source: options.notifyCapabilitySource });
    }

    return {
      runtime,
      personaSlot,
      animationsLoaded
    };
  }

  function emitCharacterSwitched(payload: {
    previousPack: CharacterPackSummary | null;
    nextPack: CharacterPackSummary;
    previousCharacter: ReturnType<typeof getCharacterInfo>;
    nextCharacter: ReturnType<typeof getCharacterInfo>;
    personaSlotId: string;
  }): void {
    const packChanged = !payload.previousPack || payload.previousPack.id !== payload.nextPack.id || payload.previousPack.source !== payload.nextPack.source;
    const characterChanged = payload.previousCharacter?.id !== payload.nextCharacter?.id;
    if (!packChanged && !characterChanged) {
      return;
    }

    mgr.emit('persona:character-switched', payload);
  }

  function resolveFallbackPack(packs: CharacterPackSummary[], removingPack: CharacterPackSummary): CharacterPackSummary | null {
    return (
      packs.find((pack) => pack.source === 'builtin' && (pack.id !== removingPack.id || pack.source !== removingPack.source)) ??
      packs.find((pack) => pack.id !== removingPack.id || pack.source !== removingPack.source) ??
      null
    );
  }

  function resolveCapabilityContext(): SpriteCapabilityResolutionContext {
    const persona = mgr.getPersonaState();
    const { featureFlags, personaFlags } = getCharacterCapabilityContextFlags(persona);

    let dailyCareEnabled = false;
    try {
      dailyCareEnabled = Boolean(getDailyCareService()?.getSnapshot().enabled);
    } catch {
      dailyCareEnabled = false;
    }

    let recorderEnabled = false;
    try {
      recorderEnabled = Boolean(getRecorderStatusSnapshot().running);
    } catch {
      recorderEnabled = false;
    }

    let screenshotEnabled = false;
    try {
      screenshotEnabled = Boolean(loadShortcutEnabledConfig().screenshot);
    } catch {
      screenshotEnabled = false;
    }

    let asrRunning = false;
    try {
      asrRunning = Boolean(getASRStatusSnapshot().running);
    } catch {
      asrRunning = false;
    }

    return {
      personaLevel: persona.level,
      achievements: persona.achievements,
      featureFlags,
      personaFlags,
      activeSignals: {
        [SPRITE_CAPABILITY_SIGNALS.movementAutoWalk]: mgr.isAutoWalkEnabled(),
        [SPRITE_CAPABILITY_SIGNALS.dailyCareEnabled]: dailyCareEnabled,
        [SPRITE_CAPABILITY_SIGNALS.recorderEnabled]: recorderEnabled,
        [SPRITE_CAPABILITY_SIGNALS.screenshotEnabled]: screenshotEnabled,
        [SPRITE_CAPABILITY_SIGNALS.asrRunning]: asrRunning
      }
    };
  }

  function ensureCapabilityUnlocked(capabilityId: string): void {
    assertSpriteCapabilityUnlocked(capabilityId);
  }

  function enforceCapabilityBoundRuntime(): void {
    const snapshot = getSpriteCapabilitySnapshot();
    if (!snapshot) return;

    const movementCapability = snapshot.capabilities.movement;
    if (movementCapability?.status === 'locked' && mgr.isAutoWalkEnabled()) {
      mgr.setAutoWalkEnabled(false);
      broadcastAutoWalkConfig();
    }

    const screenshotCapability = snapshot.capabilities.screenshot;
    if (screenshotCapability?.status === 'locked' && loadShortcutEnabledConfig().screenshot) {
      saveShortcutEnabledConfig({ screenshot: false });
      broadcastShortcutEnabledConfig();
    }

    const dailyCareCapability = snapshot.capabilities.dailyCare;
    if (dailyCareCapability?.status === 'locked') {
      const dailyCareService = getDailyCareService();
      if (dailyCareService?.getSnapshot().enabled) {
        dailyCareService.updateSettings({ enabled: false });
      }
    }

    const speechRecognitionCapability = snapshot.capabilities.speechRecognition;
    const asrConfig = getASRConfigSnapshot();
    if (speechRecognitionCapability?.status === 'locked' && (asrConfig.enabled || getASRStatusSnapshot().running)) {
      disableASRRuntime({ disableConfig: true });
    }
  }

  function broadcastAutoWalkConfig(): void {
    const configSnapshot = mgr.getSpriteConfig();
    for (const candidate of BrowserWindow.getAllWindows()) {
      if (!candidate || candidate.isDestroyed()) continue;

      if (candidate !== win) {
        try {
          candidate.webContents.send('sprite:config', configSnapshot);
        } catch {
          /* ignore */
        }
      }
    }

    notifySpriteCapabilityChanged({ source: 'movement.autoWalk' });
  }

  function broadcastShortcutEnabledConfig(): void {
    const shortcutEnabledConfig = loadShortcutEnabledConfig();
    for (const candidate of BrowserWindow.getAllWindows()) {
      if (!candidate || candidate.isDestroyed()) continue;

      try {
        candidate.webContents.send('shortcuts-enabled-updated', shortcutEnabledConfig);
      } catch {
        /* ignore */
      }
    }

    notifySpriteCapabilityChanged({ source: 'shortcuts.screenshot' });
  }

  // ===== 渲染进程 → 主进程 (handle) =====

  // 交互上报
  ipcMain.handle('sprite:interact', (_e, payload: { type: string; data?: SpriteInteractionPayload }) => {
    const interactionType = payload?.type ?? '';
    if (!isSpriteInteractionIntent(interactionType)) {
      throw new Error(`[sprite:interact] Unsupported interaction intent: ${String(payload?.type)}`);
    }
    mgr.reportInteraction(interactionType, payload?.data);
  });

  // 拖拽（主进程轮询光标位置，渲染进程只负责 start/end 信号）
  ipcMain.handle('sprite:drag', (_e, payload: { phase: 'start' | 'end'; offsetX?: number; offsetY?: number }) => {
    switch (payload.phase) {
      case 'start':
        mgr.startDrag(payload.offsetX!, payload.offsetY!);
        break;
      case 'end':
        mgr.endDrag();
        break;
    }
  });

  // 动画播放完成上报
  ipcMain.handle('sprite:anim-complete', (_e, payload: { animId: string; phase: 'intro' | 'loop' | 'outro' | 'full'; playId?: string }) => {
    console.info('[SpritePlayback] ipc sprite:anim-complete', payload);
    mgr.handleAnimationComplete(payload.animId, payload.phase, payload.playId);
  });

  // 文件拖放
  ipcMain.handle('sprite:file-drop', (_e, payload: { files: any[] }) => {
    mgr.handleFileDrop(payload.files);
  });

  // 渲染进程就绪
  ipcMain.handle('sprite:ready', () => {
    mgr.handleRendererReady();
  });

  // 获取初始状态
  ipcMain.handle('sprite:get-initial-state', () => {
    return mgr.getInitialState();
  });

  async function getSpriteEffectTargetWindow(): Promise<BrowserWindow | null> {
    const useWindowMode = isBubbleWindowMode(mgr.getBubbleMode());
    if (useWindowMode) {
      const effectWindow = spriteBubbleWindowManager?.get(SPRITE_EFFECT_WINDOW_KEY) ?? null;
      if (effectWindow && !effectWindow.isDestroyed()) return effectWindow;
      const created = (await spriteBubbleWindowManager?.create(SPRITE_EFFECT_WINDOW_KEY)) ?? null;
      return created && !created.isDestroyed() ? created : null;
    }
    return win && !win.isDestroyed() ? win : null;
  }

  async function sendSpriteEffectBridge(payload: SpriteEffectBridgePayload): Promise<{ success: boolean; error?: string }> {
    try {
      const target = await getSpriteEffectTargetWindow();
      if (!target || target.isDestroyed()) {
        return { success: false, error: 'sprite effect target window not available' };
      }
      target.webContents.send(SPRITE_EFFECT_IPC_CHANNELS.BRIDGE, payload);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  ipcMain.removeHandler(SPRITE_EFFECT_IPC_CHANNELS.SHOW);
  ipcMain.handle(SPRITE_EFFECT_IPC_CHANNELS.SHOW, (_e, payload: SpriteEffectPayload) => {
    if (!payload || typeof payload.type !== 'string' || !payload.type.trim()) {
      return { success: false, error: 'effect type is required' };
    }

    return sendSpriteEffectBridge({
      kind: 'show',
      payload: {
        ...payload,
        type: payload.type.trim()
      },
      source: 'sprite'
    });
  });

  ipcMain.removeHandler(SPRITE_EFFECT_IPC_CHANNELS.CLEAR);
  ipcMain.handle(SPRITE_EFFECT_IPC_CHANNELS.CLEAR, (_e, payload?: SpriteEffectClearPayload) => {
    return sendSpriteEffectBridge({
      kind: 'clear',
      payload: payload ?? { type: 'all' },
      source: 'sprite'
    });
  });

  // ===== 人格化 API =====

  ipcMain.handle('sprite:persona:getState', () => {
    return { ok: true, state: mgr.getPersonaState() };
  });

  function grantPersonaReward(payload: SpritePersonaRewardGrantRequest = {}): { ok: boolean; [key: string]: unknown } {
    const source = typeof payload.source === 'string' && payload.source.trim() ? payload.source.trim() : 'persona:reward';
    const xp = typeof payload.xp === 'number' && Number.isFinite(payload.xp) ? payload.xp : 0;
    const favor = typeof payload.favor === 'number' && Number.isFinite(payload.favor) ? payload.favor : 0;
    const dimensions = Array.isArray(payload.dimensions) ? payload.dimensions : [];
    const reward: PersonaRewardGrant = { xp, favor, dimensions };

    const previousState = mgr.getPersonaState();

    // 幂等：source 以 'quest:' 开头表示新手引导/任务奖励，重复发放则直接返回当前状态
    // （包含 idempotent: true 标记，供 Quest Engine 区分新发放和重复请求）
    const isQuestReward = source.startsWith('quest:');
    if (isQuestReward && mgr.hasClaimedReward(source)) {
      return {
        ok: true,
        source,
        idempotent: true,
        applied: { xp: 0, favor: 0, dimensions: [] },
        xpGained: 0,
        leveledUp: false,
        oldFavor: previousState.favor,
        newFavor: previousState.favor,
        levelChanged: false,
        favorChanged: false,
        achievementUnlocked: false,
        state: previousState
      };
    }

    mgr.applyPersonaReward(reward, source);

    let achievementUnlocked = false;
    if (typeof payload.achievementId === 'string' && payload.achievementId.trim()) {
      achievementUnlocked = mgr.unlockAchievement(payload.achievementId.trim());
    }

    if (isQuestReward) {
      mgr.markRewardClaimed(source);
    }

    const state = mgr.getPersonaState();
    const leveledUp = state.level !== previousState.level;
    const favorLevelChanged = state.favorLevel !== previousState.favorLevel;
    return {
      ok: true,
      source,
      applied: {
        xp,
        favor,
        dimensions,
        ...(payload.achievementId ? { achievementId: payload.achievementId, achievementUnlocked } : {})
      },
      xpGained: Math.max(0, xp),
      leveledUp,
      ...(leveledUp ? { newLevel: state.level } : {}),
      oldFavor: previousState.favor,
      newFavor: state.favor,
      levelChanged: favorLevelChanged,
      favorChanged: state.favor !== previousState.favor,
      achievementUnlocked,
      state
    };
  }

  ipcMain.handle('sprite:persona:grantReward', (_e, p: SpritePersonaRewardGrantRequest) => {
    return grantPersonaReward(p);
  });

  ipcMain.handle('sprite:persona:addXP', (_e, p: { amount: number; source?: string }) => {
    const result = grantPersonaReward({ xp: p.amount, source: p.source ?? 'persona:addXP' });
    return result;
  });

  ipcMain.handle('sprite:persona:changeFavor', (_e, p: { delta: number; reason?: string }) => {
    return grantPersonaReward({ favor: p.delta, source: p.reason ?? 'persona:changeFavor' });
  });

  ipcMain.handle('sprite:persona:recordLogin', () => {
    const result = mgr.recordDailyLogin();
    return { ok: true, ...result, state: mgr.getPersonaState() };
  });

  ipcMain.handle('sprite:persona:unlockAchievement', (_e, p: { id: string }) => {
    const result = grantPersonaReward({ achievementId: p.id, source: 'persona:unlockAchievement' });
    return { ok: true, unlocked: result.achievementUnlocked, state: result.state };
  });

  ipcMain.handle('sprite:persona:reset', () => {
    const state = mgr.resetPersonaState();
    enforceCapabilityBoundRuntime();
    return { ok: true, state };
  });

  ipcMain.handle('sprite:capabilities:getSnapshot', () => {
    return getSpriteCapabilitySnapshot();
  });

  // ===== 角色人格 API =====

  ipcMain.handle('sprite:character:getInfo', () => {
    return getCharacterInfo();
  });

  ipcMain.handle('sprite:character:getPersonaPrompt', (_e, options?: import('../character-service').PersonaPromptBuildOptions) => {
    const persona = mgr.getPersonaState();
    return buildCharacterPersonaPrompt(
      {
        favorLevel: persona.favorLevel,
        mood: persona.mood,
        level: persona.level
      },
      options
    );
  });

  ipcMain.handle('sprite:character:listPacks', async () => {
    return listCharacterPacks();
  });

  ipcMain.handle('sprite:character:getActivePack', async () => {
    return getActiveCharacterPack();
  });

  ipcMain.handle('sprite:character:activatePack', async (_e, payload: { packId: string; source?: CharacterPackSource }) => {
    const previousPack = await getActiveCharacterPack();
    const previousCharacter = getCharacterInfo();
    const activation = await activateCharacterPack(payload.packId, {
      source: payload.source
    });

    if (!activation) {
      throw new Error(`[sprite:character:activatePack] Pack not found: ${payload.packId}`);
    }

    initCharacterService(activation.pack.rootDir, { source: activation.pack.source });
    const reload = await reloadCharacterRuntimeChain({
      notifyCapabilitySource: 'character.pack.activate'
    });
    const nextCharacter = getCharacterInfo();

    emitCharacterSwitched({
      previousPack,
      nextPack: activation.pack,
      previousCharacter,
      nextCharacter,
      personaSlotId: reload.personaSlot.slotId
    });

    return {
      ok: true,
      changed: activation.changed,
      pack: activation.pack,
      character: nextCharacter,
      runtime: reload.runtime,
      personaSlot: reload.personaSlot
    };
  });

  ipcMain.handle('sprite:character:inspectPackFromArchive', async (_e, payload: { archivePath: string }) => {
    return inspectCharacterPackFromArchive(payload.archivePath);
  });

  type InstalledPackChangeResponse = {
    ok: true;
  } & Awaited<ReturnType<typeof installCharacterPackFromArchive>> & {
      character?: ReturnType<typeof getCharacterInfo>;
      runtime?: CharacterPersonaRuntimeSyncResult;
      personaSlot?: { slotId: string; restored: boolean; switched: boolean };
    };

  async function finalizeInstalledPackChange(
    result: Awaited<ReturnType<typeof installCharacterPackFromArchive>>,
    options?: {
      previousPack?: CharacterPackSummary | null;
      previousCharacter?: ReturnType<typeof getCharacterInfo> | null;
      capabilitySource: string;
    }
  ): Promise<InstalledPackChangeResponse> {
    const shouldReloadRuntime = result.activated || result.pack.isActive;
    if (!shouldReloadRuntime) {
      return {
        ok: true,
        ...result
      };
    }

    initCharacterService(result.pack.rootDir, { source: result.pack.source });
    const reload = await reloadCharacterRuntimeChain({
      notifyCapabilitySource: options?.capabilitySource
    });
    const nextCharacter = getCharacterInfo();

    emitCharacterSwitched({
      previousPack: options?.previousPack ?? null,
      nextPack: result.pack,
      previousCharacter: options?.previousCharacter ?? null,
      nextCharacter,
      personaSlotId: reload.personaSlot.slotId
    });

    return {
      ok: true,
      ...result,
      character: nextCharacter,
      runtime: reload.runtime,
      personaSlot: reload.personaSlot
    };
  }

  ipcMain.handle('sprite:character:installPackFromArchive', async (_e, payload: { archivePath: string; replaceExisting?: boolean; activate?: boolean }) => {
    const previousPack = payload.activate || payload.replaceExisting ? await getActiveCharacterPack() : null;
    const previousCharacter = previousPack ? getCharacterInfo() : null;
    const result = await installCharacterPackFromArchive(payload.archivePath, {
      replaceExisting: payload.replaceExisting,
      activate: payload.activate
    });

    return finalizeInstalledPackChange(result, {
      previousPack,
      previousCharacter,
      capabilitySource: 'character.pack.install.archive'
    });
  });

  ipcMain.handle('sprite:character:exportPack', async (_e, payload: { packId: string; outputPath: string; source?: CharacterPackSource }) => {
    const result = await exportCharacterPack(payload.packId, payload.outputPath, {
      source: payload.source
    });

    if (!result) {
      throw new Error(`[sprite:character:exportPack] Pack not found: ${payload.packId}`);
    }

    return {
      ok: true,
      ...result
    };
  });

  ipcMain.handle('sprite:character:removePack', async (_e, payload: { packId: string; source?: CharacterPackSource }) => {
    const packs = await listCharacterPacks();
    const targetPack =
      packs.find((pack) => pack.id === payload.packId && (!payload.source || pack.source === payload.source)) ??
      (!payload.source ? packs.find((pack) => pack.id === payload.packId && pack.source === 'installed') : undefined) ??
      (!payload.source ? packs.find((pack) => pack.id === payload.packId) : undefined);

    if (!targetPack) {
      throw new Error(`[sprite:character:removePack] Pack not found: ${payload.packId}`);
    }

    if (targetPack.isActive) {
      const fallbackPack = resolveFallbackPack(packs, targetPack);
      if (!fallbackPack) {
        throw new Error(`[sprite:character:removePack] No fallback pack available for active pack: ${payload.packId}`);
      }

      const previousPack = await getActiveCharacterPack();
      const previousCharacter = getCharacterInfo();
      const fallbackActivation = await activateCharacterPack(fallbackPack.id, {
        source: fallbackPack.source
      });
      if (!fallbackActivation) {
        throw new Error(`[sprite:character:removePack] Failed to activate fallback pack: ${fallbackPack.id}`);
      }

      initCharacterService(fallbackActivation.pack.rootDir, { source: fallbackActivation.pack.source });
      const reload = await reloadCharacterRuntimeChain({
        notifyCapabilitySource: 'character.pack.remove'
      });
      const removal = await removeCharacterPack(targetPack.id, {
        source: targetPack.source
      });
      const nextCharacter = getCharacterInfo();

      emitCharacterSwitched({
        previousPack,
        nextPack: fallbackActivation.pack,
        previousCharacter,
        nextCharacter,
        personaSlotId: reload.personaSlot.slotId
      });

      return {
        ok: true,
        removedPack: removal?.removedPack ?? targetPack,
        activePack: fallbackActivation.pack,
        switchedActivePack: true,
        character: nextCharacter,
        runtime: reload.runtime,
        personaSlot: reload.personaSlot
      };
    }

    const removal = await removeCharacterPack(targetPack.id, {
      source: targetPack.source
    });

    return {
      ok: true,
      ...removal
    };
  });

  ipcMain.handle('sprite:character:getEditorDraft', async (_e, payload: { packId: string; source?: CharacterPackSource }) => {
    return getCharacterPackEditorDraft(payload.packId, {
      source: payload.source
    });
  });

  ipcMain.handle('sprite:character:saveEditorDraft', async (_e, payload: { draft: CharacterPackEditorDraft; options?: CharacterPackEditorSaveOptions }) => {
    const previousPack = await getActiveCharacterPack();
    const previousCharacter = getCharacterInfo();
    const result = await saveCharacterPackEditorDraft(payload.draft, payload.options);
    const shouldReloadRuntime = result.activated || result.pack.isActive || (previousPack?.source === 'installed' && previousPack.id === result.pack.id);

    if (!shouldReloadRuntime) {
      return {
        ok: true,
        ...result
      };
    }

    initCharacterService(result.pack.rootDir, { source: result.pack.source });
    const reload = await reloadCharacterRuntimeChain({
      notifyCapabilitySource: 'character.pack.editor'
    });
    const nextCharacter = getCharacterInfo();

    emitCharacterSwitched({
      previousPack,
      nextPack: result.pack,
      previousCharacter,
      nextCharacter,
      personaSlotId: reload.personaSlot.slotId
    });

    return {
      ok: true,
      ...result,
      character: nextCharacter,
      runtime: reload.runtime,
      personaSlot: reload.personaSlot
    };
  });

  ipcMain.handle('sprite:character:gallery:list', async (_e, payload: { packId?: string; source?: CharacterPackSource; query?: string } = {}) => {
    return listCharacterGalleryItems(payload);
  });

  ipcMain.handle('sprite:character:gallery:canvas:get', async (_e, payload: { packId?: string; source?: CharacterPackSource } = {}) => {
    return getCharacterGalleryCanvasLayout(payload);
  });

  ipcMain.handle(
    'sprite:character:gallery:canvas:save',
    async (
      _e,
      payload: {
        layout: Parameters<typeof saveCharacterGalleryCanvasLayout>[0];
        packId?: string;
        source?: CharacterPackSource;
      }
    ) => {
      assertSpriteCapabilityUnlocked('spriteManage');
      return saveCharacterGalleryCanvasLayout(payload.layout, {
        packId: payload.packId,
        source: payload.source
      });
    }
  );

  ipcMain.handle(
    'sprite:character:gallery:import',
    async (
      _e,
      payload: {
        packId?: string;
        source?: CharacterPackSource;
        filePath: string;
        draft?: Parameters<typeof importCharacterGalleryItem>[0]['draft'];
      }
    ) => {
      assertSpriteCapabilityUnlocked('spriteManage');
      return importCharacterGalleryItem(payload);
    }
  );

  ipcMain.handle(
    'sprite:character:gallery:update',
    async (
      _e,
      payload: {
        packId?: string;
        source?: CharacterPackSource;
        itemId: string;
        patch: Parameters<typeof updateCharacterGalleryItem>[1];
      }
    ) => {
      assertSpriteCapabilityUnlocked('spriteManage');
      return updateCharacterGalleryItem(payload.itemId, payload.patch, {
        packId: payload.packId,
        source: payload.source
      });
    }
  );

  ipcMain.handle(
    'sprite:character:gallery:replaceImage',
    async (
      _e,
      payload: {
        packId?: string;
        source?: CharacterPackSource;
        itemId: string;
        filePath: string;
        origin?: Parameters<typeof replaceCharacterGalleryItemImage>[1]['origin'];
      }
    ) => {
      assertSpriteCapabilityUnlocked('spriteManage');
      return replaceCharacterGalleryItemImage(
        payload.itemId,
        {
          filePath: payload.filePath,
          origin: payload.origin
        },
        {
          packId: payload.packId,
          source: payload.source
        }
      );
    }
  );

  ipcMain.handle('sprite:character:gallery:remove', async (_e, payload: { packId?: string; source?: CharacterPackSource; itemId: string; deleteFile?: boolean }) => {
    assertSpriteCapabilityUnlocked('spriteManage');
    return removeCharacterGalleryItem(payload.itemId, {
      packId: payload.packId,
      source: payload.source,
      deleteFile: payload.deleteFile
    });
  });

  ipcMain.handle('sprite:character:gallery:buildAIEditContext', async (_e, payload: { packId?: string; source?: CharacterPackSource; draft: CharacterGalleryAIEditDraft }) => {
    return buildCharacterGalleryAIEditContext(payload.draft, {
      packId: payload.packId,
      source: payload.source
    });
  });

  ipcMain.handle('sprite:character:reload', async () => {
    const reload = await reloadCharacterRuntimeChain({
      notifyCapabilitySource: 'character.reload'
    });
    return {
      ok: true,
      character: getCharacterInfo(),
      runtime: reload.runtime,
      personaSlot: reload.personaSlot
    };
  });

  // ===== 维度 API =====

  ipcMain.handle('sprite:dimensions:get', () => {
    const schema = getPersonaRuleDimensionSchema();
    if (!schema) return null;
    const persona = mgr.getPersonaState();
    return schema.map((def) => ({
      id: def.id,
      name: def.name,
      icon: def.icon,
      description: def.description,
      maxValue: def.maxValue,
      value: persona.dimensions[def.id] ?? def.initialValue
    }));
  });

  // ===== 配置 =====

  ipcMain.handle('sprite:config:getAutoWalk', () => {
    return mgr.isAutoWalkEnabled();
  });

  ipcMain.handle('sprite:config:setAutoWalk', (_e, p: { enabled: boolean }) => {
    if (p.enabled) {
      ensureCapabilityUnlocked('movement');
    }
    mgr.setAutoWalkEnabled(p.enabled);
    broadcastAutoWalkConfig();
    return p.enabled;
  });

  ipcMain.handle('sprite:config:getDebugOverlay', () => {
    return mgr.isDebugOverlayEnabled();
  });

  ipcMain.handle('sprite:config:setDebugOverlay', (_e, p: { enabled: boolean }) => {
    mgr.setDebugOverlayEnabled(p.enabled);
    return p.enabled;
  });

  ipcMain.handle('sprite:config:getAnimationPlaylistMode', (_e, p?: { trigger?: SpriteAnimationTrigger }) => {
    return mgr.getAnimationPlaylistMode(p?.trigger);
  });

  ipcMain.handle('sprite:config:setAnimationPlaylistMode', (_e, p: { mode: SpriteAnimationPlaylistMode; trigger?: SpriteAnimationTrigger }) => {
    return mgr.setAnimationPlaylistMode(p.mode, p.trigger);
  });

  ipcMain.handle('sprite:config:getBubbleMode', () => {
    return mgr.getBubbleMode();
  });

  ipcMain.handle('sprite:config:setBubbleMode', (_e, p: { mode: SpriteBubbleMode }) => {
    const prev = mgr.getBubbleMode();
    const next = mgr.setBubbleMode(p?.mode ?? 'inline');
    // 切换模式时清空并隐藏气泡窗口，避免旧承载窗口残留或之后恢复出过期消息。
    syncSpriteBubbleWindows(spriteBubbleWindowManager, next, prev !== next);
    return next;
  });

  ipcMain.handle('sprite:movement:setAvoidRegions', (_e, p: { regions?: WindowControllerAvoidRegion[] } | undefined) => {
    mgr.setMovementAvoidRegions(Array.isArray(p?.regions) ? p.regions : []);
    return { ok: true };
  });

  ipcMain.handle('sprite:spontaneous:getPreferences', async () => {
    return (await deps.spontaneousUtteranceExecutor?.getSpontaneousUtterancePreferences?.()) ?? null;
  });

  ipcMain.handle('sprite:spontaneous:updatePreferences', async (_e, p: Record<string, unknown>) => {
    return (await deps.spontaneousUtteranceExecutor?.updateSpontaneousUtterancePreferences?.(p as any)) ?? null;
  });

  ipcMain.handle('sprite:spontaneous:listHistory', async (_e, p: Record<string, unknown> | undefined) => {
    return (await deps.spontaneousUtteranceExecutor?.listSpontaneousUtterances?.(p as any)) ?? [];
  });

  // 预览窗口移动效果
  ipcMain.handle('sprite:previewMovement', (_e, p: SpriteMovementPreviewConfig) => {
    if (p.movement?.enabled) {
      ensureCapabilityUnlocked('movement');
    }
    mgr.previewMovement(p);
  });

  // 停止移动预览
  ipcMain.handle('sprite:stopMovementPreview', () => {
    mgr.stopMovementPreview();
  });

  // ===== 语音合成 (Speak) =====

  /** 让精灵说话：合成 + 播放 + 显示气泡 */
  ipcMain.handle('sprite:speak', async (_e, p: SpeakRequest) => {
    return mgr.speak(p.text, { showBubble: p.showBubble, bubbleDuration: p.bubbleDuration });
  });

  /** 仅合成语音（不播放，不显示气泡） */
  ipcMain.handle('sprite:speak:synthesize', async (_e, p: { text: string }) => {
    return mgr.synthesizeSpeech(p.text);
  });

  /** 获取语音合成配置 */
  ipcMain.handle('sprite:speak:getConfig', () => {
    return mgr.getSpeakConfig();
  });

  /** 更新语音合成配置 */
  ipcMain.handle('sprite:speak:setConfig', (_e, p: Partial<SpriteSpeakConfig>) => {
    return mgr.setSpeakConfig(p);
  });

  /** 重置语音合成配置 */
  ipcMain.handle('sprite:speak:resetConfig', () => {
    return mgr.resetSpeakConfig();
  });

  /** 获取语音缓存统计 */
  ipcMain.handle('sprite:speak:getCacheStats', () => {
    return mgr.getSpeakCacheStats();
  });

  /** 清空语音缓存 */
  ipcMain.handle('sprite:speak:clearCache', async () => {
    await mgr.clearSpeakCache();
    return { success: true };
  });

  // ===== 统一事件触发 =====
  ipcMain.handle('sprite:trigger', (_e, p: SpriteTriggerRequest) => {
    const trigger = p.trigger;
    if (!trigger) {
      throw new Error('[sprite:trigger] Missing trigger');
    }

    mgr.trigger(trigger, {
      message: p.message,
      duration: p.duration,
      durationMs: p.durationMs,
      ctx: p.ctx,
      silent: p.silent
    });
  });

  ipcMain.handle('sprite:feedback:play', (_e, p: SpriteFeedbackRequest | null | undefined) => {
    const request = p ?? {};
    return mgr.playFeedbackAnimation({
      trigger: request.trigger,
      kind: request.kind,
      silent: request.silent,
      durationMs: request.durationMs,
      message: request.message,
      ctx: request.ctx
    });
  });

  // ===== 按动画 ID 测试播放 =====
  ipcMain.handle('sprite:triggerById', (_e, p: { animationId: string; message?: string; duration?: number; durationMs?: number; silent?: boolean }) => {
    return mgr.triggerById(p.animationId, {
      message: p.message,
      duration: p.duration,
      durationMs: p.durationMs,
      silent: p.silent
    });
  });

  // ===== Purpose / Routine 编排 =====
  ipcMain.handle('sprite:purpose:start', (_e, p: StartSpritePurposeRequest) => {
    return mgr.startPurpose(p);
  });

  ipcMain.handle('sprite:purpose:cancel', (_e, p: { purposeId?: string; reason?: string } | undefined) => {
    return mgr.cancelPurpose(p?.purposeId, p?.reason);
  });

  ipcMain.handle('sprite:purpose:getSnapshot', () => {
    return mgr.getPurposeSnapshot();
  });

  ipcMain.handle('sprite:purpose:event', (_e, p: SpritePurposeRuntimeEventInput) => {
    const result = mgr.emitPurposeEvent(p);
    if (p?.source === 'app-event' && Object.values(AppEvent).includes(p.event as AppEvent)) {
      eventManager.emit(p.event as AppEvent, p.payload);
    }
    return result;
  });

  ipcMain.handle('sprite:purpose:listHistory', (_e, p: SpritePurposeHistoryQuery | undefined) => {
    return mgr.listPurposeHistory(p);
  });

  ipcMain.handle('sprite:purpose:getDailyRetrospective', (_e, p: SpritePurposeRetrospectiveQuery | undefined) => {
    return mgr.getPurposeDailyRetrospective(p);
  });

  // ===== 启动引擎 =====

  // Initialize character pack authority first, then point CharacterService at the active pack root.
  const spritesDir = await getDefaultSpritesDir();
  initCharacterPackManager({
    userDataDir: app.getPath('userData'),
    builtinPackRootDir: spritesDir,
    appVersion: app.getVersion()
  });
  deps.addAllowedResourceRoot(getCharacterPackImportPreviewCacheRootDir());
  const activePack = await getActiveCharacterPack();
  initCharacterService(activePack?.rootDir ?? spritesDir, { source: activePack?.source ?? 'builtin' });
  await syncCharacterRuntime();
  const initialPersonaSlot = resolveActivePersonaSlot();
  mgr.configurePersonaStateSlot(initialPersonaSlot.id, initialPersonaSlot.identity);

  // ===== 加载动画（需先于 mgr.start()，否则默认行为无法读取 walk movement schedule） =====
  let initialAnimationsLoaded = false;
  try {
    await loadAndApplyRuntimeAnimations({ refreshCurrentState: false });
    initialAnimationsLoaded = true;
  } catch (err) {
    console.error('[SpriteManagerIPC] Failed to preload animations before start:', err);
  }

  await mgr.start();
  initCharacterDimensions();
  enforceCapabilityBoundRuntime();

  try {
    await deps.registerCharacterPersonaPromptProvider?.(() => {
      if (!getCharacterDefinition()) return null;
      const persona = mgr.getPersonaState();
      return buildCharacterPersonaPrompt({
        favorLevel: persona.favorLevel,
        mood: persona.mood,
        level: persona.level
      });
    });
  } catch {
    // External prompt bridge not available — skip registration.
  }

  // Character tool labels are exposed through the optional external bridge above.
  if (getCharacterToolLabels()) {
    console.log('[SpriteManager] Character tool labels loaded:', Object.keys(getCharacterToolLabels() ?? {}).length, 'tools');
  }

  // ===== 初始化事件监听器（订阅业务事件触发动画） =====
  initSpriteEventListener(mgr, deps.spriteEventListener);
  bindDailyCarePurposeBridge(mgr);

  // ===== 事件转发：persona:* → 主窗口 =====
  // 渲染进程负责打开窗口和处理数据
  const forwardPersonaEvent = (eventName: string, channel: string): void => {
    mgr.on(eventName, (event) => {
      try {
        if (!win.isDestroyed()) {
          win.webContents.send(channel, event.payload);
        }
      } catch {
        /* ignore */
      }
    });
  };

  forwardPersonaEvent('persona:level-up', 'persona:level-up');
  forwardPersonaEvent('persona:xp-gained', 'persona:xp-gained');
  forwardPersonaEvent('persona:favor-changed', 'persona:favor-changed');
  forwardPersonaEvent('persona:character-switched', 'persona:character-switched');
  forwardPersonaEvent('persona:daily-login', 'persona:daily-login');
  forwardPersonaEvent('persona:achievement-unlocked', 'persona:achievement-unlocked');

  // ===== 临时资源根目录（用于视频预览等场景） =====
  ipcMain.handle('sprite:addTempResourceRoot', (_e, root: string) => {
    deps.addAllowedResourceRoot(root);
    return { success: true };
  });

  // ===== 基于已加载动画触发初始播放 =====
  try {
    if (initialAnimationsLoaded) {
      // 状态机默认已在 idle，需 force 触发 onStateChange 以解析首个动画
      mgr.transitionTo('idle', { force: true });
    }
  } catch (err) {
    console.error('[SpriteManagerIPC] Failed to resolve initial animation:', err);
  }
}

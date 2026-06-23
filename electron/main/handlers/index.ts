import { windowManager } from '@aim-packages/window-manager';
import { app, BrowserWindow, screen } from 'electron';

import { initAIHandlers } from '../../../packages/ai/ipc-main';
import { listPresets, resolveUsablePreset } from '../../../packages/ai/preset-service';
import { getProviderDefinitionSchema, listProviderDefinitions } from '../../../packages/ai/providers/service';
import { PiExecutionService } from '../../../packages/ai/runtime/pi/execution-service';
import { broadcastMusicReactivitySnapshot, initMusicReactivityHandlers } from '../../../packages/audio-reactivity/ipc-main';
import { MusicReactivityService } from '../../../packages/audio-reactivity/music-reactivity-service';
import { AppEvent, eventManager } from '../../../packages/event';
import type { DownloadProgress } from '../../../packages/plugins';
import { initPluginResourceHandlers } from '../../../packages/plugins/ipc-main';
import { initRecorderHandlers } from '../../../packages/recorder/ipc-main';
import { initSherpaHandlers } from '../../../packages/sherpa/ipc-main';
import { assertSpriteCapabilityUnlocked } from '../../../packages/sprite-core/capability-runtime';
import { initSpriteHandlers, initSpriteManagerIPC } from '../../../packages/sprite-core/handler';
import { SpriteManager } from '../../../packages/sprite-core/manager';
import { DEFAULT_SPRITE_ROUTINE_PRESETS, SpritePurposeHistoryStore } from '../../../packages/sprite-core/purpose';
import { createOnboardingQuestRegistry, QuestEngine } from '../../../packages/sprite-core/quest';
import {
  type MessageButton,
  SPRITE_EVENT_TYPES,
  type SpriteWindowAnimationDisplay,
  type SpriteWindowAnimationMargin,
  type SpriteWindowAnimationPlacement,
  type SpriteWindowAnimationPlayPosition
} from '../../../packages/sprite-core/types';
import { initTTSHandlers } from '../../../packages/tts/ipc-main';
import { initYtDlpIpcHandlers } from '../../../packages/ytdlp';
import { createMainWindowAnimationPresetTimeline, isWindowAnimationPresetId, type WindowAnimationPresetDirection } from '../../../src/lib/window-animation-presets';
import { initDailyCare } from '../daily';
import { getMainSchedulerService, initSchedulerIPC } from '../scheduler';
import { initScreenshotHandlers } from '../screenshot';
import { initSelectedTextLearningHandlers } from '../selected-text/ipc-main';
import { initSkillTreeHandlers } from '../skillTreeWindow';
import { getResourcePath } from '../utils/resources-path';
import { initAnalyticsHandlers } from './analytics/ipc-main';
import { initAnnotationHandlers } from './annotation/ipc-main';
import { initAutomationHandlers } from './automation/ipc-main';
import { initClipHandlers } from './clip/ipc-main';
import { initDownloadHandlers } from './downloader/ipc-main';
import { initVectorHandlers } from './embedding/ipc-main';
import { initEmojiPackHandlers } from './emoji-packs/ipc-main';
import { initFFmpegHandlers } from './ffmpeg/ipc-main';
import { initFileHandlers } from './file/ipc-main';
import { initFolderHandlers } from './folder/ipc-main';
import { initMediaHandlers } from './media/ipc-main';
import { initMediaTrackHandlers } from './mediaTrack/ipc-main';
import { initMemoryHandlers } from './memory/ipc-main';
import { registerPurposeRetrospectiveMemoryProvider } from './memory/purpose-retrospective-memory-sync';
import { initPreferencesHandlers } from './preferences/ipc-main';
import { PreferencesStore } from './preferences/preferences-store';
import { initProxyHandlers } from './proxy/ipc-main';
import { getHttpProxy } from './proxy/proxy';
import { initQuestHandlers } from './quest/ipc-main';
import { initResourceHandlers } from './resource/ipc-main';
import { initRssHandlers } from './rss/ipc-main';
import { initShortcutsHandlers } from './shortcuts';
import { initSpleeterHandlers } from './spleeter/ipc-main';
import { SpritePurposePlannerRuntimeContextTracker } from './sprite/purpose-planner-context';
import { initSpritePurposePlannerIPC } from './sprite/purpose-planner-ipc';
import { SpritePurposePlannerPreferencesStore } from './sprite/purpose-planner-preferences';
import { createSpritePurposePiPlannerExecutor } from './sprite/purpose-planner-runtime';
import { createSpritePurposeRoutinePlanner, SpritePurposePlannerService } from './sprite/purpose-planner-service';
import { SpriteSpontaneousUtteranceService } from './sprite/spontaneous-utterance-service';
import { initStatusHandlers } from './status';
import { initSystemHandlers } from './system/ipc-main';
import { initThemeHandlers } from './theme/ipc-main';
import { initTrashHandlers } from './trash/ipc-main';
import { initUserProfileHandlers } from './user-profile/ipc-main';
import { initWindowHandlers } from './window';
import { attachAppWindowClosedReporter, emitAppWindowOpened, rememberWindowPayload } from './window-events';
import { emitWorkspaceWizardClosedIfStillEmpty, initWorkspaceHandlers } from './workspace/ipc-main';

let musicSpectrumWindowVisible = false;
let musicSpectrumDanceActive = false;
let musicSpectrumLastFrameAtMs = 0;
let musicSpectrumWatchdog: NodeJS.Timeout | null = null;
const MUSIC_SPECTRUM_FRAME_TIMEOUT_MS = 1200;
const MUSIC_SPECTRUM_BOTTOM_GAP_PX = 4;
const MUSIC_SPECTRUM_WINDOW_WIDTH = 360;
const MUSIC_SPECTRUM_WINDOW_HEIGHT = 48;
const DEFAULT_SPRITE_WINDOW_ANIMATION_TARGET = 'main';
const DEFAULT_CHAT_PROVIDER_ID = 'openai';
const WINDOW_ANIMATION_DIRECTIONS = new Set<WindowAnimationPresetDirection>(['top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left', 'top-left']);
const DEFAULT_WINDOW_ANIMATION_DESIGN_AREA = { width: 1440, height: 900 };
const spriteSpeechPiExecutionService = new PiExecutionService();

function positionMusicSpectrumWindowNearSprite(): void {
  const spectrumWindow = windowManager.get('musicSpectrum');
  const mainWindow = windowManager.get('main' as any);
  if (!spectrumWindow || spectrumWindow.isDestroyed() || !mainWindow || mainWindow.isDestroyed()) return;

  try {
    const currentSpectrumBounds = spectrumWindow.getBounds();
    if (currentSpectrumBounds.width !== MUSIC_SPECTRUM_WINDOW_WIDTH || currentSpectrumBounds.height !== MUSIC_SPECTRUM_WINDOW_HEIGHT) {
      spectrumWindow.setSize(MUSIC_SPECTRUM_WINDOW_WIDTH, MUSIC_SPECTRUM_WINDOW_HEIGHT, false);
    }

    const mainBounds = mainWindow.getBounds();
    const spectrumBounds = spectrumWindow.getBounds();
    const rawPadding = Math.max(0, Math.round(windowManager.getAssistantPadding?.() ?? 0));
    const padding = rawPadding * 2 < mainBounds.width && rawPadding * 2 < mainBounds.height ? rawPadding : 0;
    const anchorWidth = Math.max(1, mainBounds.width - padding * 2);
    const anchorHeight = Math.max(1, mainBounds.height - padding * 2);
    const x = Math.round(mainBounds.x + padding + (anchorWidth - spectrumBounds.width) / 2);
    const y = Math.round(mainBounds.y + padding + anchorHeight + MUSIC_SPECTRUM_BOTTOM_GAP_PX);
    spectrumWindow.setPosition(x, y);
  } catch (error) {
    console.warn('[MusicSpectrum] position window failed', error);
  }
}

async function setMusicSpectrumWindowVisible(shouldShow: boolean): Promise<void> {
  if (shouldShow === musicSpectrumWindowVisible) {
    if (shouldShow) positionMusicSpectrumWindowNearSprite();
    return;
  }
  musicSpectrumWindowVisible = shouldShow;
  try {
    if (shouldShow) {
      await windowManager.createOrShow('musicSpectrum');
      positionMusicSpectrumWindowNearSprite();
    } else {
      await windowManager.hide('musicSpectrum');
    }
  } catch (error) {
    console.warn('[MusicSpectrum] toggle window failed', error);
  }
}

function resolveWindowAnimationDirection(value: string | undefined): WindowAnimationPresetDirection {
  return value && WINDOW_ANIMATION_DIRECTIONS.has(value as WindowAnimationPresetDirection) ? (value as WindowAnimationPresetDirection) : 'left';
}

type WindowAnimationAdapterBounds = { x: number; y: number; width: number; height: number };
type WindowAnimationAdapterPoint = { x: number; y: number };
type WindowAnimationAdapterPlaybackSize = { width?: number; height?: number; padding?: number };

function getWindowAnimationAnchorOffset(
  anchor: SpriteWindowAnimationPlayPosition['positionAnchor'] | undefined,
  size: Pick<WindowAnimationAdapterBounds, 'width' | 'height'>
): WindowAnimationAdapterPoint {
  switch (anchor) {
    case 'top-left':
      return { x: 0, y: 0 };
    case 'top':
      return { x: size.width / 2, y: 0 };
    case 'top-right':
      return { x: size.width, y: 0 };
    case 'left':
      return { x: 0, y: size.height / 2 };
    case 'right':
      return { x: size.width, y: size.height / 2 };
    case 'bottom-left':
      return { x: 0, y: size.height };
    case 'bottom':
      return { x: size.width / 2, y: size.height };
    case 'bottom-right':
      return { x: size.width, y: size.height };
    case 'center':
    default:
      return { x: size.width / 2, y: size.height / 2 };
  }
}

function normalizeWindowAnimationMargin(margin?: SpriteWindowAnimationMargin): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  if (typeof margin === 'number' && Number.isFinite(margin)) {
    const value = Math.round(margin);
    return { top: value, right: value, bottom: value, left: value };
  }
  if (margin && typeof margin === 'object') {
    const x = Number.isFinite(margin.x) ? Math.round(margin.x as number) : 0;
    const y = Number.isFinite(margin.y) ? Math.round(margin.y as number) : 0;
    return {
      top: Number.isFinite(margin.top) ? Math.round(margin.top as number) : y,
      right: Number.isFinite(margin.right) ? Math.round(margin.right as number) : x,
      bottom: Number.isFinite(margin.bottom) ? Math.round(margin.bottom as number) : y,
      left: Number.isFinite(margin.left) ? Math.round(margin.left as number) : x
    };
  }
  return { top: 0, right: 0, bottom: 0, left: 0 };
}

function getWindowAnimationDisplayArea(displayMode: SpriteWindowAnimationDisplay | undefined, fallback: WindowAnimationAdapterBounds, useWorkArea = true): WindowAnimationAdapterBounds {
  const main = windowManager.get('main' as any);
  const source =
    displayMode === 'primary' ? screen.getPrimaryDisplay() : displayMode === 'main' && main && !main.isDestroyed() ? screen.getDisplayMatching(main.getBounds()) : screen.getDisplayMatching(fallback);
  return useWorkArea ? source.workArea : source.bounds;
}

function resolveSpriteWindowAnimationPlacementBounds(current: WindowAnimationAdapterBounds, placement?: SpriteWindowAnimationPlacement): WindowAnimationAdapterBounds | null {
  if (!placement?.anchor) return null;
  const area = getWindowAnimationDisplayArea(placement.display, current, placement.useWorkArea ?? true);
  const margin = normalizeWindowAnimationMargin(placement.margin);
  const offsetX = Number.isFinite(placement.offset?.x) ? Math.round(placement.offset?.x as number) : 0;
  const offsetY = Number.isFinite(placement.offset?.y) ? Math.round(placement.offset?.y as number) : 0;
  const left = area.x + margin.left;
  const right = area.x + area.width - current.width - margin.right;
  const top = area.y + margin.top;
  const bottom = area.y + area.height - current.height - margin.bottom;
  const centerX = area.x + (area.width - current.width) / 2;
  const centerY = area.y + (area.height - current.height) / 2;

  let x = current.x;
  let y = current.y;
  switch (placement.anchor) {
    case 'top-left':
      x = left;
      y = top;
      break;
    case 'top':
      x = centerX;
      y = top;
      break;
    case 'top-right':
      x = right;
      y = top;
      break;
    case 'left':
      x = left;
      y = centerY;
      break;
    case 'center':
      x = centerX;
      y = centerY;
      break;
    case 'right':
      x = right;
      y = centerY;
      break;
    case 'bottom-left':
      x = left;
      y = bottom;
      break;
    case 'bottom':
      x = centerX;
      y = bottom;
      break;
    case 'bottom-right':
      x = right;
      y = bottom;
      break;
  }

  return {
    ...current,
    x: Math.round(x + offsetX),
    y: Math.round(y + offsetY)
  };
}

function mapSpriteWindowAnimationPoint(point: WindowAnimationAdapterPoint, current: WindowAnimationAdapterBounds, playPosition: SpriteWindowAnimationPlayPosition): WindowAnimationAdapterPoint {
  const coordinateSpace = playPosition.coordinateSpace;
  if (coordinateSpace?.type !== 'design-area') {
    return { x: Math.round(point.x), y: Math.round(point.y) };
  }

  const designArea = coordinateSpace.designArea ?? DEFAULT_WINDOW_ANIMATION_DESIGN_AREA;
  const area = getWindowAnimationDisplayArea(coordinateSpace.display, current, coordinateSpace.useWorkArea ?? true);
  const scaleX = area.width / Math.max(1, designArea.width);
  const scaleY = area.height / Math.max(1, designArea.height);
  const fitMode = coordinateSpace.fitMode ?? 'stretch';
  let mappedX = area.x + point.x * scaleX;
  let mappedY = area.y + point.y * scaleY;
  if (fitMode !== 'stretch') {
    const uniformScale = fitMode === 'cover' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
    mappedX = area.x + (area.width - designArea.width * uniformScale) / 2 + point.x * uniformScale;
    mappedY = area.y + (area.height - designArea.height * uniformScale) / 2 + point.y * uniformScale;
  }
  return { x: Math.round(mappedX), y: Math.round(mappedY) };
}

function resolveSpriteWindowAnimationPlayBounds(current: WindowAnimationAdapterBounds, playPosition?: SpriteWindowAnimationPlayPosition): WindowAnimationAdapterBounds | null {
  if (!playPosition) return null;
  if (playPosition.mode === 'placement') {
    return resolveSpriteWindowAnimationPlacementBounds(current, playPosition.placement);
  }
  if (playPosition.mode !== 'point' || !playPosition.point) {
    return null;
  }
  const anchorPoint = mapSpriteWindowAnimationPoint(playPosition.point, current, playPosition);
  const offset = getWindowAnimationAnchorOffset(playPosition.positionAnchor ?? 'center', current);
  return {
    ...current,
    x: Math.round(anchorPoint.x - offset.x),
    y: Math.round(anchorPoint.y - offset.y)
  };
}

function normalizeSpriteWindowAnimationPlaybackSize(size?: WindowAnimationAdapterPlaybackSize): { width: number; height: number; padding: number } | null {
  if (!size) return null;
  const width = Number(size.width);
  const height = Number(size.height);
  const padding = Number(size.padding ?? 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
    padding: Math.max(0, Math.round(Number.isFinite(padding) ? padding : 0))
  };
}

function hasExplicitWindowAnimationSize(timeline: ReturnType<typeof createMainWindowAnimationPresetTimeline>): boolean {
  const hasSizedFrame = (frame: { width?: number; height?: number }): boolean => Number.isFinite(frame.width) || Number.isFinite(frame.height);
  return timeline.keyframes.some(hasSizedFrame) || Object.values(timeline.variants ?? {}).some((variant) => variant?.keyframes?.some(hasSizedFrame));
}

function resolveSpritePlaybackWindowBounds(current: WindowAnimationAdapterBounds, playbackSize?: WindowAnimationAdapterPlaybackSize): WindowAnimationAdapterBounds | null {
  const normalized = normalizeSpriteWindowAnimationPlaybackSize(playbackSize);
  if (!normalized) return null;
  const nextWidth = normalized.width + normalized.padding * 2;
  const nextHeight = normalized.height + normalized.padding * 2;
  if (current.width === nextWidth && current.height === nextHeight) {
    return null;
  }
  return {
    ...current,
    width: nextWidth,
    height: nextHeight
  };
}

function evaluateMusicSpectrumWindow(): void {
  const fresh = Date.now() - musicSpectrumLastFrameAtMs < MUSIC_SPECTRUM_FRAME_TIMEOUT_MS;
  const shouldShow = musicSpectrumDanceActive && fresh;
  void setMusicSpectrumWindowVisible(shouldShow);
}

function scheduleMusicSpectrumWatchdog(): void {
  if (musicSpectrumWatchdog) return;
  musicSpectrumWatchdog = setInterval(() => {
    evaluateMusicSpectrumWindow();
    if (!musicSpectrumDanceActive && !musicSpectrumWindowVisible && musicSpectrumWatchdog) {
      clearInterval(musicSpectrumWatchdog);
      musicSpectrumWatchdog = null;
    }
  }, 400);
}

function notifyMusicSpectrumDanceState(dancing: boolean): void {
  musicSpectrumDanceActive = dancing;
  evaluateMusicSpectrumWindow();
  if (dancing) scheduleMusicSpectrumWatchdog();
}

function notifyMusicSpectrumFrameReceived(): void {
  musicSpectrumLastFrameAtMs = Date.now();
  if (musicSpectrumDanceActive) evaluateMusicSpectrumWindow();
}

async function hasConfiguredChatProviderPreset(): Promise<boolean> {
  const chatProviderIds = listProviderDefinitions()
    .filter((definition) => definition.capabilities.chat !== false)
    .map((definition) => definition.id);

  for (const providerId of chatProviderIds) {
    if (await resolveUsablePreset(providerId)) {
      return true;
    }
  }

  return false;
}

function resolveChatProviderIdForGuide(): string {
  const providerDefinitions = listProviderDefinitions().filter((definition) => definition.capabilities.chat !== false);
  const presetProviderIds = new Set(listPresets().map((preset) => preset.providerId));
  return (
    providerDefinitions.find((definition) => presetProviderIds.has(definition.id))?.id ||
    providerDefinitions.find((definition) => definition.id === DEFAULT_CHAT_PROVIDER_ID)?.id ||
    providerDefinitions[0]?.id ||
    DEFAULT_CHAT_PROVIDER_ID
  );
}

function resolveRequiredProviderFields(providerId: string): string[] {
  const requiredFields =
    getProviderDefinitionSchema(providerId)
      ?.fields?.filter((field) => field.required)
      .map((field) => field.key)
      .filter(Boolean) || [];
  return requiredFields.length > 0 ? requiredFields : ['apiKey'];
}

function resolveChatApiConfigGuideContext(): Record<string, unknown> {
  const providerId = resolveChatProviderIdForGuide();
  const presetId = listPresets(providerId)[0]?.id;
  return {
    providerId,
    ...(presetId ? { presetId } : {}),
    fields: resolveRequiredProviderFields(providerId),
    trigger: 'onboarding'
  };
}

export async function initHandlers(win: BrowserWindow): Promise<void> {
  console.log(process.versions);
  const { WorkspacesRepo } = await import('../db/repositories');
  const countWorkspaces = async (): Promise<number> => {
    try {
      const list = await WorkspacesRepo.list({ deletedAt: 0 } as any, 1, 0);
      return Array.isArray(list) ? list.length : 0;
    } catch (err) {
      console.warn('[QuestEngine] countWorkspaces failed', err);
      return 0;
    }
  };
  const hasNoWorkspace = async (): Promise<boolean> => (await countWorkspaces()) <= 0;
  let onboardingFocusActive = await hasNoWorkspace();
  const scheduler = getMainSchedulerService();

  const setOnboardingFocus = (enabled: boolean): void => {
    onboardingFocusActive = enabled;
    if (enabled) {
      scheduler.pauseOwner('dailyCare', 'onboarding-workspace-required');
      return;
    }
    scheduler.resumeOwner('dailyCare');
  };
  const attachWorkspaceWizardClosedReporter = (workspaceWindow: BrowserWindow | null): void => {
    if (!workspaceWindow || workspaceWindow.isDestroyed()) return;
    if ((workspaceWindow as any).__workspaceWizardClosedReporterAttached) return;
    (workspaceWindow as any).__workspaceWizardClosedReporterAttached = true;
    const sourceWindowId = workspaceWindow.webContents.id;
    workspaceWindow.once('closed', () => {
      void emitWorkspaceWizardClosedIfStillEmpty('window-closed', sourceWindowId);
    });
  };

  setOnboardingFocus(onboardingFocusActive);

  initWindowHandlers(win);
  // Load proxy settings before any handlers that trigger startup network requests.
  await initProxyHandlers(win);
  initFFmpegHandlers(win);
  initVectorHandlers(win);
  initResourceHandlers();
  await initEmojiPackHandlers();
  initRssHandlers();
  initAutomationHandlers();
  initFolderHandlers?.();
  initTrashHandlers();
  initWorkspaceHandlers();
  initFileHandlers(win);
  initSystemHandlers();
  initSchedulerIPC();
  initDownloadHandlers(win);
  initSpriteHandlers({
    addAllowedResourceRoot: (await import('../resource-protocol')).addAllowedResourceRoot,
    getResourcePath,
    assertCapabilityUnlocked: assertSpriteCapabilityUnlocked
  });
  initDailyCare(
    () => {
      if (win && !win.isDestroyed()) return win;
      const existing = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
      return existing || null;
    },
    () => {
      return SpriteManager.hasInstance() ? SpriteManager.getInstance() : null;
    },
    {
      scheduler,
      autoDispatchGate: () => (onboardingFocusActive ? { accepted: false, reason: 'onboarding-workspace-required' } : true)
    }
  );
  initStatusHandlers(win);
  await initAIHandlers(win);
  {
    const { registerEmojiPackPromptEnricher } = await import('./emoji-packs/prompt');
    registerEmojiPackPromptEnricher();
  }
  initRecorderHandlers();
  initSherpaHandlers();
  initTTSHandlers();
  initShortcutsHandlers(win);
  initPreferencesHandlers();
  initPluginResourceHandlers(win, {
    getHttpProxy,
    getPluginDefinitionsPath: () => getResourcePath('plugins')!,
    onProgress: (info: DownloadProgress) => {
      // 发送到所有可能需要进度更新的窗口
      const targets = [win, windowManager.get('pluginDownload'), windowManager.get('pluginManager'), windowManager.get('settings')];
      for (const w of targets) {
        try {
          if (w && !w.isDestroyed()) {
            w.webContents.send('plugin-resource:progress', info);
          }
        } catch {
          // 窗口可能已关闭
        }
      }
    }
  });
  initThemeHandlers();
  initScreenshotHandlers();
  initSpleeterHandlers(win);
  initYtDlpIpcHandlers(win);
  initSkillTreeHandlers();
  initClipHandlers();
  initMediaTrackHandlers();
  initAnnotationHandlers();
  initMediaHandlers(win);
  initMemoryHandlers();
  initAnalyticsHandlers();
  initUserProfileHandlers();
  const purposeHistoryStore = new SpritePurposeHistoryStore(app.getPath('userData'));
  const purposeRetrospectiveProvider = (query?: Parameters<SpritePurposeHistoryStore['getDailyRetrospective']>[0]): ReturnType<SpritePurposeHistoryStore['getDailyRetrospective']> =>
    purposeHistoryStore.getDailyRetrospective(query);
  registerPurposeRetrospectiveMemoryProvider(purposeRetrospectiveProvider);
  const spontaneousUtteranceService = new SpriteSpontaneousUtteranceService({
    purposeRetrospectiveProvider
  });
  const purposePlannerPreferencesStore = new SpritePurposePlannerPreferencesStore(app.getPath('userData'));
  const purposePlannerContextTracker = new SpritePurposePlannerRuntimeContextTracker();
  const purposePlannerService = new SpritePurposePlannerService({
    preferences: purposePlannerPreferencesStore.read(),
    executor: createSpritePurposePiPlannerExecutor({
      context: () => purposePlannerContextTracker.resolve()
    }),
    presets: DEFAULT_SPRITE_ROUTINE_PRESETS,
    animationTriggers: SPRITE_EVENT_TYPES,
    history: purposeHistoryStore
  });
  initSpritePurposePlannerIPC(purposePlannerService, purposePlannerPreferencesStore);
  await initSpriteManagerIPC(win, {
    addAllowedResourceRoot: (await import('../resource-protocol')).addAllowedResourceRoot,
    registerCharacterPersonaPromptProvider: async (resolveCharacterPersonaPrompt) => {
      const { registerSystemPromptEnricher } = await import('../../../packages/ai/system-prompt-enricher');
      registerSystemPromptEnricher({
        id: 'character-persona',
        resolve: (ctx) => {
          if (!ctx.request.extras?.characterPersonaEnabled) return null;
          if (ctx.request.agentId === 'coder') return null;
          return resolveCharacterPersonaPrompt();
        }
      });
    },
    spontaneousUtteranceExecutor: spontaneousUtteranceService,
    speechSynthesisExecutor: {
      synthesize: (request) => spriteSpeechPiExecutionService.synthesizeSpeech(request),
      stream: (request, onEvent, input) => spriteSpeechPiExecutionService.streamSpeechSynthesis(request, onEvent, undefined, input)
    },
    syncCharacterToolLabels: async (labels) => {
      const { setCharacterToolLabels } = await import('../../../packages/ai/runtime/pi/tool-labels');
      setCharacterToolLabels(labels);
    },
    purposeWindowAdapter: {
      async open(windowKey, payload) {
        rememberWindowPayload(String(windowKey), payload);
        const opened = await windowManager.createOrShow(windowKey as any, payload);
        attachAppWindowClosedReporter(opened, String(windowKey), 'purpose-routine');
        if (String(windowKey) === 'workspaceWizard') {
          attachWorkspaceWizardClosedReporter(opened);
        }
        emitAppWindowOpened(String(windowKey), payload, 'purpose-routine');
      },
      async close(windowKey) {
        await windowManager.close(windowKey as any);
      },
      getBounds(windowKey) {
        const target = windowManager.get(windowKey as any);
        if (!target || target.isDestroyed()) return null;
        return target.getBounds();
      }
    },
    windowAnimationAdapter: {
      async playPreset(config) {
        const target = config.target || DEFAULT_SPRITE_WINDOW_ANIMATION_TARGET;
        const presetId = isWindowAnimationPresetId(config.presetId) ? config.presetId : 'fly-in';
        const targetWindow = windowManager.get(target as any);
        if (!targetWindow || targetWindow.isDestroyed()) {
          console.warn('[SpriteWindowAnimation] target window not available:', target);
          return;
        }

        let bounds = targetWindow.getBounds();
        const initialWorkArea = screen.getDisplayMatching(bounds).workArea;
        const probeTimeline = createMainWindowAnimationPresetTimeline({
          presetId,
          bounds,
          workArea: initialWorkArea,
          direction: resolveWindowAnimationDirection(config.direction),
          duration: typeof config.duration === 'number' && Number.isFinite(config.duration) ? config.duration : undefined,
          windowKey: target
        });
        if (target === DEFAULT_SPRITE_WINDOW_ANIMATION_TARGET && !hasExplicitWindowAnimationSize(probeTimeline)) {
          const playbackBounds = resolveSpritePlaybackWindowBounds(bounds, config.playbackSize);
          if (playbackBounds) {
            targetWindow.setBounds(playbackBounds, false);
            bounds = targetWindow.getBounds();
          }
        }
        const playBounds = resolveSpriteWindowAnimationPlayBounds(bounds, config.playPosition);
        if (playBounds) {
          targetWindow.setBounds(playBounds, false);
          bounds = targetWindow.getBounds();
        }
        const workArea = screen.getDisplayMatching(bounds).workArea;
        const timeline = createMainWindowAnimationPresetTimeline({
          presetId,
          bounds,
          workArea,
          direction: resolveWindowAnimationDirection(config.direction),
          duration: typeof config.duration === 'number' && Number.isFinite(config.duration) ? config.duration : undefined,
          windowKey: target
        });
        const result = await windowManager.playWindowAnimation(target as any, timeline);
        if (!result.ok) {
          console.warn('[SpriteWindowAnimation] play preset failed:', result.error || presetId);
        }
      }
    },
    purposeRoutinePlanner: createSpritePurposeRoutinePlanner(purposePlannerService, {
      history: purposeHistoryStore,
      getScreen: () => {
        const screenSize = screen.getPrimaryDisplay().workAreaSize;
        if (win.isDestroyed()) {
          return { screenSize };
        }
        const bounds = win.getBounds();
        return {
          screenSize,
          spritePosition: { x: bounds.x, y: bounds.y }
        };
      }
    })
  });
  initSelectedTextLearningHandlers(win);
  const musicReactivityService = new MusicReactivityService({
    getSpriteManager: () => {
      return SpriteManager.hasInstance() ? SpriteManager.getInstance() : null;
    },
    preferences: PreferencesStore.getMusicReactivity(),
    onSnapshot: (snapshot) => {
      broadcastMusicReactivitySnapshot(snapshot);
      notifyMusicSpectrumDanceState(snapshot.state === 'dancing');
    }
  });
  initMusicReactivityHandlers(musicReactivityService, {
    savePreferences: (preferences) => PreferencesStore.setMusicReactivity(preferences),
    onSpectrumFrame: () => notifyMusicSpectrumFrameReceived()
  });

  // ----------------------------------------------------------------------
  // Quest / 新手引导系统
  // ----------------------------------------------------------------------
  await initOnboardingQuestEngine(win, {
    countWorkspaces,
    hasChatApiConfigured: hasConfiguredChatProviderPreset,
    resolveChatApiConfigGuideContext,
    hasNoWorkspace,
    setOnboardingFocus,
    isOnboardingFocusActive: () => onboardingFocusActive
  });
}

/**
 * 初始化新手引导任务引擎（Quest）。挂在 initHandlers 末尾，依赖 SpriteManager 已就绪。
 * - 监听 AppEvent.WORKSPACE_CREATED / APP_STARTED 驱动 tick；
 * - 持久化 OnboardingState 到 PreferencesStore；
 * - 奖励发放走 SpriteManager 内部的 applyPersonaReward + markRewardClaimed，等同 IPC grantReward 流程。
 */
async function initOnboardingQuestEngine(
  _win: BrowserWindow,
  deps: {
    countWorkspaces: () => Promise<number>;
    hasChatApiConfigured: () => Promise<boolean>;
    resolveChatApiConfigGuideContext: () => Record<string, unknown> | undefined;
    hasNoWorkspace: () => Promise<boolean>;
    setOnboardingFocus: (enabled: boolean) => void;
    isOnboardingFocusActive: () => boolean;
  }
): Promise<void> {
  const registry = createOnboardingQuestRegistry({
    countWorkspaces: deps.countWorkspaces,
    hasChatApiConfigured: deps.hasChatApiConfigured,
    resolveChatApiConfigGuideContext: deps.resolveChatApiConfigGuideContext
  });

  const previousSuppressAmbientMessages = SpriteManager.hasInstance() ? SpriteManager.getInstance().getSuppressAmbientMessagesHandler() : undefined;
  if (SpriteManager.hasInstance()) {
    SpriteManager.getInstance().setSuppressAmbientMessagesHandler((context) => {
      if (deps.isOnboardingFocusActive() && (context === 'behavior' || context === 'welcome')) {
        return true;
      }
      return previousSuppressAmbientMessages?.(context) === true;
    });
  }

  deps.setOnboardingFocus(await deps.hasNoWorkspace());

  const engine = new QuestEngine({
    registry,
    startPurpose: async (request) => {
      const mgr = SpriteManager.hasInstance() ? SpriteManager.getInstance() : null;
      if (!mgr) {
        throw new Error('SpriteManager not initialized');
      }
      return mgr.startPurpose(request);
    },
    isPurposeAlive: (purposeId) => {
      const mgr = SpriteManager.hasInstance() ? SpriteManager.getInstance() : null;
      if (!mgr) return false;
      const snapshot = mgr.getPurposeSnapshot();
      return snapshot.current?.id === purposeId || snapshot.queue.some((purpose) => purpose.id === purposeId);
    },
    hasAchievement: (achievementId) => {
      const mgr = SpriteManager.hasInstance() ? SpriteManager.getInstance() : null;
      return mgr?.hasAchievement(achievementId) === true;
    },
    loadState: () => PreferencesStore.getOnboardingState() ?? null,
    saveState: (state) => {
      PreferencesStore.setOnboardingState(state);
    },
    grantReward: async (reward, source) => {
      const mgr = SpriteManager.hasInstance() ? SpriteManager.getInstance() : null;
      if (!mgr) return;
      // 幂等：source 以 'quest:' 开头时会被 SpriteManager 跳过重复发放。
      if (source.startsWith('quest:') && mgr.hasClaimedReward(source)) return;
      mgr.applyPersonaReward(
        {
          xp: reward.xp ?? 0,
          favor: reward.favor ?? 0,
          dimensions: (reward.dimensions ?? []).map((dimension) => ({
            id: dimension.id,
            delta: dimension.delta,
            maxValue: dimension.maxValue ?? 100
          }))
        },
        source
      );
      if (reward.achievementId) {
        mgr.unlockAchievement(reward.achievementId);
      }
      if (source.startsWith('quest:')) {
        mgr.markRewardClaimed(source);
      }
    },
    onRecommendation: async (offer, completedQuest) => {
      const mgr = SpriteManager.hasInstance() ? SpriteManager.getInstance() : null;
      if (!mgr) return;

      const buttons: MessageButton[] = [
        {
          id: 'start-recommended-quest',
          label: offer.confirmLabel || '继续',
          variant: 'default',
          action: `quest:start:${offer.questId}`
        }
      ];
      const cancelLabel = offer.cancelLabel?.trim();
      if (cancelLabel) {
        buttons.push({
          id: 'dismiss-recommended-quest',
          label: cancelLabel,
          variant: 'secondary',
          action: 'dismiss'
        });
      }

      if (offer.questId === 'first-file-drop' || offer.questId === 'open-resource-library') {
        const purposeSnapshot = mgr.getPurposeSnapshot();
        console.info('[QuestRecommendation] showing offer', {
          completedQuestId: completedQuest.id,
          recommendedQuestId: offer.questId,
          prompt: offer.prompt,
          confirmLabel: offer.confirmLabel,
          currentPurpose: purposeSnapshot.current
            ? {
              id: purposeSnapshot.current.id,
              kind: purposeSnapshot.current.kind,
              status: purposeSnapshot.current.status,
              priority: purposeSnapshot.current.priority
            }
            : null,
          queue: purposeSnapshot.queue.map((purpose) => ({
            id: purpose.id,
            kind: purpose.kind,
            status: purpose.status,
            priority: purpose.priority
          }))
        });
      }

      mgr.showNotice(offer.prompt || `要不要接着做「${offer.questTitle}」？`, {
        id: `quest-recommendation:${completedQuest.id}:${offer.questId}`,
        level: 'success',
        persistent: true,
        speak: true,
        buttons
      });
      mgr.playFeedbackAnimation({ trigger: 'write', kind: 'quest-record', silent: true });
    }
  });

  await engine.init();
  initQuestHandlers({ registry, engine });

  // 事件驱动 tick：WORKSPACE_CREATED 立即完成 workspace.create quest；
  // APP_STARTED 在启动时回放，处理"上一次启动就已经创建工作空间但 quest 还没标记 done"等场景。
  eventManager.on(AppEvent.WORKSPACE_CREATED, (data) => {
    deps.setOnboardingFocus(false);
    const mgr = SpriteManager.hasInstance() ? SpriteManager.getInstance() : null;
    mgr?.emitPurposeEvent({ source: 'app-event', event: 'WORKSPACE_CREATED', payload: data as Record<string, unknown> | undefined });
    void engine.tick({ event: 'WORKSPACE_CREATED', eventPayload: data });
  });
  eventManager.on(AppEvent.WORKSPACE_WIZARD_CLOSED, (data) => {
    const mgr = SpriteManager.hasInstance() ? SpriteManager.getInstance() : null;
    mgr?.emitPurposeEvent({ source: 'app-event', event: 'WORKSPACE_WIZARD_CLOSED', payload: data as Record<string, unknown> | undefined });
    void engine.tick({ event: 'WORKSPACE_WIZARD_CLOSED', eventPayload: data });
  });
  eventManager.on(AppEvent.RESOURCE_CREATED, (data) => {
    const mgr = SpriteManager.hasInstance() ? SpriteManager.getInstance() : null;
    const payload = data as Record<string, unknown> | undefined;
    const purposePayload = typeof payload?.metadata === 'string' && /"source"\s*:\s*"sprite-drop"/.test(payload.metadata) ? { ...payload, purposeSource: 'sprite-drop' } : payload;
    mgr?.emitPurposeEvent({ source: 'app-event', event: 'RESOURCE_CREATED', payload: purposePayload });
    void engine.tick({ event: 'RESOURCE_CREATED', eventPayload: data });
  });
  const spriteListenerPurposeEvents = new Set<AppEvent>([
    AppEvent.SPRITE_RESOURCE_IMPORT_COMPLETE,
    AppEvent.SPRITE_RESOURCE_IMPORT_ERROR,
    AppEvent.AI_PROVIDER_CONFIG_UPDATED,
    AppEvent.SPRITE_AI_COMPLETE,
    AppEvent.SPRITE_WORKFLOW_START,
    AppEvent.SPRITE_WORKFLOW_PROGRESS,
    AppEvent.SPRITE_WORKFLOW_COMPLETE,
    AppEvent.SPRITE_WORKFLOW_FAIL,
    AppEvent.SPRITE_WORKFLOW_CANCEL,
    AppEvent.SPRITE_DOWNLOAD_START,
    AppEvent.SPRITE_RSS_REFRESH,
    AppEvent.MEMORY_EXTRACTION_COMPLETED
  ]);

  const bridgeQuestEvent = (event: AppEvent, data: unknown): void => {
    if (!spriteListenerPurposeEvents.has(event)) {
      const mgr = SpriteManager.hasInstance() ? SpriteManager.getInstance() : null;
      mgr?.emitPurposeEvent({
        source: 'app-event',
        event,
        payload: data as Record<string, unknown> | undefined
      });
    }
    void engine.tick({ event, eventPayload: data });
  };

  const questBridgeEvents: AppEvent[] = [
    AppEvent.SPRITE_RESOURCE_IMPORT_COMPLETE,
    AppEvent.SPRITE_RESOURCE_IMPORT_ERROR,
    AppEvent.AI_PROVIDER_CONFIG_UPDATED,
    AppEvent.ASSISTANT_MENU_ITEM_SELECTED,
    AppEvent.FILE_ACTION_SELECTED,
    AppEvent.FILE_ACTION_WORKFLOW_STARTED,
    AppEvent.FILE_ACTION_RESOLVED,
    AppEvent.FILE_ACTION_FAILED,
    AppEvent.FILE_ACTION_CANCELLED,
    AppEvent.APP_WINDOW_OPENED,
    AppEvent.APP_WINDOW_CLOSED,
    AppEvent.RESOURCE_PREVIEW_OPENED,
    AppEvent.SPRITE_AI_COMPLETE,
    AppEvent.SPRITE_WORKFLOW_START,
    AppEvent.SPRITE_WORKFLOW_PROGRESS,
    AppEvent.SPRITE_WORKFLOW_COMPLETE,
    AppEvent.SPRITE_WORKFLOW_FAIL,
    AppEvent.SPRITE_WORKFLOW_CANCEL,
    AppEvent.SPRITE_DOWNLOAD_START,
    AppEvent.SPRITE_RSS_REFRESH,
    AppEvent.MEMORY_SAVED,
    AppEvent.MEMORY_EXTRACTION_COMPLETED
  ];

  for (const event of questBridgeEvents) {
    eventManager.on(event, (data) => {
      bridgeQuestEvent(event, data);
    });
  }
  eventManager.on(AppEvent.APP_STARTED, () => {
    void (async () => {
      deps.setOnboardingFocus(await deps.hasNoWorkspace());
      await engine.tick({ event: 'APP_STARTED' });
    })();
  });
}

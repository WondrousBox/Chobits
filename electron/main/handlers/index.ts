import { windowManager } from '@aim-packages/window-manager';
import { getResourcePath } from '@packages/common/utils';
import { createMainWindowAnimationPresetTimeline, isWindowAnimationPresetId, type WindowAnimationPresetDirection } from '@packages/common/window-animation-presets';
import { attachAppWindowClosedReporter, emitAppWindowOpened, rememberWindowPayload } from '@packages/event/window-events';
import { app, BrowserWindow, screen } from 'electron';

import { initAIHandlers } from '../../../packages/ai/ipc-main';
import { PiExecutionService } from '../../../packages/ai/runtime/pi/execution-service';
import { registerCharacterToolLabelsResolver } from '../../../packages/ai/runtime/pi/tool-labels';
import { registerSystemPromptEnricher } from '../../../packages/ai/system-prompt-enricher';
import type { DownloadProgress } from '../../../packages/plugins';
import { initPluginResourceHandlers } from '../../../packages/plugins/ipc-main';
import { initSherpaHandlers, initSherpaStubHandlers } from '../../../packages/sherpa/ipc-main';
import { assertSpriteCapabilityUnlocked } from '../../../packages/sprite-core/capability-runtime';
import { getCharacterDefinition } from '../../../packages/sprite-core/character-service';
import { initSpriteHandlers, initSpriteManagerIPC } from '../../../packages/sprite-core/handler';
import { DEFAULT_SPRITE_ROUTINE_PRESETS, SpritePurposeHistoryStore } from '../../../packages/sprite-core/purpose';
import {
  SPRITE_EVENT_TYPES,
  type SpriteWindowAnimationDisplay,
  type SpriteWindowAnimationMargin,
  type SpriteWindowAnimationPlacement,
  type SpriteWindowAnimationPlayPosition
} from '../../../packages/sprite-core/types';
import { isFeatureEnabled } from '../feature-flags';
import { addAllowedResourceRoot, isPathWithinAllowedRoots } from '../resource-protocol';
import { initFileHandlers } from './file/ipc-main';
import { initPreferencesHandlers } from './preferences/ipc-main';
import { initProxyHandlers } from './proxy/ipc-main';
import { getHttpProxy } from './proxy/proxy';
import { initShortcutsHandlers } from './shortcuts';
import { SpritePurposePlannerRuntimeContextTracker } from './sprite/purpose-planner-context';
import { initSpritePurposePlannerIPC } from './sprite/purpose-planner-ipc';
import { SpritePurposePlannerPreferencesStore } from './sprite/purpose-planner-preferences';
import { createSpritePurposePiPlannerExecutor } from './sprite/purpose-planner-runtime';
import { createSpritePurposeRoutinePlanner, SpritePurposePlannerService } from './sprite/purpose-planner-service';
import { createSpriteSpeechTextTranslator } from './sprite/speech-text-translator';
import { SpriteSpontaneousUtteranceService } from './sprite/spontaneous-utterance-service';
import { initStatusHandlers } from './status';
import { initSystemHandlers } from './system/ipc-main';
import { initThemeHandlers } from './theme/ipc-main';
import { initWindowHandlers } from './window';

const DEFAULT_SPRITE_WINDOW_ANIMATION_TARGET = 'main';
const WINDOW_ANIMATION_DIRECTIONS = new Set<WindowAnimationPresetDirection>(['top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left', 'top-left']);
const DEFAULT_WINDOW_ANIMATION_DESIGN_AREA = { width: 1440, height: 900 };
const spriteSpeechPiExecutionService = new PiExecutionService();

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

export async function initHandlers(win: BrowserWindow): Promise<void> {
  initWindowHandlers(win);
  // Load proxy settings before any handlers that trigger startup network requests.
  await initProxyHandlers(win);
  initFileHandlers(win);
  initSystemHandlers();
  initSpriteHandlers({
    addAllowedResourceRoot,
    getResourcePath,
    assertCapabilityUnlocked: assertSpriteCapabilityUnlocked
  });
  initStatusHandlers(win);
  await initAIHandlers(win);
  if (isFeatureEnabled('localAi')) {
    initSherpaHandlers();
  } else {
    initSherpaStubHandlers();
  }
  initShortcutsHandlers(win);
  initPreferencesHandlers();
  initPluginResourceHandlers(win, {
    getHttpProxy,
    getPluginDefinitionsPath: () => getResourcePath('plugins')!,
    onProgress: (info: DownloadProgress) => {
      const targets = [win, windowManager.get('settings')];
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

  const purposeHistoryStore = new SpritePurposeHistoryStore(app.getPath('userData'));
  const purposeRetrospectiveProvider = (query?: Parameters<SpritePurposeHistoryStore['getDailyRetrospective']>[0]): ReturnType<SpritePurposeHistoryStore['getDailyRetrospective']> =>
    purposeHistoryStore.getDailyRetrospective(query);
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
    addAllowedResourceRoot,
    isPathWithinAllowedRoots,
    registerCharacterPersonaPromptProvider: async (resolveCharacterPersonaPrompt) => {
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
      stream: (request, onEvent, input, signal) => spriteSpeechPiExecutionService.streamSpeechSynthesis(request, onEvent, signal, input)
    },
    textTranslator: createSpriteSpeechTextTranslator(),
    characterSpeechLanguageResolver: () => getCharacterDefinition()?.speechStyle?.language ?? null,
    registerCharacterToolLabelsResolver: (resolver) => {
      registerCharacterToolLabelsResolver(resolver);
    },
    purposeWindowAdapter: {
      async open(windowKey, payload) {
        rememberWindowPayload(String(windowKey), payload);
        const opened = await windowManager.createOrShow(windowKey as any, payload);
        attachAppWindowClosedReporter(opened, String(windowKey), 'purpose-routine');
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
}

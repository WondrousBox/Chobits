import { windowManager } from '@aim-packages/window-manager';
import { app, BrowserWindow, screen } from 'electron';

import { initAIHandlers } from '../../../packages/ai/ipc-main';
import type { DownloadProgress } from '../../../packages/plugins';
import { initPluginResourceHandlers } from '../../../packages/plugins/ipc-main';
import { initRecorderHandlers } from '../../../packages/recorder/ipc-main';
import { initSherpaHandlers } from '../../../packages/sherpa/ipc-main';
import { assertSpriteCapabilityUnlocked } from '../../../packages/sprite-core/capability-runtime';
import { initSpriteHandlers, initSpriteManagerIPC } from '../../../packages/sprite-core/handler';
import { DEFAULT_SPRITE_ROUTINE_PRESETS, SpritePurposeHistoryStore } from '../../../packages/sprite-core/purpose';
import { SPRITE_EVENT_TYPES } from '../../../packages/sprite-core/types';
import { initTTSHandlers } from '../../../packages/tts/ipc-main';
import { initYtDlpIpcHandlers } from '../../../packages/ytdlp';
import { initDailyCare } from '../daily';
import { initSchedulerIPC } from '../scheduler';
import { initScreenshotHandlers } from '../screenshot';
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
import { initProxyHandlers } from './proxy/ipc-main';
import { getHttpProxy } from './proxy/proxy';
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
import { initWorkspaceHandlers } from './workspace/ipc-main';

export async function initHandlers(win: BrowserWindow): Promise<void> {
  console.log(process.versions);

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
  initDailyCare(() => {
    if (win && !win.isDestroyed()) return win;
    const existing = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
    return existing || null;
  });
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
    syncCharacterToolLabels: async (labels) => {
      const { setCharacterToolLabels } = await import('../../../packages/ai/runtime/pi/tool-labels');
      setCharacterToolLabels(labels);
    },
    purposeWindowAdapter: {
      async open(windowKey, payload) {
        await windowManager.createOrShow(windowKey as any, payload);
      },
      async close(windowKey) {
        await windowManager.close(windowKey as any);
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

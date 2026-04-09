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
 *   sprite:persona:addXP     — 增加经验
 *   sprite:persona:changeFavor — 修改好感度
 *   sprite:persona:recordLogin — 记录登录
 *   sprite:persona:unlockAchievement — 解锁成就
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

import { buildCharacterPersonaPrompt, getCharacterDefinition, getCharacterInfo, getCharacterToolLabels, getDimensionSchema, initCharacterService } from '../character-service';
import { isSpriteInteractionIntent, type SpriteInteractionPayload } from '../interaction-contract';
import type { SpriteSpontaneousUtteranceExecutor } from '../manager';
import { SpriteManager } from '../manager';
import type { SpeakRequest, SpriteSpeakConfig } from '../speak/types';
import { WindowController } from '../window-controller';
import { listSprites } from './sprite-assets';
import { getDefaultSpritesDir } from './sprite-assets';
import { initSpriteEventListener } from './sprite-event-listener';

export interface SpriteManagerDeps {
  addAllowedResourceRoot: (root: string) => void;
  spontaneousUtteranceExecutor?: SpriteSpontaneousUtteranceExecutor;
}

export async function initSpriteManagerIPC(win: BrowserWindow, deps: SpriteManagerDeps): Promise<void> {
  // 初始化 SpriteManager
  const mgr = SpriteManager.init({
    win: win as any,
    dataDir: app.getPath('userData'),
    getScreenSize: () => screen.getPrimaryDisplay().workAreaSize,
    appName: 'Chobits',
    spontaneousUtteranceExecutor: deps.spontaneousUtteranceExecutor
  });

  // 初始化 WindowController 并注入
  const windowCtrl = new WindowController({
    getWindow: () => (win.isDestroyed() ? null : (win as any)),
    getScreenSize: () => screen.getPrimaryDisplay().workAreaSize,
    getCursorScreenPoint: () => screen.getCursorScreenPoint(),
    getPadding: () => mgr.getSpriteConfig().padding,
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
  ipcMain.handle('sprite:anim-complete', (_e, payload: { animId: string; phase: 'intro' | 'loop' | 'outro' | 'full' }) => {
    mgr.handleAnimationComplete(payload.animId, payload.phase);
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

  // ===== 人格化 API =====

  ipcMain.handle('sprite:persona:getState', () => {
    return { ok: true, state: mgr.getPersonaState() };
  });

  ipcMain.handle('sprite:persona:addXP', (_e, p: { amount: number; source?: string }) => {
    const result = mgr.addXP(p.amount, p.source);
    return { ok: true, ...result, state: mgr.getPersonaState() };
  });

  ipcMain.handle('sprite:persona:changeFavor', (_e, p: { delta: number; reason?: string }) => {
    const result = mgr.changeFavor(p.delta, p.reason);
    return { ok: true, ...result, state: mgr.getPersonaState() };
  });

  ipcMain.handle('sprite:persona:recordLogin', () => {
    const result = mgr.recordDailyLogin();
    return { ok: true, ...result, state: mgr.getPersonaState() };
  });

  ipcMain.handle('sprite:persona:unlockAchievement', (_e, p: { id: string }) => {
    const unlocked = mgr.unlockAchievement(p.id);
    return { ok: true, unlocked };
  });

  ipcMain.handle('sprite:persona:reset', () => {
    const state = mgr.resetPersonaState();
    return { ok: true, state };
  });

  // ===== 角色人格 API =====

  ipcMain.handle('sprite:character:getInfo', () => {
    return getCharacterInfo();
  });

  ipcMain.handle('sprite:character:getPersonaPrompt', (_e, options?: import('../character-service').PersonaPromptBuildOptions) => {
    const persona = mgr.getPersonaState();
    return buildCharacterPersonaPrompt({
      favorLevel: persona.favorLevel,
      mood: persona.mood,
      level: persona.level
    }, options);
  });

  // ===== 维度 API =====

  ipcMain.handle('sprite:dimensions:get', () => {
    const schema = getDimensionSchema();
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
    mgr.setAutoWalkEnabled(p.enabled);
    return p.enabled;
  });

  ipcMain.handle('sprite:config:getDebugOverlay', () => {
    return mgr.isDebugOverlayEnabled();
  });

  ipcMain.handle('sprite:config:setDebugOverlay', (_e, p: { enabled: boolean }) => {
    mgr.setDebugOverlayEnabled(p.enabled);
    return p.enabled;
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
  ipcMain.handle('sprite:previewMovement', (_e, p: { width: number; height: number; padding: number; movement: any }) => {
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

  // 覆盖旧的 auto-walk IPC（window.ts 中注册的版本只更新本地变量，
  // 不会同步到 SpriteManager，导致行为引擎读到旧值）
  ipcMain.removeHandler('getAutoWalkEnabled');
  ipcMain.handle('getAutoWalkEnabled', () => {
    return mgr.isAutoWalkEnabled();
  });
  ipcMain.removeHandler('setAutoWalkEnabled');
  ipcMain.handle('setAutoWalkEnabled', (_e: any, enabled: boolean) => {
    mgr.setAutoWalkEnabled(enabled);
    // 广播状态变化给 UI
    try {
      if (!win.isDestroyed()) {
        win.webContents.send('auto-walk-enabled-changed', enabled);
      }
    } catch {
      /* ignore */
    }
    return enabled;
  });

  // ===== 统一事件触发 =====
  ipcMain.handle('sprite:trigger', (_e, p: { eventType: string; message?: string; duration?: number; durationMs?: number; ctx?: any; silent?: boolean }) => {
    mgr.trigger(p.eventType, {
      message: p.message,
      duration: p.duration,
      durationMs: p.durationMs,
      ctx: p.ctx,
      silent: p.silent
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

  // ===== 启动引擎 =====

  // Initialize character service with the sprites directory
  const spritesDir = await getDefaultSpritesDir();
  initCharacterService(spritesDir);

  await mgr.start();

  // Register character persona enricher into the AI module's generic extension point.
  // The enricher is only active when extras.characterPersonaEnabled is set and agent is not 'coder'.
  try {
    const { registerSystemPromptEnricher } = await import('../../ai/system-prompt-enricher');
    registerSystemPromptEnricher({
      id: 'character-persona',
      resolve: (ctx) => {
        if (!ctx.request.extras?.characterPersonaEnabled) return null;
        if (ctx.request.agentId === 'coder') return null;
        if (!getCharacterDefinition()) return null;
        const persona = mgr.getPersonaState();
        return buildCharacterPersonaPrompt({
          favorLevel: persona.favorLevel,
          mood: persona.mood,
          level: persona.level
        });
      }
    });
  } catch {
    // AI module not available — skip enricher registration
  }

  // Register character tool labels into the tool-labels system
  try {
    const { setCharacterToolLabels } = await import('../../ai/runtime/pi/tool-labels');
    const toolLabels = getCharacterToolLabels();
    if (toolLabels) {
      setCharacterToolLabels(toolLabels);
      console.log('[SpriteManager] Character tool labels loaded:', Object.keys(toolLabels).length, 'tools');
    }
  } catch {
    // AI runtime not available — skip tool labels
  }

  // ===== 初始化维度值（从 character.json 定义） =====
  const dimSchema = getDimensionSchema();
  if (dimSchema) {
    mgr.initDimensions(dimSchema.map((d) => ({ id: d.id, initialValue: d.initialValue })));
  }

  // ===== 初始化事件监听器（订阅业务事件触发动画） =====
  initSpriteEventListener(mgr);

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

  // ===== 临时资源根目录（用于视频预览等场景） =====
  ipcMain.handle('sprite:addTempResourceRoot', (_e, root: string) => {
    deps.addAllowedResourceRoot(root);
    return { success: true };
  });

  // ===== 加载动画并触发初始播放 =====
  try {
    const sprites = await listSprites();
    mgr.registerAnimations(sprites);
    // 状态机默认已在 idle，需 force 触发 onStateChange 以解析首个动画
    mgr.transitionTo('idle', { force: true });
  } catch (err) {
    console.error('[SpriteManagerIPC] Failed to load initial animations:', err);
  }
}

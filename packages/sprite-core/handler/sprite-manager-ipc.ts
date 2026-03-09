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

import type { InteractionType } from '../interaction-tracker';
import { SpriteManager } from '../sprite-manager';
import { WindowController } from '../window-controller';
import { listSprites } from './sprite-assets';
import { initSpriteEventListener } from './sprite-event-listener';

export async function initSpriteManagerIPC(win: BrowserWindow): Promise<void> {
  // 初始化 SpriteManager
  const mgr = SpriteManager.init({
    win: win as any,
    dataDir: app.getPath('userData'),
    getScreenSize: () => screen.getPrimaryDisplay().workAreaSize,
    appName: 'Chobits'
  });

  // 初始化 WindowController 并注入
  const windowCtrl = new WindowController({
    getWindow: () => (win.isDestroyed() ? null : (win as any)),
    getScreenSize: () => screen.getPrimaryDisplay().workAreaSize,
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
  ipcMain.handle('sprite:interact', (_e, payload: { type: InteractionType; data?: Record<string, any> }) => {
    mgr.reportInteraction(payload.type, payload.data);
  });

  // 拖拽
  ipcMain.handle('sprite:drag', (_e, payload: { phase: 'start' | 'move' | 'end'; screenX?: number; screenY?: number; offsetX?: number; offsetY?: number }) => {
    switch (payload.phase) {
      case 'start':
        mgr.startDrag(payload.offsetX!, payload.offsetY!);
        break;
      case 'move':
        mgr.updateDrag(payload.screenX!, payload.screenY!);
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

  // ===== 配置 =====

  ipcMain.handle('sprite:config:getAutoWalk', () => {
    return mgr.isAutoWalkEnabled();
  });

  ipcMain.handle('sprite:config:setAutoWalk', (_e, p: { enabled: boolean }) => {
    mgr.setAutoWalkEnabled(p.enabled);
    return p.enabled;
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

  // ===== 启动引擎 =====
  await mgr.start();

  // ===== 初始化事件监听器（订阅业务事件触发动画） =====
  const cleanupEventListener = initSpriteEventListener(mgr);

  // ===== 事件转发：persona:level-up → 主窗口 =====
  // 渲染进程负责打开窗口和处理数据
  mgr.on('persona:level-up', (event) => {
    try {
      if (!win.isDestroyed()) {
        win.webContents.send('persona:level-up', event.payload);
      }
    } catch {
      /* ignore */
    }
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

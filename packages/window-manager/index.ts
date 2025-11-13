import path from 'node:path';

import { BrowserWindow, screen } from 'electron';

import { FollowerPreferMode, FollowerSide, WindowConfig, WindowKey } from './types';
import { windowConfigs } from './window-config';
import { initWindowConfigs } from './window-config';
import { restoreWindowState, saveWindowState } from './window-state-store';

let SERVER_URL = '';
let RENDERER_DIST = '';

let ANCHOR_WIDTH = -1;
let ANCHOR_HEIGHT = -1;

// 计算跟随窗口位置的函数
function computeFollowerPosition(
  main: Electron.Rectangle,
  follower: { width: number; height: number },
  preferMode?: FollowerPreferMode,
  assistantPadding: number = 100,
  forceCenterAlignment: boolean = false
): { x: number; y: number; side: FollowerSide } {
  const gap = 12;
  const padding = assistantPadding;
  const anchor = { x: main.x + padding, y: main.y + padding, width: ANCHOR_WIDTH === -1 ? main.width : ANCHOR_WIDTH, height: ANCHOR_HEIGHT === -1 ? main.height : ANCHOR_HEIGHT };
  const display = screen.getDisplayNearestPoint({ x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2 });
  const work = display.workArea;
  const mode = preferMode || 'prefer-right';

  // overlap-center 模式：把跟随窗口居中覆盖在助手区域上
  if (mode === 'overlap-center') {
    // 计算助手区域的中心点
    const centerX = Math.round(anchor.x + (anchor.width - follower.width) / 2);
    const centerY = Math.round(anchor.y + (anchor.height - follower.height) / 2);

    if (forceCenterAlignment) {
      // 强制居中，忽略屏幕边界限制
      return { x: centerX, y: centerY, side: 'overlap' as FollowerSide };
    } else {
      // 确保窗口在屏幕范围内
      const x = Math.min(Math.max(centerX, work.x), work.x + work.width - follower.width);
      const y = Math.min(Math.max(centerY, work.y), work.y + work.height - follower.height);
      return { x, y, side: 'overlap' as FollowerSide };
    }
  }

  const candidates: Array<{ x: number; y: number; score: number; side: FollowerSide }> = [];
  // 基础候选位置
  const base: Array<{ x: number; y: number; side: FollowerSide; baseScore: number }> = [
    { x: anchor.x + anchor.width + gap, y: anchor.y, side: 'right', baseScore: 100 },
    { x: anchor.x - follower.width - gap, y: anchor.y, side: 'left', baseScore: 100 },
    { x: anchor.x, y: anchor.y + anchor.height + gap, side: 'bottom', baseScore: 100 },
    { x: anchor.x, y: anchor.y - follower.height - gap, side: 'top', baseScore: 100 }
  ];

  // 根据优先模式附加偏好分
  const preferenceBoost = (side: FollowerSide): number => {
    switch (mode) {
      case 'prefer-right':
        return side === 'right' ? 20 : 0;
      case 'prefer-left':
        return side === 'left' ? 20 : 0;
      case 'prefer-bottom':
        return side === 'bottom' ? 20 : 0;
      case 'prefer-top':
        return side === 'top' ? 20 : 0;
      case 'auto':
      default:
        return 0;
    }
  };

  for (const b of base) {
    candidates.push({ x: b.x, y: b.y, score: b.baseScore + preferenceBoost(b.side), side: b.side });
  }

  const valid: typeof candidates = [];
  for (const c of candidates) {
    const withinX = c.x >= work.x && c.x + follower.width <= work.x + work.width;
    const withinY = c.y >= work.y && c.y + follower.height <= work.y + work.height;
    if (withinX && withinY) valid.push(c);
  }
  if (valid.length === 0) {
    // 允许越界，找最小出界
    function overflowArea(c: (typeof candidates)[number]): number {
      const ox = Math.max(0, work.x - c.x) + Math.max(0, c.x + follower.width - (work.x + work.width));
      const oy = Math.max(0, work.y - c.y) + Math.max(0, c.y + follower.height - (work.y + work.height));
      return ox * follower.height + oy * follower.width;
    }
    candidates.forEach((c) => ((c as any).overflow = overflowArea(c)));
    candidates.sort((a: any, b: any) => a.overflow - b.overflow || b.score - a.score);
    const best = candidates[0];
    return {
      x: Math.min(Math.max(best.x, work.x), work.x + work.width - follower.width),
      y: Math.min(Math.max(best.y, work.y), work.y + work.height - follower.height),
      side: best.side
    };
  }
  valid.sort((a, b) => b.score - a.score);
  const best = valid[0];
  return { x: best.x, y: best.y, side: best.side };
}

// Polyfill rAF in main process (Node 没有原生 requestAnimationFrame)
const hasNativeRaf = typeof (globalThis as any).requestAnimationFrame === 'function';
const raf = (cb: (ts: number) => void): number => {
  if (hasNativeRaf) return (globalThis as any).requestAnimationFrame(cb);
  return setTimeout(() => cb(performance.now()), 16) as unknown as number;
};
const caf = (id: number): void => {
  if (hasNativeRaf) (globalThis as any).cancelAnimationFrame(id);
  else clearTimeout(id as any);
};

// Open DevTools automatically in dev/test environments
const SHOULD_OPEN_DEVTOOLS = !!SERVER_URL || (process.env.NODE_ENV && process.env.NODE_ENV !== 'production');
function maybeOpenDevTools(w: BrowserWindow | null): void {
  if (SHOULD_OPEN_DEVTOOLS && w && !w.isDestroyed()) {
    // detach mode avoids overlaying frameless/transparent windows
    w.webContents.openDevTools({ mode: 'detach' });
  }
}

export class WindowManager {
  private static _instance: WindowManager | null = null;
  static get instance(): WindowManager {
    if (!this._instance) this._instance = new WindowManager();
    return this._instance;
  }

  private registry = new Map<WindowKey, BrowserWindow>();
  private mainWindow: BrowserWindow | null = null;
  private preloadPath: string | undefined;
  private followerWindows = new Set<WindowKey>();
  private assistantPadding: number = 100;
  // Track which window opened which (childKey -> opener BrowserWindow)
  private openersByChild = new Map<WindowKey, BrowserWindow>();

  // 动画相关状态
  private followerAnimTimer: NodeJS.Timeout | null = null;
  private followerAnimRaf: number | null = null;
  private followerAnimStart: number = 0;
  private followerAnimFrom: { x: number; y: number } | null = null;
  private followerAnimTo: { x: number; y: number } | null = null;
  private followerAnimDur = 0;
  private lastFollowerSide = new Map<WindowKey, FollowerSide | null>();
  // Callbacks to control hover monitor from handlers
  private onBeforeFollowerShow?: () => void;
  private onAfterFollowerHide?: () => void;

  init(
    mainWindow: BrowserWindow,
    options: {
      preloadPath?: string;
      assistantPadding?: number;
      anchorWidth?: number;
      anchorHeight?: number;
      serverUrl?: string;
      rendererDist?: string;
      windowConfigs?: Record<WindowKey, WindowConfig>;
      onBeforeFollowerShow?: () => void;
      onAfterFollowerHide?: () => void;
    }
  ): void {
    this.mainWindow = mainWindow;
    this.preloadPath = options.preloadPath || (mainWindow as any).__preloadPath;

    if (options.anchorWidth !== undefined) {
      ANCHOR_WIDTH = options.anchorWidth;
    }
    if (options.anchorHeight !== undefined) {
      ANCHOR_HEIGHT = options.anchorHeight;
    }
    if (options.serverUrl) {
      SERVER_URL = options.serverUrl;
    }
    if (options.rendererDist) {
      RENDERER_DIST = options.rendererDist;
    }
    // 设置初始助手内边距
    if (options.assistantPadding !== undefined) {
      this.assistantPadding = options.assistantPadding;
    }
    if (options.windowConfigs) {
      // Initialize dynamic window configs (defaults + user overrides)
      try {
        initWindowConfigs(options.windowConfigs);
      } catch (e) {
        console.warn('[windows] init configs failed', e);
      }
    }
    // 保存用于暂停/恢复 hover 监控的回调
    this.onBeforeFollowerShow = options.onBeforeFollowerShow;
    this.onAfterFollowerHide = options.onAfterFollowerHide;

    // 监听主窗口移动事件，自动更新跟随窗口位置
    this.setupMainWindowTracking();
  }

  private setupMainWindowTracking(): void {
    if (!this.mainWindow) return;

    // 监听主窗口移动和大小变化
    this.mainWindow.on('move', () => this.updateFollowerPositions());
    this.mainWindow.on('resize', () => this.updateFollowerPositions());
  }

  private updateFollowerPositions(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    const mainBounds = this.mainWindow.getBounds();

    // 更新所有跟随窗口的位置
    this.followerWindows.forEach((windowKey) => {
      const window = this.get(windowKey);
      if (window && !window.isDestroyed()) {
        this.repositionFollowerWindow(windowKey, window, mainBounds);
      }
    });
  }

  private repositionFollowerWindow(windowKey: WindowKey, window: BrowserWindow, mainBounds: Electron.Rectangle): void {
    try {
      const config = windowConfigs[windowKey];
      if (!config || config.followMain !== true) return;

      const windowBounds = window.getBounds();
      // On macOS, getBounds includes the shadow; for overlap-center we want content size to align visually
      const contentBounds = (() => {
        try {
          return window.getContentBounds();
        } catch {
          return windowBounds;
        }
      })();

      // 使用窗口特定的跟随偏好模式，如果没有配置则使用默认值
      const preferMode = config.followerPreferMode || 'prefer-right';
      const forceCenterAlignment = config.forceCenterAlignment || false;

      // 使用智能位置计算逻辑
      const followerSize =
        process.platform === 'darwin' || preferMode === 'overlap-center' ? { width: contentBounds.width, height: contentBounds.height } : { width: windowBounds.width, height: windowBounds.height };

      const position = computeFollowerPosition(mainBounds, followerSize, preferMode, this.assistantPadding, forceCenterAlignment);

      const lastSide = this.lastFollowerSide.get(windowKey) || null;

      // 对于 overlap-center 模式，始终跟随移动（因为位置会随着主窗口移动而变化）
      if (preferMode === 'overlap-center') {
        // 直接设置位置，确保始终跟随
        window.setPosition(position.x, position.y);
      } else {
        // 其他模式：如果方向变化，则做动画，否则直接贴靠
        if (lastSide && position.side !== lastSide) {
          this.animateFollowerTo(windowKey, window, { x: position.x, y: position.y }, true);
        } else {
          // 方向未变，保持紧随（直接设置）
          window.setPosition(position.x, position.y);
        }
      }

      this.lastFollowerSide.set(windowKey, position.side);
    } catch (error) {
      console.error('Error repositioning follower window:', error);
    }
  }

  private stopFollowerAnimation(): void {
    if (this.followerAnimTimer) {
      clearInterval(this.followerAnimTimer);
      this.followerAnimTimer = null;
    }
    if (this.followerAnimRaf !== null) {
      try {
        caf(this.followerAnimRaf);
      } catch {
        //
      }
      this.followerAnimRaf = null;
    }
  }

  private animateFollowerTo(windowKey: WindowKey, window: BrowserWindow, target: { x: number; y: number }, noAnimation?: boolean): void {
    if (!window || window.isDestroyed()) return;
    if (noAnimation) {
      window.setPosition(target.x, target.y);
      return;
    }
    try {
      const [cx, cy] = window.getPosition();
      const dx = target.x - cx;
      const dy = target.y - cy;
      const dist = Math.hypot(dx, dy);
      // 小距离直接跳
      if (dist < 8) {
        window.setPosition(target.x, target.y);
        return;
      }
      this.stopFollowerAnimation();
      this.followerAnimFrom = { x: cx, y: cy };
      this.followerAnimTo = target;
      // 动画时长与距离相关（像素 / 3 但限制范围）
      this.followerAnimDur = Math.min(400, Math.max(160, dist * 3));
      this.followerAnimStart = performance.now();
      const step = (now: number): void => {
        if (!window || window.isDestroyed()) {
          this.stopFollowerAnimation();
          return;
        }
        if (!this.followerAnimFrom || !this.followerAnimTo) {
          this.stopFollowerAnimation();
          return;
        }
        const t = (now - this.followerAnimStart) / this.followerAnimDur;
        if (t >= 1) {
          window.setPosition(this.followerAnimTo.x, this.followerAnimTo.y);
          this.stopFollowerAnimation();
          return;
        }
        // easeInOutQuad
        const tt = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        const nx = Math.round(this.followerAnimFrom.x + (this.followerAnimTo.x - this.followerAnimFrom.x) * tt);
        const ny = Math.round(this.followerAnimFrom.y + (this.followerAnimTo.y - this.followerAnimFrom.y) * tt);
        window.setPosition(nx, ny);
        this.followerAnimRaf = raf(step);
      };
      this.followerAnimRaf = raf(step);
    } catch {
      // 失败时直接跳到目标
      try {
        window?.setPosition(target.x, target.y);
      } catch {
        //
      }
    }
  }

  get(key: WindowKey): BrowserWindow | null {
    const w = this.registry.get(key);
    return w && !w.isDestroyed() ? w : null;
  }

  async createOrShow(key: WindowKey, payload?: any): Promise<BrowserWindow | null> {
    let w = this.get(key);
    if (!w) w = await this.create(key);
    if (!w) return null;
    const conf = windowConfigs[key];
    if (payload) {
      // 等待 ready 后发送数据
      if (w.webContents.isLoading()) {
        w.webContents.once('did-finish-load', () => {
          try {
            w.webContents.send('on:window:open:ready', payload);
          } catch {
            //
          }
        });
      } else {
        try {
          w.webContents.send('on:window:open:ready', payload);
        } catch {
          //
        }
      }
    }
    try {
      if (!w.isVisible()) {
        if (conf?.preferShowInactive) {
          try {
            w?.showInactive?.();
          } catch {
            try {
              w.show();
            } catch {
              //
            }
          }
        } else {
          w.show();
        }
      }
    } catch {
      //
    }
    try {
      w.focus();
    } catch {
      //
    }
    return w;
  }

  async createOrShowOnDisplay(key: WindowKey, display: Electron.Display, payload?: any): Promise<BrowserWindow | null> {
    const w = await this.createOrShow(key, payload);
    if (!w || !display) return w;
    try {
      const bounds = w.getBounds();
      const work = display.workArea;
      const width = bounds.width;
      const height = bounds.height;
      const x = Math.round(work.x + (work.width - width) / 2);
      const y = Math.round(work.y + (work.height - height) / 2);
      w.setBounds({ x, y, width, height });
      w.focus();
    } catch (error) {
      console.warn(`Failed to position window '${String(key)}' on display`, error);
    }
    return w;
  }

  setAnchorWidth(width: number): void {
    ANCHOR_WIDTH = width;
  }

  setAnchorHeight(height: number): void {
    ANCHOR_HEIGHT = height;
  }

  async create(key: WindowKey): Promise<BrowserWindow | null> {
    const conf: WindowConfig | undefined = (windowConfigs as any)[key];
    if (!conf) return null;
    const opts = { ...conf.options };
    opts.webPreferences = { ...(conf.options.webPreferences || {}), preload: this.preloadPath };
    if (conf.parent === 'main' && this.mainWindow && !this.mainWindow.isDestroyed()) {
      opts.parent = this.mainWindow;
    }

    const w = new BrowserWindow(opts);
    this.registry.set(key, w);

    // 如果配置了跟随主窗口，添加到跟随窗口集合
    if (conf.followMain === true) {
      this.followerWindows.add(key);
    }

    // 如果启用了重叠半透明效果，设置窗口透明度
    if (conf.followerPreferMode === 'overlap-center' && conf.enableOverlapTransparency) {
      try {
        w.setOpacity(0.95);
      } catch (error) {
        console.warn('Failed to set window opacity:', error);
      }
    }

    this.setupWindowEventHandlers(w, key, conf);

    // 如果启用了状态记忆，尝试恢复之前的状态
    if (conf.rememberState) {
      restoreWindowState(w, key);
    }

    w.once('ready-to-show', () => {
      try {
        console.log('ready-to-show', conf.showOnReady);
        if (conf.showOnReady === false) return;
        // If configured to start maximized, do it before showing to avoid flicker
        if (conf.startMaximized) {
          try {
            w.maximize();
          } catch {
            //
          }
        }
        w.show();
      } catch {
        //
      }
    });

    await this.loadRoute(w, conf);

    // Auto-center
    this.autoCenter(w, conf);

    // If startMaximized is set, skip manual fillWorkArea adjustments as maximize will handle it
    if (!conf.startMaximized && conf.fillWorkArea) {
      try {
        const display = screen.getPrimaryDisplay();
        const { x, y, width, height } = display.workArea;
        // Defer to next tick to avoid resize flicker before content load
        setTimeout(() => {
          try {
            w.setBounds({ x, y, width, height });
          } catch {
            //
          }
        }, 0);
      } catch {
        //
      }
    }

    // Close on blur
    if (conf.closeOnBlur) {
      w.on('blur', () => {
        try {
          w.close();
        } catch {
          //
        }
      });
    }

    if (conf.openDevTools) {
      maybeOpenDevTools(w);
    }

    // When showOnReady is false, consumers may call show() later; maximize on first show if requested
    if (conf.startMaximized) {
      try {
        w.on('show', () => {
          try {
            if (!w.isMaximized()) w.maximize();
          } catch {
            //
          }
        });
      } catch {
        //
      }
    }

    return w;
  }

  private setupWindowEventHandlers(w: BrowserWindow, key: WindowKey, conf: WindowConfig): void {
    // Broadcast maximize / unmaximize state changes to renderer so UI can update controls
    w.on('maximize', () => {
      w.webContents.send('window-maximize-changed', true);
      // 保存窗口状态
      if (conf.rememberState) {
        saveWindowState(w, key);
      }
    });
    w.on('unmaximize', () => {
      w.webContents.send('window-maximize-changed', false);
      // 保存窗口状态
      if (conf.rememberState) {
        saveWindowState(w, key);
      }
    });

    // 在显示/隐藏时处理 hover 监控暂停/恢复，以及确保 macOS 上对齐
    if (conf.followMain === true) {
      w.on('show', () => {
        // 某些透明跟随窗口显示时需要暂停 hover 监控，避免穿透计算干扰
        if (conf.suspendHoverMonitorOnShow) {
          this.onBeforeFollowerShow?.();
        }
        this.updateFollowerPositions();
      });
      w.on('hide', () => {
        if (conf.suspendHoverMonitorOnShow) {
          this.onAfterFollowerHide?.();
        }
      });
      w.on('closed', () => {
        if (conf.suspendHoverMonitorOnShow) {
          this.onAfterFollowerHide?.();
        }
      });
    }

    // 监听窗口大小和位置变化，保存状态
    if (conf.rememberState) {
      let saveTimeout: NodeJS.Timeout | null = null;
      const debouncedSave = (): void => {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          saveWindowState(w, key);
        }, 500); // 500ms 防抖
      };

      w.on('resize', debouncedSave);
      w.on('move', debouncedSave);
    }

    // Auto-close registry cleanup
    w.on('closed', () => {
      try {
        this.registry.delete(key);
        this.followerWindows.delete(key);
        this.lastFollowerSide.delete(key);
        this.stopFollowerAnimation();
      } catch {
        //
      }
      // If this window was opened by another window, bring that opener to front when this closes
      try {
        const opener = this.openersByChild.get(key) || null;
        this.openersByChild.delete(key);
        if (opener && !opener.isDestroyed()) {
          try {
            if (!opener.isVisible()) {
              // show() will also restore if minimized on Windows
              opener.show();
            }
          } catch {
            //
          }
          try {
            opener.focus();
          } catch {
            //
          }
        }
      } catch {
        //
      }
    });
  }

  private async loadRoute(w: BrowserWindow, conf: WindowConfig): Promise<void> {
    const hash = typeof conf.routeHash === 'function' ? conf.routeHash() : conf.routeHash;
    if (SERVER_URL) {
      await w.loadURL(`${SERVER_URL}#${hash}`);
    } else {
      const indexHtml = path.join(RENDERER_DIST, 'index.html');
      await (w as any).loadFile(indexHtml, { hash });
    }
  }

  private autoCenter(w: BrowserWindow, conf: WindowConfig): void {
    if (!conf.autoCenterOn || conf.autoCenterOn === 'none') return;
    try {
      let display = screen.getPrimaryDisplay();
      if (conf.autoCenterOn === 'parent-display' && this.mainWindow) {
        const b = this.mainWindow.getBounds();
        display = screen.getDisplayNearestPoint({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
      }
      const work = display.workArea;
      const { width = 400, height = 300 } = w.getBounds();
      w.setPosition(Math.round(work.x + (work.width - width) / 2), Math.round(work.y + (work.height - height) / 2));
    } catch {
      //
    }
  }

  async destroy(key: WindowKey): Promise<void> {
    const w = this.get(key);
    if (w) {
      try {
        w.destroy();
      } catch {
        //
      }
      this.registry.delete(key);
    }
  }

  /**
   * 销毁所有窗口（可选排除指定 key）
   * - 会调用 BrowserWindow.destroy()，并清理内部注册表/跟随集合/方向缓存
   */
  async destroyAll(exclude: WindowKey[] = []): Promise<void> {
    const excludeSet = new Set<WindowKey>(exclude);
    const entries = Array.from(this.registry.entries());
    for (const [key, w] of entries) {
      if (excludeSet.has(key)) continue;
      try {
        if (w && !w.isDestroyed()) {
          w.destroy();
        }
      } catch {
        //
      }
      // 清理内部状态
      try {
        this.registry.delete(key);
      } catch {
        //
      }
      try {
        this.followerWindows.delete(key);
      } catch {
        //
      }
      try {
        this.lastFollowerSide.delete(key);
      } catch {
        //
      }
    }
    // 停止可能残留的动画
    try {
      this.stopFollowerAnimation();
    } catch {
      //
    }
  }

  async show(key: WindowKey): Promise<BrowserWindow | null> {
    const w = this.get(key);
    if (w) {
      try {
        w.show();
        w.focus();
      } catch {
        //
      }
    }
    return w;
  }

  async hide(key: WindowKey): Promise<BrowserWindow | null> {
    const w = this.get(key);
    if (w) {
      try {
        w.hide();
      } catch {
        //
      }
    }
    return w;
  }

  async close(key: WindowKey): Promise<BrowserWindow | null> {
    const w = this.get(key);
    if (w) {
      try {
        w.close();
      } catch {
        //
      }
    }
    return w;
  }

  all(): Map<WindowKey, BrowserWindow> {
    return new Map(this.registry);
  }

  /**
   * 手动更新所有跟随窗口的位置
   */
  updateFollowerPositionsManually(): void {
    this.updateFollowerPositions();
  }

  /**
   * 添加窗口到跟随列表
   */
  addFollower(windowKey: WindowKey): void {
    this.followerWindows.add(windowKey);
  }

  /**
   * 从跟随列表移除窗口
   */
  removeFollower(windowKey: WindowKey): void {
    this.followerWindows.delete(windowKey);
  }

  /**
   * 设置特定窗口的跟随偏好模式
   */
  setWindowFollowerPreferMode(windowKey: WindowKey, mode: FollowerPreferMode): void {
    const config = windowConfigs[windowKey];
    if (config) {
      // 更新配置（注意：这会修改全局配置，实际项目中可能需要持久化）
      config.followerPreferMode = mode;
      this.updateFollowerPositions();
    }
  }

  /**
   * 设置助手内边距
   */
  setAssistantPadding(padding: number): void {
    this.assistantPadding = padding;
    this.updateFollowerPositions();
  }

  /**
   * 获取特定窗口的跟随偏好模式
   */
  getWindowFollowerPreferMode(windowKey: WindowKey): FollowerPreferMode {
    const config = windowConfigs[windowKey];
    return config?.followerPreferMode || 'prefer-right';
  }

  /**
   * 获取当前助手内边距
   */
  getAssistantPadding(): number {
    return this.assistantPadding;
  }

  /**
   * 调整主窗口的内边距，并自动更新跟随窗口位置
   */
  adjustMainWindowForPadding(oldPadding: number, newPadding: number): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    if (oldPadding === newPadding) return;

    try {
      const b = this.mainWindow.getBounds();
      // 旧的内层角色左上角
      const innerX = b.x + oldPadding;
      const innerY = b.y + oldPadding;
      const newWidth = ANCHOR_WIDTH + newPadding * 2;
      const newHeight = ANCHOR_HEIGHT + newPadding * 2;
      const newX = innerX - newPadding;
      const newY = innerY - newPadding;

      this.mainWindow.setBounds({ x: newX, y: newY, width: newWidth, height: newHeight });

      // 更新助手内边距配置
      this.assistantPadding = newPadding;

      // 自动更新所有跟随窗口的位置
      this.updateFollowerPositions();
    } catch (error) {
      console.error('Error adjusting main window padding:', error);
    }
  }

  /**
   * Record the opener of a window (childKey) so that when the child closes,
   * the opener can be shown and focused if it still exists.
   */
  setOpener(childKey: WindowKey, opener: BrowserWindow | null | undefined): void {
    try {
      if (opener && !opener.isDestroyed()) {
        this.openersByChild.set(childKey, opener);
      } else {
        this.openersByChild.delete(childKey);
      }
    } catch {
      //
    }
  }

  /**
   * Get the opener window of a given child key, if still alive.
   */
  getOpener(childKey: WindowKey): BrowserWindow | null {
    const w = this.openersByChild.get(childKey) || null;
    if (w && !w.isDestroyed()) return w;
    return null;
  }
}

export const windowManager = WindowManager.instance;

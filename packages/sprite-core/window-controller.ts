/**
 * WindowController — 窗口控制器
 *
 * 主进程中管理精灵窗口的位置移动：
 * - 行走动画（贝塞尔曲线路径 + 30fps 节流）
 * - 拖拽移动
 * - 位置管理与边界约束
 *
 * 从渲染进程 useWalkAnimation.ts + useDragMove.ts 迁移而来，
 * 将 requestAnimationFrame 替换为 setInterval (~16ms)，
 * 将 window.YUA.window['window:move'] 替换为 win.setPosition()。
 */

import type { SpriteWindow } from './sprite-manager';

// ============================================================================
// 数学工具 (从 src/lib/helpers.ts 内联)
// ============================================================================

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const bezierQ = (p0: number, p1: number, p2: number, t: number): number => (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t ** 2 * p2;

// ============================================================================
// 常量 (与渲染进程保持一致)
// ============================================================================

const DEFAULT_WALK_SPEED = 60; // px/s
const PATH_CURVE_FACTOR = 0.15; // 贝塞尔弯曲系数
const STEP_GRID = 12; // 路径采样步长(px)
const TICK_INTERVAL = 16; // ~60fps 定时器
const IPC_THROTTLE = 33.3; // 30fps 窗口位置更新

// ============================================================================
// 接口
// ============================================================================

export interface WindowControllerOptions {
  /** 获取 BrowserWindow */
  getWindow: () => SpriteWindow | null;
  /** 获取屏幕工作区尺寸 */
  getScreenSize: () => { width: number; height: number };
  /** 获取精灵内边距 */
  getPadding: () => number;
  /** 获取精灵尺寸 */
  getSpriteSize: () => { width: number; height: number };
  /** 行走开始回调 */
  onWalkStart?: (direction: 'left' | 'right') => void;
  /** 行走结束回调 */
  onWalkEnd?: () => void;
}

// ============================================================================
// 实现
// ============================================================================

export class WindowController {
  private opts: WindowControllerOptions;

  // 行走状态
  private walking = false;
  private walkCancelled = false;
  private walkDirection: 'left' | 'right' | null = null;
  private walkTimer: ReturnType<typeof setInterval> | null = null;
  private walkResolve: (() => void) | null = null;

  // 行走动画数据
  private walkData: {
    startX: number;
    startY: number;
    points: Array<{ x: number; y: number; d: number }>;
    totalDist: number;
    progressed: number;
    lastTickTime: number;
    lastMoveTime: number;
  } | null = null;

  // 拖拽状态
  private dragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  constructor(options: WindowControllerOptions) {
    this.opts = options;
  }

  // ============================================================================
  // 行走
  // ============================================================================

  /** 行走到目标位置（贝塞尔曲线路径） */
  walkTo(targetX: number, targetY: number): Promise<void> {
    // 如果正在行走，先停止
    if (this.walking) {
      this.cancelWalk();
    }

    const win = this.opts.getWindow();
    if (!win || win.isDestroyed()) return Promise.resolve();

    const bounds = win.getBounds();
    const startX = bounds.x;
    const startY = bounds.y;
    const dx = targetX - startX;
    const dy = targetY - startY;
    const totalDist = Math.hypot(dx, dy);

    if (totalDist < 1) return Promise.resolve();

    // 方向
    const direction: 'left' | 'right' = dx > 0 ? 'right' : 'left';
    this.walkDirection = direction;
    this.walking = true;
    this.walkCancelled = false;

    // 通知
    this.opts.onWalkStart?.(direction);

    // 贝塞尔控制点（法线方向偏移）
    const mx = (startX + targetX) / 2;
    const my = (startY + targetY) / 2;
    const nx = -dy / (totalDist || 1);
    const ny = dx / (totalDist || 1);
    const curve = totalDist * PATH_CURVE_FACTOR * (Math.random() * 0.6 + 0.4) * (Math.random() < 0.5 ? -1 : 1);
    const cx = mx + nx * curve;
    const cy = my + ny * curve;

    // 路径采样
    const samples = Math.max(20, Math.ceil(totalDist / STEP_GRID));
    const points: Array<{ x: number; y: number; d: number }> = [];
    let last = { x: startX, y: startY };
    let acc = 0;
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const x = bezierQ(startX, cx, targetX, t);
      const y = bezierQ(startY, cy, targetY, t);
      const seg = Math.hypot(x - last.x, y - last.y);
      acc += seg;
      points.push({ x, y, d: acc });
      last = { x, y };
    }

    const now = Date.now();
    this.walkData = {
      startX,
      startY,
      points,
      totalDist: acc,
      progressed: 0,
      lastTickTime: now,
      lastMoveTime: 0
    };

    return new Promise<void>((resolve) => {
      this.walkResolve = resolve;

      this.walkTimer = setInterval(() => {
        this.walkTick();
      }, TICK_INTERVAL);
    });
  }

  /** 停止行走 */
  stopWalk(): void {
    if (!this.walking) return;
    this.cancelWalk();
  }

  /** 是否正在行走 */
  isWalking(): boolean {
    return this.walking;
  }

  /** 获取行走方向 */
  getWalkDirection(): 'left' | 'right' | null {
    return this.walking ? this.walkDirection : null;
  }

  // ============================================================================
  // 位置
  // ============================================================================

  /** 获取窗口位置 */
  getPosition(): [number, number] {
    const win = this.opts.getWindow();
    if (!win || win.isDestroyed()) return [0, 0];
    const bounds = win.getBounds();
    return [bounds.x, bounds.y];
  }

  /** 设置窗口位置 */
  setPosition(x: number, y: number): void {
    const win = this.opts.getWindow();
    if (!win || win.isDestroyed()) return;
    win.setPosition(Math.round(x), Math.round(y));
  }

  // ============================================================================
  // 拖拽
  // ============================================================================

  /** 开始拖拽 */
  startDrag(offsetX: number, offsetY: number): void {
    this.stopWalk();
    this.dragging = true;
    this.dragOffsetX = offsetX;
    this.dragOffsetY = offsetY;
  }

  /** 更新拖拽位置 */
  updateDrag(screenX: number, screenY: number): void {
    if (!this.dragging) return;
    const win = this.opts.getWindow();
    if (!win || win.isDestroyed()) return;

    const padding = this.opts.getPadding();
    // dragOffsetX/Y 是 clientX/Y（相对于窗口左上角），
    // screenX/Y 是鼠标屏幕坐标，所以 screenX - dragOffsetX 就是窗口左上角位置，
    // 不需要额外减去 padding（padding 已包含在 clientX 中）
    const x = screenX - this.dragOffsetX;
    const y = screenY - this.dragOffsetY;

    // 边界约束
    const screen = this.opts.getScreenSize();
    const sprite = this.opts.getSpriteSize();
    const clampedX = clamp(x, -padding, screen.width - sprite.width - padding);
    const clampedY = clamp(y, -padding, screen.height - sprite.height - padding);

    win.setPosition(Math.round(clampedX), Math.round(clampedY));
  }

  /** 结束拖拽 */
  endDrag(): void {
    this.dragging = false;
  }

  /** 是否正在拖拽 */
  isDragging(): boolean {
    return this.dragging;
  }

  // ============================================================================
  // 尺寸
  // ============================================================================

  /** 设置窗口大小（精灵尺寸 + padding） */
  setSize(width: number, height: number, padding: number): void {
    const win = this.opts.getWindow();
    if (!win || win.isDestroyed()) return;
    win.setSize(width + padding * 2, height + padding * 2);
  }

  // ============================================================================
  // 边界约束
  // ============================================================================

  /** 将窗口约束到屏幕内 */
  clampToScreen(): void {
    const win = this.opts.getWindow();
    if (!win || win.isDestroyed()) return;

    const bounds = win.getBounds();
    const screen = this.opts.getScreenSize();
    const padding = this.opts.getPadding();
    const sprite = this.opts.getSpriteSize();

    const x = clamp(bounds.x, -padding, screen.width - sprite.width - padding);
    const y = clamp(bounds.y, -padding, screen.height - sprite.height - padding);

    if (x !== bounds.x || y !== bounds.y) {
      win.setPosition(Math.round(x), Math.round(y));
    }
  }

  // ============================================================================
  // 清理
  // ============================================================================

  destroy(): void {
    this.cancelWalk();
    this.dragging = false;
  }

  // ============================================================================
  // 内部
  // ============================================================================

  /** 行走动画 tick */
  private walkTick(): void {
    if (this.walkCancelled || !this.walkData) {
      this.finishWalk();
      return;
    }

    const win = this.opts.getWindow();
    if (!win || win.isDestroyed()) {
      this.finishWalk();
      return;
    }

    const now = Date.now();
    const dt = now - this.walkData.lastTickTime;
    this.walkData.lastTickTime = now;

    // 前进距离
    this.walkData.progressed = clamp(this.walkData.progressed + (DEFAULT_WALK_SPEED * dt) / 1000, 0, this.walkData.totalDist);

    const { points, startX, startY, progressed, totalDist } = this.walkData;

    // 查找当前位置
    let idx = 0;
    while (idx < points.length && points[idx].d < progressed) idx++;
    const prevD = idx === 0 ? 0 : points[idx - 1].d;
    const prevX = idx === 0 ? startX : points[idx - 1].x;
    const prevY = idx === 0 ? startY : points[idx - 1].y;
    const cur = points[Math.min(idx, points.length - 1)];
    const segLen = Math.max(1e-6, cur.d - prevD);
    const segT = clamp((progressed - prevD) / segLen, 0, 1);

    const x = lerp(prevX, cur.x, segT);
    const y = lerp(prevY, cur.y, segT);

    // 30fps 节流窗口位置更新
    if (this.walkData.lastMoveTime === 0 || now - this.walkData.lastMoveTime >= IPC_THROTTLE || progressed >= totalDist) {
      this.walkData.lastMoveTime = now;
      win.setPosition(Math.round(x), Math.round(y));
    }

    // 到达终点
    if (progressed >= totalDist) {
      this.finishWalk();
    }
  }

  /** 取消行走 */
  private cancelWalk(): void {
    this.walkCancelled = true;
    this.finishWalk();
  }

  /** 完成行走清理 */
  private finishWalk(): void {
    if (this.walkTimer) {
      clearInterval(this.walkTimer);
      this.walkTimer = null;
    }

    const wasWalking = this.walking;
    this.walking = false;
    this.walkDirection = null;
    this.walkData = null;
    this.walkCancelled = false;

    if (wasWalking) {
      this.opts.onWalkEnd?.();
    }

    if (this.walkResolve) {
      this.walkResolve();
      this.walkResolve = null;
    }
  }
}

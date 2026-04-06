/**
 * WindowController — 窗口控制器
 *
 * 主进程中管理精灵窗口的位置移动：
 * - 行走动画（贝塞尔曲线路径 + 30fps 节流）
 * - 拖拽移动
 * - 自动移动（动画播放时沿指定方向恒速移动）
 * - 位置管理与边界约束
 *
 * 从渲染进程 useWalkAnimation.ts + useDragMove.ts 迁移而来，
 * 将 requestAnimationFrame 替换为 setInterval (~16ms)，
 * 将 window.YUA.window['window:move'] 替换为 win.setPosition()。
 */

import type { SpriteWindow } from './manager';
import type { SpriteMovementConfig, SpriteMovementDirection } from './types';

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
  /** 获取光标屏幕坐标（主进程直接查询，无 IPC 延迟） */
  getCursorScreenPoint: () => { x: number; y: number };
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
  private dragTimer: ReturnType<typeof setInterval> | null = null;

  // 自动移动状态（动画播放时沿指定方向恒速移动）
  private autoMoving = false;
  private autoMoveTimer: ReturnType<typeof setInterval> | null = null;
  private autoMoveVelocity: { dx: number; dy: number } = { dx: 0, dy: 0 };
  private autoMoveLastTime = 0;
  private autoMoveLastMoveTime = 0;
  /** 自动移动的实际方向（用于 random 解析后的结果） */
  private autoMoveDirection: 'left' | 'right' | null = null;

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

  /** 开始拖拽（启动主进程轮询光标位置，彻底消除 IPC 延迟） */
  startDrag(offsetX: number, offsetY: number): void {
    this.stopWalk();
    this.stopAutoMove();
    this.stopDragTimer();
    this.dragging = true;
    this.dragOffsetX = offsetX;
    this.dragOffsetY = offsetY;

    // 主进程 ~60fps 轮询光标位置并移动窗口
    this.dragTimer = setInterval(() => this.dragTick(), TICK_INTERVAL);
  }

  /** 结束拖拽 */
  endDrag(): void {
    this.stopDragTimer();
    this.dragging = false;
  }

  /** 拖拽轮询 tick — 主进程直接读取光标位置 */
  private dragTick(): void {
    if (!this.dragging) {
      this.stopDragTimer();
      return;
    }
    const win = this.opts.getWindow();
    if (!win || win.isDestroyed()) {
      this.stopDragTimer();
      this.dragging = false;
      return;
    }

    const cursor = this.opts.getCursorScreenPoint();
    const padding = this.opts.getPadding();
    const x = cursor.x - this.dragOffsetX;
    const y = cursor.y - this.dragOffsetY;

    // 边界约束
    const scr = this.opts.getScreenSize();
    const sprite = this.opts.getSpriteSize();
    const clampedX = clamp(x, -padding, scr.width - sprite.width - padding);
    const clampedY = clamp(y, -padding, scr.height - sprite.height - padding);

    win.setPosition(Math.round(clampedX), Math.round(clampedY));
  }

  /** 停止拖拽定时器 */
  private stopDragTimer(): void {
    if (this.dragTimer) {
      clearInterval(this.dragTimer);
      this.dragTimer = null;
    }
  }

  /** 是否正在拖拽 */
  isDragging(): boolean {
    return this.dragging;
  }

  // ============================================================================
  // 自动移动（动画播放时沿指定方向恒速移动）
  // ============================================================================

  /** 开始自动移动 */
  startAutoMove(config: SpriteMovementConfig): void {
    this.stopAutoMove();
    if (!config.enabled) return;

    const speed = config.speed ?? DEFAULT_WALK_SPEED;
    if (speed <= 0) return;

    const dir = config.direction === 'random' ? this.resolveRandomDirection() : config.direction;

    const velocity = this.directionToVelocity(dir, speed);
    this.autoMoveVelocity = velocity;
    this.autoMoveDirection = velocity.dx < 0 ? 'left' : velocity.dx > 0 ? 'right' : null;

    this.autoMoving = true;
    this.autoMoveLastTime = Date.now();
    this.autoMoveLastMoveTime = 0;

    this.autoMoveTimer = setInterval(() => this.autoMoveTick(), TICK_INTERVAL);
  }

  /** 停止自动移动 */
  stopAutoMove(): void {
    if (this.autoMoveTimer) {
      clearInterval(this.autoMoveTimer);
      this.autoMoveTimer = null;
    }
    this.autoMoving = false;
    this.autoMoveDirection = null;
  }

  /** 是否正在自动移动 */
  isAutoMoving(): boolean {
    return this.autoMoving;
  }

  /** 获取自动移动方向（用于精灵翻转） */
  getAutoMoveDirection(): 'left' | 'right' | null {
    return this.autoMoving ? this.autoMoveDirection : null;
  }

  /** 自动移动 tick */
  private autoMoveTick(): void {
    if (!this.autoMoving) {
      this.stopAutoMove();
      return;
    }

    const win = this.opts.getWindow();
    if (!win || win.isDestroyed()) {
      this.stopAutoMove();
      return;
    }

    const now = Date.now();
    const dt = now - this.autoMoveLastTime;
    this.autoMoveLastTime = now;

    const bounds = win.getBounds();
    const scr = this.opts.getScreenSize();
    const padding = this.opts.getPadding();
    const sprite = this.opts.getSpriteSize();

    const newX = bounds.x + (this.autoMoveVelocity.dx * dt) / 1000;
    const newY = bounds.y + (this.autoMoveVelocity.dy * dt) / 1000;

    // 边界约束
    const clampedX = clamp(newX, -padding, scr.width - sprite.width - padding);
    const clampedY = clamp(newY, -padding, scr.height - sprite.height - padding);

    // 30fps 节流窗口位置更新
    if (this.autoMoveLastMoveTime === 0 || now - this.autoMoveLastMoveTime >= IPC_THROTTLE) {
      this.autoMoveLastMoveTime = now;
      win.setPosition(Math.round(clampedX), Math.round(clampedY));
    }

    // 到达边界则停止
    const atEdge =
      (this.autoMoveVelocity.dx < 0 && clampedX <= -padding) ||
      (this.autoMoveVelocity.dx > 0 && clampedX >= scr.width - sprite.width - padding) ||
      (this.autoMoveVelocity.dy < 0 && clampedY <= -padding) ||
      (this.autoMoveVelocity.dy > 0 && clampedY >= scr.height - sprite.height - padding);
    if (atEdge) {
      this.stopAutoMove();
    }
  }

  /** 将方向枚举转换为速度向量 */
  private directionToVelocity(direction: SpriteMovementDirection, speed: number): { dx: number; dy: number } {
    const diag = speed * Math.SQRT1_2; // 对角线速度分量
    switch (direction) {
      case 'left':
        return { dx: -speed, dy: 0 };
      case 'right':
        return { dx: speed, dy: 0 };
      case 'up':
        return { dx: 0, dy: -speed };
      case 'down':
        return { dx: 0, dy: speed };
      case 'up-left':
        return { dx: -diag, dy: -diag };
      case 'up-right':
        return { dx: diag, dy: -diag };
      case 'down-left':
        return { dx: -diag, dy: diag };
      case 'down-right':
        return { dx: diag, dy: diag };
      default:
        return { dx: 0, dy: 0 };
    }
  }

  /** 随机选取一个具体方向 */
  private resolveRandomDirection(): SpriteMovementDirection {
    const directions: SpriteMovementDirection[] = ['left', 'right', 'up', 'down', 'up-left', 'up-right', 'down-left', 'down-right'];
    return directions[Math.floor(Math.random() * directions.length)];
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
    this.stopDragTimer();
    this.stopAutoMove();
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

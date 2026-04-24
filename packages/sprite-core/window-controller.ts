import type { SpriteWindow } from './manager';
import type { SpriteMovementConfig } from './types';
import { WindowControllerAutoMoveSession } from './window-controller-auto-move-session';
import { WindowControllerDragSession } from './window-controller-drag-session';
import { clampWindowPosition, type WindowControllerViewport } from './window-controller-model';
import { WindowControllerPlatform } from './window-controller-platform';
import { WindowControllerWalkSession } from './window-controller-walk-session';

const TICK_INTERVAL = 16;

export interface WindowControllerOptions {
  getWindow: () => SpriteWindow | null;
  getScreenSize: () => { width: number; height: number };
  getCursorScreenPoint: () => { x: number; y: number };
  getPadding: () => number;
  getSpriteSize: () => { width: number; height: number };
  onWalkStart?: (direction: 'left' | 'right') => void;
  onWalkEnd?: () => void;
}

export class WindowController {
  private readonly opts: WindowControllerOptions;
  private readonly platform: WindowControllerPlatform;
  private readonly dragSession: WindowControllerDragSession;
  private readonly walkSession: WindowControllerWalkSession;
  private readonly autoMoveSession: WindowControllerAutoMoveSession;
  private walkTimer: ReturnType<typeof setInterval> | null = null;
  private dragTimer: ReturnType<typeof setInterval> | null = null;
  private autoMoveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: WindowControllerOptions) {
    this.opts = options;
    this.platform = new WindowControllerPlatform({
      getWindow: options.getWindow
    });
    this.dragSession = new WindowControllerDragSession({
      getCursorScreenPoint: options.getCursorScreenPoint,
      getViewport: () => this.getViewport(),
      moveWindow: (position) => this.platform.setPoint(position),
      isWindowAvailable: () => this.platform.isAvailable()
    });
    this.walkSession = new WindowControllerWalkSession();
    this.autoMoveSession = new WindowControllerAutoMoveSession();
  }

  walkTo(targetX: number, targetY: number, speed?: number): Promise<void> {
    if (this.walkSession.isActive()) {
      this.finishWalk();
    }

    const bounds = this.platform.getBounds();
    if (!bounds) return Promise.resolve();

    const walkPromise = this.walkSession.start({
      startX: bounds.x,
      startY: bounds.y,
      targetX,
      targetY,
      speed
    });

    if (!this.walkSession.isActive()) {
      return walkPromise;
    }

    const direction = this.walkSession.getDirection();
    if (direction) {
      this.opts.onWalkStart?.(direction);
    }

    this.stopWalkTimer();
    this.walkTimer = setInterval(() => this.walkTick(), TICK_INTERVAL);
    return walkPromise;
  }

  stopWalk(): void {
    if (!this.walkSession.isActive()) return;
    this.finishWalk();
  }

  isWalking(): boolean {
    return this.walkSession.isActive();
  }

  getWalkDirection(): 'left' | 'right' | null {
    return this.walkSession.getDirection();
  }

  getPosition(): [number, number] {
    const bounds = this.platform.getBounds();
    if (!bounds) return [0, 0];
    return [bounds.x, bounds.y];
  }

  setPosition(x: number, y: number): void {
    this.platform.setPosition(x, y);
  }

  startDrag(offsetX: number, offsetY: number): void {
    this.stopWalk();
    this.stopAutoMove();
    this.stopDragTimer();
    this.dragSession.start(offsetX, offsetY);
    this.dragTimer = setInterval(() => this.dragTick(), TICK_INTERVAL);
  }

  endDrag(): void {
    this.stopDragTimer();
    this.dragSession.stop();
  }

  isDragging(): boolean {
    return this.dragSession.isActive();
  }

  startAutoMove(config: SpriteMovementConfig): void {
    this.stopAutoMove();
    if (!this.autoMoveSession.start(config)) return;
    this.autoMoveTimer = setInterval(() => this.autoMoveTick(), TICK_INTERVAL);
  }

  stopAutoMove(): void {
    if (this.autoMoveTimer) {
      clearInterval(this.autoMoveTimer);
      this.autoMoveTimer = null;
    }
    this.autoMoveSession.stop();
  }

  isAutoMoving(): boolean {
    return this.autoMoveSession.isActive();
  }

  getAutoMoveDirection(): 'left' | 'right' | null {
    return this.autoMoveSession.getDirection();
  }

  setSize(width: number, height: number, padding: number): void {
    this.platform.setSize(width + padding * 2, height + padding * 2);
  }

  clampToScreen(): void {
    const bounds = this.platform.getBounds();
    if (!bounds) return;
    const nextPosition = clampWindowPosition({ x: bounds.x, y: bounds.y }, this.getViewport());

    if (nextPosition.x !== bounds.x || nextPosition.y !== bounds.y) {
      this.platform.setPoint(nextPosition);
    }
  }

  destroy(): void {
    this.finishWalk();
    this.stopDragTimer();
    this.stopAutoMove();
    this.dragSession.stop();
  }

  private dragTick(): void {
    if (!this.dragSession.tick()) {
      this.stopDragTimer();
    }
  }

  private stopDragTimer(): void {
    if (this.dragTimer) {
      clearInterval(this.dragTimer);
      this.dragTimer = null;
    }
  }

  private autoMoveTick(): void {
    if (!this.autoMoveSession.isActive()) {
      this.stopAutoMove();
      return;
    }

    const bounds = this.platform.getBounds();
    if (!bounds) {
      this.stopAutoMove();
      return;
    }

    const result = this.autoMoveSession.tick({ x: bounds.x, y: bounds.y }, this.getViewport());
    if (result.position && !this.platform.setPoint(result.position)) {
      this.stopAutoMove();
      return;
    }

    if (result.completed) {
      this.stopAutoMove();
    }
  }

  private walkTick(): void {
    const result = this.walkSession.tick(this.platform.isAvailable());
    if (result.position && !this.platform.setPoint(result.position)) {
      this.finishWalk();
      return;
    }

    if (result.completed) {
      this.finishWalk();
    }
  }

  private getViewport(): WindowControllerViewport {
    const screen = this.opts.getScreenSize();
    const sprite = this.opts.getSpriteSize();
    return {
      screenWidth: screen.width,
      screenHeight: screen.height,
      spriteWidth: sprite.width,
      spriteHeight: sprite.height,
      padding: this.opts.getPadding()
    };
  }

  private stopWalkTimer(): void {
    if (this.walkTimer) {
      clearInterval(this.walkTimer);
      this.walkTimer = null;
    }
  }

  private finishWalk(): void {
    const wasWalking = this.walkSession.isActive();
    this.stopWalkTimer();

    if (wasWalking) {
      this.opts.onWalkEnd?.();
    }

    this.walkSession.finish();
  }
}

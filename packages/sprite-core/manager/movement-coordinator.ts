import type { SpriteBubbleMode, SpriteConfig, SpriteMovementConfig, SpriteMovementDirection, SpriteMovementPreviewConfig, SpriteWalkState } from '../types';
import { isBubbleWindowMode } from '../types';
import { clampWindowPosition, getWindowClampBounds, type WindowControllerAvoidRegion, type WindowControllerViewport } from '../window-controller-model';
import type { SpriteWindowAnimationPlaybackSize } from './types';

type SpriteSizeSnapshot = Pick<SpriteConfig, 'width' | 'height' | 'padding'>;

function resolveEffectivePadding(padding: number, mode?: SpriteBubbleMode): number {
  return isBubbleWindowMode(mode) ? 0 : padding;
}

const DIRECTION_VECTORS: Record<Exclude<SpriteMovementDirection, 'random'>, { dx: number; dy: number }> = {
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  'up-left': { dx: -1, dy: -1 },
  'up-right': { dx: 1, dy: -1 },
  'down-left': { dx: -1, dy: 1 },
  'down-right': { dx: 1, dy: 1 }
};

const RESOLVABLE_DIRECTIONS = Object.keys(DIRECTION_VECTORS) as Array<keyof typeof DIRECTION_VECTORS>;

export interface MovementCoordinatorDeps {
  canMove: () => boolean;
  canUseMovement: () => boolean;
  getScreenSize: () => { width: number; height: number };
  getPosition: () => [number, number];
  getSpriteConfig: () => SpriteConfig;
  getAvoidRegions?: () => WindowControllerAvoidRegion[];
  setSpriteMetrics: (metrics: SpriteSizeSnapshot) => void;
  setWindowSize: (width: number, height: number, padding: number) => void;
  walkTo: (x: number, y: number, speed?: number) => Promise<void>;
  stopWalk: () => void;
  startAutoMove: (movement: SpriteMovementConfig) => void;
  stopAutoMove: () => void;
  isAutoMoving: () => boolean;
  getAutoMoveDirection: () => SpriteWalkState['direction'] | null;
  emitWalkState: (state: SpriteWalkState) => void;
  emitConfigChanged: () => void;
  playWindowAnimation?: (movement: SpriteMovementConfig, playbackSize?: SpriteWindowAnimationPlaybackSize) => Promise<void> | void;
  playMotionEffect?: (type: 'warp' | 'dash-trail', targetX: number, targetY: number) => Promise<boolean>;
  cancelMotionEffect?: () => void;
}

export class MovementCoordinator {
  private previewSnapshot: SpriteSizeSnapshot | null = null;

  constructor(private readonly deps: MovementCoordinatorDeps) {}

  previewMovement(config: SpriteMovementPreviewConfig): void {
    this.deps.cancelMotionEffect?.();
    const mode = config.movement?.mode ?? 'direction';
    if (config.movement?.enabled && mode === 'windowAnimation') {
      this.stopAutoMove();
      if (!this.deps.canMove() || !this.deps.canUseMovement()) {
        return;
      }
      void this.deps.playWindowAnimation?.(config.movement);
      return;
    }

    if (!this.previewSnapshot) {
      const liveConfig = this.deps.getSpriteConfig();
      this.previewSnapshot = {
        width: liveConfig.width,
        height: liveConfig.height,
        padding: liveConfig.padding
      };
    }

    this.deps.setSpriteMetrics({
      width: config.width,
      height: config.height,
      padding: config.padding
    });
    this.deps.emitConfigChanged();
    const effectivePadding = resolveEffectivePadding(config.padding, this.deps.getSpriteConfig().bubbleMode);
    this.deps.setWindowSize(config.width, config.height, effectivePadding);
    this.stopAutoMove();

    if (!config.movement?.enabled || !this.deps.canMove() || !this.deps.canUseMovement()) {
      return;
    }

    if (mode === 'walkTo') {
      const target = this.computeWalkTarget(config.movement);
      if (!target) return;
      void this.moveToTarget(target, config.movement);
      return;
    }

    this.startDirectionalAutoMove(config.movement);
  }

  stopMovementPreview(): void {
    this.deps.cancelMotionEffect?.();
    this.deps.stopWalk();
    this.stopAutoMove();

    if (!this.previewSnapshot) {
      return;
    }

    const snapshot = this.previewSnapshot;
    this.previewSnapshot = null;
    this.deps.setSpriteMetrics(snapshot);
    this.deps.emitConfigChanged();
    const effectivePadding = resolveEffectivePadding(snapshot.padding, this.deps.getSpriteConfig().bubbleMode);
    this.deps.setWindowSize(snapshot.width, snapshot.height, effectivePadding);
  }

  applyAnimationMovement(movement?: SpriteMovementConfig, playbackSize?: SpriteWindowAnimationPlaybackSize): void {
    this.stopAutoMove();

    if (!movement?.enabled || !this.deps.canMove() || !this.deps.canUseMovement()) {
      return;
    }

    const trigger = movement.trigger ?? 'animation';
    if (trigger === 'behavior') {
      return;
    }

    const mode = movement.mode ?? 'direction';
    if (mode === 'windowAnimation') {
      if (playbackSize) {
        void this.deps.playWindowAnimation?.(movement, playbackSize);
      } else {
        void this.deps.playWindowAnimation?.(movement);
      }
      return;
    }

    if (mode === 'walkTo') {
      if (movement.motionEffect === 'warp') {
        const target = this.computeWalkTarget(movement);
        if (target) void this.moveToTarget(target, movement);
      }
      return;
    }

    this.startDirectionalAutoMove(movement);
  }

  async runBehaviorMovement(movement?: SpriteMovementConfig): Promise<boolean> {
    if (!movement?.enabled || !this.deps.canMove() || !this.deps.canUseMovement()) {
      return false;
    }

    const mode = movement.mode ?? 'direction';
    if (mode === 'windowAnimation') {
      return false;
    }

    const target = mode === 'walkTo' ? this.computeWalkTarget(movement) : this.computeDirectionalWalkTarget(movement);
    if (!target) {
      return false;
    }

    await this.moveToTarget(target, movement);
    return true;
  }

  stopAutoMove(): void {
    if (!this.deps.isAutoMoving()) {
      return;
    }

    this.deps.stopAutoMove();
    this.deps.emitWalkState({ active: false });
  }

  private startDirectionalAutoMove(movement: SpriteMovementConfig): void {
    this.deps.startAutoMove(movement);
    const direction = this.deps.getAutoMoveDirection();
    if (direction) {
      this.deps.emitWalkState({ active: true, direction });
    }
  }

  private async moveToTarget(target: { targetX: number; targetY: number }, movement: SpriteMovementConfig): Promise<void> {
    if (movement.motionEffect === 'warp' && this.deps.playMotionEffect) {
      try {
        const played = await this.deps.playMotionEffect('warp', target.targetX, target.targetY);
        if (played) return;
      } catch {
        // Existing window walking is the fail-open path when the overlay cannot run.
      }
    }
    await this.deps.walkTo(target.targetX, target.targetY, movement.speed);
  }

  private computeWalkTarget(movement: SpriteMovementConfig): { targetX: number; targetY: number } | null {
    const [, currentY] = this.deps.getPosition();
    const screen = this.deps.getScreenSize();
    const config = this.deps.getSpriteConfig();
    const viewport = this.getViewport(screen, config);
    const bounds = getWindowClampBounds(viewport);

    const minX = bounds.minX;
    const maxX = bounds.maxX;
    const targetX = Math.random() * (maxX - minX) + minX;

    const verticalRange = movement.verticalRange ?? 0.1;
    const yRange = screen.height * verticalRange;
    const minY = Math.max(bounds.minY, currentY - yRange);
    const maxY = Math.min(bounds.maxY, currentY + yRange);
    const targetY = Math.random() * (maxY - minY) + minY;
    const target = clampWindowPosition({ x: targetX, y: targetY }, viewport);

    return { targetX: target.x, targetY: target.y };
  }

  private computeDirectionalWalkTarget(movement: SpriteMovementConfig): { targetX: number; targetY: number } | null {
    const [currentX, currentY] = this.deps.getPosition();
    const screen = this.deps.getScreenSize();
    const config = this.deps.getSpriteConfig();
    const viewport = this.getViewport(screen, config);
    const bounds = getWindowClampBounds(viewport);

    const minX = bounds.minX;
    const maxX = bounds.maxX;
    const minY = bounds.minY;
    const maxY = bounds.maxY;

    const configuredDirection = movement.direction;
    const resolvedDirection = configuredDirection && configuredDirection !== 'random' ? configuredDirection : RESOLVABLE_DIRECTIONS[Math.floor(Math.random() * RESOLVABLE_DIRECTIONS.length)];

    const vector = DIRECTION_VECTORS[resolvedDirection];
    if (!vector) {
      return null;
    }

    const candidates: number[] = [];
    if (vector.dx > 0) {
      candidates.push((maxX - currentX) / vector.dx);
    } else if (vector.dx < 0) {
      candidates.push((minX - currentX) / vector.dx);
    }

    if (vector.dy > 0) {
      candidates.push((maxY - currentY) / vector.dy);
    } else if (vector.dy < 0) {
      candidates.push((minY - currentY) / vector.dy);
    }

    const maxDistance = candidates.filter((value) => Number.isFinite(value) && value > 0).reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY);
    if (!Number.isFinite(maxDistance)) {
      return null;
    }

    const target = clampWindowPosition(
      {
        x: Math.max(minX, Math.min(maxX, currentX + vector.dx * maxDistance)),
        y: Math.max(minY, Math.min(maxY, currentY + vector.dy * maxDistance))
      },
      viewport
    );

    return { targetX: target.x, targetY: target.y };
  }

  private getViewport(screen: { width: number; height: number }, config: SpriteSizeSnapshot): WindowControllerViewport {
    const liveConfig = this.deps.getSpriteConfig();
    return {
      screenWidth: screen.width,
      screenHeight: screen.height,
      spriteWidth: config.width,
      spriteHeight: config.height,
      padding: resolveEffectivePadding(config.padding, liveConfig.bubbleMode),
      avoidRegions: this.deps.getAvoidRegions?.() ?? []
    };
  }
}

import type { SpriteMovementConfig } from './types';
import {
  computeAutoMoveStep,
  DEFAULT_WALK_SPEED,
  directionToVelocity,
  resolveRandomMovementDirection,
  type WindowControllerPoint,
  type WindowControllerViewport
} from './window-controller-model';

const IPC_THROTTLE = 33.3;

export interface WindowControllerAutoMoveSessionOptions {
  now?: () => number;
  random?: () => number;
}

export interface WindowControllerAutoMoveTickResult {
  position: WindowControllerPoint | null;
  completed: boolean;
}

export class WindowControllerAutoMoveSession {
  private readonly options: WindowControllerAutoMoveSessionOptions;
  private active = false;
  private velocity: WindowControllerPoint = { x: 0, y: 0 };
  private lastTickTime = 0;
  private lastMoveTime = 0;
  private direction: 'left' | 'right' | null = null;

  constructor(options: WindowControllerAutoMoveSessionOptions = {}) {
    this.options = options;
  }

  start(config: SpriteMovementConfig): boolean {
    this.stop();

    if (!config.enabled) {
      return false;
    }

    const speed = config.speed ?? DEFAULT_WALK_SPEED;
    if (speed <= 0) {
      return false;
    }

    const direction = config.direction ?? 'random';
    const resolvedDirection = direction === 'random' ? resolveRandomMovementDirection(this.options.random?.()) : direction;
    const velocity = directionToVelocity(resolvedDirection, speed);

    this.velocity = { x: velocity.x, y: velocity.y };
    this.direction = velocity.x < 0 ? 'left' : velocity.x > 0 ? 'right' : null;
    this.active = true;
    this.lastTickTime = this.getNow();
    this.lastMoveTime = 0;
    return true;
  }

  stop(): boolean {
    const wasActive = this.active;
    this.active = false;
    this.velocity = { x: 0, y: 0 };
    this.lastTickTime = 0;
    this.lastMoveTime = 0;
    this.direction = null;
    return wasActive;
  }

  isActive(): boolean {
    return this.active;
  }

  getDirection(): 'left' | 'right' | null {
    return this.active ? this.direction : null;
  }

  tick(position: WindowControllerPoint, viewport: WindowControllerViewport): WindowControllerAutoMoveTickResult {
    if (!this.active) {
      return { position: null, completed: true };
    }

    const now = this.getNow();
    const dt = Math.max(0, now - this.lastTickTime);
    this.lastTickTime = now;

    const nextStep = computeAutoMoveStep({
      position,
      velocity: this.velocity,
      elapsedMs: dt,
      viewport
    });

    const completed = nextStep.hitBoundary;
    const shouldMove = this.lastMoveTime === 0 || now - this.lastMoveTime >= IPC_THROTTLE || completed;
    if (!shouldMove) {
      return { position: null, completed };
    }

    this.lastMoveTime = now;
    return {
      position: { x: nextStep.x, y: nextStep.y },
      completed
    };
  }

  private getNow(): number {
    return this.options.now?.() ?? Date.now();
  }
}

import {
  DEFAULT_WALK_SPEED,
  getWalkPathPosition,
  sampleWindowWalkPath,
  type WindowControllerPoint,
  type WindowControllerWalkPath
} from './window-controller-model';

const IPC_THROTTLE = 33.3;

export interface WindowControllerWalkSessionOptions {
  now?: () => number;
  curveMagnitudeRandom?: () => number;
  curveDirectionRandom?: () => number;
}

export interface WindowControllerWalkTickResult {
  position: WindowControllerPoint | null;
  completed: boolean;
}

interface WindowControllerWalkSessionData {
  path: WindowControllerWalkPath;
  progressed: number;
  lastTickTime: number;
  lastMoveTime: number;
  speed: number;
}

export class WindowControllerWalkSession {
  private readonly options: WindowControllerWalkSessionOptions;
  private active = false;
  private direction: 'left' | 'right' | null = null;
  private data: WindowControllerWalkSessionData | null = null;
  private resolve: (() => void) | null = null;

  constructor(options: WindowControllerWalkSessionOptions = {}) {
    this.options = options;
  }

  start(input: {
    startX: number;
    startY: number;
    targetX: number;
    targetY: number;
    speed?: number;
  }): Promise<void> {
    const dx = input.targetX - input.startX;
    const dy = input.targetY - input.startY;
    const totalDist = Math.hypot(dx, dy);

    if (totalDist < 1) {
      return Promise.resolve();
    }

    if (this.active || this.resolve) {
      this.finish();
    }

    const now = this.getNow();
    this.active = true;
    this.direction = dx > 0 ? 'right' : 'left';
    this.data = {
      path: sampleWindowWalkPath({
        startX: input.startX,
        startY: input.startY,
        targetX: input.targetX,
        targetY: input.targetY,
        curveMagnitudeRandom: this.options.curveMagnitudeRandom?.(),
        curveDirectionRandom: this.options.curveDirectionRandom?.()
      }),
      progressed: 0,
      lastTickTime: now,
      lastMoveTime: 0,
      speed: input.speed ?? DEFAULT_WALK_SPEED
    };

    return new Promise<void>((resolve) => {
      this.resolve = resolve;
    });
  }

  isActive(): boolean {
    return this.active;
  }

  getDirection(): 'left' | 'right' | null {
    return this.active ? this.direction : null;
  }

  tick(windowAvailable: boolean): WindowControllerWalkTickResult {
    if (!this.active || !this.data) {
      return { position: null, completed: true };
    }

    if (!windowAvailable) {
      return { position: null, completed: true };
    }

    const now = this.getNow();
    const dt = Math.max(0, now - this.data.lastTickTime);
    this.data.lastTickTime = now;
    this.data.progressed = Math.max(0, Math.min(this.data.progressed + (this.data.speed * dt) / 1000, this.data.path.totalDist));

    const completed = this.data.progressed >= this.data.path.totalDist;
    const shouldMove = this.data.lastMoveTime === 0 || now - this.data.lastMoveTime >= IPC_THROTTLE || completed;
    if (!shouldMove) {
      return { position: null, completed };
    }

    this.data.lastMoveTime = now;
    return {
      position: getWalkPathPosition(this.data.path, this.data.progressed),
      completed
    };
  }

  finish(): boolean {
    const wasActive = this.active;
    const resolve = this.resolve;
    this.active = false;
    this.direction = null;
    this.data = null;
    this.resolve = null;
    resolve?.();
    return wasActive;
  }

  private getNow(): number {
    return this.options.now?.() ?? Date.now();
  }
}

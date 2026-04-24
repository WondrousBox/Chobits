import { resolveDragWindowPosition, type WindowControllerPoint, type WindowControllerViewport } from './window-controller-model';

export interface WindowControllerDragSessionOptions {
  getCursorScreenPoint: () => WindowControllerPoint;
  getViewport: () => WindowControllerViewport;
  moveWindow: (position: WindowControllerPoint) => boolean;
  isWindowAvailable: () => boolean;
}

export class WindowControllerDragSession {
  private readonly options: WindowControllerDragSessionOptions;
  private active = false;
  private dragOffset: WindowControllerPoint = { x: 0, y: 0 };

  constructor(options: WindowControllerDragSessionOptions) {
    this.options = options;
  }

  start(offsetX: number, offsetY: number): void {
    this.active = true;
    this.dragOffset = {
      x: offsetX,
      y: offsetY
    };
  }

  stop(): void {
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  tick(): boolean {
    if (!this.active) {
      return false;
    }

    if (!this.options.isWindowAvailable()) {
      this.stop();
      return false;
    }

    const nextPosition = resolveDragWindowPosition(this.options.getCursorScreenPoint(), this.dragOffset, this.options.getViewport());
    const moved = this.options.moveWindow(nextPosition);
    if (!moved) {
      this.stop();
      return false;
    }

    return true;
  }
}

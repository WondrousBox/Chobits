import type { SpriteWindow } from './manager';
import type { WindowControllerPoint } from './window-controller-model';

export interface WindowControllerPlatformOptions {
  getWindow: () => SpriteWindow | null;
}

export class WindowControllerPlatform {
  private readonly options: WindowControllerPlatformOptions;

  constructor(options: WindowControllerPlatformOptions) {
    this.options = options;
  }

  isAvailable(): boolean {
    return this.resolveWindow() !== null;
  }

  getBounds(): { x: number; y: number; width: number; height: number } | null {
    return this.resolveWindow()?.getBounds() ?? null;
  }

  setPosition(x: number, y: number): boolean {
    const win = this.resolveWindow();
    if (!win) return false;
    win.setPosition(Math.round(x), Math.round(y));
    return true;
  }

  setPoint(position: WindowControllerPoint): boolean {
    return this.setPosition(position.x, position.y);
  }

  setSize(width: number, height: number): boolean {
    const win = this.resolveWindow();
    if (!win) return false;
    win.setSize(Math.round(width), Math.round(height));
    return true;
  }

  private resolveWindow(): SpriteWindow | null {
    const win = this.options.getWindow();
    return win && !win.isDestroyed() ? win : null;
  }
}

import { describe, expect, it } from 'vitest';

import { WindowControllerPlatform } from '../../packages/sprite-core/window-controller-platform';

function createWindow() {
  let destroyed = false;
  let bounds = { x: 10, y: 20, width: 200, height: 300 };

  return {
    window: {
      webContents: {
        send: () => undefined
      },
      getBounds: () => bounds,
      setPosition: (x: number, y: number) => {
        bounds = { ...bounds, x, y };
      },
      setSize: (width: number, height: number) => {
        bounds = { ...bounds, width, height };
      },
      isDestroyed: () => destroyed
    },
    destroy: () => {
      destroyed = true;
    }
  };
}

describe('window controller platform', () => {
  it('reads bounds and rounds position and size writes', () => {
    const state = createWindow();
    const platform = new WindowControllerPlatform({
      getWindow: () => state.window
    });

    expect(platform.getBounds()).toEqual({ x: 10, y: 20, width: 200, height: 300 });
    expect(platform.setPosition(10.6, 21.4)).toBe(true);
    expect(platform.setSize(99.9, 120.2)).toBe(true);
    expect(platform.getBounds()).toEqual({ x: 11, y: 21, width: 100, height: 120 });
  });

  it('becomes unavailable after the underlying window is destroyed', () => {
    const state = createWindow();
    const platform = new WindowControllerPlatform({
      getWindow: () => state.window
    });

    state.destroy();

    expect(platform.isAvailable()).toBe(false);
    expect(platform.getBounds()).toBeNull();
    expect(platform.setPosition(1, 2)).toBe(false);
    expect(platform.setSize(3, 4)).toBe(false);
  });
});

import { describe, expect, it, vi } from 'vitest';

import { WindowControllerDragSession } from '../../packages/sprite-core/window-controller-drag-session';

describe('window controller drag session', () => {
  it('moves the window using clamped drag positions', () => {
    const moveWindow = vi.fn(() => true);
    const session = new WindowControllerDragSession({
      getCursorScreenPoint: () => ({ x: 110, y: 90 }),
      getViewport: () => ({
        screenWidth: 400,
        screenHeight: 300,
        spriteWidth: 100,
        spriteHeight: 120,
        padding: 20
      }),
      moveWindow,
      isWindowAvailable: () => true
    });

    session.start(30, 50);

    expect(session.tick()).toBe(true);
    expect(moveWindow).toHaveBeenCalledWith({ x: 80, y: 40 });
    expect(session.isActive()).toBe(true);
  });

  it('stops itself when the window becomes unavailable', () => {
    const session = new WindowControllerDragSession({
      getCursorScreenPoint: () => ({ x: 10, y: 10 }),
      getViewport: () => ({
        screenWidth: 400,
        screenHeight: 300,
        spriteWidth: 100,
        spriteHeight: 120,
        padding: 20
      }),
      moveWindow: vi.fn(() => true),
      isWindowAvailable: () => false
    });

    session.start(5, 5);

    expect(session.tick()).toBe(false);
    expect(session.isActive()).toBe(false);
  });
});

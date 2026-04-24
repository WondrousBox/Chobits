import { describe, expect, it } from 'vitest';

import { WindowControllerAutoMoveSession } from '../packages/sprite-core/window-controller-auto-move-session';

const viewport = {
  screenWidth: 800,
  screenHeight: 600,
  spriteWidth: 120,
  spriteHeight: 160,
  padding: 24
};

describe('window controller auto-move session', () => {
  it('starts from movement config and throttles intermediate updates', () => {
    let now = 1_000;
    const session = new WindowControllerAutoMoveSession({
      now: () => now
    });

    expect(
      session.start({
        enabled: true,
        direction: 'right',
        speed: 100
      })
    ).toBe(true);
    expect(session.isActive()).toBe(true);
    expect(session.getDirection()).toBe('right');

    now = 1_016;
    expect(session.tick({ x: 100, y: 200 }, viewport)).toEqual({
      position: { x: 101.6, y: 200 },
      completed: false
    });

    now = 1_032;
    expect(session.tick({ x: 101.6, y: 200 }, viewport)).toEqual({
      position: null,
      completed: false
    });
  });

  it('resolves random directions deterministically and stops at boundaries', () => {
    let now = 2_000;
    const session = new WindowControllerAutoMoveSession({
      now: () => now,
      random: () => 0
    });

    expect(
      session.start({
        enabled: true,
        direction: 'random',
        speed: 100
      })
    ).toBe(true);
    expect(session.getDirection()).toBe('left');

    now = 2_500;
    expect(session.tick({ x: 10, y: 200 }, viewport)).toEqual({
      position: { x: -24, y: 200 },
      completed: true
    });

    expect(session.stop()).toBe(true);
    expect(session.isActive()).toBe(false);
    expect(session.getDirection()).toBeNull();
  });
});

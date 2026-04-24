import { describe, expect, it } from 'vitest';

import { WindowControllerWalkSession } from '../packages/sprite-core/window-controller-walk-session';

describe('window controller walk session', () => {
  it('tracks walk progress and resolves after finish', async () => {
    let now = 1_000;
    const session = new WindowControllerWalkSession({
      now: () => now,
      curveMagnitudeRandom: () => 0,
      curveDirectionRandom: () => 1
    });

    const walkPromise = session.start({
      startX: 0,
      startY: 0,
      targetX: 100,
      targetY: 0,
      speed: 100
    });

    expect(session.isActive()).toBe(true);
    expect(session.getDirection()).toBe('right');

    now = 1_500;
    const midway = session.tick(true);
    expect(midway.completed).toBe(false);
    expect(midway.position).not.toBeNull();
    expect(midway.position!.x).toBeGreaterThan(40);
    expect(midway.position!.x).toBeLessThan(60);

    now = 2_100;
    const completed = session.tick(true);
    expect(completed.completed).toBe(true);
    expect(completed.position).toEqual({ x: 100, y: 0 });

    expect(session.finish()).toBe(true);
    expect(session.isActive()).toBe(false);
    expect(session.getDirection()).toBeNull();
    await expect(walkPromise).resolves.toBeUndefined();
  });

  it('completes immediately when the window becomes unavailable', () => {
    let now = 500;
    const session = new WindowControllerWalkSession({
      now: () => now
    });

    void session.start({
      startX: 0,
      startY: 0,
      targetX: 80,
      targetY: 0
    });

    now = 516;
    expect(session.tick(false)).toEqual({
      position: null,
      completed: true
    });
  });
});

import { describe, expect, it } from 'vitest';

import {
  clampWindowPosition,
  computeAutoMoveStep,
  directionToVelocity,
  getWalkPathPosition,
  resolveDragWindowPosition,
  resolveRandomMovementDirection,
  sampleWindowWalkPath,
  type WindowControllerViewport
} from '../packages/sprite-core/window-controller-model';

const viewport: WindowControllerViewport = {
  screenWidth: 800,
  screenHeight: 600,
  spriteWidth: 120,
  spriteHeight: 160,
  padding: 24
};

describe('window controller model helpers', () => {
  it('clamps window positions into the padded viewport', () => {
    expect(clampWindowPosition({ x: -100, y: 999 }, viewport)).toEqual({
      x: -24,
      y: 416
    });
  });

  it('pushes sprite content out of active avoid regions', () => {
    expect(
      clampWindowPosition(
        { x: 620, y: 200 },
        {
          ...viewport,
          avoidRegions: [{ x: 600, y: 0, width: 200, height: 600 }]
        }
      )
    ).toEqual({
      x: 456,
      y: 200
    });
  });

  it('keeps positions that do not intersect an avoid region', () => {
    expect(
      clampWindowPosition(
        { x: 620, y: 200 },
        {
          ...viewport,
          avoidRegions: [{ x: 600, y: 0, width: 200, height: 120 }]
        }
      )
    ).toEqual({
      x: 620,
      y: 200
    });
  });

  it('derives drag positions from cursor coordinates before clamping', () => {
    expect(resolveDragWindowPosition({ x: 100, y: 120 }, { x: 20, y: 30 }, viewport)).toEqual({
      x: 80,
      y: 90
    });
  });

  it('samples walk paths and interpolates progress along the curve', () => {
    const path = sampleWindowWalkPath({
      startX: 0,
      startY: 0,
      targetX: 100,
      targetY: 0,
      curveMagnitudeRandom: 0,
      curveDirectionRandom: 1
    });

    expect(path.totalDist).toBeGreaterThan(100);
    expect(getWalkPathPosition(path, 0)).toEqual({ x: 0, y: 0 });
    expect(getWalkPathPosition(path, path.totalDist)).toEqual({ x: 100, y: 0 });

    const midpoint = getWalkPathPosition(path, path.totalDist / 2);
    expect(midpoint.x).toBeGreaterThan(40);
    expect(midpoint.x).toBeLessThan(60);
    expect(midpoint.y).toBeGreaterThan(0);
  });

  it('computes auto-move steps and reports boundary hits', () => {
    expect(
      computeAutoMoveStep({
        position: { x: 640, y: 200 },
        velocity: { x: 100, y: 0 },
        elapsedMs: 500,
        viewport
      })
    ).toEqual({
      x: 656,
      y: 200,
      hitBoundary: true
    });
  });

  it('reports auto-move completion when an avoid region blocks movement', () => {
    expect(
      computeAutoMoveStep({
        position: { x: 540, y: 200 },
        velocity: { x: 100, y: 0 },
        elapsedMs: 1000,
        viewport: {
          ...viewport,
          avoidRegions: [{ x: 600, y: 0, width: 200, height: 600 }]
        }
      })
    ).toEqual({
      x: 456,
      y: 200,
      hitBoundary: true
    });
  });

  it('maps directions to velocity vectors and resolves random directions deterministically', () => {
    expect(directionToVelocity('down-right', 100)).toEqual({
      x: 100 * Math.SQRT1_2,
      y: 100 * Math.SQRT1_2
    });
    expect(resolveRandomMovementDirection(0)).toBe('left');
    expect(resolveRandomMovementDirection(0.999999)).toBe('down-right');
  });
});

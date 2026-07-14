import { describe, expect, it } from 'vitest';

import {
  createSpriteMotionEffectPath,
  createSpriteMotionEffectRun,
  getSpriteMotionEffectFrame,
  getSpriteMotionEffectLocalPoint,
  getSpriteMotionEffectPoint,
  SPRITE_MOTION_EFFECT_TIMELINES
} from '../packages/sprite-core/sprite-motion-effect';
import { createSpriteMotionParticles, sampleSpriteMotionParticle } from '../src/features/sprite-motion-effect/motion-effect-particles';

const sourceBounds = { x: -240, y: 120, width: 200, height: 260 };
const destinationBounds = { x: 880, y: 430, width: 200, height: 260 };

describe('sprite motion effect', () => {
  it('builds a deterministic quadratic path between character centers', () => {
    const path = createSpriteMotionEffectPath(sourceBounds, destinationBounds, 8);
    const repeated = createSpriteMotionEffectPath(sourceBounds, destinationBounds, 8);
    const mirrored = createSpriteMotionEffectPath(sourceBounds, destinationBounds, 9);

    expect(path).toEqual(repeated);
    expect(path.start).toEqual({ x: -140, y: 250 });
    expect(path.end).toEqual({ x: 980, y: 560 });
    expect(mirrored.control1).not.toEqual(path.control1);
    expect(getSpriteMotionEffectPoint(path, 0)).toEqual(path.start);
    expect(getSpriteMotionEffectPoint(path, 1)).toEqual(path.end);
  });

  it('keeps the full curve and both character windows inside the overlay corridor', () => {
    const run = createSpriteMotionEffectRun({ type: 'warp', sourceBounds, destinationBounds, reducedMotion: false }, { runId: 'motion-1', now: 1000, seed: 12, startDelayMs: 100 });
    const overlay = run.overlayBounds;

    expect(overlay.x).toBeLessThan(sourceBounds.x);
    expect(overlay.y).toBeLessThan(Math.min(sourceBounds.y, destinationBounds.y));
    expect(overlay.x + overlay.width).toBeGreaterThan(destinationBounds.x + destinationBounds.width);
    expect(overlay.y + overlay.height).toBeGreaterThan(destinationBounds.y + destinationBounds.height);
    for (let index = 0; index <= 100; index += 1) {
      const local = getSpriteMotionEffectLocalPoint(run, getSpriteMotionEffectPoint(run.path, index / 100));
      expect(local.x).toBeGreaterThanOrEqual(0);
      expect(local.y).toBeGreaterThanOrEqual(0);
      expect(local.x).toBeLessThanOrEqual(overlay.width);
      expect(local.y).toBeLessThanOrEqual(overlay.height);
    }
  });

  it('samples dissolve, travel and arrival from the shared absolute timeline', () => {
    const run = createSpriteMotionEffectRun({ type: 'warp', sourceBounds, destinationBounds, reducedMotion: false }, { runId: 'motion-2', now: 2000, seed: 3, startDelayMs: 0 });

    expect(getSpriteMotionEffectFrame(run, 1999)).toMatchObject({ dissolveProgress: 0, travelProgress: 0, arriveProgress: 0, complete: false });
    expect(getSpriteMotionEffectFrame(run, 2000 + run.timeline.travelEndMs).travelProgress).toBe(1);
    expect(getSpriteMotionEffectFrame(run, 2000 + run.timeline.arriveEndMs).arriveProgress).toBe(1);
    expect(getSpriteMotionEffectFrame(run, 2000 + run.durationMs).complete).toBe(true);
  });

  it('uses the compact reduced-motion timeline and deterministic particles', () => {
    const run = createSpriteMotionEffectRun({ type: 'warp', sourceBounds, destinationBounds, reducedMotion: true }, { runId: 'motion-3', now: 3000, seed: 123, startDelayMs: 0 });
    const particles = createSpriteMotionParticles(run);

    expect(run.durationMs).toBe(SPRITE_MOTION_EFFECT_TIMELINES.reduced.durationMs);
    expect(particles).toHaveLength(36);
    expect(createSpriteMotionParticles(run)).toEqual(particles);
    expect(sampleSpriteMotionParticle(particles[0], particles[0].spawnAtMs + 1)).not.toBeNull();
  });

  it('rejects invalid source or destination bounds', () => {
    expect(() => createSpriteMotionEffectRun({ type: 'warp', sourceBounds: { ...sourceBounds, width: 0 }, destinationBounds, reducedMotion: false }, { runId: 'invalid', now: 0, seed: 0 })).toThrow(
      'Invalid sprite motion effect bounds'
    );
  });
});

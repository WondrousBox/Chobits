import { getSpriteMotionEffectFrame, getSpriteMotionEffectPoint } from '@packages/sprite-core/sprite-motion-effect';
import type { SpriteMotionEffectRun } from '@packages/sprite-core/types';

export interface SpriteMotionParticle {
  id: number;
  phase: 'source' | 'trail' | 'arrival';
  kind: 'dot' | 'streak';
  colorIndex: 0 | 1 | 2;
  spawnAtMs: number;
  lifetimeMs: number;
  originX: number;
  originY: number;
  velocityX: number;
  velocityY: number;
  size: number;
  phaseOffset: number;
}

export interface SpriteMotionParticleSample {
  x: number;
  y: number;
  opacity: number;
  stretch: number;
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSpriteMotionParticles(run: SpriteMotionEffectRun): SpriteMotionParticle[] {
  const random = mulberry32(run.seed ^ 0x9e3779b9);
  const count = run.reducedMotion ? 36 : 220;
  const sourceCount = Math.round(count * 0.24);
  const trailCount = Math.round(count * 0.5);

  return Array.from({ length: count }, (_, id) => {
    const phase = id < sourceCount ? 'source' : id < sourceCount + trailCount ? 'trail' : 'arrival';
    let spawnAtMs = 0;
    let origin = run.path.start;

    if (phase === 'source') {
      spawnAtMs = random() * run.timeline.dissolveEndMs;
    } else if (phase === 'trail') {
      spawnAtMs = run.timeline.travelStartMs + random() * (run.timeline.travelEndMs - run.timeline.travelStartMs);
      const pathProgress = getSpriteMotionEffectFrame(run, run.startsAt + spawnAtMs).travelProgress;
      origin = getSpriteMotionEffectPoint(run.path, pathProgress);
    } else {
      spawnAtMs = run.timeline.arriveStartMs + random() * Math.max(1, run.timeline.arriveEndMs - run.timeline.arriveStartMs) * 0.7;
      origin = run.path.end;
    }

    const angle = random() * Math.PI * 2;
    const speed = phase === 'trail' ? 0.025 + random() * 0.07 : 0.06 + random() * 0.16;
    const radialScale = phase === 'trail' ? 0.55 : 1;
    return {
      id,
      phase,
      kind: random() < (phase === 'trail' ? 0.46 : 0.28) ? 'streak' : 'dot',
      colorIndex: Math.floor(random() * 3) as 0 | 1 | 2,
      spawnAtMs,
      lifetimeMs: run.reducedMotion ? 110 + random() * 100 : 280 + random() * 460,
      originX: origin.x,
      originY: origin.y,
      velocityX: Math.cos(angle) * speed * radialScale,
      velocityY: Math.sin(angle) * speed * radialScale - (phase === 'source' ? 0.025 : 0),
      size: 0.7 + random() * (phase === 'trail' ? 2.2 : 3.2),
      phaseOffset: random() * Math.PI * 2
    };
  });
}

export function sampleSpriteMotionParticle(particle: SpriteMotionParticle, elapsedMs: number): SpriteMotionParticleSample | null {
  const ageMs = elapsedMs - particle.spawnAtMs;
  if (ageMs < 0 || ageMs > particle.lifetimeMs) return null;
  const life = ageMs / particle.lifetimeMs;
  const fadeIn = Math.min(1, life / 0.1);
  const fadeOut = Math.max(0, 1 - Math.max(0, life - 0.42) / 0.58);
  const wobble = Math.sin(particle.phaseOffset + life * Math.PI * 3) * (particle.phase === 'trail' ? 4 : 2);
  return {
    x: particle.originX + particle.velocityX * ageMs + wobble,
    y: particle.originY + particle.velocityY * ageMs + (particle.phase === 'arrival' ? 0.00008 : -0.000035) * ageMs * ageMs,
    opacity: fadeIn * fadeOut,
    stretch: particle.kind === 'streak' ? 5 + (1 - life) * 10 : 1
  };
}

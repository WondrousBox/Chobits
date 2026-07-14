import { getAssistantEntranceFrame } from '@packages/sprite-core/assistant-entrance';
import type { AssistantEntranceRun } from '@packages/sprite-core/types';

export interface AssistantEntranceParticle {
  id: number;
  kind: 'dot' | 'streak';
  colorIndex: 0 | 1 | 2;
  spawnAtMs: number;
  lifetimeMs: number;
  originX: number;
  originY: number;
  velocityX: number;
  velocityY: number;
  size: number;
  phase: number;
}

export interface AssistantEntranceParticleSample {
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

export function createAssistantEntranceParticles(run: AssistantEntranceRun): AssistantEntranceParticle[] {
  const random = mulberry32(run.seed);
  const count = run.reducedMotion ? 16 : 112;
  const horizontalOverflow = Math.min(10, run.characterRect.width * 0.04);

  return Array.from({ length: count }, (_, id) => {
    const spawnAtMs = run.scanStartMs + random() * run.scanDurationMs;
    const spawnFrame = getAssistantEntranceFrame(run, run.startsAt + spawnAtMs);
    const kind = random() < 0.3 ? 'streak' : 'dot';
    return {
      id,
      kind,
      colorIndex: Math.floor(random() * 3) as 0 | 1 | 2,
      spawnAtMs,
      lifetimeMs: run.reducedMotion ? 180 + random() * 100 : 360 + random() * 420,
      originX: run.characterRect.x - horizontalOverflow + random() * (run.characterRect.width + horizontalOverflow * 2),
      originY: spawnFrame.scanY + (random() - 0.5) * (run.reducedMotion ? 4 : 16),
      velocityX: (random() - 0.5) * (kind === 'streak' ? 0.09 : 0.065),
      velocityY: -(kind === 'streak' ? 0.1 + random() * 0.1 : 0.045 + random() * 0.105),
      size: kind === 'streak' ? 0.7 + random() * 1.2 : 0.8 + random() * 2.6,
      phase: random() * Math.PI * 2
    };
  });
}

export function sampleAssistantEntranceParticle(particle: AssistantEntranceParticle, elapsedMs: number): AssistantEntranceParticleSample | null {
  const ageMs = elapsedMs - particle.spawnAtMs;
  if (ageMs < 0 || ageMs > particle.lifetimeMs) return null;

  const lifeProgress = ageMs / particle.lifetimeMs;
  const fadeIn = Math.min(1, lifeProgress / 0.12);
  const fadeOut = Math.max(0, 1 - Math.max(0, lifeProgress - 0.55) / 0.45);
  const drift = Math.sin(particle.phase + lifeProgress * Math.PI * 2) * 2.5;
  return {
    x: particle.originX + particle.velocityX * ageMs + drift,
    y: particle.originY + particle.velocityY * ageMs - 0.000018 * ageMs * ageMs,
    opacity: fadeIn * fadeOut,
    stretch: particle.kind === 'streak' ? 5 + 8 * (1 - lifeProgress) : 1
  };
}

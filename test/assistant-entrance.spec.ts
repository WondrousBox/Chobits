import { describe, expect, it } from 'vitest';

import {
  ASSISTANT_ENTRANCE_START_DELAY_MS,
  ASSISTANT_ENTRANCE_TIMELINES,
  createAssistantEntranceRun,
  getAssistantEntranceFrame,
  normalizeAssistantEntrancePreparePayload
} from '../packages/sprite-core/assistant-entrance';
import { createAssistantEntranceParticles, sampleAssistantEntranceParticle } from '../src/features/sprite-effect/assistant-entrance-particles';

const payload = {
  surface: { width: 380, height: 440 },
  characterRect: { x: 100, y: 100, width: 180, height: 240 },
  reducedMotion: false
};

describe('assistant entrance timeline', () => {
  it('normalizes valid geometry and rejects out-of-surface character bounds', () => {
    expect(normalizeAssistantEntrancePreparePayload(payload)).toEqual(payload);
    expect(
      normalizeAssistantEntrancePreparePayload({
        ...payload,
        characterRect: { x: 250, y: 100, width: 180, height: 240 }
      })
    ).toBeNull();
  });

  it('creates a deterministic standard run with a future shared start', () => {
    const run = createAssistantEntranceRun(payload, { runId: 'entrance-1', now: 1000, seed: 42 });

    expect(run.startsAt).toBe(1000 + ASSISTANT_ENTRANCE_START_DELAY_MS);
    expect(run.durationMs).toBe(ASSISTANT_ENTRANCE_TIMELINES.standard.durationMs);
    expect(run.scanStartMs).toBe(ASSISTANT_ENTRANCE_TIMELINES.standard.scanStartMs);
    expect(run.scanDurationMs).toBe(ASSISTANT_ENTRANCE_TIMELINES.standard.scanDurationMs);
    expect(run.seed).toBe(42);
  });

  it('moves the scan monotonically from the character bottom to its top', () => {
    const run = createAssistantEntranceRun(payload, { runId: 'entrance-2', now: 0, seed: 7, startDelayMs: 0 });
    const before = getAssistantEntranceFrame(run, 0);
    const middle = getAssistantEntranceFrame(run, run.scanStartMs + run.scanDurationMs / 2);
    const scanned = getAssistantEntranceFrame(run, run.scanStartMs + run.scanDurationMs);
    const complete = getAssistantEntranceFrame(run, run.durationMs);

    expect(before.scanProgress).toBe(0);
    expect(before.scanY).toBe(340);
    expect(middle.scanProgress).toBeCloseTo(0.5, 5);
    expect(middle.scanY).toBeCloseTo(220, 5);
    expect(scanned.scanProgress).toBe(1);
    expect(scanned.scanY).toBe(100);
    expect(complete.complete).toBe(true);
    expect(complete.overallProgress).toBe(1);
  });

  it('uses the shortened reduced-motion timeline', () => {
    const run = createAssistantEntranceRun({ ...payload, reducedMotion: true }, { runId: 'entrance-reduced', now: 200, seed: -1, startDelayMs: 0 });

    expect(run.durationMs).toBe(ASSISTANT_ENTRANCE_TIMELINES.reduced.durationMs);
    expect(run.scanDurationMs).toBe(ASSISTANT_ENTRANCE_TIMELINES.reduced.scanDurationMs);
    expect(run.seed).toBe(0xffffffff);
    expect(getAssistantEntranceFrame(run, 200 + run.durationMs).complete).toBe(true);
  });

  it('generates deterministic particles that only exist during their lifetime', () => {
    const run = createAssistantEntranceRun(payload, { runId: 'entrance-particles', now: 0, seed: 1234, startDelayMs: 0 });
    const first = createAssistantEntranceParticles(run);
    const second = createAssistantEntranceParticles(run);

    expect(first).toEqual(second);
    expect(first).toHaveLength(112);
    expect(first.every((particle) => particle.originY >= payload.characterRect.y - 8 && particle.originY <= payload.characterRect.y + payload.characterRect.height + 8)).toBe(true);

    const particle = first[0];
    expect(sampleAssistantEntranceParticle(particle, particle.spawnAtMs - 1)).toBeNull();
    expect(sampleAssistantEntranceParticle(particle, particle.spawnAtMs + particle.lifetimeMs / 2)).toEqual(expect.objectContaining({ opacity: expect.any(Number) }));
    expect(sampleAssistantEntranceParticle(particle, particle.spawnAtMs + particle.lifetimeMs + 1)).toBeNull();
  });
});

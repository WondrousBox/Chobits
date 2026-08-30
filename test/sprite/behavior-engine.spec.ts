import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BehaviorContext, BehaviorDefinition } from '../../packages/sprite-core/behavior-engine';
import { BehaviorEngine } from '../../packages/sprite-core/behavior-engine';

function createContext(): BehaviorContext {
  return {
    spriteState: 'idle',
    personaState: {
      name: 'Test',
      description: '',
      mood: 'neutral',
      moodIntensity: 50,
      favor: 50,
      favorLevel: 'friend',
      level: 1,
      achievements: [],
      dimensions: {},
      createdAt: Date.now(),
      updatedAt: Date.now()
    } as any,
    interactionStats: {
      idleDuration: 60_000
    } as any,
    now: new Date('2026-05-05T09:00:00+08:00'),
    screenSize: { width: 1280, height: 720 }
  };
}

function createBehavior(action: BehaviorDefinition['action']): BehaviorDefinition {
  return {
    id: 'test-behavior',
    name: '测试行为',
    enabled: true,
    priority: 'low',
    schedule: { type: 'interval', intervalMs: 10_000 },
    conditions: [() => true],
    probability: 1,
    action,
    allowedStates: ['idle']
  };
}

describe('BehaviorEngine', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('can try a single behavior without scanning the whole behavior set', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-05T09:00:00+08:00'));

    const action = vi.fn();
    const engine = new BehaviorEngine();
    engine.register(createBehavior(action));

    const notDue = await engine.tryRunBehavior('test-behavior', {
      context: createContext(),
      now: Date.now() + 5_000
    });

    expect(notDue).toMatchObject({
      behaviorId: 'test-behavior',
      triggered: false,
      skippedReason: 'not-due'
    });
    expect(action).not.toHaveBeenCalled();

    const forced = await engine.tryRunBehavior('test-behavior', {
      context: createContext(),
      now: Date.now() + 5_000,
      ignoreSchedule: true
    });

    expect(forced).toMatchObject({
      behaviorId: 'test-behavior',
      triggered: true
    });
    expect(action).toHaveBeenCalledOnce();
  });

  it('force trigger bypasses behavior due filters but keeps core safety checks', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-05T09:00:00+08:00'));

    const action = vi.fn();
    const engine = new BehaviorEngine();
    engine.register({
      ...createBehavior(action),
      conditions: [() => false],
      probability: 0,
      schedule: { type: 'interval', intervalMs: 10_000, timeWindow: { startHour: 22, endHour: 23 } }
    });

    const normal = await engine.tryRunBehavior('test-behavior', {
      context: createContext(),
      now: Date.now() + 10_000,
      ignoreSchedule: true
    });

    expect(normal).toMatchObject({
      behaviorId: 'test-behavior',
      triggered: false,
      skippedReason: 'time-window'
    });

    const forced = await engine.tryRunBehavior('test-behavior', {
      context: createContext(),
      now: Date.now() + 10_000,
      ignoreSchedule: true,
      force: true
    });

    expect(forced).toMatchObject({
      behaviorId: 'test-behavior',
      triggered: true
    });
    expect(action).toHaveBeenCalledOnce();
  });
});

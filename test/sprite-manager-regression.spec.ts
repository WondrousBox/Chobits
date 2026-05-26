import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AnimationEntry } from '../packages/sprite-core/animation-registry';
import { initSpriteCapabilityRuntime, resetSpriteCapabilityRuntime } from '../packages/sprite-core/capability-runtime';
import { registerDefaultBehaviors } from '../packages/sprite-core/manager/default-behaviors';
import { SpriteManager } from '../packages/sprite-core/manager/sprite-manager';
import { mapStateToEventType } from '../packages/sprite-core/manager/state-mapping';
import { removePersonaRulesLayer, resetPersonaRulesRuntime, setPersonaRulesProvider, upsertPersonaRulesLayer } from '../packages/sprite-core/persona-rules';
import type { SpriteAnimation, SpriteMovementConfig } from '../packages/sprite-core/types';

function createTestWindow(): {
  win: {
    webContents: {
      send(channel: string, payload: unknown): void;
    };
    getBounds(): { x: number; y: number; width: number; height: number };
    setPosition: ReturnType<typeof vi.fn>;
    setSize: ReturnType<typeof vi.fn>;
    isDestroyed(): boolean;
  };
  sent: Array<{ channel: string; payload: unknown }>;
} {
  const sent: Array<{ channel: string; payload: unknown }> = [];
  const win = {
    webContents: {
      send: (channel: string, payload: unknown) => {
        sent.push({ channel, payload });
      }
    },
    getBounds: () => ({ x: 0, y: 0, width: 200, height: 200 }),
    setPosition: vi.fn(),
    setSize: vi.fn(),
    isDestroyed: () => false
  };

  return { win, sent };
}

function createManager(options: { purposeWindowAdapter?: any; behaviorScheduler?: any } = {}): {
  mgr: SpriteManager;
  sent: Array<{ channel: string; payload: unknown }>;
  dataDir: string;
} {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'sprite-manager-test-'));
  const { win, sent } = createTestWindow();
  const mgr = SpriteManager.init({
    win: win as any,
    dataDir,
    getScreenSize: () => ({ width: 1280, height: 720 }),
    appName: 'SpriteTest',
    purposeWindowAdapter: options.purposeWindowAdapter,
    behaviorScheduler: options.behaviorScheduler
  });

  return { mgr, sent, dataDir };
}

function createBehaviorSchedulerHarness(): {
  scheduler: {
    handlers: Map<string, any>;
    gates: Map<string, any>;
    jobs: Map<string, any>;
    started: boolean;
    registerHandler: ReturnType<typeof vi.fn>;
    registerGate: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
  };
} {
  const scheduler = {
    handlers: new Map<string, any>(),
    gates: new Map<string, any>(),
    jobs: new Map<string, any>(),
    started: false,
    registerHandler: vi.fn((owner: string, handler: any) => {
      scheduler.handlers.set(owner, handler);
      return () => scheduler.handlers.delete(owner);
    }),
    registerGate: vi.fn((id: string, handler: any) => {
      scheduler.gates.set(id, handler);
      return () => scheduler.gates.delete(id);
    }),
    upsert: vi.fn((job: any) => {
      scheduler.jobs.set(job.id, job);
      return { definition: job, runtime: {}, active: true, runningCount: 0 };
    }),
    remove: vi.fn((id: string) => {
      const existed = scheduler.jobs.has(id);
      scheduler.jobs.delete(id);
      return existed;
    }),
    start: vi.fn(() => {
      scheduler.started = true;
    })
  };

  return { scheduler };
}

async function destroyManager(dataDir?: string): Promise<void> {
  if (SpriteManager.hasInstance()) {
    try {
      await SpriteManager.getInstance().destroy();
    } catch {
      (SpriteManager as any).instance = null;
    }
  }

  if (dataDir) {
    rmSync(dataDir, { recursive: true, force: true });
  }
}

describe('sprite manager regression coverage', () => {
  const dataDirs = new Set<string>();

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetPersonaRulesRuntime();
    resetSpriteCapabilityRuntime();
    await destroyManager();
    for (const dataDir of dataDirs) {
      rmSync(dataDir, { recursive: true, force: true });
    }
    dataDirs.clear();
  });

  it('trigger() selects conditional animations with persona state', () => {
    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);
    const registry = (mgr as any).animationRegistry;

    const baseAnimation: AnimationEntry = {
      id: 'celebrate-default',
      title: 'Celebrate Default',
      eventTypes: ['celebrate'],
      priority: 1,
      source: { localPath: './default.webm', type: 'video/webm' },
      playback: { durationMs: 800 }
    };
    const gatedAnimation: AnimationEntry = {
      id: 'celebrate-high-favor',
      title: 'Celebrate High Favor',
      eventTypes: ['celebrate'],
      priority: 10,
      condition: (personaState) => personaState.favor >= 80,
      source: { localPath: './high.webm', type: 'video/webm' },
      playback: { durationMs: 800 }
    };

    registry.register(baseAnimation);
    registry.register(gatedAnimation);

    (mgr as any).personaState.loadState({ favor: 10 });
    mgr.trigger('celebrate', { silent: true });
    expect(mgr.getCurrentAnimation()?.animationId).toBe('celebrate-default');

    (mgr as any).personaState.loadState({ favor: 95 });
    mgr.trigger('celebrate', { silent: true });
    expect(mgr.getCurrentAnimation()?.animationId).toBe('celebrate-high-favor');
  });

  it('trigger() advances list-loop playlists in priority order and wraps', () => {
    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);
    const registry = (mgr as any).animationRegistry;

    registry.register({
      id: 'idle-low',
      title: 'Idle Low',
      eventTypes: ['idle'],
      priority: 1,
      source: { localPath: './idle-low.webm', type: 'video/webm' },
      playback: { durationMs: 800, autoIdle: false }
    });
    registry.register({
      id: 'idle-high',
      title: 'Idle High',
      eventTypes: ['idle'],
      priority: 10,
      source: { localPath: './idle-high.webm', type: 'video/webm' },
      playback: { durationMs: 800, autoIdle: false }
    });
    registry.register({
      id: 'idle-mid',
      title: 'Idle Mid',
      eventTypes: ['idle'],
      priority: 5,
      source: { localPath: './idle-mid.webm', type: 'video/webm' },
      playback: { durationMs: 800, autoIdle: false }
    });

    mgr.setAnimationPlaylistMode('list-loop');
    mgr.trigger('idle', { silent: true });

    expect(mgr.getCurrentAnimation()?.animationId).toBe('idle-high');
    expect(mgr.getCurrentAnimation()?.playback?.loop).toBe(false);

    mgr.handleAnimationComplete('idle-high', 'full');
    expect(mgr.getCurrentAnimation()?.animationId).toBe('idle-mid');

    mgr.handleAnimationComplete('idle-mid', 'full');
    expect(mgr.getCurrentAnimation()?.animationId).toBe('idle-low');

    mgr.handleAnimationComplete('idle-low', 'full');
    expect(mgr.getCurrentAnimation()?.animationId).toBe('idle-high');
  });

  it('uses per-trigger playlist modes before the global fallback', () => {
    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);
    const registry = (mgr as any).animationRegistry;

    registry.register({
      id: 'idle-high',
      title: 'Idle High',
      eventTypes: ['idle'],
      priority: 10,
      source: { localPath: './idle-high.webm', type: 'video/webm' },
      playback: { durationMs: 800, autoIdle: false }
    });
    registry.register({
      id: 'idle-low',
      title: 'Idle Low',
      eventTypes: ['idle'],
      priority: 1,
      source: { localPath: './idle-low.webm', type: 'video/webm' },
      playback: { durationMs: 800, autoIdle: false }
    });
    registry.register({
      id: 'success-high',
      title: 'Success High',
      eventTypes: ['success'],
      priority: 10,
      source: { localPath: './success-high.webm', type: 'video/webm' },
      playback: { durationMs: 800, loop: true }
    });
    registry.register({
      id: 'success-low',
      title: 'Success Low',
      eventTypes: ['success'],
      priority: 1,
      source: { localPath: './success-low.webm', type: 'video/webm' },
      playback: { durationMs: 800, loop: true }
    });

    mgr.setAnimationPlaylistMode('single-once');
    mgr.setAnimationPlaylistMode('list-loop', 'idle');

    expect(mgr.getAnimationPlaylistMode()).toBe('single-once');
    expect(mgr.getAnimationPlaylistMode('idle')).toBe('list-loop');
    expect(mgr.getAnimationPlaylistMode('success')).toBe('single-once');

    mgr.trigger('idle', { silent: true });
    expect(mgr.getCurrentAnimation()?.animationId).toBe('idle-high');
    mgr.handleAnimationComplete('idle-high', 'full');
    expect(mgr.getCurrentAnimation()?.animationId).toBe('idle-low');

    mgr.trigger('success', { silent: true });
    expect(mgr.getCurrentAnimation()?.animationId).toBe('success-high');
    mgr.handleAnimationComplete('success-high', 'full');
    expect(mgr.getCurrentAnimation()?.animationId).not.toBe('success-low');
  });

  it('playlist mode never disables a per-animation segment loop', () => {
    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);
    const registry = (mgr as any).animationRegistry;

    registry.register({
      id: 'idle-segmented',
      title: 'Idle Segmented',
      eventTypes: ['idle'],
      source: { localPath: './idle-segmented.webm', type: 'video/webm' },
      playback: {
        loop: false,
        loopStartMs: 300,
        loopEndMs: 900,
        durationMs: 1500
      }
    });

    mgr.setAnimationPlaylistMode('single-once');
    mgr.trigger('idle', { silent: true });

    expect(mgr.getCurrentAnimation()).toMatchObject({
      animationId: 'idle-segmented',
      playback: {
        loop: true,
        loopStartMs: 300,
        loopEndMs: 900
      }
    });
  });

  it('playlist mode never disables a per-animation whole-clip loop', () => {
    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);
    const registry = (mgr as any).animationRegistry;

    registry.register({
      id: 'idle-looping',
      title: 'Idle Looping',
      eventTypes: ['idle'],
      source: { localPath: './idle-looping.webm', type: 'video/webm' },
      playback: {
        loop: true,
        autoIdle: false,
        durationMs: 1500
      }
    });

    mgr.setAnimationPlaylistMode('single-once');
    mgr.trigger('idle', { silent: true });

    expect(mgr.getCurrentAnimation()).toMatchObject({
      animationId: 'idle-looping',
      playback: {
        loop: true
      }
    });
  });

  it('limits legacy looping animations when they are played inside a list playlist', () => {
    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);
    const registry = (mgr as any).animationRegistry;

    registry.register({
      id: 'dance-looping',
      title: 'Dance Looping',
      eventTypes: ['dance'],
      priority: 10,
      source: { localPath: './dance-looping.webm', type: 'video/webm' },
      playback: {
        loop: true,
        autoIdle: false,
        durationMs: 1500
      }
    });
    registry.register({
      id: 'dance-once',
      title: 'Dance Once',
      eventTypes: ['dance'],
      priority: 1,
      source: { localPath: './dance-once.webm', type: 'video/webm' },
      playback: {
        autoIdle: false,
        durationMs: 1500
      }
    });

    mgr.setAnimationPlaylistMode('list-loop');
    mgr.trigger('dance', { silent: true });

    expect(mgr.getCurrentAnimation()).toMatchObject({
      animationId: 'dance-looping',
      playback: {
        loop: true,
        loopCount: 1
      }
    });

    mgr.handleAnimationComplete('dance-looping', 'full');
    expect(mgr.getCurrentAnimation()?.animationId).toBe('dance-once');
  });

  it('keeps walkTo whole-clip loops unbounded inside a list playlist', () => {
    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);
    const registry = (mgr as any).animationRegistry;

    registry.register({
      id: 'walk-looping',
      title: 'Walk Looping',
      eventTypes: ['walk'],
      priority: 10,
      source: { localPath: './walk-looping.webm', type: 'video/webm' },
      playback: {
        loop: true,
        autoIdle: false,
        durationMs: 1500,
        movement: {
          enabled: true,
          mode: 'walkTo',
          speed: 60
        }
      }
    });
    registry.register({
      id: 'walk-once',
      title: 'Walk Once',
      eventTypes: ['walk'],
      priority: 1,
      source: { localPath: './walk-once.webm', type: 'video/webm' },
      playback: {
        autoIdle: false,
        durationMs: 1500
      }
    });

    mgr.setAnimationPlaylistMode('list-loop');
    mgr.trigger('walk', { silent: true });

    expect(mgr.getCurrentAnimation()).toMatchObject({
      animationId: 'walk-looping',
      playback: {
        loop: true
      }
    });
    expect(mgr.getCurrentAnimation()?.playback?.loopCount).toBeUndefined();
  });

  it('keeps walkTo segmented loops unbounded inside a list playlist', () => {
    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);
    const registry = (mgr as any).animationRegistry;

    registry.register({
      id: 'walk-segmented',
      title: 'Walk Segmented',
      eventTypes: ['walk'],
      priority: 10,
      source: { localPath: './walk-segmented.webm', type: 'video/webm' },
      playback: {
        loop: true,
        autoIdle: false,
        loopStartMs: 300,
        loopEndMs: 900,
        durationMs: 1500,
        movement: {
          enabled: true,
          mode: 'walkTo',
          speed: 60
        }
      }
    });

    mgr.setAnimationPlaylistMode('list-loop');
    mgr.trigger('walk', { silent: true });

    expect(mgr.getCurrentAnimation()).toMatchObject({
      animationId: 'walk-segmented',
      playback: {
        loop: true,
        loopStartMs: 300,
        loopEndMs: 900
      }
    });
    expect(mgr.getCurrentAnimation()?.playback?.loopCount).toBeUndefined();
  });

  it('preserves explicit loopCount when resolving playlist playback', () => {
    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);
    const registry = (mgr as any).animationRegistry;

    registry.register({
      id: 'dance-two',
      title: 'Dance Two',
      eventTypes: ['dance'],
      source: { localPath: './dance-two.webm', type: 'video/webm' },
      playback: {
        loop: true,
        loopCount: 2,
        durationMs: 1500
      }
    });

    mgr.setAnimationPlaylistMode('list-loop');
    mgr.trigger('dance', { silent: true });

    expect(mgr.getCurrentAnimation()).toMatchObject({
      animationId: 'dance-two',
      playback: {
        loop: true,
        loopCount: 2
      }
    });
  });

  it('autoIdle completes back to idle before advancing a list playlist', () => {
    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);
    const registry = (mgr as any).animationRegistry;

    registry.register({
      id: 'idle-default',
      title: 'Idle Default',
      eventTypes: ['idle'],
      source: { localPath: './idle.webm', type: 'video/webm' },
      playback: { durationMs: 800, loop: true }
    });
    registry.register({
      id: 'success-high',
      title: 'Success High',
      eventTypes: ['success'],
      priority: 10,
      source: { localPath: './success-high.webm', type: 'video/webm' },
      playback: { durationMs: 800, autoIdle: true }
    });
    registry.register({
      id: 'success-low',
      title: 'Success Low',
      eventTypes: ['success'],
      priority: 1,
      source: { localPath: './success-low.webm', type: 'video/webm' },
      playback: { durationMs: 800, autoIdle: false }
    });

    mgr.setAnimationPlaylistMode('list-loop');
    mgr.trigger('success', { silent: true });

    expect(mgr.getCurrentAnimation()?.animationId).toBe('success-high');

    mgr.handleAnimationComplete('success-high', 'full');

    expect(mgr.getState()).toBe('idle');
    expect(mgr.getCurrentAnimation()?.animationId).toBe('idle-default');
  });

  it('registerAnimation() resolves primary trigger aliases through the registry', () => {
    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);

    const animation: SpriteAnimation = {
      meta: {
        id: 'celebrate-alias',
        title: 'Celebrate Alias',
        primaryTrigger: 'celebrate',
        triggerAliases: ['workflow:complete'],
        priority: 6
      },
      source: { localPath: './celebrate.webm', type: 'video/webm' },
      durationMs: 800
    };

    mgr.registerAnimation(animation);

    expect(mgr.findAnimationByTrigger('workflow:complete')?.id).toBe('celebrate-alias');

    mgr.trigger('workflow:complete', { silent: true });
    expect(mgr.getCurrentAnimation()?.animationId).toBe('celebrate-alias');
  });

  it('registerAnimation() compiles persisted condition schema into runtime registry filters', () => {
    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);

    mgr.registerAnimation({
      meta: {
        id: 'celebrate-default-meta',
        title: 'Celebrate Default Meta',
        primaryTrigger: 'celebrate',
        priority: 1
      },
      source: { localPath: './default-meta.webm', type: 'video/webm' },
      durationMs: 800
    });

    mgr.registerAnimation({
      meta: {
        id: 'celebrate-bestie-meta',
        title: 'Celebrate Bestie Meta',
        primaryTrigger: 'celebrate',
        priority: 10,
        condition: {
          type: 'all',
          conditions: [
            { type: 'compare', field: 'favor', operator: 'gte', value: 80 },
            { type: 'compare', field: 'mood', operator: 'eq', value: 'joyful' }
          ]
        }
      },
      source: { localPath: './bestie-meta.webm', type: 'video/webm' },
      durationMs: 800
    });

    (mgr as any).personaState.loadState({ favor: 90, mood: 'neutral' });
    mgr.trigger('celebrate', { silent: true });
    expect(mgr.getCurrentAnimation()?.animationId).toBe('celebrate-default-meta');

    (mgr as any).personaState.loadState({ favor: 90, mood: 'joyful' });
    mgr.trigger('celebrate', { silent: true });
    expect(mgr.getCurrentAnimation()?.animationId).toBe('celebrate-bestie-meta');
  });

  it('trigger() assigns a timed playback session for segmented animations', () => {
    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);
    const registry = (mgr as any).animationRegistry;

    registry.register({
      id: 'thinking-segmented',
      title: 'Thinking Segmented',
      eventTypes: ['thinking'],
      source: { localPath: './thinking.webm', type: 'video/webm' },
      playback: {
        loop: true,
        loopStartMs: 300,
        loopEndMs: 900,
        durationMs: 1500
      }
    });

    mgr.trigger('thinking', { silent: true, durationMs: 1200 });
    expect(mgr.getCurrentAnimation()).toMatchObject({
      animationId: 'thinking-segmented',
      playbackSession: {
        mode: 'timed',
        activeDurationMs: 1200
      }
    });
    expect(mgr.getCurrentAnimation()?.playbackSession?.startedAtMs).toEqual(expect.any(Number));
  });

  it('purpose animation waits for the matching playId before continuing', async () => {
    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);
    const registry = (mgr as any).animationRegistry;

    registry.register({
      id: 'thinking-purpose',
      title: 'Thinking Purpose',
      eventTypes: ['thinking'],
      source: { localPath: './thinking.webm', type: 'video/webm' },
      playback: {
        durationMs: 200,
        autoIdle: false
      }
    });

    let settled = false;
    const promise = (mgr as any)
      .runPurposeAnimationStep({ id: 'play', type: 'playAnimation', trigger: 'thinking', waitFor: 'complete', timeoutMs: 200 }, new AbortController().signal, {
        id: 'routine-purpose-1',
        purposeId: 'purpose-1',
        priority: 80,
        source: 'preset',
        status: 'running',
        steps: [],
        cursor: 0,
        createdAt: Date.now()
      })
      .then(() => {
        settled = true;
      });

    const playId = mgr.getCurrentAnimation()?.playId;
    expect(playId).toEqual(expect.any(String));

    mgr.handleAnimationComplete('thinking-purpose', 'full', 'other-play');
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(settled).toBe(false);

    mgr.handleAnimationComplete('thinking-purpose', 'full', playId);
    await expect(promise).resolves.toBeUndefined();
    expect(settled).toBe(true);
  });

  it('keeps low-priority ambient triggers from overriding a running purpose animation', async () => {
    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);
    const registry = (mgr as any).animationRegistry;

    registry.register({
      id: 'thinking-purpose',
      title: 'Thinking Purpose',
      eventTypes: ['thinking'],
      source: { localPath: './thinking.webm', type: 'video/webm' },
      playback: { durationMs: 40 }
    });
    registry.register({
      id: 'idle-ambient',
      title: 'Idle Ambient',
      eventTypes: ['idle'],
      source: { localPath: './idle.webm', type: 'video/webm' },
      playback: { durationMs: 40 }
    });

    const promise = (mgr as any).runPurposeAnimationStep({ id: 'play', type: 'playAnimation', trigger: 'thinking', waitFor: 'duration', durationMs: 20 }, new AbortController().signal, {
      id: 'routine-purpose-1',
      purposeId: 'purpose-1',
      priority: 80,
      source: 'preset',
      status: 'running',
      steps: [],
      cursor: 0,
      createdAt: Date.now()
    });

    expect(mgr.getCurrentAnimation()?.animationId).toBe('thinking-purpose');
    mgr.trigger('idle', { silent: true, priority: 10 });
    expect(mgr.getCurrentAnimation()?.animationId).toBe('thinking-purpose');

    await promise;
    mgr.trigger('idle', { silent: true, priority: 10 });
    expect(mgr.getCurrentAnimation()?.animationId).toBe('idle-ambient');
  });

  it('keeps state-driven animations behind the routine lifecycle presentation lock', () => {
    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);
    const registry = (mgr as any).animationRegistry;

    registry.register({
      id: 'thinking-purpose',
      title: 'Thinking Purpose',
      eventTypes: ['thinking'],
      source: { localPath: './thinking.webm', type: 'video/webm' },
      playback: { durationMs: 100 }
    });
    registry.register({
      id: 'click-state',
      title: 'Click State',
      eventTypes: ['click'],
      source: { localPath: './click.webm', type: 'video/webm' },
      playback: { durationMs: 100 }
    });

    mgr.trigger('thinking', { silent: true });
    (mgr as any).acquireRoutinePresentationLock(
      { id: 'purpose-1', priority: 80 },
      {
        id: 'routine-purpose-1',
        purposeId: 'purpose-1',
        priority: 80,
        source: 'preset',
        status: 'running',
        steps: [{ id: 'wait', type: 'wait', durationMs: 1000 }],
        cursor: 0,
        createdAt: Date.now()
      }
    );

    mgr.transitionTo('reacting', { subState: 'click', force: true });
    expect(mgr.getCurrentAnimation()?.animationId).toBe('thinking-purpose');

    (mgr as any).releaseRoutinePresentationLock('purpose-1');
    expect(mgr.getCurrentAnimation()?.animationId).toBe('click-state');
  });

  it('allows routine-owned walk state animation while the lifecycle lock is active', async () => {
    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);
    const registry = (mgr as any).animationRegistry;

    registry.register({
      id: 'thinking-purpose',
      title: 'Thinking Purpose',
      eventTypes: ['thinking'],
      source: { localPath: './thinking.webm', type: 'video/webm' },
      playback: { durationMs: 100 }
    });
    registry.register({
      id: 'walk-purpose',
      title: 'Walk Purpose',
      eventTypes: ['walk'],
      source: { localPath: './walk.webm', type: 'video/webm' },
      playback: { durationMs: 100 }
    });

    mgr.trigger('thinking', { silent: true });
    const routine = {
      id: 'routine-purpose-1',
      purposeId: 'purpose-1',
      priority: 80,
      source: 'preset',
      status: 'running',
      steps: [],
      cursor: 0,
      createdAt: Date.now()
    };
    (mgr as any).acquireRoutinePresentationLock({ id: 'purpose-1', priority: 80 }, routine);
    mgr.setWindowController({
      walkTo: vi.fn(() => {
        mgr.transitionTo('walking', { force: true });
        return Promise.resolve();
      }),
      stopWalk: vi.fn(),
      getPosition: () => [0, 0]
    });

    await (mgr as any).runPurposeWalkStep({ id: 'walk', type: 'walkTo', target: 'center', timeoutMs: 1000 }, new AbortController().signal, routine);

    expect(mgr.getCurrentAnimation()?.animationId).toBe('walk-purpose');
  });

  it('opens routine windows through the injected purpose window adapter', async () => {
    const opened: Array<{ windowKey: string; payload?: Record<string, unknown> }> = [];
    const { mgr, dataDir } = createManager({
      purposeWindowAdapter: {
        open(windowKey: string, payload?: Record<string, unknown>) {
          opened.push({ windowKey, payload });
        }
      }
    });
    dataDirs.add(dataDir);

    await (mgr as any).runPurposeOpenWindowStep({ id: 'open-menu', type: 'openWindow', window: 'fileActionsMenu', payload: { correlationId: 'drop-1' } }, new AbortController().signal);

    expect(opened).toEqual([{ windowKey: 'fileActionsMenu', payload: { correlationId: 'drop-1' } }]);
  });

  it('recordConversationEvent() routes base reward through the event bus and respects cooldown', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-21T10:00:00Z'));

    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);

    expect(mgr.getPersonaState()).toMatchObject({
      xp: 0,
      favor: 50
    });

    expect(
      mgr.recordConversationEvent({
        assistantContentLength: 640,
        toolCallCount: 2
      })
    ).toBe(true);

    expect(mgr.getPersonaState()).toMatchObject({
      xp: 15,
      favor: 51.5
    });

    expect(mgr.recordConversationEvent()).toBe(false);
    expect(mgr.getPersonaState()).toMatchObject({
      xp: 15,
      favor: 51.5
    });
  });

  it('recordConversationEvent() reads rewards and dimensions from a single injected provider snapshot', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-21T10:00:00Z'));

    setPersonaRulesProvider({
      getSnapshot: () => ({
        conversationRewards: {
          xpPerConversation: 7,
          favorPerConversation: 0.4,
          cooldownMs: 30_000,
          bonusConditions: []
        },
        activityRewards: {
          'workflow-complete': { xp: 1, favor: 0, dimensionGrowth: undefined }
        },
        dimensionSchema: [
          {
            id: 'conversation',
            name: 'Conversation',
            icon: 'chat',
            description: 'conversation',
            maxValue: 100,
            initialValue: 0,
            growthSources: ['conversation']
          },
          {
            id: 'tooling',
            name: 'Tooling',
            icon: 'tool',
            description: 'tooling',
            maxValue: 80,
            initialValue: 0,
            growthSources: ['tool-usage', 'task-completion']
          }
        ]
      })
    });

    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);

    expect(
      mgr.recordConversationEvent({
        toolCallCount: 1
      })
    ).toBe(true);

    expect(mgr.getPersonaState()).toMatchObject({
      xp: 7,
      favor: 50.4
    });
    expect(mgr.getPersonaState().dimensions.conversation).toBeCloseTo(1.01, 5);
    expect(mgr.getPersonaState().dimensions.tooling).toBeCloseTo(0.81, 5);
  });

  it('syncs live persona rule layers into the manager runtime', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-21T10:00:00Z'));

    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);

    upsertPersonaRulesLayer('extension:conversation', {
      conversationRewards: {
        xpPerConversation: 22,
        favorPerConversation: 2.2,
        cooldownMs: 5_000
      },
      moodRules: [
        {
          id: 'extension-joy',
          trigger: (state) => state.favor >= 50,
          targetMood: 'joyful',
          intensity: 90,
          priority: 20
        }
      ]
    });

    (mgr as any).eventBus.emit('ai:message-sent', undefined, 'test-layer');
    expect(mgr.getPersonaState()).toMatchObject({
      xp: 22,
      favor: 52.2
    });

    (mgr as any).personaState.evaluateMood();
    expect(mgr.getPersonaState()).toMatchObject({
      mood: 'joyful',
      moodIntensity: 90
    });

    removePersonaRulesLayer('extension:conversation');
    (mgr as any).eventBus.emit('ai:message-sent', undefined, 'test-layer');

    expect(mgr.getPersonaState()).toMatchObject({
      xp: 37,
      favor: 53.7
    });
  });

  it('trigger() does not fall back to idle when explicit event animation is missing', () => {
    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);
    const registry = (mgr as any).animationRegistry;

    registry.register({
      id: 'idle-default',
      title: 'Idle Default',
      eventTypes: ['idle'],
      source: { localPath: './idle.webm', type: 'video/webm' },
      playback: { durationMs: 800 }
    });

    mgr.trigger('custom:missing', { silent: true });
    expect(mgr.getCurrentAnimation()).toBeNull();
    expect(mgr.findAnimationByTrigger('custom:missing')).toBeUndefined();
  });

  it('falls back from music:dance to the built-in dance trigger', () => {
    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);
    const registry = (mgr as any).animationRegistry;

    registry.register({
      id: 'dance-default',
      title: 'Dance Default',
      eventTypes: ['dance'],
      source: { localPath: './dance.webm', type: 'video/webm' },
      playback: { durationMs: 1200 }
    });

    mgr.trigger('music:dance', { silent: true, playId: 'music-dance-test' });
    expect(mgr.getCurrentAnimation()?.animationId).toBe('dance-default');
  });

  it('allows music dance playId triggers to use the dance list-loop playlist', () => {
    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);
    const registry = (mgr as any).animationRegistry;

    registry.register({
      id: 'dance-high',
      title: 'Dance High',
      eventTypes: ['dance'],
      priority: 10,
      source: { localPath: './dance-high.webm', type: 'video/webm' },
      playback: { durationMs: 800, autoIdle: true }
    });
    registry.register({
      id: 'dance-low',
      title: 'Dance Low',
      eventTypes: ['dance'],
      priority: 1,
      source: { localPath: './dance-low.webm', type: 'video/webm' },
      playback: { durationMs: 800, autoIdle: true }
    });

    mgr.setAnimationPlaylistMode('single-once');
    mgr.setAnimationPlaylistMode('list-loop', 'dance');

    mgr.trigger('music:dance', {
      silent: true,
      playId: 'music-dance-test',
      allowPlaylistWithPlayId: true
    });

    expect(mgr.getCurrentAnimation()?.animationId).toBe('dance-high');
    expect(mgr.getCurrentAnimation()?.playId).toBe('music-dance-test');

    mgr.handleAnimationComplete('dance-high', 'full', 'music-dance-test');
    expect(mgr.getCurrentAnimation()?.animationId).toBe('dance-low');
    expect(mgr.getCurrentAnimation()?.playId).toBe('music-dance-test');

    mgr.handleAnimationComplete('dance-low', 'full', 'music-dance-test');
    expect(mgr.getCurrentAnimation()?.animationId).toBe('dance-high');
  });

  it('stops only the matching tracked animation session', () => {
    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);
    const registry = (mgr as any).animationRegistry;

    registry.register({
      id: 'idle-default',
      title: 'Idle Default',
      eventTypes: ['idle'],
      source: { localPath: './idle.webm', type: 'video/webm' },
      playback: { durationMs: 800, loop: true }
    });
    registry.register({
      id: 'dance-high',
      title: 'Dance High',
      eventTypes: ['dance'],
      priority: 10,
      source: { localPath: './dance-high.webm', type: 'video/webm' },
      playback: { durationMs: 800, autoIdle: true }
    });
    registry.register({
      id: 'dance-low',
      title: 'Dance Low',
      eventTypes: ['dance'],
      priority: 1,
      source: { localPath: './dance-low.webm', type: 'video/webm' },
      playback: { durationMs: 800, autoIdle: true }
    });

    mgr.setAnimationPlaylistMode('list-loop', 'dance');
    mgr.trigger('dance', {
      silent: true,
      playId: 'music-dance-test',
      allowPlaylistWithPlayId: true
    });

    expect(mgr.stopAnimationSession('other-play')).toBe(false);
    expect(mgr.getCurrentAnimation()?.animationId).toBe('dance-high');

    expect(mgr.stopAnimationSession('music-dance-test')).toBe(true);
    expect(mgr.getCurrentAnimation()?.animationId).toBe('idle-default');

    mgr.handleAnimationComplete('dance-high', 'full', 'music-dance-test');
    expect(mgr.getCurrentAnimation()?.animationId).toBe('idle-default');
  });

  it('keeps trigger() and playOnce() on separate runtime boundaries', () => {
    vi.useFakeTimers();

    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);

    mgr.registerAnimation({
      meta: {
        id: 'click-reaction',
        title: 'Click Reaction',
        primaryTrigger: 'click'
      },
      source: { localPath: './click.webm', type: 'video/webm' },
      durationMs: 500
    });

    expect(mgr.getState()).toBe('idle');
    expect(mgr.getSubState()).toBeNull();

    mgr.trigger('click', { silent: true });
    expect(mgr.getState()).toBe('idle');
    expect(mgr.getSubState()).toBeNull();
    expect(mgr.getCurrentAnimation()?.animationId).toBe('click-reaction');

    mgr.playOnce('click', { durationMs: 300 });
    expect(mgr.getState()).toBe('reacting');
    expect(mgr.getSubState()).toBe('click');

    vi.advanceTimersByTime(300);
    expect(mgr.getState()).toBe('idle');
    expect(mgr.getSubState()).toBeNull();
  });

  it('state-driven animation resolution can still fall back to idle', () => {
    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);
    const registry = (mgr as any).animationRegistry;

    registry.register({
      id: 'idle-default',
      title: 'Idle Default',
      eventTypes: ['idle'],
      source: { localPath: './idle.webm', type: 'video/webm' },
      playback: { durationMs: 800 }
    });

    mgr.transitionTo('walking');
    expect(mgr.getCurrentAnimation()?.animationId).toBe('idle-default');
  });

  it('reacting state no longer treats business animation semantics as sub-state mappings', () => {
    expect(mapStateToEventType('reacting', 'click')).toBe('click');
    expect(mapStateToEventType('reacting', 'emotion' as any)).toBe('idle');
    expect(mapStateToEventType('reacting', 'celebrate' as any)).toBe('idle');
    expect(mapStateToEventType('reacting', 'write' as any)).toBe('idle');
  });

  it('file-drop from file-drag-over enters file-drop reaction instead of returning directly to idle', () => {
    vi.useFakeTimers();

    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);
    mgr.transitionTo('reacting', { subState: 'file-drag-over', force: true });

    mgr.reportInteraction('file-drop');
    expect(mgr.getState()).toBe('reacting');
    expect(mgr.getSubState()).toBe('file-drop');
  });

  it('stopMovementPreview restores the live sprite config', () => {
    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);
    const setSize = vi.fn();
    const stopWalk = vi.fn();

    (mgr as any).windowController = {
      setSize,
      stopWalk,
      isAutoMoving: () => false
    };

    expect(mgr.getSpriteConfig()).toEqual({
      width: 200,
      height: 200,
      padding: 100,
      animationPlaylistMode: 'list-loop',
      autoWalkEnabled: false,
      bubbleMode: 'fixed-top',
      showDebugOverlay: false
    });

    mgr.previewMovement({
      width: 320,
      height: 260,
      padding: 24,
      movement: { enabled: false }
    });
    expect(mgr.getSpriteConfig()).toEqual({
      width: 320,
      height: 260,
      padding: 24,
      animationPlaylistMode: 'list-loop',
      autoWalkEnabled: false,
      bubbleMode: 'fixed-top',
      showDebugOverlay: false
    });

    mgr.stopMovementPreview();
    expect(stopWalk).toHaveBeenCalledOnce();
    expect(setSize).toHaveBeenLastCalledWith(200, 200, 0);
    expect(mgr.getSpriteConfig()).toEqual({
      width: 200,
      height: 200,
      padding: 100,
      animationPlaylistMode: 'list-loop',
      autoWalkEnabled: false,
      bubbleMode: 'fixed-top',
      showDebugOverlay: false
    });
  });

  it('auto-walk config is exposed through the shared sprite config snapshot', () => {
    const { mgr, dataDir, sent } = createManager();
    dataDirs.add(dataDir);

    expect(mgr.getSpriteConfig().autoWalkEnabled).toBe(false);

    mgr.setAutoWalkEnabled(true);

    expect(mgr.getSpriteConfig().autoWalkEnabled).toBe(true);
    expect(sent).toContainEqual({
      channel: 'sprite:config',
      payload: {
        width: 200,
        height: 200,
        padding: 100,
        animationPlaylistMode: 'list-loop',
        autoWalkEnabled: true,
        bubbleMode: 'fixed-top',
        showDebugOverlay: false
      }
    });

    mgr.setAutoWalkEnabled(false);

    expect(mgr.getSpriteConfig().autoWalkEnabled).toBe(false);
    expect(sent).toContainEqual({
      channel: 'sprite:config',
      payload: {
        width: 200,
        height: 200,
        padding: 100,
        animationPlaylistMode: 'list-loop',
        autoWalkEnabled: false,
        bubbleMode: 'fixed-top',
        showDebugOverlay: false
      }
    });
  });

  it('trigger() routes direction movement through the unified coordinator path', () => {
    const { mgr, dataDir, sent } = createManager();
    dataDirs.add(dataDir);
    initSpriteCapabilityRuntime({
      resolveContext: () => ({
        personaLevel: 10,
        activeSignals: {}
      })
    });

    const startAutoMove = vi.fn();
    (mgr as any).windowController = {
      startAutoMove,
      getAutoMoveDirection: () => 'left',
      isAutoMoving: () => false
    };

    mgr.registerAnimation({
      meta: {
        id: 'celebrate-direction-move',
        title: 'Celebrate Direction Move',
        primaryTrigger: 'celebrate'
      },
      source: { localPath: './celebrate-direction.webm', type: 'video/webm' },
      movement: {
        enabled: true,
        mode: 'direction',
        direction: 'left',
        speed: 64
      }
    });

    mgr.trigger('celebrate', { silent: true });

    expect(startAutoMove).toHaveBeenCalledWith({
      enabled: true,
      mode: 'direction',
      direction: 'left',
      speed: 64
    });
    expect(sent).toContainEqual({
      channel: 'sprite:walk',
      payload: { active: true, direction: 'left' }
    });
  });

  it('auto-walk behavior delegates movement execution to the unified runtime entry', async () => {
    const registered = new Map<string, any>();
    const runBehaviorMovement = vi.fn(async () => true);
    const movement: SpriteMovementConfig = {
      enabled: true,
      trigger: 'behavior',
      mode: 'direction',
      direction: 'left',
      speed: 48
    };

    const resolveWalkAnimation = (): AnimationEntry => ({
      id: 'walk-default',
      title: 'walk',
      eventTypes: ['walk'],
      source: {},
      playback: {
        movement
      }
    });

    const fakeManager = {
      findAnimationByTrigger: resolveWalkAnimation,
      registerBehavior: (behavior: any) => {
        registered.set(behavior.id, behavior);
      },
      isAutoWalkEnabled: () => true,
      runBehaviorMovement
    };

    registerDefaultBehaviors(fakeManager as any);
    const autoWalk = registered.get('auto-walk');
    expect(autoWalk).toBeTruthy();

    await autoWalk.action({} as any);
    expect(runBehaviorMovement).toHaveBeenCalledWith(movement);
  });

  it('pauses movement while the assistant context menu is open without changing auto-walk settings', async () => {
    const { mgr, dataDir } = createManager();
    dataDirs.add(dataDir);
    initSpriteCapabilityRuntime({
      resolveContext: () => ({
        personaLevel: 1,
        activeSignals: {}
      })
    });

    const walkTo = vi.fn(async () => undefined);
    const stopWalk = vi.fn();
    const stopAutoMove = vi.fn();
    const isAutoMoving = vi.fn(() => true);
    (mgr as any).windowController = {
      getPosition: () => [100, 100],
      walkTo,
      stopWalk,
      stopAutoMove,
      isAutoMoving,
      getAutoMoveDirection: () => 'left'
    };

    const movement: SpriteMovementConfig = {
      enabled: true,
      mode: 'direction',
      direction: 'right',
      speed: 48
    };

    mgr.setAutoWalkEnabled(true);
    expect(mgr.isAutoWalkEnabled()).toBe(true);

    mgr.reportInteraction('context-menu', { open: true });

    expect(mgr.isAutoWalkEnabled()).toBe(true);
    expect(stopWalk).toHaveBeenCalledOnce();
    expect(stopAutoMove).toHaveBeenCalledOnce();
    await expect(mgr.runBehaviorMovement(movement)).resolves.toBe(false);
    expect(walkTo).not.toHaveBeenCalled();

    isAutoMoving.mockReturnValue(false);
    mgr.reportInteraction('context-menu', { open: false });

    await expect(mgr.runBehaviorMovement(movement)).resolves.toBe(true);
    expect(walkTo).toHaveBeenCalledOnce();
  });

  it('registers sprite behaviors with the injected main scheduler instead of legacy polling', async () => {
    const { scheduler } = createBehaviorSchedulerHarness();
    const { mgr, dataDir } = createManager({ behaviorScheduler: scheduler });
    dataDirs.add(dataDir);
    const legacyStart = vi.spyOn((mgr as any).behaviorEngine, 'start');

    await mgr.start();

    expect(scheduler.start).toHaveBeenCalledOnce();
    expect(legacyStart).not.toHaveBeenCalled();
    expect(scheduler.registerHandler).toHaveBeenCalledWith('sprite.behavior', expect.any(Function));
    expect(scheduler.registerGate).toHaveBeenCalledWith('sprite.canAutoMove', expect.any(Function));
    expect(scheduler.jobs.get('sprite.behavior:auto-walk')).toMatchObject({
      id: 'sprite.behavior:auto-walk',
      owner: 'sprite.behavior',
      name: '自动行走',
      enabled: true,
      schedule: {
        kind: 'randomInterval',
        minMs: 20_000,
        maxMs: 60_000
      },
      payload: {
        behaviorId: 'auto-walk'
      },
      admission: {
        customGate: 'sprite.canAutoMove'
      }
    });
  });

  it('blocks scheduled auto-walk while the assistant context menu is open', async () => {
    const { scheduler } = createBehaviorSchedulerHarness();
    const { mgr, dataDir } = createManager({ behaviorScheduler: scheduler });
    dataDirs.add(dataDir);
    initSpriteCapabilityRuntime({
      resolveContext: () => ({
        personaLevel: 1,
        activeSignals: {}
      })
    });
    (mgr as any).windowController = {
      stopWalk: vi.fn(),
      stopAutoMove: vi.fn(),
      isAutoMoving: () => false
    };
    mgr.setAutoWalkEnabled(true);

    await mgr.start();
    const gate = scheduler.gates.get('sprite.canAutoMove');

    await expect(
      Promise.resolve(
        gate({
          payload: { behaviorId: 'auto-walk' },
          scheduledFor: Date.now(),
          triggeredAt: Date.now()
        })
      )
    ).resolves.toBe(true);

    mgr.reportInteraction('context-menu', { open: true });

    await expect(
      Promise.resolve(
        gate({
          payload: { behaviorId: 'auto-walk' },
          scheduledFor: Date.now(),
          triggeredAt: Date.now()
        })
      )
    ).resolves.toEqual({ accepted: false, reason: 'movement-suspended' });
  });

  it('routes night sleepy behavior through the daily rest purpose', async () => {
    const registered = new Map<string, any>();
    const startPurpose = vi.fn(async () => ({ accepted: true, status: 'started' }));
    const playOnce = vi.fn();
    const showToast = vi.fn();
    const fakeManager = {
      findAnimationByTrigger: vi.fn(),
      registerBehavior: (behavior: any) => {
        registered.set(behavior.id, behavior);
      },
      isAutoWalkEnabled: () => false,
      runBehaviorMovement: vi.fn(),
      startPurpose,
      playOnce,
      showToast,
      trigger: vi.fn(),
      transitionTo: vi.fn(),
      changeFavor: vi.fn(),
      getSpontaneousUtteranceExecutor: vi.fn()
    };

    registerDefaultBehaviors(fakeManager as any);
    const nightSleepy = registered.get('night-sleepy');
    expect(nightSleepy).toBeTruthy();

    await nightSleepy.action({ now: new Date('2026-05-03T23:00:00+08:00') } as any);

    expect(startPurpose).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'daily.rest-reminder',
        source: 'behavior',
        presetId: 'daily.rest-reminder',
        priority: 60,
        coalesceKey: 'night-sleepy',
        context: expect.objectContaining({
          behaviorId: 'night-sleepy',
          hour: 23
        })
      })
    );
    expect(playOnce).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('keeps idle sleepy as a lightweight single reaction', async () => {
    const registered = new Map<string, any>();
    const startPurpose = vi.fn(async () => ({ accepted: true, status: 'started' }));
    const playOnce = vi.fn();
    const showToast = vi.fn();
    const fakeManager = {
      findAnimationByTrigger: vi.fn(),
      registerBehavior: (behavior: any) => {
        registered.set(behavior.id, behavior);
      },
      isAutoWalkEnabled: () => false,
      runBehaviorMovement: vi.fn(),
      startPurpose,
      playOnce,
      showToast,
      trigger: vi.fn(),
      transitionTo: vi.fn(),
      changeFavor: vi.fn(),
      getSpontaneousUtteranceExecutor: vi.fn()
    };

    registerDefaultBehaviors(fakeManager as any);
    const idleSleepy = registered.get('idle-sleepy');
    expect(idleSleepy).toBeTruthy();

    await idleSleepy.action({} as any);

    expect(startPurpose).not.toHaveBeenCalled();
    expect(playOnce).toHaveBeenCalledWith('sleepy');
    expect(showToast).toHaveBeenCalledWith('有点困了呢...', { category: 'info', duration: 2000 });
  });

  it('gates idle emotion behavior behind emotionExpression capability', () => {
    const registered = new Map<string, any>();
    const trigger = vi.fn();
    const fakeManager = {
      findAnimationByTrigger: vi.fn(),
      registerBehavior: (behavior: any) => {
        registered.set(behavior.id, behavior);
      },
      isAutoWalkEnabled: () => false,
      trigger,
      transitionTo: vi.fn(),
      showToast: vi.fn(),
      changeFavor: vi.fn(),
      getSpontaneousUtteranceExecutor: vi.fn()
    };
    const context = {
      spriteState: 'idle',
      interactionStats: { idleDuration: 120_000 },
      personaState: { favor: 70 }
    };

    registerDefaultBehaviors(fakeManager as any);
    const idleEmotion = registered.get('idle-emotion');
    expect(idleEmotion).toBeTruthy();

    initSpriteCapabilityRuntime({
      resolveContext: () => ({
        personaLevel: 1,
        featureFlags: { 'character:loaded': true, 'pack:has-custom-animations': true, 'character:has-custom-appearance': true },
        personaFlags: {},
        activeSignals: {}
      })
    });

    idleEmotion.action(context as any);
    expect(trigger).not.toHaveBeenCalled();

    initSpriteCapabilityRuntime({
      resolveContext: () => ({
        personaLevel: 20,
        featureFlags: { 'character:loaded': true, 'pack:has-custom-animations': true, 'character:has-custom-appearance': true },
        personaFlags: { 'persona:bonded': true },
        activeSignals: { 'movement.autoWalk': true }
      })
    });

    idleEmotion.action(context as any);
    expect(trigger).toHaveBeenCalledTimes(1);
  });
});

import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AnimationEntry } from '../packages/sprite-core/animation-registry';
import { registerDefaultBehaviors } from '../packages/sprite-core/manager/default-behaviors';
import { SpriteManager } from '../packages/sprite-core/manager/sprite-manager';
import { mapStateToEventType } from '../packages/sprite-core/manager/state-mapping';
import { resetPersonaRulesRuntime, setPersonaRulesProvider, upsertPersonaRulesLayer, removePersonaRulesLayer } from '../packages/sprite-core/persona-rules';
import { initSpriteCapabilityRuntime, resetSpriteCapabilityRuntime } from '../packages/sprite-core/capability-runtime';
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

function createManager(): {
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
    appName: 'SpriteTest'
  });

  return { mgr, sent, dataDir };
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
      autoWalkEnabled: true,
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
      autoWalkEnabled: true,
      showDebugOverlay: false
    });

    mgr.stopMovementPreview();
    expect(stopWalk).toHaveBeenCalledOnce();
    expect(setSize).toHaveBeenLastCalledWith(200, 200, 100);
    expect(mgr.getSpriteConfig()).toEqual({
      width: 200,
      height: 200,
      padding: 100,
      autoWalkEnabled: true,
      showDebugOverlay: false
    });
  });

  it('auto-walk config is exposed through the shared sprite config snapshot', () => {
    const { mgr, dataDir, sent } = createManager();
    dataDirs.add(dataDir);

    expect(mgr.getSpriteConfig().autoWalkEnabled).toBe(true);

    mgr.setAutoWalkEnabled(false);

    expect(mgr.getSpriteConfig().autoWalkEnabled).toBe(false);
    expect(sent).toContainEqual({
      channel: 'sprite:config',
      payload: {
        width: 200,
        height: 200,
        padding: 100,
        autoWalkEnabled: false,
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

    const resolveWalkAnimation = () => ({
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
    expect(runBehaviorMovement).toHaveBeenCalledWith(movement, { hasSegmentLoop: false });
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

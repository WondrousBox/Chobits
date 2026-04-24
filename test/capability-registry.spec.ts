import { afterEach, describe, expect, it } from 'vitest';

import { CapabilityRegistry, DEFAULT_SPRITE_CAPABILITY_REGISTRY, SPRITE_CAPABILITY_SIGNALS } from '../packages/sprite-core/capability-registry';
import { assertSpriteCapabilityActive, assertSpriteCapabilityUnlocked, initSpriteCapabilityRuntime, resetSpriteCapabilityRuntime } from '../packages/sprite-core/capability-runtime';

describe('capability registry', () => {
  afterEach(() => {
    resetSpriteCapabilityRuntime();
  });

  it('keeps locked capabilities inactive even if a runtime signal is already on', () => {
    const snapshot = DEFAULT_SPRITE_CAPABILITY_REGISTRY.resolveSnapshot({
      personaLevel: 1,
      activeSignals: {
        [SPRITE_CAPABILITY_SIGNALS.movementAutoWalk]: true
      }
    });

    expect(snapshot.capabilities.movement.status).toBe('locked');
    expect(snapshot.capabilities.movement.active).toBe(false);
    expect(snapshot.capabilities.movement.unlockReady).toBe(false);
  });

  it('treats passive prerequisites as unlocked while runtime-bound prerequisites still require active signals', () => {
    const snapshot = DEFAULT_SPRITE_CAPABILITY_REGISTRY.resolveSnapshot({
      personaLevel: 10,
      activeSignals: {
        [SPRITE_CAPABILITY_SIGNALS.recorderEnabled]: true
      }
    });

    expect(snapshot.capabilities.microphone.status).toBe('active');
    expect(snapshot.capabilities.systemAudio.status).toBe('active');
    expect(snapshot.capabilities.speechRecognition.status).toBe('unlocked');
    expect(snapshot.capabilities.spriteManage.status).toBe('locked');
    expect(snapshot.capabilities.spriteManage.missingFeatureFlags).toEqual(['character:loaded']);
    expect(snapshot.capabilities.customAppearance.status).toBe('locked');
    expect(snapshot.capabilities.customAppearance.missingPrerequisites).toEqual(['spriteManage']);
    expect(snapshot.capabilities.customAppearance.missingFeatureFlags).toEqual(['character:loaded', 'character:has-custom-appearance']);
    expect(snapshot.capabilities.aiChat.status).toBe('unlocked');
    expect(snapshot.capabilities.docUnderstanding.status).toBe('unlocked');
    expect(snapshot.capabilities.smartAssistant.status).toBe('locked');
    expect(snapshot.capabilities.smartAssistant.missingPersonaFlags).toEqual(['persona:advanced-level']);
    expect(snapshot.capabilities.actionChoreography.status).toBe('locked');
    expect(snapshot.capabilities.actionChoreography.inactivePrerequisites).toEqual(['movement']);
    expect(snapshot.capabilities.actionChoreography.missingPrerequisites).toEqual(['customAppearance']);
    expect(snapshot.capabilities.actionChoreography.missingFeatureFlags).toEqual(['character:loaded', 'pack:has-custom-animations']);
  });

  it('distinguishes inactive runtime prerequisites from actually locked prerequisites', () => {
    const snapshot = DEFAULT_SPRITE_CAPABILITY_REGISTRY.resolveSnapshot({
      personaLevel: 10,
      activeSignals: {}
    });

    expect(snapshot.capabilities.microphone.status).toBe('unlocked');
    expect(snapshot.capabilities.speechRecognition.status).toBe('locked');
    expect(snapshot.capabilities.speechRecognition.inactivePrerequisites).toEqual(['microphone']);
    expect(snapshot.capabilities.speechRecognition.missingPrerequisites).toEqual([]);
  });

  it('supports level, achievement, feature-flag and persona-flag gating in one resolver', () => {
    const registry = new CapabilityRegistry([
      {
        id: 'capability-a',
        name: 'Capability A',
        description: 'base',
        branch: 'core',
        tier: 'beginner',
        column: 0,
        row: 0,
        prerequisites: []
      },
      {
        id: 'capability-b',
        name: 'Capability B',
        description: 'gated',
        branch: 'core',
        tier: 'advanced',
        column: 1,
        row: 0,
        prerequisites: ['capability-a'],
        requiredLevel: 7,
        requiredAchievements: ['ach:one'],
        requiredFeatureFlags: ['feature:one'],
        requiredPersonaFlags: ['persona:one'],
        activationSignals: ['signal:a', 'signal:b'],
        activationSignalMode: 'all'
      }
    ]);

    const lockedSnapshot = registry.resolveSnapshot({
      personaLevel: 6,
      achievements: ['ach:one'],
      featureFlags: { 'feature:one': true },
      personaFlags: {}
    });

    expect(lockedSnapshot.capabilities['capability-b'].status).toBe('locked');
    expect(lockedSnapshot.capabilities['capability-b'].missingPersonaFlags).toEqual(['persona:one']);
    expect(lockedSnapshot.capabilities['capability-b'].meetsLevelRequirement).toBe(false);

    const activeSnapshot = registry.resolveSnapshot({
      personaLevel: 8,
      achievements: ['ach:one'],
      featureFlags: { 'feature:one': true },
      personaFlags: { 'persona:one': true },
      activeSignals: {
        'signal:a': true,
        'signal:b': true
      }
    });

    expect(activeSnapshot.capabilities['capability-a'].status).toBe('unlocked');
    expect(activeSnapshot.capabilities['capability-b'].status).toBe('active');
  });

  it('lets default avatar capabilities consume character feature flags and persona flags', () => {
    const snapshot = DEFAULT_SPRITE_CAPABILITY_REGISTRY.resolveSnapshot({
      personaLevel: 15,
      featureFlags: {
        'character:loaded': true,
        'character:has-custom-appearance': true,
        'pack:has-custom-animations': true
      },
      personaFlags: {
        'persona:bonded': true,
        'persona:advanced-level': true
      },
      activeSignals: {
        [SPRITE_CAPABILITY_SIGNALS.movementAutoWalk]: true
      }
    });

    expect(snapshot.capabilities.spriteManage.status).toBe('unlocked');
    expect(snapshot.capabilities.customAppearance.status).toBe('unlocked');
    expect(snapshot.capabilities.actionChoreography.status).toBe('unlocked');
    expect(snapshot.capabilities.emotionExpression.status).toBe('unlocked');
    expect(snapshot.capabilities.smartAssistant.status).toBe('unlocked');
  });

  it('keeps action choreography locked until the active pack declares custom animations', () => {
    const snapshot = DEFAULT_SPRITE_CAPABILITY_REGISTRY.resolveSnapshot({
      personaLevel: 15,
      featureFlags: {
        'character:loaded': true,
        'character:has-custom-appearance': true
      },
      activeSignals: {
        [SPRITE_CAPABILITY_SIGNALS.movementAutoWalk]: true
      }
    });

    expect(snapshot.capabilities.customAppearance.status).toBe('unlocked');
    expect(snapshot.capabilities.actionChoreography.status).toBe('locked');
    expect(snapshot.capabilities.actionChoreography.missingFeatureFlags).toEqual(['pack:has-custom-animations']);
  });

  it('keeps smart assistant locked until the persona reaches the advanced milestone flag', () => {
    const snapshot = DEFAULT_SPRITE_CAPABILITY_REGISTRY.resolveSnapshot({
      personaLevel: 15
    });

    expect(snapshot.capabilities.docUnderstanding.status).toBe('unlocked');
    expect(snapshot.capabilities.translation.status).toBe('unlocked');
    expect(snapshot.capabilities.smartAssistant.status).toBe('locked');
    expect(snapshot.capabilities.smartAssistant.missingPersonaFlags).toEqual(['persona:advanced-level']);
  });

  it('fails closed when runtime authority is unavailable or the capability id is unknown', () => {
    resetSpriteCapabilityRuntime();
    expect(() => assertSpriteCapabilityUnlocked('movement')).toThrow('Sprite capability runtime unavailable: movement');
    expect(() => assertSpriteCapabilityActive('movement')).toThrow('Sprite capability runtime unavailable: movement');

    initSpriteCapabilityRuntime({
      resolveContext: () => ({
        personaLevel: 99,
        activeSignals: {}
      })
    });

    expect(() => assertSpriteCapabilityUnlocked('missing-capability')).toThrow('Unknown sprite capability: missing-capability');
    expect(() => assertSpriteCapabilityActive('missing-capability')).toThrow('Unknown sprite capability: missing-capability');
  });

  it('distinguishes unlocked capability access from active runtime access', () => {
    initSpriteCapabilityRuntime({
      resolveContext: () => ({
        personaLevel: 99,
        activeSignals: {
          [SPRITE_CAPABILITY_SIGNALS.recorderEnabled]: true
        }
      })
    });

    expect(assertSpriteCapabilityUnlocked('speechRecognition').status).toBe('unlocked');
    expect(() => assertSpriteCapabilityActive('speechRecognition')).toThrow('Sprite capability inactive: speechRecognition');

    initSpriteCapabilityRuntime({
      resolveContext: () => ({
        personaLevel: 99,
        activeSignals: {
          [SPRITE_CAPABILITY_SIGNALS.recorderEnabled]: true,
          [SPRITE_CAPABILITY_SIGNALS.asrRunning]: true
        }
      })
    });

    expect(assertSpriteCapabilityActive('speechRecognition').status).toBe('active');
  });
});

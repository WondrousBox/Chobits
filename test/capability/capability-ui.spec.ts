import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@packages/sprite-core/capability-registry', async () => import('../../packages/sprite-core/capability-registry'));
vi.mock('@/lib/utils', () => ({
  cn: (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')
}));

let DEFAULT_SPRITE_CAPABILITY_REGISTRY: typeof import('../../packages/sprite-core/capability-registry').DEFAULT_SPRITE_CAPABILITY_REGISTRY;
let getSpriteCapabilityLockedReason: typeof import('../../src/features/sprite/capability-guard').getSpriteCapabilityLockedReason;

beforeAll(async () => {
  ({ DEFAULT_SPRITE_CAPABILITY_REGISTRY } = await import('../../packages/sprite-core/capability-registry'));
  ({ getSpriteCapabilityLockedReason } = await import('../../src/features/sprite/capability-guard'));
});

describe('capability UI helpers', () => {
  it('describes runtime-bound prerequisite gaps as activation requirements', () => {
    const snapshot = DEFAULT_SPRITE_CAPABILITY_REGISTRY.resolveSnapshot({
      activeSignals: {}
    });

    expect(getSpriteCapabilityLockedReason(snapshot.capabilities.speechRecognition)).toBe('需要先启用前置能力：麦克风录音');
  });

  it('keeps true unlock prerequisites described as unlock requirements', () => {
    expect(
      getSpriteCapabilityLockedReason({
        ...DEFAULT_SPRITE_CAPABILITY_REGISTRY.getDefinition('actionChoreography')!,
        status: 'locked',
        active: false,
        unlocked: false,
        unlockReady: false,
        meetsLevelRequirement: true,
        inactivePrerequisites: [],
        missingPrerequisites: ['customAppearance'],
        missingAchievements: [],
        missingFeatureFlags: []
      })
    ).toBe('需要先解锁前置能力：外观定制');
  });
});

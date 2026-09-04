import { describe, expect, it, vi } from 'vitest';

import { MovementCoordinator } from '../../packages/sprite-core/manager/movement-coordinator';
import type { SpriteConfig, SpriteMovementConfig } from '../../packages/sprite-core/types';
import type { WindowControllerAvoidRegion } from '../../packages/sprite-core/window-controller-model';

function createCoordinatorHarness(options?: { canUseMovement?: () => boolean; getAvoidRegions?: () => WindowControllerAvoidRegion[] }): {
  coordinator: MovementCoordinator;
  getConfig: () => SpriteConfig;
  walkTo: ReturnType<typeof vi.fn>;
  startAutoMove: ReturnType<typeof vi.fn>;
  stopAutoMove: ReturnType<typeof vi.fn>;
  emitWalkState: ReturnType<typeof vi.fn>;
  playWindowAnimation: ReturnType<typeof vi.fn>;
} {
  const config: SpriteConfig = {
    width: 200,
    height: 200,
    padding: 100,
    debugOverlayEnabled: false
  };
  let autoMoving = false;
  let autoMoveDirection: 'left' | 'right' | null = null;

  const walkTo = vi.fn(async () => undefined);
  const emitWalkState = vi.fn();
  const playWindowAnimation = vi.fn(async () => undefined);
  const startAutoMove = vi.fn((movement: SpriteMovementConfig) => {
    autoMoving = true;
    if (movement.direction === 'left') {
      autoMoveDirection = 'left';
    } else if (movement.direction === 'right') {
      autoMoveDirection = 'right';
    } else {
      autoMoveDirection = null;
    }
  });
  const stopAutoMove = vi.fn(() => {
    autoMoving = false;
    autoMoveDirection = null;
  });

  const coordinator = new MovementCoordinator({
    canMove: () => true,
    canUseMovement: options?.canUseMovement ?? (() => true),
    getScreenSize: () => ({ width: 1280, height: 720 }),
    getPosition: () => [320, 240],
    getSpriteConfig: () => config,
    getAvoidRegions: options?.getAvoidRegions,
    walkTo,
    startAutoMove,
    stopAutoMove,
    isAutoMoving: () => autoMoving,
    getAutoMoveDirection: () => autoMoveDirection,
    emitWalkState,
    playWindowAnimation
  });

  return {
    coordinator,
    getConfig: () => config,
    walkTo,
    startAutoMove,
    stopAutoMove,
    emitWalkState,
    playWindowAnimation
  };
}

describe('MovementCoordinator', () => {
  it('starts direction-based animation movement through the unified auto-move path', () => {
    const harness = createCoordinatorHarness();

    harness.coordinator.applyAnimationMovement({
      enabled: true,
      mode: 'direction',
      direction: 'left',
      speed: 48
    });

    expect(harness.startAutoMove).toHaveBeenCalledWith({
      enabled: true,
      mode: 'direction',
      direction: 'left',
      speed: 48
    });
    expect(harness.emitWalkState).toHaveBeenCalledWith({ active: true, direction: 'left' });
  });

  it('resolves behavior direction movement into a bounded walk target', async () => {
    const harness = createCoordinatorHarness();

    const moved = await harness.coordinator.runBehaviorMovement({
      enabled: true,
      trigger: 'behavior',
      mode: 'direction',
      direction: 'left',
      speed: 60
    });

    expect(moved).toBe(true);
    expect(harness.walkTo).toHaveBeenCalledOnce();
    const [targetX, targetY, speed] = harness.walkTo.mock.calls[0];
    expect(targetX).toBeLessThan(320);
    expect(targetY).toBe(240);
    expect(speed).toBe(60);
  });

  it('keeps behavior movement targets outside active avoid regions', async () => {
    const harness = createCoordinatorHarness({
      getAvoidRegions: () => [{ x: 640, y: 0, width: 640, height: 720 }]
    });

    const moved = await harness.coordinator.runBehaviorMovement({
      enabled: true,
      trigger: 'behavior',
      mode: 'direction',
      direction: 'right',
      speed: 60
    });

    expect(moved).toBe(true);
    expect(harness.walkTo).toHaveBeenCalledOnce();
    const [targetX, targetY] = harness.walkTo.mock.calls[0];
    expect(targetX).toBe(340);
    expect(targetY).toBe(240);
  });

  it('allows walkTo behavior movement without requiring a segmented loop animation', async () => {
    const harness = createCoordinatorHarness();

    const moved = await harness.coordinator.runBehaviorMovement({
      enabled: true,
      trigger: 'behavior',
      mode: 'walkTo',
      speed: 60,
      verticalRange: 0.1
    });

    expect(moved).toBe(true);
    expect(harness.walkTo).toHaveBeenCalledOnce();
    const [targetX, targetY, speed] = harness.walkTo.mock.calls[0];
    expect(targetX).toBeGreaterThanOrEqual(-200);
    expect(targetX).toBeLessThanOrEqual(1080);
    expect(targetY).toBeGreaterThanOrEqual(168);
    expect(targetY).toBeLessThanOrEqual(312);
    expect(speed).toBe(60);
  });

  it('plays window animation presets without starting sprite movement state', () => {
    const harness = createCoordinatorHarness();
    const movement: SpriteMovementConfig = {
      enabled: true,
      mode: 'windowAnimation',
      windowAnimationPresetId: 'fly-in',
      windowAnimationDirection: 'left',
      windowAnimationDuration: 650,
      windowAnimationPlayPosition: {
        mode: 'placement',
        placement: {
          anchor: 'top-right',
          display: 'current',
          useWorkArea: true,
          margin: 16
        }
      }
    };

    harness.coordinator.applyAnimationMovement(movement);

    expect(harness.playWindowAnimation).toHaveBeenCalledWith(movement);
    expect(harness.startAutoMove).not.toHaveBeenCalled();
    expect(harness.walkTo).not.toHaveBeenCalled();
    expect(harness.emitWalkState).not.toHaveBeenCalledWith(expect.objectContaining({ active: true }));
  });

  it('forwards playback size when applying sprite-bound window animations', () => {
    const harness = createCoordinatorHarness();
    const movement: SpriteMovementConfig = {
      enabled: true,
      mode: 'windowAnimation',
      windowAnimationPresetId: 'fly-in'
    };
    const playbackSize = { width: 320, height: 260, padding: 0 };

    harness.coordinator.applyAnimationMovement(movement, playbackSize);

    expect(harness.playWindowAnimation).toHaveBeenCalledWith(movement, playbackSize);
  });

  it('keeps movement suspension as the shared gate for animation and behavior movement', async () => {
    const harness = createCoordinatorHarness({ canUseMovement: () => false });

    harness.coordinator.applyAnimationMovement({
      enabled: true,
      mode: 'direction',
      direction: 'left',
      speed: 48
    });

    expect(harness.startAutoMove).not.toHaveBeenCalled();

    const moved = await harness.coordinator.runBehaviorMovement({
      enabled: true,
      trigger: 'behavior',
      mode: 'direction',
      direction: 'left',
      speed: 60
    });

    expect(moved).toBe(false);
    expect(harness.walkTo).not.toHaveBeenCalled();
    expect(harness.emitWalkState).not.toHaveBeenCalledWith(expect.objectContaining({ active: true }));
  });
});

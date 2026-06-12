import { describe, expect, it, vi } from 'vitest';

import { MovementCoordinator } from '../packages/sprite-core/manager/movement-coordinator';
import type { SpriteConfig, SpriteMovementConfig } from '../packages/sprite-core/types';
import type { WindowControllerAvoidRegion } from '../packages/sprite-core/window-controller-model';

function createCoordinatorHarness(options?: { canUseMovement?: () => boolean; getAvoidRegions?: () => WindowControllerAvoidRegion[] }): {
  coordinator: MovementCoordinator;
  getConfig: () => SpriteConfig;
  walkTo: ReturnType<typeof vi.fn>;
  stopWalk: ReturnType<typeof vi.fn>;
  startAutoMove: ReturnType<typeof vi.fn>;
  stopAutoMove: ReturnType<typeof vi.fn>;
  setWindowSize: ReturnType<typeof vi.fn>;
  emitConfigChanged: ReturnType<typeof vi.fn>;
  emitWalkState: ReturnType<typeof vi.fn>;
  playWindowAnimation: ReturnType<typeof vi.fn>;
} {
  let config: SpriteConfig = {
    width: 200,
    height: 200,
    padding: 100,
    autoWalkEnabled: true,
    showDebugOverlay: false
  };
  let autoMoving = false;
  let autoMoveDirection: 'left' | 'right' | null = null;

  const walkTo = vi.fn(async () => undefined);
  const stopWalk = vi.fn();
  const setWindowSize = vi.fn();
  const emitConfigChanged = vi.fn();
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
    setSpriteMetrics: (metrics) => {
      config = { ...config, ...metrics };
    },
    setWindowSize,
    walkTo,
    stopWalk,
    startAutoMove,
    stopAutoMove,
    isAutoMoving: () => autoMoving,
    getAutoMoveDirection: () => autoMoveDirection,
    emitWalkState,
    emitConfigChanged,
    playWindowAnimation
  });

  return {
    coordinator,
    getConfig: () => config,
    walkTo,
    stopWalk,
    startAutoMove,
    stopAutoMove,
    setWindowSize,
    emitConfigChanged,
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

  it('restores live sprite metrics after a direction preview session ends', () => {
    const harness = createCoordinatorHarness();

    harness.coordinator.previewMovement({
      width: 320,
      height: 260,
      padding: 24,
      movement: {
        enabled: true,
        mode: 'direction',
        direction: 'right',
        speed: 72
      }
    });

    expect(harness.getConfig()).toMatchObject({ width: 320, height: 260, padding: 24 });
    expect(harness.setWindowSize).toHaveBeenCalledWith(320, 260, 24);
    expect(harness.startAutoMove).toHaveBeenCalledOnce();
    expect(harness.emitWalkState).toHaveBeenCalledWith({ active: true, direction: 'right' });

    harness.coordinator.stopMovementPreview();

    expect(harness.stopWalk).toHaveBeenCalledOnce();
    expect(harness.stopAutoMove).toHaveBeenCalledOnce();
    expect(harness.emitWalkState).toHaveBeenLastCalledWith({ active: false });
    expect(harness.getConfig()).toMatchObject({ width: 200, height: 200, padding: 100 });
    expect(harness.setWindowSize).toHaveBeenLastCalledWith(200, 200, 100);
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

  it('previews window animation presets without resizing the sprite window', () => {
    const harness = createCoordinatorHarness();
    const movement: SpriteMovementConfig = {
      enabled: true,
      mode: 'windowAnimation',
      windowAnimationPresetId: 'shake',
      windowAnimationDirection: 'top'
    };

    harness.coordinator.previewMovement({
      width: 320,
      height: 260,
      padding: 24,
      movement
    });

    expect(harness.playWindowAnimation).toHaveBeenCalledWith(movement);
    expect(harness.setWindowSize).not.toHaveBeenCalled();
    expect(harness.emitConfigChanged).not.toHaveBeenCalled();
    expect(harness.getConfig()).toMatchObject({ width: 200, height: 200, padding: 100 });
  });

  it('keeps movement capability as the shared gate for preview, animation and behavior movement', async () => {
    const harness = createCoordinatorHarness({ canUseMovement: () => false });

    harness.coordinator.previewMovement({
      width: 320,
      height: 260,
      padding: 24,
      movement: {
        enabled: true,
        mode: 'direction',
        direction: 'right',
        speed: 72
      }
    });

    expect(harness.getConfig()).toMatchObject({ width: 320, height: 260, padding: 24 });
    expect(harness.setWindowSize).toHaveBeenCalledWith(320, 260, 24);
    expect(harness.startAutoMove).not.toHaveBeenCalled();
    expect(harness.walkTo).not.toHaveBeenCalled();

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

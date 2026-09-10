import { type VRM, VRMExpression, VRMExpressionManager } from '@pixiv/three-vrm';
import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';

import { resolveVrmMoodExpression, VrmBlinkController, VrmExpressionController } from '../src/features/sprite-assistant/renderers/vrm/vrm-expression-controller';

function createExpressionVrm(names: string[]): { vrm: VRM; manager: VRMExpressionManager } {
  const manager = new VRMExpressionManager();
  for (const name of names) manager.registerExpression(new VRMExpression(name));
  return { vrm: { expressionManager: manager } as VRM, manager };
}

describe('VRM expression controller', () => {
  it('maps trigger expressions before persona mood expressions', () => {
    expect(resolveVrmMoodExpression('sad', 'success')).toBe('happy');
    expect(resolveVrmMoodExpression('neutral', 'task:failure')).toBe('sad');
    expect(resolveVrmMoodExpression('annoyed')).toBe('angry');
    expect(resolveVrmMoodExpression('neutral')).toBeNull();
  });

  it('produces a bounded blink and resets while paused', () => {
    const blink = new VrmBlinkController(() => 0);
    for (let index = 0; index < 9; index += 1) expect(blink.update(0.25)).toBe(0);
    expect(blink.update(0.25)).toBe(1);
    expect(blink.update(0.05)).toBeCloseTo(0.5);
    expect(blink.update(0.01, true)).toBe(0);
  });

  it('drives mood and mouth weights but yields channels owned by VRMA', () => {
    const { vrm, manager } = createExpressionVrm(['happy', 'sad', 'blink', 'aa']);
    const controller = new VrmExpressionController(vrm);
    const camera = new PerspectiveCamera(35, 1, 0.01, 100);

    controller.update(0.2, camera, { mood: 'joyful', moodIntensity: 100, amplitude: 1 });
    expect(manager.getValue('happy')).toBeGreaterThan(0.6);
    expect(manager.getValue('aa')).toBeGreaterThan(0.9);

    const motionMask = { mood: false, blink: false, mouth: true, lookAt: false };
    controller.prepareForAnimation(motionMask);
    manager.setValue('aa', 0.75);
    controller.update(0.2, camera, { mood: 'sad', amplitude: 0, motionMask });
    expect(manager.getValue('aa')).toBe(0.75);
    expect(manager.getValue('sad')).toBeGreaterThan(0);

    controller.dispose();
    expect(manager.getValue('aa')).toBe(0);
  });

  it('maps pointer movement to a damped lookAt target and pauses while dragging', () => {
    const reset = vi.fn();
    const lookAt = {
      target: null,
      autoUpdate: false,
      getLookAtWorldPosition: (target: Vector3) => target.set(0, 1.5, 0),
      reset
    };
    const vrm = { lookAt } as unknown as VRM;
    const controller = new VrmExpressionController(vrm);
    const camera = new PerspectiveCamera(35, 1, 0.01, 100);
    camera.position.set(0, 1, 3);

    controller.update(0.2, camera, { pointer: { active: true, x: 1, y: 1 } });
    expect(lookAt.autoUpdate).toBe(true);
    expect(lookAt.target).not.toBeNull();
    expect((lookAt.target as unknown as { position: Vector3 }).position.x).toBeGreaterThan(0);
    expect((lookAt.target as unknown as { position: Vector3 }).position.y).toBeGreaterThan(1.5);

    controller.update(0.2, camera, { isDragging: true });
    expect(lookAt.autoUpdate).toBe(false);
    expect(lookAt.target).toBeNull();
    controller.dispose();
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

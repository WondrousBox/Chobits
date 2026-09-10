import { type VRM, VRMExpressionPresetName } from '@pixiv/three-vrm';
import { MathUtils, Object3D, type PerspectiveCamera, Vector3 } from 'three';

import { EMPTY_VRM_MOTION_CONTROL_MASK, type VrmMotionControlMask } from './vrm-motion-controller';

const MOOD_EXPRESSIONS = [VRMExpressionPresetName.Happy, VRMExpressionPresetName.Angry, VRMExpressionPresetName.Sad, VRMExpressionPresetName.Relaxed, VRMExpressionPresetName.Surprised] as const;
const BLINK_EXPRESSIONS = [VRMExpressionPresetName.Blink, VRMExpressionPresetName.BlinkLeft, VRMExpressionPresetName.BlinkRight] as const;
const MOUTH_EXPRESSIONS = [VRMExpressionPresetName.Aa, VRMExpressionPresetName.Ih, VRMExpressionPresetName.Ou, VRMExpressionPresetName.Ee, VRMExpressionPresetName.Oh] as const;

const TRIGGER_EXPRESSION_MAP: Record<string, VrmMoodExpression> = {
  joyful: 'happy',
  celebrate: 'happy',
  success: 'happy',
  sad: 'sad',
  failure: 'sad',
  angry: 'angry',
  relaxed: 'relaxed',
  sleep: 'relaxed',
  surprised: 'surprised',
  welcome: 'surprised'
};

const MOOD_EXPRESSION_MAP: Record<string, VrmMoodExpression> = {
  joyful: 'happy',
  content: 'happy',
  excited: 'happy',
  sad: 'sad',
  annoyed: 'angry',
  sleepy: 'relaxed',
  curious: 'surprised'
};

export type VrmMoodExpression = 'happy' | 'angry' | 'sad' | 'relaxed' | 'surprised';

export interface VrmPointerTarget {
  active: boolean;
  x: number;
  y: number;
}

export interface VrmExpressionFrameInput {
  mood?: string | null;
  moodIntensity?: number | null;
  trigger?: string | null;
  spriteState?: string | null;
  isDragging?: boolean;
  amplitude?: number;
  pointer?: VrmPointerTarget;
  motionMask?: VrmMotionControlMask;
}

export function resolveVrmMoodExpression(mood?: string | null, trigger?: string | null): VrmMoodExpression | null {
  const normalizedTrigger = trigger?.trim().toLowerCase() ?? '';
  const triggerSegment = normalizedTrigger.split(':').at(-1) ?? normalizedTrigger;
  if (TRIGGER_EXPRESSION_MAP[normalizedTrigger]) return TRIGGER_EXPRESSION_MAP[normalizedTrigger];
  if (TRIGGER_EXPRESSION_MAP[triggerSegment]) return TRIGGER_EXPRESSION_MAP[triggerSegment];
  return MOOD_EXPRESSION_MAP[mood?.trim().toLowerCase() ?? ''] ?? null;
}

export class VrmBlinkController {
  private phase: 'waiting' | 'closing' | 'opening' = 'waiting';
  private phaseSeconds = 0;
  private waitSeconds: number;

  constructor(private readonly random: () => number = Math.random) {
    this.waitSeconds = this.nextWait();
  }

  update(deltaSeconds: number, paused = false): number {
    if (paused) {
      this.reset();
      return 0;
    }

    const delta = Math.max(0, Math.min(deltaSeconds, 0.25));
    if (this.phase === 'waiting') {
      this.waitSeconds -= delta;
      if (this.waitSeconds > 0) return 0;
      this.phase = 'closing';
      this.phaseSeconds = 0;
    }

    this.phaseSeconds += delta;
    if (this.phase === 'closing') {
      const weight = Math.min(1, this.phaseSeconds / 0.07);
      if (weight < 1) return weight;
      this.phase = 'opening';
      this.phaseSeconds = 0;
      return 1;
    }

    const weight = Math.max(0, 1 - this.phaseSeconds / 0.1);
    if (weight <= 0) this.reset();
    return weight;
  }

  reset(): void {
    this.phase = 'waiting';
    this.phaseSeconds = 0;
    this.waitSeconds = this.nextWait();
  }

  private nextWait(): number {
    return 2.5 + MathUtils.clamp(this.random(), 0, 1) * 3.5;
  }
}

export class VrmExpressionController {
  private readonly blink = new VrmBlinkController();
  private readonly lookAtTarget = new Object3D();
  private readonly lookAtOrigin = new Vector3();
  private readonly desiredLookAt = new Vector3();
  private previousMotionMask = EMPTY_VRM_MOTION_CONTROL_MASK;
  private lookAtInitialized = false;
  private mouthWeight = 0;

  constructor(private readonly vrm: VRM) {}

  prepareForAnimation(mask: VrmMotionControlMask): void {
    const manager = this.vrm.expressionManager;
    if (manager) {
      if (mask.mood && !this.previousMotionMask.mood) {
        for (const name of MOOD_EXPRESSIONS) manager.setValue(name, 0);
      }
      if (mask.blink && !this.previousMotionMask.blink) {
        for (const name of BLINK_EXPRESSIONS) manager.setValue(name, 0);
      }
      if (mask.mouth && !this.previousMotionMask.mouth) {
        for (const name of MOUTH_EXPRESSIONS) manager.setValue(name, 0);
      }
    }
    this.previousMotionMask = mask;
  }

  update(deltaSeconds: number, camera: PerspectiveCamera, input: VrmExpressionFrameInput): void {
    const motionMask = input.motionMask ?? EMPTY_VRM_MOTION_CONTROL_MASK;
    this.updateMood(deltaSeconds, input, motionMask);
    this.updateBlink(deltaSeconds, input, motionMask);
    this.updateMouth(deltaSeconds, input.amplitude ?? 0, motionMask);
    this.updateLookAt(deltaSeconds, camera, input, motionMask);
  }

  dispose(): void {
    const manager = this.vrm.expressionManager;
    if (manager) {
      for (const name of [...MOOD_EXPRESSIONS, ...BLINK_EXPRESSIONS, ...MOUTH_EXPRESSIONS]) manager.setValue(name, 0);
    }
    if (this.vrm.lookAt) {
      this.vrm.lookAt.target = null;
      this.vrm.lookAt.autoUpdate = false;
      this.vrm.lookAt.reset();
    }
  }

  private updateMood(deltaSeconds: number, input: VrmExpressionFrameInput, motionMask: VrmMotionControlMask): void {
    const manager = this.vrm.expressionManager;
    if (!manager || motionMask.mood) return;

    const active = resolveVrmMoodExpression(input.mood, input.trigger);
    const intensity = Number.isFinite(input.moodIntensity) ? MathUtils.clamp((input.moodIntensity ?? 50) / 100, 0, 1) : 0.5;
    const targetWeight = input.trigger && active ? Math.max(0.8, intensity) : active ? 0.3 + intensity * 0.6 : 0;
    const alpha = 1 - Math.exp(-deltaSeconds * 7);
    for (const name of MOOD_EXPRESSIONS) {
      const current = manager.getValue(name);
      if (current !== null) manager.setValue(name, MathUtils.lerp(current, name === active ? targetWeight : 0, alpha));
    }
  }

  private updateBlink(deltaSeconds: number, input: VrmExpressionFrameInput, motionMask: VrmMotionControlMask): void {
    const manager = this.vrm.expressionManager;
    if (!manager || motionMask.blink) return;

    const sleeping = input.spriteState === 'sleeping' || input.spriteState === 'sleep' || input.trigger === 'sleep';
    let weight: number;
    if (sleeping) {
      this.blink.reset();
      weight = 1;
    } else {
      weight = this.blink.update(deltaSeconds);
    }
    if (manager.getExpression(VRMExpressionPresetName.Blink)) {
      manager.setValue(VRMExpressionPresetName.Blink, weight);
      return;
    }
    manager.setValue(VRMExpressionPresetName.BlinkLeft, weight);
    manager.setValue(VRMExpressionPresetName.BlinkRight, weight);
  }

  private updateMouth(deltaSeconds: number, amplitude: number, motionMask: VrmMotionControlMask): void {
    const manager = this.vrm.expressionManager;
    if (!manager || motionMask.mouth) return;

    const target = MathUtils.clamp(amplitude * 7, 0, 1);
    const response = target > this.mouthWeight ? 20 : 12;
    this.mouthWeight = MathUtils.lerp(this.mouthWeight, target, 1 - Math.exp(-deltaSeconds * response));
    if (this.mouthWeight < 0.001) this.mouthWeight = 0;
    manager.setValue(VRMExpressionPresetName.Aa, this.mouthWeight);
  }

  private updateLookAt(deltaSeconds: number, camera: PerspectiveCamera, input: VrmExpressionFrameInput, motionMask: VrmMotionControlMask): void {
    const lookAt = this.vrm.lookAt;
    if (!lookAt) return;

    if (motionMask.lookAt || input.isDragging) {
      lookAt.target = null;
      lookAt.autoUpdate = false;
      return;
    }

    lookAt.getLookAtWorldPosition(this.lookAtOrigin);
    const distance = Math.max(0.5, Math.abs(camera.position.z - this.lookAtOrigin.z));
    const pointerX = input.pointer?.active ? MathUtils.clamp(input.pointer.x, -1, 1) : 0;
    const pointerY = input.pointer?.active ? MathUtils.clamp(input.pointer.y, -1, 1) : 0;
    const viewportHalfHeight = Math.tan(MathUtils.degToRad(camera.fov / 2)) * distance;
    const viewportHalfWidth = viewportHalfHeight * camera.aspect;
    const maxHorizontal = Math.tan(MathUtils.degToRad(20)) * distance;
    const maxVertical = Math.tan(MathUtils.degToRad(12)) * distance;
    this.desiredLookAt.set(camera.position.x + pointerX * Math.min(viewportHalfWidth, maxHorizontal), this.lookAtOrigin.y + pointerY * Math.min(viewportHalfHeight, maxVertical), camera.position.z);

    if (!this.lookAtInitialized) {
      this.lookAtTarget.position.copy(this.desiredLookAt);
      this.lookAtInitialized = true;
    } else {
      this.lookAtTarget.position.lerp(this.desiredLookAt, 1 - Math.exp(-deltaSeconds * 9));
    }
    this.lookAtTarget.updateMatrixWorld();
    lookAt.target = this.lookAtTarget;
    lookAt.autoUpdate = true;
  }
}

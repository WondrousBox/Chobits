import { type VRM } from '@pixiv/three-vrm';
import { VRMAnimation } from '@pixiv/three-vrm-animation';
import { AnimationClip, Group, LoopOnce, LoopRepeat, NumberKeyframeTrack, QuaternionKeyframeTrack } from 'three';
import { describe, expect, it, vi } from 'vitest';

import type { SpritePlayCommand } from '../packages/sprite-core/types';
import { getVrmAnimationControlMask, resolveVrmActionLoop, VrmMotionController } from '../src/features/sprite-assistant/renderers/vrm/vrm-motion-controller';

function createVrm(): VRM {
  return { scene: new Group() } as VRM;
}

function createAnimation(duration = 0.1): VRMAnimation {
  const animation = new VRMAnimation();
  animation.duration = duration;
  return animation;
}

function createCommand(animationId: string, playback: SpritePlayCommand['playback'] = { loop: false }): SpritePlayCommand {
  return {
    animationId,
    playId: animationId + '-play',
    source: { kind: 'three', localPath: '/pack/' + animationId + '.vrma', type: 'model/vrm-animation' },
    playback
  };
}

describe('VRM motion controller', () => {
  it('maps sprite loop semantics to Three.js action semantics', () => {
    expect(resolveVrmActionLoop(undefined)).toEqual({ mode: LoopOnce, repetitions: 1, completes: true });
    expect(resolveVrmActionLoop({ loop: true })).toEqual({ mode: LoopRepeat, repetitions: Infinity, completes: false });
    expect(resolveVrmActionLoop({ loop: true, loopCount: 3 })).toEqual({ mode: LoopRepeat, repetitions: 3, completes: true });
  });

  it('detects expression and lookAt channels owned by a VRMA clip', () => {
    const animation = createAnimation();
    animation.expressionTracks.preset.set('happy', new NumberKeyframeTrack('happy', [0, 1], [0, 1]));
    animation.expressionTracks.preset.set('blink', new NumberKeyframeTrack('blink', [0, 1], [0, 1]));
    animation.expressionTracks.preset.set('aa', new NumberKeyframeTrack('aa', [0, 1], [0, 1]));
    animation.lookAtTrack = new QuaternionKeyframeTrack('lookAt', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]);

    expect(getVrmAnimationControlMask(animation)).toEqual({ mood: true, blink: true, mouth: true, lookAt: true });
  });

  it('reports a finite action exactly once and reuses parsed animation data', async () => {
    const animation = createAnimation();
    const onComplete = vi.fn();
    const loadAnimation = vi.fn(async () => animation);
    const controller = new VrmMotionController(createVrm(), {
      loadAnimation,
      createClip: () => new AnimationClip('test', 0.1, []),
      onComplete
    });

    await controller.play(createCommand('welcome'), 'res://pack/welcome.vrma');
    controller.update(0.2);
    controller.update(0.2);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('welcome', 'welcome-play');

    await controller.play(createCommand('welcome-again'), 'res://pack/welcome.vrma');
    expect(loadAnimation).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it('uses a timed playback deadline to finish an otherwise infinite action', async () => {
    let now = 1000;
    const onComplete = vi.fn();
    const controller = new VrmMotionController(createVrm(), {
      loadAnimation: async () => createAnimation(1),
      createClip: () => new AnimationClip('loop', 1, []),
      onComplete,
      now: () => now
    });
    const timed = createCommand('timed', { loop: true });
    timed.playbackSession = { mode: 'timed', startedAtMs: 1000, activeDurationMs: 500 };

    await controller.play(timed, 'res://pack/timed.vrma');
    controller.update(0.1);
    expect(onComplete).not.toHaveBeenCalled();
    now = 1500;
    controller.update(0.1);
    expect(onComplete).toHaveBeenCalledWith('timed', 'timed-play');
    controller.dispose();
  });

  it('ignores an animation load that resolves after a newer command', async () => {
    let resolveFirst!: (animation: VRMAnimation) => void;
    const newer = createAnimation();
    newer.expressionTracks.preset.set('aa', new NumberKeyframeTrack('aa', [0, 1], [0, 1]));
    const loadAnimation = vi.fn((url: string) =>
      url.includes('first')
        ? new Promise<VRMAnimation>((resolve) => {
            resolveFirst = resolve;
          })
        : Promise.resolve(newer)
    );
    const controller = new VrmMotionController(createVrm(), {
      loadAnimation,
      createClip: () => new AnimationClip('test', 1, [])
    });

    const firstPlay = controller.play(createCommand('first', { loop: true }), 'res://pack/first.vrma');
    await controller.play(createCommand('second', { loop: true }), 'res://pack/second.vrma');
    expect(controller.getControlMask().mouth).toBe(true);
    resolveFirst(createAnimation());
    await firstPlay;
    expect(controller.getControlMask().mouth).toBe(true);
    controller.dispose();
  });

  it('fails a finite invalid source without leaving completion waiters blocked', async () => {
    const onComplete = vi.fn();
    const onError = vi.fn();
    const controller = new VrmMotionController(createVrm(), { onComplete, onError });

    await controller.play(createCommand('invalid'), 'res://pack/invalid.webm');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('invalid', 'invalid-play');
    controller.dispose();
  });
});

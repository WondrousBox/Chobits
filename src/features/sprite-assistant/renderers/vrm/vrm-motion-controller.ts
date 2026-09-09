import type { SpritePlayCommand } from '@packages/sprite-core/types';
import { createVRMAnimationClip, type VRMAnimation, VRMAnimationLoaderPlugin, VRMLookAtQuaternionProxy } from '@pixiv/three-vrm-animation';
import { type VRM, VRMUtils } from '@pixiv/three-vrm';
import { AnimationClip, AnimationMixer, LoopOnce, LoopRepeat } from 'three';
import type { AnimationAction, AnimationMixerEventMap } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const CROSS_FADE_SECONDS = 0.15;
const MOTION_CACHE_LIMIT = 8;

const BLINK_EXPRESSIONS = new Set(['blink', 'blinkLeft', 'blinkRight']);
const MOUTH_EXPRESSIONS = new Set(['aa', 'ih', 'ou', 'ee', 'oh']);

export interface VrmMotionControlMask {
  mood: boolean;
  blink: boolean;
  mouth: boolean;
  lookAt: boolean;
}

export const EMPTY_VRM_MOTION_CONTROL_MASK: VrmMotionControlMask = {
  mood: false,
  blink: false,
  mouth: false,
  lookAt: false
};

interface ActiveVrmMotion {
  animationId: string;
  playId?: string;
  clip: AnimationClip;
  action: AnimationAction;
  controlMask: VrmMotionControlMask;
  completionReported: boolean;
  completes: boolean;
  deadlineMs?: number;
}

interface RetiringVrmMotion {
  clip: AnimationClip;
  action: AnimationAction;
  remainingSeconds: number;
}

export interface VrmMotionControllerOptions {
  onComplete?: (animationId: string, playId?: string) => void;
  onError?: (error: unknown, command: SpritePlayCommand) => void;
  loadAnimation?: (url: string) => Promise<VRMAnimation>;
  createClip?: (animation: VRMAnimation, vrm: VRM) => AnimationClip;
  now?: () => number;
}

export interface VrmActionLoopConfig {
  mode: typeof LoopOnce | typeof LoopRepeat;
  repetitions: number;
  completes: boolean;
}

export function resolveVrmActionLoop(playback: SpritePlayCommand['playback']): VrmActionLoopConfig {
  const loopCount = playback?.loopCount;
  if (typeof loopCount === 'number' && Number.isFinite(loopCount) && loopCount > 0) {
    return { mode: LoopRepeat, repetitions: Math.max(1, Math.floor(loopCount)), completes: true };
  }
  if (playback?.loop === true) {
    return { mode: LoopRepeat, repetitions: Infinity, completes: false };
  }
  return { mode: LoopOnce, repetitions: 1, completes: true };
}

export function getVrmAnimationControlMask(animation: VRMAnimation): VrmMotionControlMask {
  const expressionNames = [...animation.expressionTracks.preset.keys(), ...animation.expressionTracks.custom.keys()];
  return {
    mood: expressionNames.some((name) => !BLINK_EXPRESSIONS.has(name) && !MOUTH_EXPRESSIONS.has(name)),
    blink: expressionNames.some((name) => BLINK_EXPRESSIONS.has(name)),
    mouth: expressionNames.some((name) => MOUTH_EXPRESSIONS.has(name)),
    lookAt: animation.lookAtTrack !== null
  };
}

export async function loadVrmAnimation(url: string): Promise<VRMAnimation> {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
  const gltf = await loader.loadAsync(url);
  const animation = (gltf.userData.vrmAnimations as VRMAnimation[] | undefined)?.[0];
  VRMUtils.deepDispose(gltf.scene);
  if (!animation) throw new Error('The loaded asset does not contain VRM animation data');
  return animation;
}

export class VrmMotionController {
  private readonly mixer: AnimationMixer;
  private readonly animationCache = new Map<string, Promise<VRMAnimation>>();
  private readonly retiring: RetiringVrmMotion[] = [];
  private readonly loadAnimation: (url: string) => Promise<VRMAnimation>;
  private readonly createClip: (animation: VRMAnimation, vrm: VRM) => AnimationClip;
  private readonly now: () => number;
  private active: ActiveVrmMotion | null = null;
  private requestedKey: string | null = null;
  private generation = 0;
  private disposed = false;

  constructor(
    private readonly vrm: VRM,
    private readonly options: VrmMotionControllerOptions = {}
  ) {
    this.mixer = new AnimationMixer(vrm.scene);
    this.loadAnimation = options.loadAnimation ?? loadVrmAnimation;
    this.createClip = options.createClip ?? createVRMAnimationClip;
    this.now = options.now ?? Date.now;
    this.mixer.addEventListener('finished', this.handleFinished);

    if (vrm.lookAt) {
      const proxy = new VRMLookAtQuaternionProxy(vrm.lookAt);
      proxy.name = 'VRMLookAtQuaternionProxy';
      vrm.scene.add(proxy);
    }
  }

  getControlMask(): VrmMotionControlMask {
    return this.active?.controlMask ?? EMPTY_VRM_MOTION_CONTROL_MASK;
  }

  async play(command: SpritePlayCommand | null, url?: string): Promise<void> {
    const key = command ? `${command.animationId}\n${command.playId ?? ''}\n${url ?? ''}` : null;
    if (key === this.requestedKey) return;
    const generation = ++this.generation;
    this.requestedKey = key;

    if (!command) {
      this.retireActive();
      return;
    }

    if (!url || !url.toLowerCase().split(/[?#]/, 1)[0]?.endsWith('.vrma')) {
      this.retireActive();
      this.handlePlaybackFailure(command, new Error('three animation source must reference a .vrma file'));
      return;
    }

    if (command.playback?.loopStartMs != null || command.playback?.loopEndMs != null) {
      console.warn('[SpriteVRM] loopStartMs/loopEndMs are not supported for VRMA; using the full clip');
    }

    try {
      const animation = await this.getCachedAnimation(url);
      if (this.disposed || generation !== this.generation) return;

      const clip = this.createClip(animation, this.vrm);
      clip.name = command.animationId;
      const action = this.mixer.clipAction(clip);
      const loop = resolveVrmActionLoop(command.playback);
      action.reset().setLoop(loop.mode, loop.repetitions);
      action.clampWhenFinished = loop.completes;
      action.enabled = true;
      action.setEffectiveTimeScale(1);
      action.setEffectiveWeight(1);

      const previous = this.active;
      if (previous) {
        previous.action.fadeOut(CROSS_FADE_SECONDS);
        this.retiring.push({ clip: previous.clip, action: previous.action, remainingSeconds: CROSS_FADE_SECONDS });
      }

      const playbackSession = command.playbackSession;
      this.active = {
        animationId: command.animationId,
        playId: command.playId,
        clip,
        action,
        controlMask: getVrmAnimationControlMask(animation),
        completionReported: false,
        completes: loop.completes || playbackSession?.mode === 'timed',
        ...(playbackSession?.mode === 'timed'
          ? {
              deadlineMs: playbackSession.startedAtMs + playbackSession.activeDurationMs
            }
          : {})
      };

      action.fadeIn(CROSS_FADE_SECONDS).play();
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      this.retireActive();
      this.handlePlaybackFailure(command, error);
    }
  }

  update(deltaSeconds: number): void {
    if (this.disposed) return;
    this.mixer.update(deltaSeconds);

    for (let index = this.retiring.length - 1; index >= 0; index -= 1) {
      const motion = this.retiring[index];
      motion.remainingSeconds -= deltaSeconds;
      if (motion.remainingSeconds <= 0) {
        motion.action.stop();
        this.mixer.uncacheAction(motion.clip, this.vrm.scene);
        this.mixer.uncacheClip(motion.clip);
        this.retiring.splice(index, 1);
      }
    }

    if (this.active?.deadlineMs != null && this.now() >= this.active.deadlineMs) {
      this.completeActive(this.active);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.mixer.removeEventListener('finished', this.handleFinished);
    this.mixer.stopAllAction();
    if (this.active) this.mixer.uncacheClip(this.active.clip);
    for (const motion of this.retiring) this.mixer.uncacheClip(motion.clip);
    this.mixer.uncacheRoot(this.vrm.scene);
    this.active = null;
    this.retiring.length = 0;
    this.animationCache.clear();
  }

  private readonly handleFinished = (event: AnimationMixerEventMap['finished']): void => {
    if (this.active?.action !== event.action) return;
    this.completeActive(this.active);
  };

  private completeActive(motion: ActiveVrmMotion): void {
    if (this.active !== motion || motion.completionReported || !motion.completes) return;
    motion.completionReported = true;
    motion.action.stop();
    this.mixer.uncacheAction(motion.clip, this.vrm.scene);
    this.mixer.uncacheClip(motion.clip);
    this.active = null;
    this.requestedKey = null;
    this.options.onComplete?.(motion.animationId, motion.playId);
  }

  private retireActive(): void {
    if (!this.active) return;
    this.active.action.stop();
    this.mixer.uncacheAction(this.active.clip, this.vrm.scene);
    this.mixer.uncacheClip(this.active.clip);
    this.active = null;
  }

  private handlePlaybackFailure(command: SpritePlayCommand, error: unknown): void {
    this.options.onError?.(error, command);
    const loop = resolveVrmActionLoop(command.playback);
    if (loop.completes || command.playbackSession?.mode === 'timed') {
      this.options.onComplete?.(command.animationId, command.playId);
    }
  }

  private getCachedAnimation(url: string): Promise<VRMAnimation> {
    const cached = this.animationCache.get(url);
    if (cached) {
      this.animationCache.delete(url);
      this.animationCache.set(url, cached);
      return cached;
    }

    const pending = this.loadAnimation(url).catch((error) => {
      this.animationCache.delete(url);
      throw error;
    });
    this.animationCache.set(url, pending);
    while (this.animationCache.size > MOTION_CACHE_LIMIT) {
      const oldest = this.animationCache.keys().next().value as string | undefined;
      if (!oldest) break;
      this.animationCache.delete(oldest);
    }
    return pending;
  }
}

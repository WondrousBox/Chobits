import type { SpritePresentationConfig } from '@packages/sprite-core/types';
import { useEffect, useRef } from 'react';
import { Clock, DirectionalLight, HemisphereLight, MathUtils, PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three';

import { getCurrentRMS } from '@/lib/audio/lip-sync-source';
import { makeResSrc } from '@/pages/ResourcePage/utils/resourceProtocol';

import { useSpriteState } from '../../context/hooks';
import type { SpriteRendererProps } from '..';
import { frameVrmCamera } from './vrm-camera';
import { disposeVrm, disposeVrmRenderer } from './vrm-dispose';
import { VrmExpressionController, type VrmPointerTarget } from './vrm-expression-controller';
import { loadVrmModel } from './vrm-model-loader';
import { VrmMotionController } from './vrm-motion-controller';

type ThreePresentation = Extract<SpritePresentationConfig, { renderer: 'three' }> & {
  model: NonNullable<Extract<SpritePresentationConfig, { renderer: 'three' }>['model']>;
};

export interface VrmSpriteProps extends SpriteRendererProps {
  presentation: ThreePresentation;
}

const MAX_PIXEL_RATIO = 2;
const FRAME_INTERVAL_MS = 1000 / 30;

export default function VrmSprite({ width = 180, height = 240, walkDirection, isDragging, onFirstFrame, presentation }: VrmSpriteProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const firstFrameCallbackRef = useRef(onFirstFrame);
  const generationRef = useRef(0);
  const sizeRef = useRef({ width, height });
  const resizeRef = useRef<(() => void) | null>(null);
  const pointerRef = useRef<VrmPointerTarget>({ active: false, x: 0, y: 0 });
  const runtimeRef = useRef<{ motion: VrmMotionController; expressions: VrmExpressionController } | null>(null);
  const { currentAnimation, personaState, spriteState } = useSpriteState();
  const visualStateRef = useRef({ currentAnimation, personaState, spriteState, walkDirection, isDragging });

  useEffect(() => {
    visualStateRef.current = { currentAnimation, personaState, spriteState, walkDirection, isDragging };
  }, [currentAnimation, isDragging, personaState, spriteState, walkDirection]);

  useEffect(() => {
    firstFrameCallbackRef.current = onFirstFrame;
  }, [onFirstFrame]);

  useEffect(() => {
    sizeRef.current = { width, height };
    resizeRef.current?.();
  }, [height, width]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const motionPath = currentAnimation?.source?.kind === 'three' ? currentAnimation.source.localPath : undefined;
    void runtime.motion.play(currentAnimation, motionPath ? makeResSrc(motionPath) : undefined);
  }, [currentAnimation]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const generation = ++generationRef.current;
    let disposed = false;
    let frameRequest: number | null = null;
    let observer: ResizeObserver | null = null;
    let vrm: Awaited<ReturnType<typeof loadVrmModel>> | null = null;
    let motionController: VrmMotionController | null = null;
    let expressionController: VrmExpressionController | null = null;
    let firstFrameReported = false;
    let renderFailed = false;
    let lastFrameAt = 0;
    const scene = new Scene();
    const camera = new PerspectiveCamera(presentation.camera?.fov ?? 35, 1, 0.01, 100);
    const clock = new Clock();
    let renderer: WebGLRenderer | null = null;

    const reportFirstFrame = (): void => {
      if (firstFrameReported) return;
      firstFrameReported = true;
      firstFrameCallbackRef.current?.();
    };

    const getSize = (): { width: number; height: number } => {
      const rect = container.getBoundingClientRect();
      return {
        width: Math.max(1, Math.round(rect.width || sizeRef.current.width)),
        height: Math.max(1, Math.round(rect.height || sizeRef.current.height))
      };
    };

    const resize = (): void => {
      if (!renderer) return;
      const size = getSize();
      renderer.setSize(size.width, size.height, false);
      if (vrm) frameVrmCamera(camera, vrm.scene, size.width / size.height, presentation.camera);
    };
    resizeRef.current = resize;

    function scheduleFrame(): void {
      if (disposed || renderFailed || document.hidden || !renderer || !vrm || frameRequest !== null) return;
      frameRequest = requestAnimationFrame(renderFrame);
    }

    function renderFrame(now: number): void {
      frameRequest = null;
      if (disposed || renderFailed || !renderer) return;
      if (document.hidden) {
        clock.stop();
        return;
      }
      if (now - lastFrameAt < FRAME_INTERVAL_MS) {
        scheduleFrame();
        return;
      }
      lastFrameAt = now;
      if (!clock.running) clock.start();
      try {
        const delta = Math.min(clock.getDelta(), 0.1);
        const visualState = visualStateRef.current;
        const motionMask = motionController?.getControlMask();
        if (motionMask) expressionController?.prepareForAnimation(motionMask);
        motionController?.update(delta);
        expressionController?.update(delta, camera, {
          mood: visualState.personaState?.mood,
          moodIntensity: visualState.personaState?.moodIntensity,
          trigger: visualState.currentAnimation?.trigger,
          spriteState: visualState.spriteState,
          isDragging: visualState.isDragging,
          amplitude: getCurrentRMS(),
          pointer: pointerRef.current,
          motionMask: motionController?.getControlMask()
        });
        if (vrm) {
          const targetYaw = visualState.spriteState === 'walking' ? (visualState.walkDirection === 'right' ? -0.35 : visualState.walkDirection === 'left' ? 0.35 : 0) : 0;
          vrm.scene.rotation.y = MathUtils.damp(vrm.scene.rotation.y, targetYaw, 10, delta);
        }
        vrm?.update(delta);
        renderer.render(scene, camera);
        if (vrm) reportFirstFrame();
        scheduleFrame();
      } catch (error) {
        renderFailed = true;
        console.error('[SpriteVRM] Frame rendering failed', error);
        reportFirstFrame();
      }
    }

    const handleVisibilityChange = (): void => {
      if (document.hidden) {
        if (frameRequest !== null) {
          cancelAnimationFrame(frameRequest);
          frameRequest = null;
        }
        clock.stop();
        return;
      }
      clock.stop();
      clock.start();
      scheduleFrame();
    };

    const handleContextLost = (event: Event): void => {
      event.preventDefault();
      renderFailed = true;
      if (frameRequest !== null) {
        cancelAnimationFrame(frameRequest);
        frameRequest = null;
      }
      clock.stop();
      console.error('[SpriteVRM] WebGL context lost');
      reportFirstFrame();
    };

    const release = (): void => {
      if (disposed) return;
      disposed = true;
      resizeRef.current = null;
      generationRef.current += 1;
      if (frameRequest !== null) cancelAnimationFrame(frameRequest);
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pagehide', release);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clock.stop();
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerleave', handlePointerLeave);
      motionController?.dispose();
      expressionController?.dispose();
      motionController = null;
      expressionController = null;
      runtimeRef.current = null;
      if (vrm) {
        scene.remove(vrm.scene);
        disposeVrm(vrm);
        vrm = null;
      }
      if (renderer) {
        const canvas = renderer.domElement;
        canvas.removeEventListener('webglcontextlost', handleContextLost);
        disposeVrmRenderer(renderer);
        renderer = null;
        canvas.remove();
      }
    };

    const handlePointerMove = (event: PointerEvent): void => {
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointerRef.current = {
        active: true,
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: -(((event.clientY - rect.top) / rect.height) * 2 - 1)
      };
    };

    const handlePointerLeave = (): void => {
      pointerRef.current = { active: false, x: 0, y: 0 };
    };

    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.outputColorSpace = SRGBColorSpace;
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.background = 'transparent';
      renderer.domElement.style.display = 'block';
      renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
      container.appendChild(renderer.domElement);
    } catch (error) {
      console.error('[SpriteVRM] WebGL initialization failed', error);
      reportFirstFrame();
      release();
      return release;
    }

    scene.add(new HemisphereLight(0xffffff, 0x404040, 2.2));
    const keyLight = new DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(1.5, 2.5, 3);
    scene.add(keyLight);

    resize();
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(resize);
      observer.observe(container);
    } else {
      window.addEventListener('resize', resize);
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', release);
    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerleave', handlePointerLeave);

    void loadVrmModel(makeResSrc(presentation.model.localPath))
      .then((loadedVrm) => {
        if (disposed || generationRef.current !== generation) {
          disposeVrm(loadedVrm);
          return;
        }
        vrm = loadedVrm;
        motionController = new VrmMotionController(loadedVrm, {
          onComplete: (animationId, playId) => {
            void window.YUA.sprite.animComplete(animationId, 'full', playId);
          },
          onError: (error, command) => {
            console.warn('[SpriteVRM] Motion failed', { animationId: command.animationId, playId: command.playId }, error);
          }
        });
        expressionController = new VrmExpressionController(loadedVrm);
        runtimeRef.current = { motion: motionController, expressions: expressionController };
        scene.add(loadedVrm.scene);
        resize();
        const animation = visualStateRef.current.currentAnimation;
        const motionPath = animation?.source?.kind === 'three' ? animation.source.localPath : undefined;
        void motionController.play(animation, motionPath ? makeResSrc(motionPath) : undefined);
        clock.start();
        scheduleFrame();
      })
      .catch((error) => {
        if (disposed || generationRef.current !== generation) return;
        console.error('[SpriteVRM] Failed to load model', error);
        reportFirstFrame();
      });

    return release;
  }, [presentation]);

  return <div ref={containerRef} data-sprite-renderer="three" style={{ width, height, userSelect: 'none', background: 'transparent' }} />;
}

import type { SpritePresentationConfig } from '@packages/sprite-core/types';
import { type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from 'react';

import { getCurrentRMS } from '@/lib/audio/lip-sync-source';
import { InvalidMotionQueueEntryHandleValue } from '@/live2d-sdk/Framework/src/motion/cubismmotionqueuemanager';
import * as LAppDefine from '@/live2d-sdk/src/lappdefine';
import { LAppLive2DManager } from '@/live2d-sdk/src/lapplive2dmanager';
import { makeResSrc } from '@/pages/ResourcePage/utils/resourceProtocol';

import { useSpriteState } from '../context/hooks';
import { type Live2DConfig, loadLive2DConfig, resolveTriggerMapping } from '../live2d/live2d-config';
import { resolveLive2DModelTarget } from '../live2d/live2d-model-target';
import { destroyLive2DRuntime, initLive2DRuntime, resizeLive2DRuntime } from '../live2d/live2d-runtime';
import type { SpriteRendererProps } from '.';

type Live2DPresentation = Extract<SpritePresentationConfig, { renderer: 'live2d' }>;

interface ActiveLive2DPlayback {
  animationId: string;
  playId?: string;
}

interface ReadyLive2DRuntime {
  key: string;
  config: Live2DConfig;
}

let canvasSequence = 0;

function reportAnimationComplete(animationId: string, playId?: string): void {
  void window.YUA.sprite.animComplete(animationId, 'full', playId);
}

export default function Live2DSprite({ width = 300, height = 400, walkDirection, onFirstFrame, presentation }: SpriteRendererProps & { presentation: Live2DPresentation }): JSX.Element {
  const [canvasId] = useState(() => `live2d-sprite-canvas-${++canvasSequence}`);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activePlaybackRef = useRef<ActiveLive2DPlayback | null>(null);
  const firstFrameCallbackRef = useRef(onFirstFrame);
  const [readyRuntime, setReadyRuntime] = useState<ReadyLive2DRuntime | null>(null);
  const { currentAnimation, spriteState } = useSpriteState();
  const modelPath = presentation.model?.localPath;
  const configPath = presentation.config?.localPath;
  const runtimeKey = `${modelPath ?? ''}\n${configPath ?? ''}`;
  const activeRuntime = readyRuntime?.key === runtimeKey ? readyRuntime : null;
  const config = activeRuntime?.config ?? null;
  const runtimeReady = activeRuntime !== null;

  useEffect(() => {
    firstFrameCallbackRef.current = onFirstFrame;
  }, [onFirstFrame]);

  useEffect(() => {
    let disposed = false;
    let firstFrameReported = false;

    const reportFirstFrame = (): void => {
      if (firstFrameReported) return;
      firstFrameReported = true;
      firstFrameCallbackRef.current?.();
    };

    if (!modelPath) {
      reportFirstFrame();
      return;
    }

    activePlaybackRef.current = null;

    void loadLive2DConfig(configPath ? makeResSrc(configPath) : undefined)
      .then(async (loadedConfig) => {
        if (disposed || !canvasRef.current) return;
        await initLive2DRuntime({
          canvasId,
          model: resolveLive2DModelTarget(modelPath),
          scale: loadedConfig.canvas.scale
        });
        if (disposed) return;
        setReadyRuntime({ key: runtimeKey, config: loadedConfig });
        reportFirstFrame();
      })
      .catch((error) => {
        if (disposed) return;
        console.error('[SpriteLive2D] Initialization failed', error);
        reportFirstFrame();
      });

    return () => {
      disposed = true;
      activePlaybackRef.current = null;
      destroyLive2DRuntime();
    };
  }, [canvasId, configPath, modelPath, runtimeKey]);

  useEffect(() => {
    if (!runtimeReady || !currentAnimation) return;

    const previous = activePlaybackRef.current;
    if (previous?.animationId === currentAnimation.animationId && previous.playId === currentAnimation.playId) return;

    const trigger = currentAnimation.trigger ?? 'idle';
    const mapping = resolveTriggerMapping(config, trigger);
    const record = {
      animationId: currentAnimation.animationId,
      playId: currentAnimation.playId
    };
    activePlaybackRef.current = record;

    if (!mapping?.motion) {
      reportAnimationComplete(record.animationId, record.playId);
      return;
    }

    const model = LAppLive2DManager.getInstanceIfExists()?.getModel(0);
    if (!model) {
      reportAnimationComplete(record.animationId, record.playId);
      return;
    }

    if (mapping.expression) {
      try {
        model.setExpression(mapping.expression);
      } catch (error) {
        console.warn('[SpriteLive2D] Expression failed', mapping.expression, error);
      }
    }

    const loop = mapping.loop === true;
    const onFinished = loop
      ? undefined
      : (): void => {
          if (activePlaybackRef.current === record) activePlaybackRef.current = null;
          reportAnimationComplete(record.animationId, record.playId);
        };

    const failAndReport = (error?: unknown): void => {
      console.warn('[SpriteLive2D] Motion failed', { trigger, ...mapping.motion }, error);
      if (!loop) {
        if (activePlaybackRef.current === record) activePlaybackRef.current = null;
        reportAnimationComplete(record.animationId, record.playId);
      }
    };

    try {
      const priority = trigger === 'idle' ? LAppDefine.PriorityIdle : LAppDefine.PriorityNormal;
      const handle = model.startMotion(mapping.motion.group, mapping.motion.index, priority, onFinished);
      if (handle === InvalidMotionQueueEntryHandleValue) failAndReport();
    } catch (error) {
      failAndReport(error);
    }
  }, [config, currentAnimation, runtimeReady]);

  useEffect(() => {
    if (!runtimeReady) return;
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => resizeLive2DRuntime());
    observer.observe(container);
    return () => observer.disconnect();
  }, [runtimeReady]);

  useEffect(() => {
    if (!runtimeReady) return;
    const paramId = config?.lipSync?.paramId ?? 'ParamMouthOpenY';
    const gain = config?.lipSync?.gain ?? 2;
    let frame = 0;

    const updateLipSync = (): void => {
      const model = LAppLive2DManager.getInstanceIfExists()?.getModel(0);
      const rms = getCurrentRMS();
      if (model && rms > 0.001) {
        try {
          model.getModel().addParameterValueById(paramId, rms * gain, 4);
        } catch {
          // Model does not expose the configured lip-sync parameter.
        }
      }
      frame = requestAnimationFrame(updateLipSync);
    };

    frame = requestAnimationFrame(updateLipSync);
    return () => cancelAnimationFrame(frame);
  }, [config, runtimeReady]);

  useEffect(() => {
    if (!runtimeReady || !config?.lookAt?.enabled || !config.lookAt.pointer) return;
    const container = containerRef.current;
    if (!container) return;

    const onMove = (event: MouseEvent): void => {
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      LAppLive2DManager.getInstanceIfExists()?.getModel(0)?.setDragging(x, y);
    };
    const onLeave = (): void => {
      LAppLive2DManager.getInstanceIfExists()?.getModel(0)?.setDragging(0, 0);
    };

    container.addEventListener('mousemove', onMove);
    container.addEventListener('mouseleave', onLeave);
    return () => {
      container.removeEventListener('mousemove', onMove);
      container.removeEventListener('mouseleave', onLeave);
    };
  }, [config, runtimeReady]);

  const handleClick = (event: ReactMouseEvent): void => {
    if (!runtimeReady) return;
    const container = containerRef.current;
    const model = LAppLive2DManager.getInstanceIfExists()?.getModel(0);
    if (!container || !model) return;
    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

    try {
      if (model.hitTest(LAppDefine.HitAreaNameHead, x, y)) {
        model.setRandomExpression();
      } else if (model.hitTest(LAppDefine.HitAreaNameBody, x, y)) {
        model.startRandomMotion(LAppDefine.MotionGroupTapBody, LAppDefine.PriorityNormal);
      }
    } catch {
      // Optional model hit areas may not exist.
    }
  };

  const shouldFlip = walkDirection === 'right' && spriteState === 'walking';
  return (
    <div
      ref={containerRef}
      data-sprite-renderer="live2d"
      data-renderer-status={presentation.model ? (runtimeReady ? 'ready' : 'loading') : 'missing-model'}
      onClick={handleClick}
      style={{
        position: 'relative',
        width,
        height,
        userSelect: 'none',
        transform: shouldFlip ? 'scaleX(-1)' : 'none',
        transformOrigin: 'center center',
        background: 'transparent'
      }}
    >
      <canvas id={canvasId} ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}

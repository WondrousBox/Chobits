import type { SpritePlayCommand } from '@packages/sprite-core/types';
import { useEffect, useRef, useState } from 'react';

import { destroyLive2DRuntime, initLive2DRuntime } from '../live2d/Live2DRuntime';
import { loadLive2DConfig, resolveTriggerMapping, type Live2DConfig } from '../live2d/live2d-config';
import { useSpriteState } from '../context/hooks';
import { LAppLive2DManager } from '@/live2d-sdk/src/lapplive2dmanager';
import * as LAppDefine from '@/live2d-sdk/src/lappdefine';

const CANVAS_ID = 'live2d-assistant-canvas';
const MODEL_BASE_URL = 'res://local/sprites/live2d/';
const MODEL_DIR = 'mao_pro/runtime';
const MODEL_FILE = 'mao_pro';
const MODEL_DIR_URL = `${MODEL_BASE_URL}${MODEL_DIR}/`;

/** 当前正在播放的 live2d 动画记录，用于 loop 重播与完成上报 */
interface ActiveLive2DPlayback {
  animationId: string;
  playId?: string;
  trigger: string;
  loop: boolean;
  motionGroup: string;
  motionIndex: number;
}

export default function Live2DSprite({ width, height, walkDirection }: { width?: number; height?: number; walkDirection?: 'left' | 'right' | null }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { currentAnimation } = useSpriteState();
  const [config, setConfig] = useState<Live2DConfig | null>(null);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const activePlaybackRef = useRef<ActiveLive2DPlayback | null>(null);

  // 初始化运行时与配置
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let mounted = true;

    const boot = async (): Promise<void> => {
      try {
        const loadedConfig = await loadLive2DConfig(MODEL_DIR_URL);
        if (!mounted) return;
        setConfig(loadedConfig);

        await initLive2DRuntime({
          canvasId: CANVAS_ID,
          model: {
            resourcesBaseUrl: MODEL_BASE_URL,
            modelDir: MODEL_DIR,
            modelFileName: MODEL_FILE
          }
        });
        if (!mounted) return;
        setRuntimeReady(true);
      } catch (error) {
        console.error('[Live2DSprite] init failed', error);
      }
    };

    void boot();

    return () => {
      mounted = false;
      setRuntimeReady(false);
      activePlaybackRef.current = null;
      destroyLive2DRuntime();
    };
  }, []);

  // 根据 currentAnimation 播放 motion / expression
  useEffect(() => {
    if (!runtimeReady || !currentAnimation) return;

    const trigger = currentAnimation.trigger ?? 'idle';
    const mapping = resolveTriggerMapping(config, trigger);
    if (!mapping?.motion) {
      // 没有映射时回退到 idle（SDK 会自动处理 idle 循环）
      activePlaybackRef.current = null;
      return;
    }

    const manager = LAppLive2DManager.getInstance();
    const model = manager?.getModel(0);
    if (!model) return;

    const { group, index } = mapping.motion;
    const loop = mapping.loop === true;

    // 避免重复触发同一个动画
    const prev = activePlaybackRef.current;
    if (prev && prev.animationId === currentAnimation.animationId && prev.playId === currentAnimation.playId) {
      return;
    }

    activePlaybackRef.current = {
      animationId: currentAnimation.animationId,
      playId: currentAnimation.playId,
      trigger,
      loop,
      motionGroup: group,
      motionIndex: index
    };

    // 播放表情
    if (mapping.expression) {
      try {
        model.setExpression(mapping.expression);
      } catch (e) {
        console.warn('[Live2DSprite] setExpression failed', mapping.expression, e);
      }
    }

    // 播放动作
    const onFinished = loop
      ? undefined
      : (): void => {
          const active = activePlaybackRef.current;
          if (!active) return;
          activePlaybackRef.current = null;
          if (active.playId) {
            window.YUA.sprite.animComplete(active.animationId, 'main', active.playId);
          } else {
            window.YUA.sprite.animComplete(active.animationId, 'main');
          }
        };

    try {
      if (loop) {
        // loop 动作：使用 PriorityNormal 确保打断 idle，结束后由 SDK 自动回 idle
        model.startMotion(group, index, LAppDefine.PriorityNormal, onFinished);
      } else {
        model.startMotion(group, index, LAppDefine.PriorityNormal, onFinished);
      }
    } catch (e) {
      console.warn('[Live2DSprite] startMotion failed', { group, index, trigger }, e);
      activePlaybackRef.current = null;
    }
  }, [currentAnimation, runtimeReady, config]);

  // walkDirection 翻转
  const shouldFlip = walkDirection === 'right';

  const w = width ?? config?.canvas.width ?? 300;
  const h = height ?? config?.canvas.height ?? 400;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: w,
        height: h,
        userSelect: 'none',
        transform: shouldFlip ? 'scaleX(-1)' : 'none',
        transformOrigin: 'center center'
      }}
    >
      <canvas
        id={CANVAS_ID}
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block'
        }}
      />
    </div>
  );
}

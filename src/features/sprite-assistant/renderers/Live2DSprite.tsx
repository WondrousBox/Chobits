import type { SpritePlayCommand } from '@packages/sprite-core/types';
import { useEffect, useRef, useState } from 'react';

import { destroyLive2DRuntime, initLive2DRuntime } from '../live2d/Live2DRuntime';
import { loadLive2DConfig, resolveTriggerMapping, type Live2DConfig } from '../live2d/live2d-config';
import { useSpriteState } from '../context/hooks';
import { getCurrentRMS } from '@/lib/audio/lip-sync-source';
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

  // lip-sync rAF 循环
  useEffect(() => {
    if (!runtimeReady) return;

    const paramId = config?.lipSync?.paramId ?? 'ParamA';
    const gain = config?.lipSync?.gain ?? 2.0;
    let rafId = 0;

    const tick = (): void => {
      const rms = getCurrentRMS();
      if (rms > 0.001) {
        const manager = LAppLive2DManager.getInstance();
        const model = manager?.getModel(0);
        if (model) {
          try {
            model.getModel().addParameterValueById(paramId, rms * gain, 4.0);
          } catch {
            // 参数不存在时静默忽略
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [runtimeReady, config]);

  // 视线追踪：将鼠标位置映射到 Live2D 视图坐标
  useEffect(() => {
    if (!runtimeReady || !config?.lookAt?.enabled) return;

    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent): void => {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      // 将鼠标位置映射到 [-1, 1] 视图坐标
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1); // Y 轴翻转

      const manager = LAppLive2DManager.getInstance();
      const model = manager?.getModel(0);
      if (model) {
        try {
          model.setDragging(x, y);
        } catch {
          // ignore
        }
      }
    };

    const handleMouseLeave = (): void => {
      const manager = LAppLive2DManager.getInstance();
      const model = manager?.getModel(0);
      if (model) {
        try {
          model.setDragging(0, 0);
        } catch {
          // ignore
        }
      }
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [runtimeReady, config]);

  // 点击反馈：hit area 检测
  const handleClick = (e: React.MouseEvent): void => {
    if (!runtimeReady) return;

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

    const manager = LAppLive2DManager.getInstance();
    const model = manager?.getModel(0);
    if (!model) return;

    try {
      if (model.hitTest(LAppDefine.HitAreaNameHead, x, y)) {
        model.setRandomExpression();
      } else if (model.hitTest(LAppDefine.HitAreaNameBody, x, y)) {
        model.startRandomMotion(LAppDefine.MotionGroupTapBody, LAppDefine.PriorityNormal);
      }
    } catch {
      // ignore
    }
  };

  // walkDirection 翻转
  const shouldFlip = walkDirection === 'right';

  const w = width ?? config?.canvas.width ?? 300;
  const h = height ?? config?.canvas.height ?? 400;

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
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

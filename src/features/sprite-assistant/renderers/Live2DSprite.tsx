import { isBubbleWindowMode } from '@packages/sprite-core/types';
import { useEffect, useRef, useState } from 'react';

import { getCurrentRMS } from '@/lib/audio/lip-sync-source';
import { InvalidMotionQueueEntryHandleValue } from '@/live2d-sdk/Framework/src/motion/cubismmotionqueuemanager';
import * as LAppDefine from '@/live2d-sdk/src/lappdefine';
import { LAppLive2DManager } from '@/live2d-sdk/src/lapplive2dmanager';

import { useSpriteState } from '../context/hooks';
import { type Live2DConfig, loadLive2DConfig, resolveTriggerMapping } from '../live2d/live2d-config';
import { destroyLive2DRuntime, initLive2DRuntime } from '../live2d/Live2DRuntime';
import { alignMainWindowToBottomRight } from '../utils/positioning';

const CANVAS_ID = 'live2d-assistant-canvas';
const MODEL_BASE_URL = 'res://local/sprites/live2d/';
/** 默认模型目录名;激活角色包可通过 pack.json 的 assets.live2d 指定其他模型(约定 model3.json 文件名与目录同名) */
// 现阶段默认使用官方示例模型 mao_pro,chii 模型待后续升级后再作为默认
const DEFAULT_MODEL_DIR_NAME = 'mao_pro';

// live2d.json 放在模型根目录（与 index.json 同级），而不是 runtime/ 子目录
function resolveModelDirName(pack: { assets?: { live2d?: string } } | null | undefined): string {
  const dir = pack?.assets?.live2d?.trim();
  return dir || DEFAULT_MODEL_DIR_NAME;
}

/** 当前正在播放的 live2d 动画记录，用于 loop 重播与完成上报 */
interface ActiveLive2DPlayback {
  animationId: string;
  playId?: string;
  trigger: string;
  loop: boolean;
  motionGroup: string;
  motionIndex: number;
}

/** 上报动画完成（phase 固定 'full'，主进程只处理 full/outro）；所有失败路径也走这里兜底，主进程不能干等 */
function reportAnimComplete(animationId: string, playId?: string): void {
  if (playId) {
    window.YUA.sprite.animComplete(animationId, 'full', playId);
  } else {
    window.YUA.sprite.animComplete(animationId, 'full');
  }
}

export default function Live2DSprite({ width, height, walkDirection }: { width?: number; height?: number; walkDirection?: 'left' | 'right' | null }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { currentAnimation, spriteConfig } = useSpriteState();
  const [config, setConfig] = useState<Live2DConfig | null>(null);
  const [runtimeReady, setRuntimeReady] = useState(false);
  // 当前 Live2D 模型目录名（由激活角色包的 assets.live2d 决定，null 表示尚未解析）
  const [modelDirName, setModelDirName] = useState<string | null>(null);
  // live2d.json 已加载(可能为 null 配置)并提交 DOM 的模型目录;用于把 SDK init 推迟到画布尺寸生效之后
  const [configReadyFor, setConfigReadyFor] = useState<string | null>(null);
  const activePlaybackRef = useRef<ActiveLive2DPlayback | null>(null);
  // 右下角对齐只做一次（初始化后），避免动画切换时把用户拖走的窗口抢回来
  const hasAlignedToBottomRightRef = useRef(false);
  // boot effect 只跑一次，通过 ref 读取最新的气泡模式
  const spriteConfigRef = useRef(spriteConfig);
  useEffect(() => {
    spriteConfigRef.current = spriteConfig;
  }, [spriteConfig]);

  // 启动时按激活角色包解析模型目录
  useEffect(() => {
    let mounted = true;
    window.YUA.persona
      .getActiveCharacterPack()
      .then((pack) => {
        if (mounted) setModelDirName(resolveModelDirName(pack));
      })
      .catch((e) => {
        console.warn('[Live2DSprite] getActiveCharacterPack failed, fallback to default model', e);
        if (mounted) setModelDirName(DEFAULT_MODEL_DIR_NAME);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // 角色包切换时切换模型（目录相同则不动）
  useEffect(() => {
    const unsubscribe = window.YUA.persona.onCharacterSwitched((payload) => {
      const dir = resolveModelDirName(payload.nextPack);
      setModelDirName((prev) => (prev === dir ? prev : dir));
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // 初始化运行时与配置（模型目录变化时重建）
  // 拆成两步：先加载 live2d.json 并让 React 把新画布尺寸提交到 DOM，
  // 再初始化 SDK —— SDK 的 _resizeCanvas 读 canvas.clientWidth/Height,
  // 如果 init 早于 DOM 提交,WebGL backing store 会沿用上一个模型的尺寸,模型被压扁/拉伸
  useEffect(() => {
    if (!modelDirName) return;

    let mounted = true;
    // 换模型后允许重新做一次右下角对齐
    hasAlignedToBottomRightRef.current = false;

    destroyLive2DRuntime();
    setRuntimeReady(false);
    setConfig(null);
    activePlaybackRef.current = null;

    const loadConfig = async (): Promise<void> => {
      const loadedConfig = await loadLive2DConfig(`${MODEL_BASE_URL}${modelDirName}/`);
      if (!mounted) return;
      setConfig(loadedConfig);
      // 标记配置已就绪(可能为 null),init 在下一个 effect 中等 DOM 提交后执行
      setConfigReadyFor(modelDirName);

      // 校正主窗口尺寸以匹配 Live2D 画布
      if (loadedConfig) {
        try {
          // 独立窗口气泡模式下运行期 padding 强制为 0（与主进程 getEffectivePadding 口径一致）
          const padding = isBubbleWindowMode(spriteConfigRef.current.bubbleMode) ? 0 : loadedConfig.canvas.padding;
          const result = await window.YUA.window.setAssistantSize({
            width: loadedConfig.canvas.width,
            height: loadedConfig.canvas.height,
            padding
          });
          // 主进程 setSize 以左上角为锚，会破坏更早的右下角定位，这里补齐一次
          if (result?.success && !hasAlignedToBottomRightRef.current) {
            hasAlignedToBottomRightRef.current = true;
            await alignMainWindowToBottomRight(loadedConfig.canvas.width + padding * 2, loadedConfig.canvas.height + padding * 2);
          }
        } catch (e) {
          console.warn('[Live2DSprite] setAssistantSize failed', e);
        }
      }
    };

    void loadConfig();

    return () => {
      mounted = false;
    };
  }, [modelDirName]);

  // 配置提交到 DOM 后再初始化运行时（effect 在 DOM commit 后执行,此时 canvas.clientWidth 已是新画布尺寸）
  useEffect(() => {
    if (!modelDirName || configReadyFor !== modelDirName) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let mounted = true;

    const boot = async (): Promise<void> => {
      try {
        await initLive2DRuntime({
          canvasId: CANVAS_ID,
          model: {
            resourcesBaseUrl: MODEL_BASE_URL,
            modelDir: `${modelDirName}/runtime`,
            modelFileName: modelDirName
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
  }, [modelDirName, configReadyFor]);

  // 根据 currentAnimation 播放 motion / expression
  useEffect(() => {
    if (!runtimeReady || !currentAnimation) return;

    const trigger = currentAnimation.trigger ?? 'idle';

    // 同一指令(同 animationId + playId)只处理一次:
    // 去重必须放在所有上报路径之前,否则主进程因兜底上报重发同一指令时会形成回环风暴
    const prev = activePlaybackRef.current;
    if (prev && prev.animationId === currentAnimation.animationId && prev.playId === currentAnimation.playId) {
      return;
    }

    const mapping = resolveTriggerMapping(config, trigger);
    if (!mapping?.motion) {
      // 没有映射时回退到 idle（SDK 会自动处理 idle 循环）,留占位记录去重,并兜底上报完成一次
      activePlaybackRef.current = {
        animationId: currentAnimation.animationId,
        playId: currentAnimation.playId,
        trigger,
        loop: true,
        motionGroup: '',
        motionIndex: -1
      };
      reportAnimComplete(currentAnimation.animationId, currentAnimation.playId);
      return;
    }

    const manager = LAppLive2DManager.getInstance();
    const model = manager?.getModel(0);
    if (!model) return;

    const { group, index } = mapping.motion;
    const loop = mapping.loop === true;

    const record: ActiveLive2DPlayback = {
      animationId: currentAnimation.animationId,
      playId: currentAnimation.playId,
      trigger,
      loop,
      motionGroup: group,
      motionIndex: index
    };
    activePlaybackRef.current = record;

    // 播放表情
    if (mapping.expression) {
      try {
        model.setExpression(mapping.expression);
      } catch (e) {
        console.warn('[Live2DSprite] setExpression failed', mapping.expression, e);
      }
    }

    // 播放动作（loop 与非 loop 同一入口；非 loop 注册完成回调）
    const { animationId, playId } = currentAnimation;
    const onFinished = loop
      ? undefined
      : (): void => {
          // 闭包捕获本次的 animationId/playId：记录仍属于自己时才清除；
          // 即使已被新动画顶替，也只上报自己的完成而不动 ref（避免张冠李戴）
          if (activePlaybackRef.current === record) {
            activePlaybackRef.current = null;
          }
          reportAnimComplete(animationId, playId);
        };

    // startMotion 被框架拒绝（同优先级占用、资源缺失）时返回无效句柄而不抛错，需要检查返回值
    const failAndReport = (e?: unknown): void => {
      if (e) {
        console.warn('[Live2DSprite] startMotion failed', { group, index, trigger }, e);
      } else {
        console.warn('[Live2DSprite] startMotion refused', { group, index, trigger });
      }
      if (loop) {
        // loop 动画没有"完成"语义：被拒绝通常是同优先级的它自己还在播。
        // 保留记录用于去重且不上报,否则主进程会把完成上报当成重发信号,形成回环风暴
        return;
      }
      if (activePlaybackRef.current === record) {
        activePlaybackRef.current = null;
      }
      reportAnimComplete(animationId, playId);
    };

    try {
      // 只有 idle 用 PriorityIdle,其余(loop 的 talk/walk、一次性动画)都用 PriorityNormal:
      // SDK 在队列空闲时会以 PriorityIdle 自动播 idle(lappmodel.update),
      // 若 loop 动画也用 PriorityIdle 会被自动 idle 同优先级拒绝,说话时 talk 播不出来;
      // 而 idle 用 Normal 又会反过来挡住一次性动画(welcome/wave 播不出来)
      const priority = trigger === 'idle' ? LAppDefine.PriorityIdle : LAppDefine.PriorityNormal;
      const handle = model.startMotion(group, index, priority, onFinished);
      if (handle === InvalidMotionQueueEntryHandleValue) {
        failAndReport();
      }
    } catch (e) {
      failAndReport(e);
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

  // live2d 模式下画布尺寸以 live2d.json 配置为准（与 setAssistantSize 同源），外部传入的 width/height 仅作加载前兜底
  const shouldFlip = walkDirection === 'right';

  const w = config?.canvas.width ?? width ?? 300;
  const h = config?.canvas.height ?? height ?? 400;

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

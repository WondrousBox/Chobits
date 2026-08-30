/**
 * Live2DRuntime —— vendored Cubism WebSDK（src/live2d-sdk）的正式 TS 边界。
 *
 * 只暴露三件事：
 * 1. 初始化：加载 live2dcubismcore 脚本 + 在指定 canvas 上准备 WebGL 上下文；
 * 2. 加载模型：给模型目录 URL（res:// 协议），SDK 内部用 fetch/Image 拼接相对路径加载；
 * 3. 销毁：释放 delegate / manager / framework，停止 rAF 渲染循环。
 *
 * P0 阶段不接 trigger / motion / lip-sync，相关入口见文件末尾注释。
 */
import coreScriptUrl from '@/live2d-sdk/Core/live2dcubismcore.min.js?url';
import { updateModelConfig } from '@/live2d-sdk/src/lappdefine';
import { LAppDelegate } from '@/live2d-sdk/src/lappdelegate';
import { LAppGlManager } from '@/live2d-sdk/src/lappglmanager';
import { LAppLive2DManager } from '@/live2d-sdk/src/lapplive2dmanager';

export interface Live2DModelTarget {
  /** 模型资源根 URL（res:// 协议，结尾带 /），SDK 会在其后拼接 modelDir 与相对资源路径 */
  resourcesBaseUrl: string;
  /** 模型目录（相对 resourcesBaseUrl），如 'mao_pro/runtime' */
  modelDir: string;
  /** model3.json 文件名（不含扩展名），如 'mao_pro' */
  modelFileName: string;
}

export interface Live2DRuntimeOptions {
  /** 渲染用 canvas 的 DOM id（WebSDK 通过 getElementById 查找） */
  canvasId: string;
  model: Live2DModelTarget;
  /** 等待模型加载就绪的超时时间（ms），超时只告警不 reject */
  readyTimeoutMs?: number;
}

const DEFAULT_READY_TIMEOUT_MS = 15000;

let coreScriptPromise: Promise<void> | null = null;

/**
 * 通过 <script> 标签加载 live2dcubismcore（UMD，挂载全局 Live2DCubismCore）。
 * 只加载一次；Framework 依赖该全局变量，必须先于 SDK 初始化完成。
 */
export function loadCubismCore(): Promise<void> {
  if ((window as unknown as { Live2DCubismCore?: unknown }).Live2DCubismCore) {
    return Promise.resolve();
  }
  if (!coreScriptPromise) {
    coreScriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = coreScriptUrl;
      script.onload = () => {
        console.info('[Live2D] Cubism Core script loaded');
        resolve();
      };
      script.onerror = () => {
        coreScriptPromise = null;
        reject(new Error(`[Live2D] failed to load Cubism Core script: ${coreScriptUrl}`));
      };
      document.head.appendChild(script);
    });
  }
  return coreScriptPromise;
}

/**
 * 初始化运行时并加载模型。可重复调用（会先销毁旧实例），React StrictMode 双调用安全。
 */
export async function initLive2DRuntime(options: Live2DRuntimeOptions): Promise<void> {
  const { canvasId, model, readyTimeoutMs = DEFAULT_READY_TIMEOUT_MS } = options;

  await loadCubismCore();

  // 重复初始化前先释放旧实例（StrictMode / 热更新场景）
  destroyLive2DRuntime();

  LAppGlManager.canvasId = canvasId;

  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    throw new Error(`[Live2D] canvas #${canvasId} not found in DOM`);
  }

  // WebSDK 在初始化 manager 时（changeScene）就会按此配置异步拉取 model3.json
  updateModelConfig(model.resourcesBaseUrl, model.modelDir, model.modelFileName);

  LAppGlManager.getInstance();
  const delegate = LAppDelegate.getInstance();
  if (!delegate.initialize()) {
    throw new Error('[Live2D] LAppDelegate.initialize() failed');
  }
  delegate.run();

  console.info('[Live2D] runtime initialized', {
    canvasId,
    modelUrl: `${model.resourcesBaseUrl}${model.modelDir}/${model.modelFileName}.model3.json`
  });

  await waitForModelReady(readyTimeoutMs);
}

/**
 * 销毁运行时：停止渲染循环并释放模型 / 纹理 / Framework。
 * 幂等；内部吞掉 SDK 释放路径上的非致命异常。
 */
export function destroyLive2DRuntime(): void {
  try {
    LAppDelegate.releaseInstance();
  } catch (e) {
    console.warn('[Live2D] error while releasing LAppDelegate', e);
  }
  try {
    LAppGlManager.releaseInstance();
  } catch (e) {
    console.warn('[Live2D] error while releasing LAppGlManager', e);
  }
}

/** 轮询等待首个模型完成加载（LoadStep 全部走完）。超时仅告警，不阻断渲染循环。 */
function waitForModelReady(timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const timer = window.setInterval(() => {
      const manager = LAppLive2DManager.getInstance();
      const model = manager?.getModel(0);
      if (model && model.isInitialized()) {
        window.clearInterval(timer);
        console.info(`[Live2D] model ready in ${Date.now() - startedAt}ms`);
        resolve();
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        window.clearInterval(timer);
        console.warn(`[Live2D] model not ready after ${timeoutMs}ms (continuing anyway)`);
        resolve();
      }
    }, 100);
  });
}

/*
 * P1 参考（vendored SDK 内已有的能力入口）：
 * - 触发动作：LAppLive2DManager.getInstance().getModel(0).startMotion(group, index, priority)
 *   / startRandomMotion(group, priority)；group 对应 model3.json 的 Motions 键
 *   （mao_pro: 'Idle' 与 ''，priority 用 lappdefine 的 PriorityNormal/PriorityForce）。
 * - 点击命中触发表情/动作：model.startTapMotion(hitAreaName, tapMotions)（lappmodel.ts）。
 * - 表情：model.setExpression(name) / setRandomExpression()，名称来自 model3.json Expressions。
 * - lip-sync：lappmodel.update() 里读取 this._wavFileHandler.getRms() 写入
 *   ParamMouthOpenY（_lipSyncIds）；model._wavFileHandler.start(audioUrl) 启动采样，
 *   或直接在 update 链路向 _lipSyncIds 对应参数写值。
 */

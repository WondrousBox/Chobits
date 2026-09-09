import coreScriptUrl from '@/live2d-sdk/Core/live2dcubismcore.min.js?url';
import { updateModelConfig } from '@/live2d-sdk/src/lappdefine';
import { LAppDelegate } from '@/live2d-sdk/src/lappdelegate';
import { LAppGlManager } from '@/live2d-sdk/src/lappglmanager';
import { LAppLive2DManager } from '@/live2d-sdk/src/lapplive2dmanager';

export interface Live2DModelTarget {
  resourcesBaseUrl: string;
  modelDir: string;
  modelFileName: string;
}

export interface Live2DRuntimeOptions {
  canvasId: string;
  model: Live2DModelTarget;
  scale?: number;
  readyTimeoutMs?: number;
}

const DEFAULT_READY_TIMEOUT_MS = 15_000;
let runtimeGeneration = 0;
let coreScriptPromise: Promise<void> | null = null;
let runtimeActive = false;

export function loadCubismCore(): Promise<void> {
  if ((window as unknown as { Live2DCubismCore?: unknown }).Live2DCubismCore) return Promise.resolve();

  if (!coreScriptPromise) {
    coreScriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = coreScriptUrl;
      script.onload = () => resolve();
      script.onerror = () => {
        coreScriptPromise = null;
        reject(new Error(`Failed to load Cubism Core: ${coreScriptUrl}`));
      };
      document.head.appendChild(script);
    });
  }
  return coreScriptPromise;
}

export async function initLive2DRuntime(options: Live2DRuntimeOptions): Promise<void> {
  const { canvasId, model, scale, readyTimeoutMs = DEFAULT_READY_TIMEOUT_MS } = options;
  await loadCubismCore();
  destroyLive2DRuntime();
  const generation = ++runtimeGeneration;

  LAppGlManager.canvasId = canvasId;
  if (!document.getElementById(canvasId)) throw new Error(`Live2D canvas #${canvasId} was not found`);

  updateModelConfig(model.resourcesBaseUrl, model.modelDir, model.modelFileName, scale);
  LAppGlManager.getInstance();
  const delegate = LAppDelegate.getInstance();
  if (!delegate.initialize()) throw new Error('LAppDelegate.initialize() failed');
  delegate.run();
  runtimeActive = true;

  await waitForModelReady(readyTimeoutMs, generation);
}

export function resizeLive2DRuntime(): void {
  if (!runtimeActive) return;
  try {
    LAppDelegate.getInstance().onResize();
  } catch (error) {
    console.warn('[SpriteLive2D] Failed to resize runtime', error);
  }
}

export function destroyLive2DRuntime(): void {
  runtimeGeneration += 1;
  runtimeActive = false;
  try {
    LAppDelegate.releaseInstance();
  } catch (error) {
    console.warn('[SpriteLive2D] Failed to release delegate', error);
  }
  try {
    LAppGlManager.releaseInstance();
  } catch (error) {
    console.warn('[SpriteLive2D] Failed to release WebGL manager', error);
  }
}

function waitForModelReady(timeoutMs: number, generation: number): Promise<void> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const timer = window.setInterval(() => {
      if (generation !== runtimeGeneration) {
        window.clearInterval(timer);
        resolve();
        return;
      }
      const model = LAppLive2DManager.getInstanceIfExists()?.getModel(0);
      if (model?.isInitialized()) {
        window.clearInterval(timer);
        resolve();
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        window.clearInterval(timer);
        console.warn(`[SpriteLive2D] Model was not ready after ${timeoutMs}ms`);
        resolve();
      }
    }, 100);
  });
}

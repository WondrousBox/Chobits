import { PluginDefinition } from '@packages/plugins/types';

import { ASRType, createASRInstance, freeASRInstance, sendASRData } from './asr-instance-manager';
import { CommonConfig, FORCE_ONLINE_MODELS, SherpaModel, StreamInstances, TTSInstances } from './common';
import { getDefaultSherpaModels } from './model';
import { createTTSInstance, CreateTTSInstanceOptions, destroyTTSInstance, generateSpeech, GenerateSpeechOptions } from './tts-instance-manager';

let openedModel: PluginDefinition | undefined;

// 存活实例登记：create* 时登记、destroy* 时移除。
// 供 destroyAllSherpaProcesses 在主进程退出（will-quit）时遍历强杀 fork 子进程，
// 避免 ASR/TTS 子进程孤儿化常驻（单个常驻可达几百 MB）。
const liveASRInstances = new Map<string, StreamInstances[string]>();
const liveTTSInstances = new Map<string, TTSInstances[string]>();

/**
 * 销毁全部 sherpa ASR/TTS 子进程。
 * 先走 graceful stop（子进程收到 'stop' 事件后自行 process.exit），
 * 再调用 ChildProcessManager.stop() 兜底 SIGTERM 强杀，两条路径均做了异常兜底。
 */
export function destroyAllSherpaProcesses(): void {
  for (const [uuid, instance] of liveASRInstances) {
    try {
      freeASRInstance(uuid);
    } catch {
      /* noop */
    }
    try {
      instance?.process?.stop();
    } catch {
      /* noop */
    }
  }
  liveASRInstances.clear();
  for (const [uuid, instance] of liveTTSInstances) {
    try {
      destroyTTSInstance(uuid);
    } catch {
      /* noop */
    }
    try {
      instance?.process?.stop();
    } catch {
      /* noop */
    }
  }
  liveTTSInstances.clear();
}

export async function ASR_createInstance(data: {
  uuid: string;
  model?: SherpaModel;
  type?: ASRType;
  punctuationModel?: string;
  language?: string;
  commonConfig?: CommonConfig;
  vad?: {
    threshold?: number;
    minSpeechDuration?: number;
    minSilenceDuration?: number;
    windowSize?: number;
  };
}): Promise<StreamInstances[string]> {
  console.log(
    data,
    `
====== [ASR] ===================================================================
ASR_createInstance: ${JSON.stringify(data, null, 2)}
================================================================================`
  );
  let type = data.type;
  if (!type && data.model) {
    // 检查是否在强制使用 online 模式的模型列表中
    const isForceOnline = FORCE_ONLINE_MODELS.includes(data.model as SherpaModel);
    // 如果模型名称包含 'streaming' 或在强制列表中，使用 online 模式
    type = data.model.includes('streaming') || isForceOnline ? 'online' : 'offline';
  }

  if (type !== 'vad') {
    const models = await getDefaultSherpaModels();

    const model = models.find((m) => m.id === data.model);

    if (!model) {
      throw new Error(`Model ${data.model} not found`);
    }
    openedModel = model;
    console.log('openedModel', openedModel);
  }

  const instance = await createASRInstance({
    ...data,
    type: type as ASRType
  });
  if (instance) liveASRInstances.set(data.uuid, instance);
  return instance;
}

export function ASR_sendData(
  data: {
    uuid: string;
  },
  array: Float32Array
): void {
  return sendASRData(data.uuid, array);
}

export function ASR_destroyInstance(data: { uuid: string }): void {
  liveASRInstances.delete(data.uuid);
  return freeASRInstance(data.uuid);
}

// ==================== TTS 相关函数 ====================

export async function TTS_createInstance(data: CreateTTSInstanceOptions): Promise<TTSInstances[string]> {
  console.log(
    data,
    `
====== [TTS] ===================================================================
TTS_createInstance: ${JSON.stringify(data, null, 2)}
================================================================================`
  );

  const instance = await createTTSInstance(data);
  if (instance) liveTTSInstances.set(data.uuid, instance);
  return instance;
}

export function TTS_generateSpeech(options: GenerateSpeechOptions): void {
  return generateSpeech(options);
}

export function TTS_destroyInstance(data: { uuid: string }): void {
  liveTTSInstances.delete(data.uuid);
  return destroyTTSInstance(data.uuid);
}

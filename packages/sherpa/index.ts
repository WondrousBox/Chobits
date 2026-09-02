import { PluginDefinition } from '@packages/plugins/types';

import { ASRType, createASRInstance, freeASRInstance, sendASRData } from './asr-instance-manager';
import { CommonConfig, FORCE_ONLINE_MODELS, SherpaModel, StreamInstances, TTSInstances } from './common';
import { getDefaultSherpaModels } from './model';
import { createTTSInstance, CreateTTSInstanceOptions, destroyTTSInstance, generateSpeech, GenerateSpeechOptions, TTSResult } from './tts-instance-manager';

let openedModel: PluginDefinition | undefined;
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

  return createASRInstance({
    ...data,
    type: type as ASRType
  });
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

  return createTTSInstance(data);
}

export function TTS_generateSpeech(options: GenerateSpeechOptions): void {
  return generateSpeech(options);
}

export function TTS_destroyInstance(data: { uuid: string }): void {
  return destroyTTSInstance(data.uuid);
}

// 导出类型
export type { CreateTTSInstanceOptions, GenerateSpeechOptions, TTSResult };

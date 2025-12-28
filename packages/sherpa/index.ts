import { PluginDefinition } from '@packages/plugins/types';

import { createASRInstance, freeASRInstance, sendASRData } from './asr-instance-manager';
import { AllModels, StreamInstances } from './common';
import { getDefaultSherpaModels } from './model';

let openedModel: PluginDefinition | undefined;
export async function ASR_createInstance(data: {
  uuid: string;
  model?: AllModels;
  type?: 'online' | 'offline' | 'vad';
  punctuationModel?: string;
  language?: string;
  vad?: {
    threshold?: number;
    minSpeechDuration?: number;
    minSilenceDuration?: number;
    windowSize?: number;
  };
}): Promise<StreamInstances[string]> {
  let type = data.type;
  if (!type && data.model) {
    type = data.model.includes('streaming') ? 'online' : 'offline';
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
    type: type as any
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

export function ASR_freeInstance(data: { uuid: string }): void {
  return freeASRInstance(data.uuid);
}

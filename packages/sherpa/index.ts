import { PluginDefinition } from '@packages/plugins/types';

import { AllModels, StreamInstances } from './common';
import { createInstance as createInstanceOffline, freeInstance as freeInstanceOffline, getInstance as getInstanceOffline, sendData as sendDataOffline } from './index-offline';
import { createInstance as createInstanceOnline, freeInstance as freeInstanceOnline, getInstance as getInstanceOnline, sendData as sendDataOnline } from './index-online';
import { getDefaultSherpaModels } from './model';

let openedModel: PluginDefinition | undefined;
export async function ASR_createInstance(data: { uuid: string; model: AllModels; punctuationModel?: string; language?: string }): Promise<StreamInstances[string]> {
  const models = await getDefaultSherpaModels();

  const model = models.find((m) => m.id === data.model);

  if (!model) {
    throw new Error(`Model ${data.model} not found`);
  }
  openedModel = model;
  console.log('openedModel', openedModel);

  if (data.model.includes('streaming')) {
    return createInstanceOnline(data);
  } else {
    return createInstanceOffline(data);
  }
}

export function ASR_sendData(
  data: {
    uuid: string;
  },
  array: Float32Array
): void {
  if (getInstanceOnline(data.uuid)) {
    return sendDataOnline(data.uuid, array);
  } else if (getInstanceOffline(data.uuid)) {
    return sendDataOffline(data.uuid, array);
  }
}

export function ASR_freeInstance(data: { uuid: string }): void {
  if (getInstanceOnline(data.uuid)) {
    return freeInstanceOnline(data.uuid);
  } else if (getInstanceOffline(data.uuid)) {
    return freeInstanceOffline(data.uuid);
  }
}

import { PluginDefinition } from '@packages/plugins/types';

import { AllModels, StreamInstances } from './common';
import { createInstance as createInstanceOnline, freeInstance as freeInstanceOnline, sendData as sendDataOnline } from './index-online';
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
  return createInstanceOnline(data);
}

export function ASR_sendData(
  data: {
    uuid: string;
  },
  array: Float32Array
): void {
  return sendDataOnline(data.uuid, array);
}

export function ASR_freeInstance(data: { uuid: string }): void {
  return freeInstanceOnline(data.uuid);
}

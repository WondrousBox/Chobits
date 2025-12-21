import { AllModels, StreamInstances } from './common';
import { createInstance as createInstanceOnline, freeInstance as freeInstanceOnline, sendData as sendDataOnline } from './index-online';
import { getDefaultSherpaModels, ModelType } from './model';

let openedModel: ModelType | undefined;
export function ASR_createInstance(data: { uuid: string; model: AllModels; punctuationModel?: string; language?: string }): Promise<StreamInstances[string]> {
  const models = getDefaultSherpaModels();

  const model = models.find((m) => m.value === data.model);

  if (!model) {
    // @ts-ignore
    return;
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

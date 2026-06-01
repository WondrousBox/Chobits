import { ipcRenderer } from 'electron';

import type { SelectedTextLearningConfig, SelectedTextLearningConfigPatch, SelectedTextLearningRunResult, SelectedTextLearningStatus } from './types';

export type SelectedTextLearningBridgeType = {
  getConfig: () => Promise<SelectedTextLearningConfig>;
  setConfig: (patch: SelectedTextLearningConfigPatch) => Promise<{ config: SelectedTextLearningConfig; ok: boolean; status: SelectedTextLearningStatus }>;
  getStatus: () => Promise<SelectedTextLearningStatus>;
  testReadSelection: () => Promise<SelectedTextLearningRunResult>;
  triggerNow: () => Promise<SelectedTextLearningRunResult>;
  openLatestOverlay: () => Promise<boolean>;
};

export const selectedTextLearningBridge: SelectedTextLearningBridgeType = {
  getConfig: () => ipcRenderer.invoke('selectedTextLearning:getConfig'),
  setConfig: (patch) => ipcRenderer.invoke('selectedTextLearning:setConfig', patch),
  getStatus: () => ipcRenderer.invoke('selectedTextLearning:getStatus'),
  testReadSelection: () => ipcRenderer.invoke('selectedTextLearning:testReadSelection'),
  triggerNow: () => ipcRenderer.invoke('selectedTextLearning:triggerNow'),
  openLatestOverlay: () => ipcRenderer.invoke('selectedTextLearning:openLatestOverlay')
};

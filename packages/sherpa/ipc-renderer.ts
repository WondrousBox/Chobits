import { ipcRenderer } from 'electron';

import { AllModels } from './common';

export const sherpaIpcRenderer = {
  createInstance(data: { model: AllModels; punctuationModel?: string; language?: string }): Promise<boolean> {
    return ipcRenderer.invoke('sherpa:createInstance', data);
  },

  freeInstance(): Promise<boolean> {
    return ipcRenderer.invoke('sherpa:freeInstance');
  },

  sendData(data: {
    uuid: string;
    workspaceId?: string;
    folderId?: string;
    data: Float32Array;
    save?: boolean;
    tracks?: [
      {
        format: 'srt';
        language: 'zh_cn';
        content: string;
      }
    ];
  }): Promise<boolean> {
    return ipcRenderer.invoke('sherpa:sendData', data);
  }
};

export type SherpaIpcRendererType = typeof sherpaIpcRenderer;

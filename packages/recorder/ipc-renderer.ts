import { ipcRenderer } from 'electron';

export type RecorderConfig = {
  enabled?: boolean;
};

export const recorderIpcRenderer = {
  async start(port?: number): Promise<boolean> {
    return ipcRenderer.invoke('recorder:start', port);
  },

  async stop(): Promise<boolean> {
    return ipcRenderer.invoke('recorder:stop');
  },

  async getStatus(): Promise<boolean> {
    return ipcRenderer.invoke('recorder:status');
  },

  async getConfig(): Promise<RecorderConfig> {
    return ipcRenderer.invoke('recorder:getConfig');
  },

  async updateConfig(partial: Partial<RecorderConfig>): Promise<RecorderConfig> {
    return ipcRenderer.invoke('recorder:updateConfig', partial);
  }
};

export type RecorderIpcRendererType = typeof recorderIpcRenderer;

import { ipcRenderer } from 'electron';

export const recorderIpcRenderer = {
  async start(port?: number): Promise<boolean> {
    return ipcRenderer.invoke('recorder:start', port);
  },

  async stop(): Promise<boolean> {
    return ipcRenderer.invoke('recorder:stop');
  },

  async getStatus(): Promise<boolean> {
    return ipcRenderer.invoke('recorder:status');
  }
};

export type RecorderIpcRendererType = typeof recorderIpcRenderer;

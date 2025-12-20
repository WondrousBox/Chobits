import { ipcRenderer } from 'electron';

export const recorderIpcRenderer = {
  async start(port?: number): Promise<boolean> {
    return ipcRenderer.invoke('recorder:start', port);
  },

  async stop(): Promise<boolean> {
    return ipcRenderer.invoke('recorder:stop');
  }
};

export type RecorderIpcRendererType = typeof recorderIpcRenderer;

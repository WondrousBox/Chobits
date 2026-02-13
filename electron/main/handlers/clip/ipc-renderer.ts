import type { IpcRenderer } from 'electron';

import type { ClipData } from './ipc-main';

export interface ClipIpcRenderer {
  load: (resourceId: string) => Promise<ClipData | null>;
  save: (resourceId: string, clips: any[]) => Promise<{ success: boolean; error?: string }>;
  delete: (resourceId: string) => Promise<{ success: boolean }>;
}

export function createClipIpcRenderer(ipcRenderer: IpcRenderer): ClipIpcRenderer {
  return {
    load: (resourceId: string) => ipcRenderer.invoke('clip:load', { resourceId }),
    save: (resourceId: string, clips: any[]) => ipcRenderer.invoke('clip:save', { resourceId, clips }),
    delete: (resourceId: string) => ipcRenderer.invoke('clip:delete', { resourceId })
  };
}

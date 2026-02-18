import type { IpcRenderer } from 'electron';

import type { AnnotationData, AnnotationItem } from './ipc-main';

export interface AnnotationIpcRenderer {
  load: (resourceId: string) => Promise<AnnotationData | null>;
  save: (resourceId: string, annotations: AnnotationItem[]) => Promise<{ success: boolean; error?: string }>;
  delete: (resourceId: string) => Promise<{ success: boolean }>;
}

export function createAnnotationIpcRenderer(ipcRenderer: IpcRenderer): AnnotationIpcRenderer {
  return {
    load: (resourceId: string) => ipcRenderer.invoke('annotation:load', { resourceId }),
    save: (resourceId: string, annotations: AnnotationItem[]) => ipcRenderer.invoke('annotation:save', { resourceId, annotations }),
    delete: (resourceId: string) => ipcRenderer.invoke('annotation:delete', { resourceId })
  };
}

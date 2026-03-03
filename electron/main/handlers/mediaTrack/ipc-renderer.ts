import type { IpcRenderer } from 'electron';

import type { MediaSource, MediaTrackData, MediaTrackDataStorage } from './ipc-main';

export interface MediaTrackIpcRenderer {
  /** 加载媒体轨道数据 */
  load: (resourceId: string) => Promise<MediaTrackDataStorage | null>;
  /** 保存媒体轨道数据 */
  save: (resourceId: string, data: { tracks: MediaTrackData[]; sources: Record<string, MediaSource> }) => Promise<{ success: boolean; error?: string }>;
  /** 删除媒体轨道数据 */
  delete: (resourceId: string) => Promise<{ success: boolean }>;
}

export function createMediaTrackIpcRenderer(ipcRenderer: IpcRenderer): MediaTrackIpcRenderer {
  return {
    load: (resourceId: string) => ipcRenderer.invoke('mediaTrack:load', { resourceId }),
    save: (resourceId: string, data) =>
      ipcRenderer.invoke('mediaTrack:save', {
        resourceId,
        tracks: data.tracks,
        sources: data.sources
      }),
    delete: (resourceId: string) => ipcRenderer.invoke('mediaTrack:delete', { resourceId })
  };
}

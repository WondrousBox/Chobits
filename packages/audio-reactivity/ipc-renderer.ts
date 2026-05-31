import { ipcRenderer } from 'electron';

import {
  MUSIC_REACTIVITY_SNAPSHOT_CHANNEL,
  MUSIC_REACTIVITY_SPECTRUM_FRAME_CHANNEL,
  type MusicReactivityAnalysisInput,
  type MusicReactivityPreferences,
  type MusicReactivitySnapshot,
  type MusicReactivitySpectrumFrame
} from './types';

export type MusicReactivityResult<T> = Promise<{ ok: boolean; error?: string } & T>;

export type MusicReactivityIpcRendererType = typeof musicReactivityIpcRenderer;

export const musicReactivityIpcRenderer = {
  getPreferences: async (): MusicReactivityResult<{ preferences?: MusicReactivityPreferences }> => {
    return await ipcRenderer.invoke('music-reactivity:getPreferences');
  },

  updatePreferences: async (preferences: Partial<MusicReactivityPreferences>): MusicReactivityResult<{ preferences?: MusicReactivityPreferences; snapshot?: MusicReactivitySnapshot }> => {
    return await ipcRenderer.invoke('music-reactivity:updatePreferences', { preferences });
  },

  getSnapshot: async (): MusicReactivityResult<{ snapshot?: MusicReactivitySnapshot }> => {
    return await ipcRenderer.invoke('music-reactivity:getSnapshot');
  },

  ingestAnalysis: async (input: MusicReactivityAnalysisInput): MusicReactivityResult<{ snapshot?: MusicReactivitySnapshot }> => {
    return await ipcRenderer.invoke('music-reactivity:ingestAnalysis', input);
  },

  testDance: async (): MusicReactivityResult<{ snapshot?: MusicReactivitySnapshot }> => {
    return await ipcRenderer.invoke('music-reactivity:testDance');
  },

  reset: async (reason?: string): MusicReactivityResult<{ snapshot?: MusicReactivitySnapshot }> => {
    return await ipcRenderer.invoke('music-reactivity:reset', { reason });
  },

  onSnapshot: (callback: (snapshot: MusicReactivitySnapshot) => void): (() => void) => {
    const handler = (_event: unknown, snapshot: MusicReactivitySnapshot): void => callback(snapshot);
    ipcRenderer.on(MUSIC_REACTIVITY_SNAPSHOT_CHANNEL, handler);
    return () => ipcRenderer.off(MUSIC_REACTIVITY_SNAPSHOT_CHANNEL, handler);
  },

  sendSpectrumFrame: (frame: MusicReactivitySpectrumFrame): void => {
    ipcRenderer.send('music-reactivity:emit-spectrum-frame', frame);
  },

  onSpectrumFrame: (callback: (frame: MusicReactivitySpectrumFrame) => void): (() => void) => {
    const handler = (_event: unknown, frame: MusicReactivitySpectrumFrame): void => callback(frame);
    ipcRenderer.on(MUSIC_REACTIVITY_SPECTRUM_FRAME_CHANNEL, handler);
    return () => ipcRenderer.off(MUSIC_REACTIVITY_SPECTRUM_FRAME_CHANNEL, handler);
  }
};

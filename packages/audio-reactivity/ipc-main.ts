import { BrowserWindow, ipcMain } from 'electron';

import type { MusicReactivityService } from './music-reactivity-service';
import { MUSIC_REACTIVITY_SNAPSHOT_CHANNEL, type MusicReactivityAnalysisInput, type MusicReactivityPreferences, type MusicReactivitySnapshot } from './types';

export interface MusicReactivityHandlerOptions {
  savePreferences?: (preferences: MusicReactivityPreferences) => void;
}

export function broadcastMusicReactivitySnapshot(snapshot: MusicReactivitySnapshot): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    win.webContents.send(MUSIC_REACTIVITY_SNAPSHOT_CHANNEL, snapshot);
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function initMusicReactivityHandlers(service: MusicReactivityService, options: MusicReactivityHandlerOptions = {}): void {
  ipcMain.handle('music-reactivity:getPreferences', async () => {
    try {
      return { ok: true, preferences: service.getPreferences() };
    } catch (error) {
      console.error('[MusicReactivity] getPreferences failed:', error);
      return { ok: false, error: toErrorMessage(error) };
    }
  });

  ipcMain.handle('music-reactivity:updatePreferences', async (_event, payload: { preferences?: Partial<MusicReactivityPreferences> } = {}) => {
    try {
      const preferences = service.updatePreferences(payload.preferences ?? {});
      options.savePreferences?.(preferences);
      return { ok: true, preferences, snapshot: service.getSnapshot() };
    } catch (error) {
      console.error('[MusicReactivity] updatePreferences failed:', error);
      return { ok: false, error: toErrorMessage(error) };
    }
  });

  ipcMain.handle('music-reactivity:getSnapshot', async () => {
    try {
      return { ok: true, snapshot: service.getSnapshot() };
    } catch (error) {
      console.error('[MusicReactivity] getSnapshot failed:', error);
      return { ok: false, error: toErrorMessage(error) };
    }
  });

  ipcMain.handle('music-reactivity:ingestAnalysis', async (_event, payload: MusicReactivityAnalysisInput = {}) => {
    try {
      return { ok: true, snapshot: service.ingestAnalysis(payload) };
    } catch (error) {
      console.error('[MusicReactivity] ingestAnalysis failed:', error);
      return { ok: false, error: toErrorMessage(error) };
    }
  });

  ipcMain.handle('music-reactivity:testDance', async () => {
    try {
      return { ok: true, snapshot: service.triggerDanceForTest() };
    } catch (error) {
      console.error('[MusicReactivity] testDance failed:', error);
      return { ok: false, error: toErrorMessage(error) };
    }
  });

  ipcMain.handle('music-reactivity:reset', async (_event, payload: { reason?: string } = {}) => {
    try {
      return { ok: true, snapshot: service.reset(payload.reason ?? 'manual-reset') };
    } catch (error) {
      console.error('[MusicReactivity] reset failed:', error);
      return { ok: false, error: toErrorMessage(error) };
    }
  });
}

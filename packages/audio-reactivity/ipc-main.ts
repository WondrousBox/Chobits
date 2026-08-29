import { BrowserWindow, ipcMain } from 'electron';

import type { MusicReactivityService } from './music-reactivity-service';
import {
  MUSIC_REACTIVITY_SNAPSHOT_CHANNEL,
  MUSIC_REACTIVITY_SPECTRUM_FRAME_CHANNEL,
  type MusicReactivityAnalysisInput,
  type MusicReactivityPreferences,
  type MusicReactivitySnapshot,
  type MusicReactivitySpectrumFrame
} from './types';

export interface MusicReactivityHandlerOptions {
  savePreferences?: (preferences: MusicReactivityPreferences) => void;
  onSpectrumFrame?: (frame: MusicReactivitySpectrumFrame) => void;
}

export function broadcastMusicReactivitySnapshot(snapshot: MusicReactivitySnapshot): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    win.webContents.send(MUSIC_REACTIVITY_SNAPSHOT_CHANNEL, snapshot);
  }
}

export function broadcastMusicReactivitySpectrumFrame(frame: MusicReactivitySpectrumFrame): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    win.webContents.send(MUSIC_REACTIVITY_SPECTRUM_FRAME_CHANNEL, frame);
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * music 功能旗标关闭时注册的降级 handler:
 * 统一返回 { ok: false },渲染侧现有逻辑均按失败分支静默降级,避免 "No handler registered" 噪音。
 * ('music-reactivity:emit-spectrum-frame' 是 send 通道,无主进程监听时天然静默,无需 stub)
 */
export function initMusicReactivityStubHandlers(): void {
  const disabled = (): { ok: boolean; error: string } => ({ ok: false, error: 'Music feature is disabled' });
  ipcMain.handle('music-reactivity:getPreferences', async () => disabled());
  ipcMain.handle('music-reactivity:updatePreferences', async () => disabled());
  ipcMain.handle('music-reactivity:getSnapshot', async () => disabled());
  ipcMain.handle('music-reactivity:ingestAnalysis', async () => disabled());
  ipcMain.handle('music-reactivity:testDance', async () => disabled());
  ipcMain.handle('music-reactivity:reset', async () => disabled());
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

  ipcMain.removeAllListeners('music-reactivity:emit-spectrum-frame');
  ipcMain.on('music-reactivity:emit-spectrum-frame', (_event, frame: MusicReactivitySpectrumFrame) => {
    if (!frame || !Array.isArray(frame.bands)) return;
    options.onSpectrumFrame?.(frame);
    broadcastMusicReactivitySpectrumFrame(frame);
  });
}

import fs from 'node:fs';
import path from 'node:path';

import { app, BrowserWindow, ipcMain } from 'electron';

import { assertSpriteCapabilityUnlocked } from '../sprite-core/capability-runtime';
import { notifySpriteCapabilityChanged } from '../sprite-core/handler/capability-events';
import { disableASRRuntime } from '../sherpa/ipc-main';
import { recorderServer } from './index';

export type RecorderConfig = {
  enabled?: boolean;
};

const defaultConfig: RecorderConfig = {
  enabled: false
};

let recorderConfig: RecorderConfig = defaultConfig;
let recorderConfigLoaded = false;

function getRecorderConfigFile(): string {
  const configDir = app.getPath('userData');
  return path.join(configDir, 'data', 'recorder-config.json');
}

function ensureRecorderConfigLoaded(): void {
  if (recorderConfigLoaded) return;

  const configFile = getRecorderConfigFile();
  try {
    if (fs.existsSync(configFile)) {
      const txt = fs.readFileSync(configFile, 'utf8');
      const parsed = JSON.parse(txt);
      recorderConfig = { ...defaultConfig, ...parsed };
    } else {
      recorderConfig = defaultConfig;
    }
  } catch {
    recorderConfig = defaultConfig;
  }
  recorderConfigLoaded = true;
}

function saveRecorderConfig(): void {
  const configFile = getRecorderConfigFile();
  try {
    const dir = path.dirname(configFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configFile, JSON.stringify(recorderConfig, null, 2), 'utf8');
  } catch {
    //
  }
}

export function getRecorderConfigSnapshot(): RecorderConfig {
  ensureRecorderConfigLoaded();
  return { ...recorderConfig };
}

export function getRecorderStatusSnapshot(): { running: boolean } {
  return { running: recorderServer.isRunning() };
}

function broadcastRecorderStatus(): void {
  const payload = getRecorderStatusSnapshot();
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win || win.isDestroyed()) continue;
    try {
      win.webContents.send('recorder-status-updated', payload);
    } catch {
      /* ignore */
    }
  }

  notifySpriteCapabilityChanged({ source: 'recorder.status' });
}

/**
 * recording 功能旗标关闭时注册的降级 handler:
 * 只返回禁用态默认值,不做任何副作用,避免渲染侧无条件调用刷 "No handler registered" 错误。
 */
export function initRecorderStubHandlers(): void {
  ipcMain.handle('recorder:start', async () => false);
  ipcMain.handle('recorder:stop', async () => true);
  ipcMain.handle('recorder:status', async () => false);
  ipcMain.handle('recorder:getConfig', () => ({ ...defaultConfig }));
  ipcMain.handle('recorder:updateConfig', () => ({ ...defaultConfig }));
}

export function initRecorderHandlers(): void {
  ensureRecorderConfigLoaded();

  if (!recorderConfig.enabled) {
    disableASRRuntime({ disableConfig: true });
    broadcastRecorderStatus();
  }

  // Auto-start recorder if enabled
  if (recorderConfig.enabled) {
    recorderServer
      .start()
      .then(() => {
        broadcastRecorderStatus();
      })
      .catch((error) => {
        console.error('[Recorder] Failed to auto-start recorder:', error);
        broadcastRecorderStatus();
      });
  }

  ipcMain.handle('recorder:start', async (_, port?: number) => {
    assertSpriteCapabilityUnlocked('microphone');
    const started = await recorderServer.start(port);
    broadcastRecorderStatus();
    return started;
  });

  ipcMain.handle('recorder:stop', async () => {
    const stopped = await recorderServer.stop();
    disableASRRuntime({ disableConfig: true });
    broadcastRecorderStatus();
    return stopped;
  });

  ipcMain.handle('recorder:status', async () => {
    return recorderServer.isRunning();
  });

  ipcMain.handle('recorder:getConfig', () => {
    return getRecorderConfigSnapshot();
  });

  ipcMain.handle('recorder:updateConfig', (_, partial: Partial<RecorderConfig>) => {
    if (partial.enabled === true) {
      assertSpriteCapabilityUnlocked('microphone');
    }
    recorderConfig = { ...recorderConfig, ...partial };
    saveRecorderConfig();
    if (recorderConfig.enabled === false) {
      disableASRRuntime({ disableConfig: true });
      broadcastRecorderStatus();
    }
    return getRecorderConfigSnapshot();
  });
}

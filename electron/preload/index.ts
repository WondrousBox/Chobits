import { arch, isLinux, isMac, isMacIntel, isWindows, platform } from '@packages/common/utils/os';
import { contextBridge, ipcRenderer } from 'electron';

// 使用当前的 AI IPC bridge
import { aiBridge } from '../../packages/ai/ipc-renderer';
import { pluginResourceBridge } from '../../packages/plugins/ipc-renderer';
import { sherpaBridge } from '../../packages/sherpa/ipc-renderer';
import { spriteBridge } from '../../packages/sprite-core/preload';
import { MESSAGE_IPC_CHANNELS, type MessageBridgePayload } from '../../packages/sprite-core/types';
import { characterBridge } from './apis/character';
import { fileBridge } from './apis/file';
import { preferencesBridge } from './apis/preferences';
import { proxyBridge } from './apis/proxy';
import { shortcutsBridge } from './apis/shortcuts';
import { statusBridge } from './apis/status';
import { systemBridge } from './apis/system';
import { themeBridge } from './apis/theme';
import { windowBridge } from './apis/window';

// --------- 渲染进程全局桥对象 window.chobits ---------
contextBridge.exposeInMainWorld('chobits', {
  isMac,
  isWindows,
  isLinux,
  isMacIntel,
  platform,
  arch,
  isProd: process.env.NODE_ENV !== 'development',
  isDev: process.env.NODE_ENV === 'development',
  window: windowBridge,
  file: fileBridge,
  system: systemBridge,
  sprite: spriteBridge,
  status: statusBridge,
  character: characterBridge,
  shortcuts: shortcutsBridge,
  ai: aiBridge,
  pluginResource: pluginResourceBridge,
  proxy: proxyBridge,
  theme: themeBridge,
  sherpa: sherpaBridge,
  preferences: preferencesBridge,
  messages: {
    on: (callback: (payload: MessageBridgePayload) => void) => {
      const subscription = (_event: any, payload: MessageBridgePayload): void => callback(payload);
      ipcRenderer.on(MESSAGE_IPC_CHANNELS.BRIDGE, subscription);
      return () => ipcRenderer.off(MESSAGE_IPC_CHANNELS.BRIDGE, subscription);
    }
  }
});

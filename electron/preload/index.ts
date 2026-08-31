import { arch, isLinux, isMac, isMacIntel, isWindows, platform } from '@packages/common/utils/os';
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// 使用当前的 AI IPC bridge
import { aiBridge } from '../../packages/ai/ipc-renderer';
import { APP_EVENT_CHANNEL, AppEventPayload } from '../../packages/event/events';
import { pluginResourceIpcRenderer } from '../../packages/plugins/ipc-renderer';
import { sherpaIpcRenderer } from '../../packages/sherpa/ipc-renderer';
import { spriteBridge } from '../../packages/sprite-core/preload';
import { MESSAGE_IPC_CHANNELS, type MessageBridgePayload } from '../../packages/sprite-core/types';
import { fileIpcRenderer } from '../main/handlers/file/ipc-renderer';
import { preferencesIpcRenderer } from '../main/handlers/preferences/ipc-renderer';
import { proxyIpcRenderer } from '../main/handlers/proxy/ipc-renderer';
import { systemIpcRenderer } from '../main/handlers/system/ipc-renderer';
import { themeIpcRenderer } from '../main/handlers/theme/ipc-renderer';
import { personaApi } from './apis/persona';
import { shortcutsBridge } from './apis/shortcuts';
import { statusBridge } from './apis/status';
import { windowBridge } from './apis/window';

const handles: Record<string, (...arg: any) => any> = {};
const ipcRendererListenerMap = new Map<string, WeakMap<(...args: any[]) => any, (...args: any[]) => void>>();

function getIpcRendererListenerMap(channel: string): WeakMap<(...args: any[]) => any, (...args: any[]) => void> {
  let listeners = ipcRendererListenerMap.get(channel);
  if (!listeners) {
    listeners = new WeakMap();
    ipcRendererListenerMap.set(channel, listeners);
  }
  return listeners;
}

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args;
    const channelListeners = getIpcRendererListenerMap(channel);
    let wrappedListener = channelListeners.get(listener);

    if (!wrappedListener) {
      wrappedListener = (event, ...eventArgs) => listener(event, ...eventArgs);
      channelListeners.set(listener, wrappedListener);
    }

    ipcRenderer.on(channel, wrappedListener);
    return () => ipcRenderer.off(channel, wrappedListener);
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, listener] = args;
    const wrappedListener = getIpcRendererListenerMap(channel).get(listener);
    return ipcRenderer.off(channel, wrappedListener ?? listener);
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args;
    return ipcRenderer.send(channel, ...omit);
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args;
    return ipcRenderer.invoke(channel, ...omit);
  }

  // You can expose other APTs you need here.
  // ...
});

// --------- AI Assistant API ---------
contextBridge.exposeInMainWorld('YUA', {
  isMac,
  isWindows,
  isLinux,
  isMacIntel,
  platform,
  arch,
  isProd: process.env.NODE_ENV !== 'development',
  isDev: process.env.NODE_ENV === 'development',
  window: windowBridge,
  file: fileIpcRenderer,
  system: systemIpcRenderer,
  sprite: spriteBridge,
  status: statusBridge,
  persona: personaApi,
  shortcuts: shortcutsBridge,
  ai: aiBridge,
  pluginResource: pluginResourceIpcRenderer,
  proxy: proxyIpcRenderer,
  theme: themeIpcRenderer,
  sherpa: sherpaIpcRenderer,
  preferences: preferencesIpcRenderer,
  messages: {
    on: (callback: (payload: MessageBridgePayload) => void) => {
      const subscription = (_event: any, payload: MessageBridgePayload): void => callback(payload);
      ipcRenderer.on(MESSAGE_IPC_CHANNELS.BRIDGE, subscription);
      return () => ipcRenderer.off(MESSAGE_IPC_CHANNELS.BRIDGE, subscription);
    }
  },
  events: {
    on: (callback: (payload: AppEventPayload) => void) => {
      const subscription = (_event: any, payload: AppEventPayload): void => callback(payload);
      ipcRenderer.on(APP_EVENT_CHANNEL, subscription);
      return () => ipcRenderer.off(APP_EVENT_CHANNEL, subscription);
    }
  },
  handleMessage: (handleFunction: (event: IpcRendererEvent, data: { type: string; data: any }) => any, name: string) => {
    if (handles[name]) {
      ipcRenderer.removeListener('renderer-message', handles[name]);
    }
    handles[name] = handleFunction;

    return ipcRenderer.addListener('renderer-message', handleFunction);
  },
  removeHandler: (name: string) => {
    if (handles[name]) {
      return ipcRenderer.removeListener('renderer-message', handles[name]);
    }
  }
});

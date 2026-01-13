import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

import { aiBridge } from '../../packages/ai/ipc-renderer';
import { APP_EVENT_CHANNEL, AppEventPayload } from '../../packages/event/events';
import { pluginResourceIpcRenderer } from '../../packages/plugins/ipc-renderer';
import { recorderIpcRenderer } from '../../packages/recorder/ipc-renderer';
import { sherpaIpcRenderer } from '../../packages/sherpa/ipc-renderer';
import { dailyCareBridge } from '../main/daily/ipc-renderer';
import downloaderIpcRenderer from '../main/handlers/downloader/ipc-renderer';
import { vectorIpcRenderer } from '../main/handlers/embedding/ipc-renderer';
import { ffmpegIpcRenderer } from '../main/handlers/ffmpeg/ipc-renderer';
import { fileIpcRenderer } from '../main/handlers/file/ipc-renderer';
import { folderIpcRenderer } from '../main/handlers/folder/ipc-renderer';
import { preferencesIpcRenderer } from '../main/handlers/preferences/ipc-renderer';
import { proxyIpcRenderer } from '../main/handlers/proxy/ipc-renderer';
import { resourceIpcRenderer } from '../main/handlers/resource/ipc-renderer';
import { createRssApi } from '../main/handlers/rss/ipc-renderer';
import { systemIpcRenderer } from '../main/handlers/system/ipc-renderer';
import { themeIpcRenderer } from '../main/handlers/theme/ipc-renderer';
import { trashIpcRenderer } from '../main/handlers/trash/ipc-renderer';
import { workspaceIpcRenderer } from '../main/handlers/workspace/ipc-renderer';
import { ytdlpIpcRenderer } from '../main/handlers/ytdlp/ipc-renderer';
import { arch, isLinux, isMac, isMacIntel, isWindows, platform } from '../main/utils/os';
import { shortcutsBridge } from './apis/shortcuts';
import { spriteBridge } from './apis/sprite';
import { statusBridge } from './apis/status';
import { windowBridge } from './apis/window';

const handles: Record<string, (...arg: any) => any> = {};

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args;
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args));
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args;
    return ipcRenderer.off(channel, ...omit);
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
  ffmpeg: ffmpegIpcRenderer,
  vector: vectorIpcRenderer,
  resource: resourceIpcRenderer,
  trash: trashIpcRenderer,
  workspace: workspaceIpcRenderer,
  file: fileIpcRenderer,
  system: systemIpcRenderer,
  folder: folderIpcRenderer,
  videoDownloader: downloaderIpcRenderer,
  sprite: spriteBridge,
  status: statusBridge,
  shortcuts: shortcutsBridge,
  ai: aiBridge,
  recorder: recorderIpcRenderer,
  dailyCare: dailyCareBridge,
  pluginResource: pluginResourceIpcRenderer,
  proxy: proxyIpcRenderer,
  theme: themeIpcRenderer,
  sherpa: sherpaIpcRenderer,
  preferences: preferencesIpcRenderer,
  ytdlp: ytdlpIpcRenderer,
  rss: createRssApi(ipcRenderer),
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

// --------- Preload scripts loading ---------
function domReady(condition: DocumentReadyState[] = ['complete', 'interactive']): Promise<boolean> {
  return new Promise((resolve) => {
    if (condition.includes(document.readyState)) {
      resolve(true);
    } else {
      document.addEventListener('readystatechange', () => {
        if (condition.includes(document.readyState)) {
          resolve(true);
        }
      });
    }
  });
}

const safeDOM = {
  append(parent: HTMLElement, child: HTMLElement) {
    if (!Array.from(parent.children).find((e) => e === child)) {
      return parent.appendChild(child);
    }
  },
  remove(parent: HTMLElement, child: HTMLElement) {
    if (Array.from(parent.children).find((e) => e === child)) {
      return parent.removeChild(child);
    }
  }
};

/**
 * https://tobiasahlin.com/spinkit
 * https://connoratherton.com/loaders
 * https://projects.lukehaas.me/css-loaders
 * https://matejkustec.github.io/SpinThatShit
 */
function makeLoadingHelpers(): { appendLoading: () => void; removeLoading: () => void } {
  const className = `loaders-css__square-spin`;
  const styleContent = `
@keyframes square-spin {
  25% { transform: perspective(100px) rotateX(180deg) rotateY(0); }
  50% { transform: perspective(100px) rotateX(180deg) rotateY(180deg); }
  75% { transform: perspective(100px) rotateX(0) rotateY(180deg); }
  100% { transform: perspective(100px) rotateX(0) rotateY(0); }
}
.${className} > div {
  animation-fill-mode: both;
  width: 50px;
  height: 50px;
  background: #fff;
  animation: square-spin 3s 0s cubic-bezier(0.09, 0.57, 0.49, 0.9) infinite;
}
.app-loading-wrap {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #282c34;
  z-index: 9;
}
    `;
  const oStyle = document.createElement('style');
  const oDiv = document.createElement('div');

  oStyle.id = 'app-loading-style';
  oStyle.innerHTML = styleContent;
  oDiv.className = 'app-loading-wrap';
  oDiv.innerHTML = `<div class="${className}"><div></div></div>`;

  return {
    appendLoading() {
      safeDOM.append(document.head, oStyle);
      safeDOM.append(document.body, oDiv);
    },
    removeLoading() {
      safeDOM.remove(document.head, oStyle);
      safeDOM.remove(document.body, oDiv);
    }
  };
}

// ----------------------------------------------------------------------

// const { appendLoading, removeLoading } = makeLoadingHelpers();
// domReady().then(appendLoading);

// window.onmessage = (ev) => {
//   ev.data.payload === 'removeLoading' && removeLoading();
// };

// setTimeout(removeLoading, 4999);

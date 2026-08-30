import type { IpcRendererEvent } from 'electron';

import type { FileIpcType } from '../electron/main/handlers/file/ipc-renderer';
import type { PreferencesIpcType } from '../electron/main/handlers/preferences/ipc-renderer';
import type { ProxyIpcType } from '../electron/main/handlers/proxy/ipc-renderer';
import type { SystemIpcType } from '../electron/main/handlers/system/ipc-renderer';
import type { ThemeIpcType } from '../electron/main/handlers/theme/ipc-renderer';
import type { PersonaApiBridgeType } from '../electron/preload/apis/persona';
import type { ShortcutsBridgeType } from '../electron/preload/apis/shortcuts';
import type { StatusBridgeType } from '../electron/preload/apis/status';
import type { WindowBridgeType } from '../electron/preload/apis/window';
import type { AIApi } from '../packages/ai/types';
import type { AppEventPayload } from '../packages/event/events';
import type { PluginResourceIpcType } from '../packages/plugins/ipc-renderer';
import type { SherpaIpcRendererType } from '../packages/sherpa/ipc-renderer';
import type { SpriteBridgeType } from '../packages/sprite-core/preload';
import type { MessageBridgePayload } from '../packages/sprite-core/types';

declare global {
  interface Window {
    YUA: {
      isMac: boolean;
      isWindows: boolean;
      isLinux: boolean;
      isMacIntel: boolean;
      platform: 'win32' | 'darwin' | 'linux';
      arch: 'arm64' | 'x64';
      isProd: boolean;
      isDev: boolean;

      window: WindowBridgeType;
      file: FileIpcType;
      system: SystemIpcType;
      sprite: SpriteBridgeType;
      status: StatusBridgeType;
      persona: PersonaApiBridgeType;
      shortcuts: ShortcutsBridgeType;
      pluginResource: PluginResourceIpcType;
      proxy: ProxyIpcType;
      theme: ThemeIpcType;
      sherpa: SherpaIpcRendererType;
      preferences: PreferencesIpcType;
      ai: AIApi;
      messages: {
        on: (callback: (payload: MessageBridgePayload) => void) => () => void;
      };
      events: {
        on: (callback: (payload: AppEventPayload) => void) => () => void;
      };
      handleMessage: (handleFunction: (event: IpcRendererEvent, data: { type: string; data: any }) => any, name: string) => Promise<void>;
      removeHandler: (name?: string) => Promise<void>;
    };
    ipcRenderer: import('electron').IpcRenderer;
  }
}

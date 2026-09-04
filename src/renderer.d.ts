import type { CharacterApiBridgeType } from '../electron/preload/apis/character';
import type { FileBridgeType } from '../electron/preload/apis/file';
import type { PreferencesBridgeType } from '../electron/preload/apis/preferences';
import type { ProxyBridgeType } from '../electron/preload/apis/proxy';
import type { ShortcutsBridgeType } from '../electron/preload/apis/shortcuts';
import type { StatusBridgeType } from '../electron/preload/apis/status';
import type { SystemBridgeType } from '../electron/preload/apis/system';
import type { ThemeBridgeType } from '../electron/preload/apis/theme';
import type { WindowBridgeType } from '../electron/preload/apis/window';
import type { AIApi } from '../packages/ai/types';
import type { PluginResourceBridgeType } from '../packages/plugins/ipc-renderer';
import type { SherpaBridgeType } from '../packages/sherpa/ipc-renderer';
import type { SpriteBridgeType } from '../packages/sprite-core/preload';
import type { MessageBridgePayload } from '../packages/sprite-core/types';

declare global {
  interface Window {
    chobits: {
      isMac: boolean;
      isWindows: boolean;
      isLinux: boolean;
      isMacIntel: boolean;
      platform: 'win32' | 'darwin' | 'linux';
      arch: 'arm64' | 'x64';
      isProd: boolean;
      isDev: boolean;

      window: WindowBridgeType;
      file: FileBridgeType;
      system: SystemBridgeType;
      sprite: SpriteBridgeType;
      status: StatusBridgeType;
      character: CharacterApiBridgeType;
      shortcuts: ShortcutsBridgeType;
      pluginResource: PluginResourceBridgeType;
      proxy: ProxyBridgeType;
      theme: ThemeBridgeType;
      sherpa: SherpaBridgeType;
      preferences: PreferencesBridgeType;
      ai: AIApi;
      messages: {
        on: (callback: (payload: MessageBridgePayload) => void) => () => void;
      };
    };
    ipcRenderer: import('electron').IpcRenderer;
  }
}

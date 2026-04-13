import type { IpcRendererEvent } from 'electron';

import type { DailyCareBridgeType } from '../electron/main/daily/ipc-renderer';
import type { AnnotationIpcRenderer } from '../electron/main/handlers/annotation/ipc-renderer';
import type { ClipIpcRenderer } from '../electron/main/handlers/clip/ipc-renderer';
import type { DownloaderIpcRendererType } from '../electron/main/handlers/downloader/ipc-renderer';
import type { FFmpegIpcType } from '../electron/main/handlers/ffmpeg/ipc-renderer';
import type { FileIpcType } from '../electron/main/handlers/file/ipc-renderer';
import type { FolderIpcType } from '../electron/main/handlers/folder/ipc-renderer';
import type { MediaIpcType } from '../electron/main/handlers/media/ipc-renderer';
import type { PreferencesIpcType } from '../electron/main/handlers/preferences/ipc-renderer';
import type { ProxyIpcType } from '../electron/main/handlers/proxy/ipc-renderer';
import type { ResourceIpcType } from '../electron/main/handlers/resource/ipc-renderer';
import type { RssApi } from '../electron/main/handlers/rss/ipc-renderer';
import type { SpleeterIpcType } from '../electron/main/handlers/spleeter/ipc-renderer';
import type { SystemIpcType } from '../electron/main/handlers/system/ipc-renderer';
import type { ThemeIpcType } from '../electron/main/handlers/theme/ipc-renderer';
import type { TrashIpcType } from '../electron/main/handlers/trash/ipc-renderer';
import type { WorkspaceIpcType } from '../electron/main/handlers/workspace/ipc-renderer';
import type { YtDlpIpcRendererType } from '../electron/main/handlers/ytdlp/ipc-renderer';
import type { PluginResourceIpcType } from '../electron/main/plugins/ipc-renderer';
import type { analyticsApi } from '../electron/preload/apis/analytics';
import type { memoryApi } from '../electron/preload/apis/memory';
import type { PersonaApiBridgeType } from '../electron/preload/apis/persona';
import type { ShortcutsBridgeType } from '../electron/preload/apis/shortcuts';
import type { StatusBridgeType } from '../electron/preload/apis/status';
import type { userProfileApi } from '../electron/preload/apis/user-profile';
import type { WindowBridgeType } from '../electron/preload/apis/window';
import type { AIApi } from '../packages/ai/types';
import type { AppEventPayload } from '../packages/event/events';
import type { RecorderIpcRendererType } from '../packages/recorder/ipc-renderer';
import type { SherpaIpcRendererType } from '../packages/sherpa/ipc-renderer';
import type { SpriteBridgeType } from '../packages/sprite-core/preload';
import type { MessageBridgePayload } from '../packages/sprite-core/types';
import type { TTSIpcRenderer } from '../packages/tts/ipc-renderer';

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
      ffmpeg: FFmpegIpcType;
      resource: ResourceIpcType;
      trash: TrashIpcType;
      workspace: WorkspaceIpcType;
      file: FileIpcType;
      system: SystemIpcType;
      folder: FolderIpcType;
      videoDownloader: DownloaderIpcRendererType;
      sprite: SpriteBridgeType;
      status: StatusBridgeType;
      persona: PersonaApiBridgeType;
      shortcuts: ShortcutsBridgeType;
      pluginResource: PluginResourceIpcType;
      dailyCare: DailyCareBridgeType;
      recorder: RecorderIpcRendererType;
      proxy: ProxyIpcType;
      theme: ThemeIpcType;
      sherpa: SherpaIpcRendererType;
      preferences: PreferencesIpcType;
      ytdlp: YtDlpIpcRendererType;
      spleeter: SpleeterIpcType & {
        onProgress: (callback: (data: { progress: number }) => void) => () => void;
      };
      rss: RssApi;
      ai: AIApi;
      tts: TTSIpcRenderer;
      clip: ClipIpcRenderer;
      annotation: AnnotationIpcRenderer;
      media: MediaIpcType;
      memory: typeof memoryApi;
      analytics: typeof analyticsApi;
      userProfile: typeof userProfileApi;
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

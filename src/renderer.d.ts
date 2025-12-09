import type { AIApi } from '../electron/main/ai/types';
import type { DailyCareBridgeType } from '../electron/main/daily/ipc-renderer';
import type { FFmpegIpcType } from '../electron/main/handlers/ffmpeg/ipc-renderer';
import type { FileIpcType } from '../electron/main/handlers/file/ipc-renderer';
import type { FolderIpcType } from '../electron/main/handlers/folder/ipc-renderer';
import type { ProxyIpcType } from '../electron/main/handlers/proxy/ipc-renderer';
import type { ResourceIpcType } from '../electron/main/handlers/resource/ipc-renderer';
import type { ThemeIpcType } from '../electron/main/handlers/theme/ipc-renderer';
import type { TrashIpcType } from '../electron/main/handlers/trash/ipc-renderer';
import type { WorkspaceIpcType } from '../electron/main/handlers/workspace/ipc-renderer';
import type { PluginResourceBridgeType } from '../electron/main/plugins/ipc-renderer';
import type { ShortcutsBridgeType } from '../electron/preload/apis/shortcuts';
import type { SpriteBridgeType } from '../electron/preload/apis/sprite';
import type { StatusBridgeType } from '../electron/preload/apis/status';
import type { SystemBridgeType } from '../electron/preload/apis/system';
import type { VectorBridgeType } from '../electron/preload/apis/vector';
import type videoDownloaderAPI from '../electron/preload/apis/video-downloader';
import type { WindowBridgeType } from '../electron/preload/apis/window';
import type { AppEventPayload } from '../packages/event/events';

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
      vector: VectorBridgeType & {
        onEmbeddingJob(cb: (job: any) => void): () => void;
        onEmbeddingProgress(cb: (p: { id: string; done: number; total: number; status?: string }) => void): () => void;
      };
      resource: ResourceIpcType;
      trash: TrashIpcType;
      workspace: WorkspaceIpcType;
      file: FileIpcType;
      system: SystemBridgeType;
      folder: FolderIpcType;
      videoDownloader: typeof videoDownloaderAPI;
      sprite: SpriteBridgeType;
      status: StatusBridgeType;
      shortcuts: ShortcutsBridgeType;
      pluginResource: PluginResourceBridgeType;
      dailyCare: DailyCareBridgeType;
      proxy: ProxyIpcType;
      theme: ThemeIpcType;
      ai: AIApi;
      events: {
        on: (callback: (payload: AppEventPayload) => void) => () => void;
      };
    };
    ipcRenderer: import('electron').IpcRenderer;
  }
}

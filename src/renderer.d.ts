import type { AIApi } from '../electron/main/ai/types';
import type { PluginResourceBridgeType } from '../electron/main/plugins/ipc-renderer';
import type { ProxyBridgeType } from '../packages/proxy/ipc-renderer';
import type { FFmpegBridgeType } from '../electron/preload/apis/ffmpeg';
import type { FileBridgeType } from '../electron/preload/apis/file';
import type { FolderBridgeType } from '../electron/preload/apis/folder';
import type { ModelBridgeType } from '../electron/preload/apis/model';
import type { ResourceBridgeType } from '../electron/preload/apis/resource';
import type { ShortcutsBridgeType } from '../electron/preload/apis/shortcuts';
import type { SpriteBridgeType } from '../electron/preload/apis/sprite';
import type { StatusBridgeType } from '../electron/preload/apis/status';
import type { SystemBridgeType } from '../electron/preload/apis/system';
import type { TrashBridgeType } from '../electron/preload/apis/trash';
import type { VectorBridgeType } from '../electron/preload/apis/vector';
import type videoDownloaderAPI from '../electron/preload/apis/video-downloader';
import type { WindowBridgeType } from '../electron/preload/apis/window';
import type { WorkspaceBridgeType } from '../electron/preload/apis/workspace';

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
      ffmpeg: FFmpegBridgeType;
      vector: VectorBridgeType & {
        onEmbeddingJob(cb: (job: any) => void): () => void;
        onEmbeddingProgress(cb: (p: { id: string; done: number; total: number; status?: string }) => void): () => void;
      };
      resource: ResourceBridgeType;
      trash: TrashBridgeType;
      workspace: WorkspaceBridgeType;
      model: ModelBridgeType;
      file: FileBridgeType;
      system: SystemBridgeType;
      folder: FolderBridgeType;
      videoDownloader: typeof videoDownloaderAPI;
      sprite: SpriteBridgeType;
      status: StatusBridgeType;
      shortcuts: ShortcutsBridgeType;
      pluginResource: PluginResourceBridgeType;
      proxy: ProxyBridgeType;
      ai: AIApi;
    };
    ipcRenderer: import('electron').IpcRenderer;
  }
}

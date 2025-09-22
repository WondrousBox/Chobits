import type { FFmpegBridgeType } from '../electron/preload/apis/ffmpeg'
import type { WindowBridgeType } from '../electron/preload/apis/window'
import type { VectorBridgeType } from '../electron/preload/apis/vector'
import type { ResourceBridgeType } from '../electron/preload/apis/resource'
import type { TrashBridgeType } from '../electron/preload/apis/trash'
import type { WorkspaceBridgeType } from '../electron/preload/apis/workspace'
import type { ModelBridgeType } from '../electron/preload/apis/model'

declare global {
  interface Window {
    YUA: {
      isMac: boolean;
      isWindows: boolean;
      isLinux: boolean;
      isMacIntel: boolean;
      platform: "win32" | "darwin" | "linux";
      arch: "arm64" | "x64";
      isProd: boolean;
      isDev: boolean;

      window: WindowBridgeType
      ffmpeg: FFmpegBridgeType
      vector: VectorBridgeType & {
        onEmbeddingJob(cb: (job: any) => void): () => void
        onEmbeddingProgress(cb: (p: { id: string; done: number; total: number; status?: string }) => void): () => void
      }
      resource: ResourceBridgeType
      trash: TrashBridgeType
      workspace: WorkspaceBridgeType
      model: ModelBridgeType
    }
    ipcRenderer: any
  }
}

export { }

import type { FFmpegBridgeType } from '../electron/preload/apis/ffmpeg'
import type { WindowBridgeType } from '../electron/preload/apis/window'
import type { VectorBridgeType } from '../electron/preload/apis/vector'
import type { ResourceBridgeType } from '../electron/preload/apis/resource'
import type { TrashBridgeType } from '../electron/preload/apis/trash'

declare global {
  interface Window {
    YUA: {
      window: WindowBridgeType
      ffmpeg: FFmpegBridgeType
      vector: VectorBridgeType & {
        onEmbeddingJob(cb: (job: any) => void): () => void
        onEmbeddingProgress(cb: (p: { id: string; done: number; total: number; status?: string }) => void): () => void
      }
      resource: ResourceBridgeType
      trash: TrashBridgeType
    }
    ipcRenderer: any
  }
}

export { }

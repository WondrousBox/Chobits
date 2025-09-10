import type { FFmpegBridgeType } from '../electron/preload/apis/ffmpeg'
import type { WindowBridgeType } from '../electron/preload/apis/window'
import type { VectorBridgeType } from '../electron/preload/apis/vector'

declare global {
  interface Window {
    YUA: {
      window: WindowBridgeType
      ffmpeg: FFmpegBridgeType
      vector: VectorBridgeType
    }
    ipcRenderer: any
  }
}

export { }

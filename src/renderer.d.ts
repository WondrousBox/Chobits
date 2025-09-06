import type { FFmpegBridgeType } from '../electron/preload/apis/ffmpeg'
import type { WindowBridgeType } from '../electron/preload/apis/window'

declare global {
  interface Window {
    YUA: {
      window: WindowBridgeType
      ffmpeg: FFmpegBridgeType
    }
    ipcRenderer: any
  }
}

export { }

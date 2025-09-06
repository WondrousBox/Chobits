import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import ffmpeg from "fluent-ffmpeg";

export function initFFmpegHandlers(win: BrowserWindow) {
  ipcMain.handle('playSprite', () => {
    ffmpeg('input.webm')
      .outputOptions('-vf', 'fps=30') // 控制帧率
      .outputOptions('-f', 'image2pipe')
      .outputOptions('-vcodec', 'png')
      .on('data', frameBuffer => {
        // 通过 IPC 发送 frameBuffer 到渲染进程
      })
      .run();
    return "movementConfig"
  })
}

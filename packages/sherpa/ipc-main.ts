import { BrowserWindow, ipcMain } from 'electron';

import { AllModels } from './common';
import { ASR_createInstance, ASR_freeInstance, ASR_sendData } from './index';

export function initSherpaHandlers(win?: BrowserWindow | null): void {
  ipcMain.handle('sherpa:createInstance', async (_, data: { model: AllModels; punctuationModel?: string; language?: string }) => {
    const ins = await ASR_createInstance({
      uuid: 'stream',
      model: data.model,
      language: data.language,
      punctuationModel: data.punctuationModel
    });
    if (ins) {
      ins.handler = (d) => {
        console.log({
          type: 'asr:message',
          data: d
        });

        // 发送识别结果到前端
        if (win && !win.isDestroyed()) {
          try {
            win.webContents.send('sherpa:message', d);
          } catch (error) {
            console.error('发送 ASR 识别结果失败:', error);
          }
        } else {
          // 如果没有指定窗口，发送到所有窗口
          BrowserWindow.getAllWindows().forEach((w) => {
            if (!w.isDestroyed()) {
              try {
                w.webContents.send('sherpa:message', d);
              } catch (error) {
                console.error('发送 ASR 识别结果失败:', error);
              }
            }
          });
        }
      };

      return true;
    }

    return false;
  });

  ipcMain.handle('sherpa:freeInstance', async () => {
    ASR_freeInstance({
      uuid: 'stream'
    });
    return true;
  });

  ipcMain.handle(
    'sherpa:sendData',
    async (
      _,
      data: {
        uuid: string;
        workspaceId?: number | string;
        folderId?: number | string;
        data: Float32Array;
        save?: boolean;
        tracks?: [
          {
            format: 'srt';
            language: 'zh_cn';
            content: string;
          }
        ];
      }
    ) => {
      ASR_sendData({ uuid: 'stream' }, data.data);
      // if (data.save) {
      //   // 将 PCM 数据写入文件
      //   // 写 Float32 PCM：
      //   const f32 = new Float32Array(data.data);
      //   writeStreams[data.uuid]?.write(Buffer.from(f32.buffer));

      //   if (data.tracks) {
      //     writeStreams[data.uuid + "stt"]?.write(JSON.stringify(data.tracks));
      //   }
      // }
    }
  );
}

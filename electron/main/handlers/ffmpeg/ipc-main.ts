import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';
import { app } from 'electron';
import ffmpeg from 'fluent-ffmpeg';

// ESM-safe __dirname/__filename
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

ffmpeg.setFfmpegPath(path.join(__dirname, '../../resources/ffmpeg', process.platform, process.arch, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'));
ffmpeg.setFfprobePath(path.join(__dirname, '../../resources/ffmpeg', process.platform, process.arch, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'));

// 简单 JPEG 帧分包器：按 SOI(0xFFD8) 和 EOI(0xFFD9) 切分
function extractJpegFrames(buffer: Buffer): { frames: Buffer[]; rest: Buffer } {
  const frames: Buffer[] = [];
  let i = 0;
  let start = -1;
  while (i < buffer.length - 1) {
    const byte = buffer[i];
    const next = buffer[i + 1];
    if (start < 0 && byte === 0xff && next === 0xd8) {
      start = i;
      i += 2;
      continue;
    }
    if (start >= 0 && byte === 0xff && next === 0xd9) {
      const end = i + 2;
      frames.push(buffer.slice(start, end));
      buffer = buffer.slice(end);
      i = 0;
      start = -1;
      continue;
    }
    i++;
  }
  return { frames, rest: start >= 0 ? buffer.slice(start) : Buffer.alloc(0) };
}

export function initFFmpegHandlers(win: BrowserWindow) {
  ipcMain.handle('playSprite', async (_evt, arg?: { sourceId?: string; fps?: number; inputPath?: string }) => {
    const sourceId = arg?.sourceId || 'ffmpegSource';
    const fps = Math.max(1, Math.min(60, arg?.fps || 30));

    // 解析输入视频路径：默认使用应用 public/idle.webm（示例）
    const defaultInput = path.join(process.env.VITE_PUBLIC || app.getAppPath(), 'idle.webm');
    const input = arg?.inputPath || defaultInput;

    return await new Promise<string>((resolve, reject) => {
      try {
        const cmd = ffmpeg(input)
          .noAudio()
          .videoCodec('png')
          .format('image2pipe')
          .outputOptions(['-vf', `fps=${fps}`, '-pix_fmt', 'rgba'])
          .on('start', (commandLine: string) => {
            // 可选：日志
            console.log('[ffmpeg] start:', commandLine);
          })
          .on('stderr', (line: string) => {
            console.log('[ffmpeg][stderr]', line);
          })
          .on('error', (err: any) => {
            console.error('[ffmpeg] error:', err);
            // 将错误返回给调用方
            reject(err);
          })
          .on('end', () => {
            console.log('[ffmpeg] end');
            resolve('ended');
          });

        // PNG帧分包器：按PNG签名和IEND块切分
        function extractPngFrames(buffer: Buffer): { frames: Buffer[]; rest: Buffer } {
          const frames: Buffer[] = [];
          let i = 0;
          while (i < buffer.length) {
            // PNG文件签名 8字节: 89 50 4E 47 0D 0A 1A 0A
            if (buffer.length - i < 8) break;
            if (
              buffer[i] === 0x89 &&
              buffer[i + 1] === 0x50 &&
              buffer[i + 2] === 0x4e &&
              buffer[i + 3] === 0x47 &&
              buffer[i + 4] === 0x0d &&
              buffer[i + 5] === 0x0a &&
              buffer[i + 6] === 0x1a &&
              buffer[i + 7] === 0x0a
            ) {
              // 找IEND块
              let end = -1;
              for (let j = i + 8; j < buffer.length - 11; j++) {
                // IEND块: 00 00 00 00 49 45 4E 44 AE 42 60 82
                if (
                  buffer[j + 4] === 0x49 &&
                  buffer[j + 5] === 0x45 &&
                  buffer[j + 6] === 0x4e &&
                  buffer[j + 7] === 0x44 &&
                  buffer[j + 8] === 0xae &&
                  buffer[j + 9] === 0x42 &&
                  buffer[j + 10] === 0x60 &&
                  buffer[j + 11] === 0x82
                ) {
                  end = j + 12;
                  frames.push(buffer.slice(i, end));
                  i = end;
                  break;
                }
              }
              if (end === -1) break;
            } else {
              i++;
            }
          }
          return { frames, rest: buffer.slice(i) };
        }

        const stream: any = cmd.pipe();
        let cache: Buffer = Buffer.alloc(0);
        stream.on('data', (chunk: Buffer) => {
          cache = Buffer.concat([cache, chunk]);
          const { frames, rest } = extractPngFrames(cache);
          cache = rest as Buffer;
          for (const frame of frames) {
            // 每帧通过 IPC 发送到渲染进程
            const ab = frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength);
            win.webContents.send('video-frame', { sourceId, data: ab });
          }
        });
        stream.on('error', (err: any) => reject(err));
        stream.on('end', () => resolve('ended'));
      } catch (e) {
        reject(e);
      }
    });
  });

  ipcMain.handle('convertMovToWebmWithAlpha', async (_evt, arg?: { inputPath: string; outputPath: string }) => {
    const input = arg?.inputPath;
    const output = arg?.outputPath;
    if (!input || !output) throw new Error('inputPath 和 outputPath 必须指定');
    return await new Promise<string>((resolve, reject) => {
      try {
        ffmpeg(input)
          .videoCodec('libvpx-vp9')
          .outputOptions(['-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '28'])
          .output(output)
          .on('start', (commandLine: string) => {
            console.log('[ffmpeg] start:', commandLine);
          })
          .on('stderr', (line: string) => {
            console.log('[ffmpeg][stderr]', line);
          })
          .on('error', (err: any) => {
            console.error('[ffmpeg] error:', err);
            reject(err);
          })
          .on('end', () => {
            console.log('[ffmpeg] end');
            resolve('success');
          })
          .run();
      } catch (e) {
        reject(e);
      }
    });
  });
}

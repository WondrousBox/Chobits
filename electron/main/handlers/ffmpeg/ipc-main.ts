import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import crypto from 'node:crypto';

import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';
import { app } from 'electron';
import ffmpeg from 'fluent-ffmpeg';

import { AIRemoveBackground } from './ai-remove-background';

// ESM-safe __dirname/__filename
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

ffmpeg.setFfmpegPath(path.join(__dirname, '../../resources/ffmpeg', process.platform, process.arch, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'));
ffmpeg.setFfprobePath(path.join(__dirname, '../../resources/ffmpeg', process.platform, process.arch, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'));

// 简单 JPEG 帧分包器：按 SOI(0xFFD8) 和 EOI(0xFFD9) 切分
export function extractJpegFrames(buffer: Buffer): { frames: Buffer[]; rest: Buffer } {
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

export function initFFmpegHandlers(win: BrowserWindow): void {
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

  /**
   * 使用 AI 模型进行单张图片背景移除
   * @param arg.inputPath - 输入图片路径
   * @param arg.outputPath - 输出图片路径（PNG格式，支持透明通道）
   * @param arg.modelId - AI模型ID，默认 'briaai/RMBG-2.0'
   */
  ipcMain.handle(
    'removeBackgroundFromImage',
    async (
      _evt,
      arg?: {
        inputPath: string;
        outputPath: string;
        modelId?: string;
      }
    ) => {
      const input = arg?.inputPath;
      const output = arg?.outputPath;
      if (!input || !output) throw new Error('inputPath 和 outputPath 必须指定');

      const modelId = arg?.modelId || 'briaai/RMBG-2.0';

      return await new Promise<string>((resolve, reject) => {
        const remover = new AIRemoveBackground(modelId);

        remover
          .processImage(input, output)
          .then(() => {
            console.log('[AI抠图] 图片处理完成');
            resolve('success');
          })
          .catch((error: any) => {
            console.error('[AI抠图] 图片处理错误:', error);
            reject(error);
          });
      });
    }
  );

  /**
   * 从音频/视频文件中提取波形数据
   * 返回指定数量的采样点（峰值数据），用于高性能渲染
   * 支持缓存：计算后的波形数据会保存到文件，下次直接读取
   * @param arg.inputPath - 输入文件路径（音频或视频）
   * @param arg.samplesCount - 需要的采样点数量（默认 1000）
   */
  ipcMain.handle(
    'extractWaveform',
    async (
      _evt,
      arg: {
        inputPath: string;
        samplesCount?: number;
      }
    ) => {
      const input = arg.inputPath;
      const samplesCount = arg.samplesCount || 1000;

      if (!input) throw new Error('inputPath 必须指定');

      // 生成缓存文件路径
      const inputDir = path.dirname(input);
      const inputBasename = path.basename(input);
      const inputExt = path.extname(input);
      const inputNameWithoutExt = inputBasename.slice(0, -inputExt.length);

      // 使用文件名和采样数量生成缓存标识
      const cacheKey = crypto.createHash('md5').update(`${inputBasename}-${samplesCount}`).digest('hex');
      const cacheFileName = `.${inputNameWithoutExt}.waveform-${cacheKey}.json`;
      const cachePath = path.join(inputDir, cacheFileName);

      // 检查缓存是否存在且有效
      try {
        if (fs.existsSync(cachePath)) {
          const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));

          // 验证缓存数据的有效性
          if (
            cacheData.peaks &&
            Array.isArray(cacheData.peaks) &&
            typeof cacheData.duration === 'number' &&
            cacheData.samplesCount === samplesCount
          ) {
            console.log('[ffmpeg] 使用缓存的波形数据:', cachePath);
            return { peaks: cacheData.peaks, duration: cacheData.duration };
          }
        }
      } catch (err) {
        console.warn('[ffmpeg] 读取波形缓存失败，将重新计算:', err);
      }

      // 缓存不存在或无效，重新计算
      return await new Promise<{ peaks: number[]; duration: number }>((resolve, reject) => {
        try {
          // 首先获取音频时长
          ffmpeg.ffprobe(input, (err, metadata) => {
            if (err) {
              console.error('[ffmpeg] ffprobe error:', err);
              reject(err);
              return;
            }

            const duration = metadata.format.duration || 0;
            console.log('[ffmpeg] Audio duration:', duration);

            // 使用 ffmpeg 提取音频波形数据
            // 输出格式：每个采样点的峰值（-1 到 1 的浮点数）
            const buffers: Buffer[] = [];

            const cmd = ffmpeg(input)
              .audioChannels(1) // 转为单声道
              .audioFrequency(8000) // 降采样到 8kHz，减少数据量
              .format('f32le') // 32位浮点 PCM，小端序
              .noVideo()
              .on('start', (commandLine: string) => {
                console.log('[ffmpeg] waveform extraction start:', commandLine);
              })
              .on('error', (error: any) => {
                console.error('[ffmpeg] waveform extraction error:', error);
                reject(error);
              })
              .on('end', () => {
                console.log('[ffmpeg] waveform extraction end');

                // 合并所有 buffer
                const fullBuffer = Buffer.concat(buffers);
                const floatArray = new Float32Array(fullBuffer.buffer, fullBuffer.byteOffset, fullBuffer.length / 4);

                // 将原始采样降采样到指定数量的峰值
                const peaks: number[] = [];
                const samplesPerPeak = Math.max(1, Math.floor(floatArray.length / samplesCount));

                for (let i = 0; i < samplesCount; i++) {
                  const start = i * samplesPerPeak;
                  const end = Math.min(start + samplesPerPeak, floatArray.length);

                  let maxVal = 0;
                  for (let j = start; j < end; j++) {
                    const absVal = Math.abs(floatArray[j]);
                    if (absVal > maxVal) maxVal = absVal;
                  }

                  peaks.push(maxVal);
                }

                const result = { peaks, duration };

                // 保存到缓存文件
                try {
                  const cacheData = {
                    peaks,
                    duration,
                    samplesCount,
                    createdAt: Date.now(),
                    version: 1
                  };
                  fs.writeFileSync(cachePath, JSON.stringify(cacheData), 'utf-8');
                  console.log('[ffmpeg] 波形数据已缓存到:', cachePath);
                } catch (cacheErr) {
                  console.warn('[ffmpeg] 保存波形缓存失败:', cacheErr);
                  // 缓存保存失败不影响返回结果
                }

                resolve(result);
              });

            const stream = cmd.pipe() as any;
            stream.on('data', (chunk: Buffer) => {
              buffers.push(chunk);
            });
          });
        } catch (e) {
          reject(e);
        }
      });
    }
  );
}

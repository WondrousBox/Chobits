import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';
import { app } from 'electron';
import ffmpeg from 'fluent-ffmpeg';

import { readProjectTempSubDirJson, writeProjectTempSubDirFile } from '../resource/resource-project';
import { AIRemoveBackground } from './ai-remove-background';
import { executeExport } from './export-video';

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
   * @param arg.resourceId - 可选，资源ID（用于项目文件夹缓存）
   * @param arg.workspaceId - 可选，工作空间ID（用于项目文件夹缓存）
   */
  ipcMain.handle(
    'extractWaveform',
    async (
      _evt,
      arg: {
        inputPath: string;
        samplesCount?: number;
        resourceId?: string;
        workspaceId?: string;
      }
    ) => {
      const input = arg.inputPath;
      const samplesCount = arg.samplesCount || 1000;
      const { resourceId, workspaceId } = arg;

      if (!input) throw new Error('inputPath 必须指定');

      // 生成缓存文件名
      const inputBasename = path.basename(input);
      const inputExt = path.extname(input);
      const inputNameWithoutExt = inputBasename.slice(0, -inputExt.length);
      const cacheKey = crypto.createHash('md5').update(`${inputBasename}-${samplesCount}`).digest('hex');
      const cacheFileName = `${inputNameWithoutExt}.waveform-${cacheKey}.json`;

      // 确定缓存路径：优先使用项目文件夹，否则使用文件同目录
      let cachePath: string | null = null;
      let useProjectFolder = false;

      if (resourceId && workspaceId) {
        // 尝试从项目文件夹读取缓存
        const projectCache = await readProjectTempSubDirJson<{
          peaks: number[];
          duration: number;
          samplesCount: number;
          createdAt: number;
          version: number;
        }>(resourceId, workspaceId, 'waveforms', cacheFileName);

        if (projectCache && projectCache.peaks && Array.isArray(projectCache.peaks) && typeof projectCache.duration === 'number' && projectCache.samplesCount === samplesCount) {
          console.log('[ffmpeg] 从项目文件夹读取波形缓存:', cacheFileName);
          return { peaks: projectCache.peaks, duration: projectCache.duration };
        }

        useProjectFolder = true;
      } else {
        // 回退到旧逻辑：使用文件同目录
        const inputDir = path.dirname(input);
        cachePath = path.join(inputDir, `.${cacheFileName}`);

        // 检查缓存是否存在且有效
        try {
          if (fs.existsSync(cachePath)) {
            const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));

            if (cacheData.peaks && Array.isArray(cacheData.peaks) && typeof cacheData.duration === 'number' && cacheData.samplesCount === samplesCount) {
              return { peaks: cacheData.peaks, duration: cacheData.duration };
            }
          }
        } catch (err) {
          console.warn('[ffmpeg] 读取波形缓存失败，将重新计算:', err);
        }
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
              .on('error', (error: any) => {
                console.error('[ffmpeg] waveform extraction error:', error);
                reject(error);
              })
              .on('end', () => {
                // 合并所有 buffer
                const fullBuffer = Buffer.concat(buffers);
                const floatArray = new Float32Array(fullBuffer.buffer, fullBuffer.byteOffset, fullBuffer.length / 4);

                // 将原始采样降采样到指定数量的峰值
                // 使用浮点数精确计算每个 peak 对应的采样范围，避免累积误差导致波形与音频不同步
                const peaks: number[] = [];
                const totalSamples = floatArray.length;

                // 确保生成的 peaks 数量不超过实际采样数
                const actualPeaksCount = Math.min(samplesCount, totalSamples);

                for (let i = 0; i < actualPeaksCount; i++) {
                  // 使用浮点数精确计算每个 peak 的起止位置
                  // 这样可以确保所有采样都被均匀分配到各个 peak 中，不会丢失末尾数据
                  const start = Math.floor((i * totalSamples) / actualPeaksCount);
                  const end = Math.floor(((i + 1) * totalSamples) / actualPeaksCount);

                  let maxVal = 0;
                  for (let j = start; j < end; j++) {
                    const absVal = Math.abs(floatArray[j]);
                    if (absVal > maxVal) maxVal = absVal;
                  }

                  peaks.push(maxVal);
                }

                const result = { peaks, duration };

                // 保存到缓存
                const cacheData = {
                  peaks,
                  duration,
                  samplesCount,
                  createdAt: Date.now(),
                  version: 1
                };

                if (useProjectFolder && resourceId && workspaceId) {
                  // 保存到项目文件夹 temp/waveforms/
                  writeProjectTempSubDirFile(resourceId, workspaceId, 'waveforms', cacheFileName, JSON.stringify(cacheData))
                    .then((writeResult) => {
                      if (writeResult.success) {
                        console.log('[ffmpeg] 波形缓存已保存到项目文件夹:', cacheFileName);
                      } else {
                        console.warn('[ffmpeg] 保存波形缓存到项目文件夹失败:', writeResult.error);
                      }
                    })
                    .catch((cacheErr) => {
                      console.warn('[ffmpeg] 保存波形缓存到项目文件夹失败:', cacheErr);
                    });
                } else if (cachePath) {
                  // 回退到旧逻辑：保存到文件同目录
                  try {
                    fs.writeFileSync(cachePath, JSON.stringify(cacheData), 'utf-8');
                  } catch (cacheErr) {
                    console.warn('[ffmpeg] 保存波形缓存失败:', cacheErr);
                  }
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

  /**
   * 导出视频：合并视频+字幕+TTS音频
   */
  ipcMain.handle('exportVideo', async (_evt, arg: any) => {
    try {
      return await executeExport(win, arg);
    } catch (err: any) {
      // 确保错误信息能通过 IPC 完整传递给渲染进程
      console.error('[ipc-exportVideo] 导出失败:', err?.message || err);
      throw new Error(err?.message || String(err) || '导出视频失败');
    }
  });

  /**
   * 将视频转换为精灵动画（支持片段裁剪和色度键抠图）
   * @param arg.inputPath - 输入视频路径
   * @param arg.outputPath - 输出 WebM 路径
   * @param arg.segments - 片段标记 { start, loopStart, loopEnd, end } (毫秒)
   * @param arg.chromaKey - 色度键设置 { enabled, color, similarity, blend }
   * @param arg.meta - 元数据 { eventType, title }
   */
  ipcMain.handle(
    'convertToSpriteAnimation',
    async (
      _evt,
      arg?: {
        inputPath: string;
        outputPath: string;
        segments?: {
          start: number;
          loopStart: number;
          loopEnd: number;
          end: number;
        };
        chromaKey?: {
          enabled: boolean;
          color: string;
          similarity: number;
          blend: number;
        };
        meta?: {
          eventType?: string;
          title?: string;
        };
      }
    ) => {
      const input = arg?.inputPath;
      const output = arg?.outputPath;
      if (!input || !output) throw new Error('inputPath 和 outputPath 必须指定');

      const segments = arg?.segments || { start: 0, loopStart: 0, loopEnd: 0, end: 0 };
      const chromaKey = arg?.chromaKey || { enabled: false, color: '#00ff00', similarity: 40, blend: 15 };

      return await new Promise<string>((resolve, reject) => {
        try {
          let cmd = ffmpeg(input);

          // 构建滤镜链
          const filterParts: string[] = [];

          // 1. 片段裁剪（如果设置了）
          if (segments.start > 0 || segments.end > 0) {
            cmd = cmd.setStartTime(segments.start / 1000); // 转换为秒
            if (segments.end > 0) {
              const duration = (segments.end - segments.start) / 1000;
              cmd = cmd.setDuration(duration);
            }
          }

          // 2. 色度键抠图（如果启用）
          if (chromaKey.enabled) {
            // 解析颜色
            const hexColor = chromaKey.color.replace('#', '');
            const r = parseInt(hexColor.slice(0, 2), 16);
            const g = parseInt(hexColor.slice(2, 4), 16);
            const b = parseInt(hexColor.slice(4, 6), 16);
            const colorStr = `0x${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

            // 相似度转换为 FFmpeg 的 similarity 参数 (0.0-1.0)
            const similarity = chromaKey.similarity / 100;
            // 混合度
            const blend = chromaKey.blend / 100;

            // chromakey 滤镜：将指定颜色变为透明
            filterParts.push(`chromakey=${colorStr}:${similarity.toFixed(2)}:${blend.toFixed(2)}`);
          }

          // 应用滤镜
          if (filterParts.length > 0) {
            cmd = cmd.videoFilter(filterParts.join(','));
          }

          // 输出设置
          cmd = cmd
            .videoCodec('libvpx-vp9')
            .outputOptions([
              '-pix_fmt', 'yuva420p', // 支持透明通道
              '-b:v', '0',
              '-crf', '28', // 质量
              '-an' // 移除音频
            ])
            .output(output)
            .on('start', (commandLine: string) => {
              console.log('[ffmpeg][convertToSpriteAnimation] start:', commandLine);
            })
            .on('stderr', (line: string) => {
              console.log('[ffmpeg][convertToSpriteAnimation][stderr]', line);
            })
            .on('error', (err: any) => {
              console.error('[ffmpeg][convertToSpriteAnimation] error:', err);
              reject(err);
            })
            .on('end', () => {
              console.log('[ffmpeg][convertToSpriteAnimation] end');
              resolve('success');
            })
            .run();
        } catch (e) {
          reject(e);
        }
      });
    }
  );
}

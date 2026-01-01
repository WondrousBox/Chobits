import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { env, pipeline } from '@huggingface/transformers';
import ffmpeg from 'fluent-ffmpeg';
import sharp from 'sharp';

import { PluginConfigStore } from '../../../../packages/plugins/plugin-config-store';
import { getModelCacheDir } from '../../embedding/provider';

type Pipeline = any;

/**
 * 使用 AI 模型进行背景移除（基于 RMBG 模型）
 * 注意：处理视频会逐帧处理，速度较慢，但效果更好
 */
export class AIRemoveBackground {
  private pipeline: Pipeline | null = null;
  private modelId: string;

  constructor(modelId: string = 'briaai/RMBG-1.4') {
    this.modelId = modelId;
  }

  async init(): Promise<void> {
    if (this.pipeline) return;

    // 配置模型路径
    env.allowLocalModels = true;
    env.allowRemoteModels = false; // 允许从 HuggingFace 下载模型
    const pluginsDir = PluginConfigStore.getPluginsDir();
    env.localModelPath = pluginsDir || getModelCacheDir();
    env.cacheDir = path.join(env.localModelPath, 'transformers-cache');

    console.log(env.localModelPath);

    console.log('[AI抠图] 加载模型:', this.modelId);
    console.log('[AI抠图] 模型缓存目录:', env.cacheDir);

    try {
      // 使用 image-segmentation pipeline 进行背景移除
      this.pipeline = await pipeline('image-segmentation', this.modelId, {
        quantized: true // 使用量化模型以节省内存
      });
      console.log('[AI抠图] 模型加载完成');
    } catch (error: any) {
      console.error('[AI抠图] 模型加载失败:', error);
      throw new Error(`无法加载 AI 模型: ${error.message}`);
    }
  }

  /**
   * 处理单张图片，移除背景
   */
  async processImage(imagePath: string, outputPath: string): Promise<void> {
    await this.init();

    try {
      // 直接传入文件路径，transformers.js 会自动读取
      // 注意：transformers.js 的 image-segmentation pipeline 需要文件路径或 RawImage 对象，不接受 Buffer
      const outputs = await (this.pipeline as any)(imagePath);

      // 读取原始图片用于后续处理
      const imageBuffer = await fs.promises.readFile(imagePath);

      // 处理模型输出
      // image-segmentation pipeline 通常返回数组，每个元素包含 label 和 mask
      // RMBG 模型可能返回单个对象或数组
      console.log('[AI抠图] 模型输出类型:', Array.isArray(outputs) ? 'array' : typeof outputs);
      console.log('[AI抠图] 模型输出:', JSON.stringify(outputs, null, 2).substring(0, 500));

      let mask: any = null;

      if (Array.isArray(outputs)) {
        // 如果是数组，找到最大的掩码（通常是前景）
        // 或者找到 label 为 'person' 或类似的前景标签
        mask = outputs.find((o: any) => o.label && (o.label.toLowerCase().includes('person') || o.label.toLowerCase().includes('object')));
        if (!mask) {
          // 如果没有找到，使用第一个或最大的掩码
          mask = outputs[0];
        }
      } else if (outputs) {
        mask = outputs;
      }

      if (!mask || !mask.mask) {
        throw new Error(`模型输出格式不符合预期。输出: ${JSON.stringify(outputs).substring(0, 200)}`);
      }

      // 先获取原图尺寸
      const image = sharp(imageBuffer);
      const metadata = await image.metadata();
      const width = metadata.width || 1024;
      const height = metadata.height || 1024;

      // 获取掩码图像
      // mask.mask 通常是 RawImage 对象，需要转换为 Buffer
      const maskRawImage = mask.mask;
      let maskBuffer: Buffer;

      // 尝试不同的方式获取掩码数据
      if (maskRawImage.data) {
        // RawImage 对象有 data 属性（Uint8ClampedArray）
        const data = maskRawImage.data;
        const maskWidth = maskRawImage.width || width;
        const maskHeight = maskRawImage.height || height;

        // 转换为 Buffer
        maskBuffer = Buffer.from(data);
      } else if (Buffer.isBuffer(maskRawImage)) {
        maskBuffer = maskRawImage;
      } else {
        // 尝试调用 toBuffer 方法（如果 RawImage 支持）
        if (typeof maskRawImage.toBuffer === 'function') {
          maskBuffer = await maskRawImage.toBuffer();
        } else {
          throw new Error(`无法识别的掩码格式。掩码类型: ${typeof maskRawImage}`);
        }
      }

      // 处理掩码：RawImage 通常是单通道灰度图，需要转换为 RGBA
      // 掩码值：0 = 背景（透明），255 = 前景（不透明）
      // 注意：某些模型的掩码可能需要反转
      const maskWidth = maskRawImage.width || width;
      const maskHeight = maskRawImage.height || height;

      // 尝试检测通道数：如果数据长度是 width*height，则是单通道；如果是 width*height*4，则是 RGBA
      const expectedSingleChannel = maskWidth * maskHeight;
      const expectedRGBA = maskWidth * maskHeight * 4;
      const actualLength = maskBuffer.length;

      let channels = 1;
      if (actualLength === expectedRGBA) {
        channels = 4;
      } else if (actualLength === expectedSingleChannel) {
        channels = 1;
      } else {
        // 尝试自动检测
        channels = Math.round(actualLength / (maskWidth * maskHeight));
        if (channels < 1 || channels > 4) channels = 1;
      }

      const maskSharp = sharp(maskBuffer, {
        raw: {
          width: maskWidth,
          height: maskHeight,
          channels: channels
        }
      })
        .resize(width, height, { fit: 'fill' })
        .greyscale()
        .ensureAlpha(); // 确保有 alpha 通道

      // 将掩码作为 alpha 通道应用到原图
      const maskBufferProcessed = await maskSharp.png().toBuffer();

      // 使用掩码作为 alpha 通道
      await image
        .composite([
          {
            input: maskBufferProcessed,
            blend: 'dest-in' // 使用掩码的 alpha 通道
          }
        ])
        .png()
        .toFile(outputPath);
    } catch (error: any) {
      console.error('[AI抠图] 处理图片失败:', error);
      throw new Error(`AI 抠图处理失败: ${error.message}`);
    }
  }

  /**
   * 处理视频，逐帧移除背景
   * @param inputPath 输入视频路径
   * @param outputPath 输出视频路径
   * @param onProgress 进度回调 (currentFrame, totalFrames)
   */
  async processVideo(inputPath: string, outputPath: string, onProgress?: (current: number, total: number) => void): Promise<void> {
    await this.init();

    const tempDir = path.join(tmpdir(), `ai-remove-bg-${Date.now()}`);
    await fs.promises.mkdir(tempDir, { recursive: true });

    try {
      // 1. 提取视频帧
      const framesDir = path.join(tempDir, 'frames');
      const processedFramesDir = path.join(tempDir, 'processed_frames');
      await fs.promises.mkdir(framesDir, { recursive: true });
      await fs.promises.mkdir(processedFramesDir, { recursive: true });

      console.log('[AI抠图] 提取视频帧...');

      // 获取视频信息
      const videoInfo = await new Promise<any>((resolve, reject) => {
        ffmpeg.ffprobe(inputPath, (err, metadata) => {
          if (err) reject(err);
          else resolve(metadata);
        });
      });

      const duration = videoInfo.format.duration || 0;
      const fps = videoInfo.streams[0]?.r_frame_rate?.split('/').reduce((a: number, b: number) => a / b) || 30;
      const totalFrames = Math.ceil(duration * fps);

      // 提取所有帧
      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .outputOptions(['-vf', `fps=${fps}`])
          .output(path.join(framesDir, 'frame_%06d.png'))
          .on('end', () => resolve())
          .on('error', reject)
          .run();
      });

      // 2. 处理每一帧
      console.log('[AI抠图] 处理视频帧...');
      const frameFiles = (await fs.promises.readdir(framesDir)).filter((f) => f.endsWith('.png')).sort();

      for (let i = 0; i < frameFiles.length; i++) {
        const frameFile = frameFiles[i];
        const framePath = path.join(framesDir, frameFile);
        const outputFramePath = path.join(processedFramesDir, frameFile);

        await this.processImage(framePath, outputFramePath);

        if (onProgress) {
          onProgress(i + 1, frameFiles.length);
        }
      }

      // 3. 重新合成视频
      console.log('[AI抠图] 合成视频...');
      await new Promise<void>((resolve, reject) => {
        ffmpeg(path.join(processedFramesDir, 'frame_%06d.png'))
          .inputOptions(['-framerate', String(fps)])
          .videoCodec('prores_ks')
          .outputOptions(['-profile:v', '4444', '-pix_fmt', 'yuva444p10le'])
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', reject)
          .run();
      });

      console.log('[AI抠图] 完成');
    } finally {
      // 清理临时文件
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      } catch (e) {
        console.warn('[AI抠图] 清理临时文件失败:', e);
      }
    }
  }

  private async maskToBuffer(mask: any): Promise<Buffer> {
    // 将掩码转换为 Buffer
    // 这里需要根据实际模型输出格式实现
    // 如果 mask 已经是 ImageData 或 Buffer，直接返回
    if (Buffer.isBuffer(mask)) {
      return mask;
    }

    // 如果是其他格式，需要转换
    // 这里提供一个基础实现
    throw new Error('掩码格式转换未实现，请检查模型输出格式');
  }
}

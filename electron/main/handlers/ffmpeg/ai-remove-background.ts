import fs from 'node:fs';
import path from 'node:path';

import { env, pipeline } from '@huggingface/transformers';
import { app } from 'electron';
import sharp from 'sharp';

import { PluginConfigStore } from '../../../../packages/plugins/plugin-config-store';

type Pipeline = any;

/**
 * 使用 AI 模型进行背景移除（基于 RMBG 模型）
 * 注意：处理视频会逐帧处理，速度较慢，但效果更好
 */
export class AIRemoveBackground {
  private pipeline: Pipeline | null = null;
  private modelId: string;

  constructor(modelId: string = 'briaai/RMBG-2.0') {
    this.modelId = modelId;
  }

  async init(): Promise<void> {
    if (this.pipeline) return;

    // 配置模型路径
    env.allowLocalModels = true;
    env.allowRemoteModels = false; // 允许从 HuggingFace 下载模型
    const pluginsDir = PluginConfigStore.getPluginsDir();
    env.localModelPath = pluginsDir || path.join(app.getPath('userData'), 'data', 'models');
    env.cacheDir = path.join(env.localModelPath, 'transformers-cache');

    console.log(env.localModelPath);

    console.log('[AI抠图] 加载模型:', this.modelId);
    console.log('[AI抠图] 模型缓存目录:', env.cacheDir);

    try {
      // RMBG 模型是专门的背景移除模型，可能需要使用不同的 pipeline
      // 尝试使用 image-segmentation，如果失败则尝试其他方式
      try {
        this.pipeline = await pipeline('image-segmentation', this.modelId, {
          quantized: true // 使用量化模型以节省内存
        });
      } catch (e: any) {
        // 如果 image-segmentation 失败，尝试直接使用模型
        console.warn('[AI抠图] image-segmentation pipeline 失败，尝试其他方式:', e.message);
        // 某些模型可能需要使用 'image-to-image' 或其他 pipeline
        this.pipeline = await pipeline('image-to-image', this.modelId, {
          quantized: true
        });
      }
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

      // 处理掩码：RawImage 通常是单通道灰度图
      // 掩码值：255 = 前景（要保留），0 = 背景（要移除）
      // 注意：某些模型的掩码方向可能相反，需要反转
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

      console.log(`[AI抠图] 掩码尺寸: ${maskWidth}x${maskHeight}, 通道数: ${channels}, 数据长度: ${actualLength}`);

      // 处理掩码：将掩码的灰度值作为 alpha 通道
      // 掩码值：255 = 前景（不透明），0 = 背景（透明）
      // 注意：某些模型的掩码方向可能相反，如果效果不对，需要反转掩码

      const maskSharp = sharp(maskBuffer, {
        raw: {
          width: maskWidth,
          height: maskHeight,
          channels: channels
        }
      })
        .resize(width, height, { fit: 'fill' })
        .greyscale(); // 确保是单通道灰度图

      // 获取原图的 RGB 数据
      const originalRGB = await image
        .removeAlpha() // 移除原图的 alpha（如果有）
        .raw()
        .toBuffer();

      // 获取掩码的灰度数据（作为 alpha 通道）
      const maskAlpha = await maskSharp.raw().toBuffer();

      // 直接使用模型输出的掩码，不进行颜色计算判断
      // RMBG 模型返回的掩码：前景（要保留）是白色(255)，背景（要移除）是黑色(0)
      // 直接将掩码作为 alpha 通道使用
      const finalAlpha = maskAlpha;
      console.log('[AI抠图] 直接使用模型输出的掩码作为 alpha 通道');

      // 组合 RGB 和 Alpha：创建 RGBA 图像
      const outputPixels = Buffer.alloc(width * height * 4);
      for (let i = 0; i < width * height; i++) {
        const rgbIdx = i * 3;
        const rgbaIdx = i * 4;

        // RGB 来自原图
        outputPixels[rgbaIdx] = originalRGB[rgbIdx]; // R
        outputPixels[rgbaIdx + 1] = originalRGB[rgbIdx + 1]; // G
        outputPixels[rgbaIdx + 2] = originalRGB[rgbIdx + 2]; // B
        // Alpha 来自掩码
        outputPixels[rgbaIdx + 3] = finalAlpha[i]; // A
      }

      // 保存结果
      await sharp(outputPixels, {
        raw: {
          width: width,
          height: height,
          channels: 4
        }
      })
        .png()
        .toFile(outputPath);

      console.log('[AI抠图] 图片处理完成');
    } catch (error: any) {
      console.error('[AI抠图] 处理图片失败:', error);
      throw new Error(`AI 抠图处理失败: ${error.message}`);
    }
  }
}

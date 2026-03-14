import OpenAI from 'openai';

import type { ProviderSecrets } from '../../types';
import { resolvePiModelConfig } from './model-resolver';

export interface GeneratePiImageOptions {
  model: string;
  prompt: string;
  providerId: string;
  quality?: string;
  secrets: ProviderSecrets;
  size?: string;
}

export interface GeneratePiImageRequest {
  model: string;
  prompt: string;
  providerId: string;
  providerInstanceId?: string;
  quality?: string;
  size?: string;
}

const DEFAULT_IMAGE_BASE_URLS: Record<string, string> = {
  zhipu: 'https://open.bigmodel.cn/api/paas/v4/'
};

export class PiImageGenerationService {
  async generateImageUrl(options: GeneratePiImageOptions): Promise<string> {
    const { model, prompt, providerId, quality = 'standard', secrets, size = '1024x1024' } = options;
    const apiKey = String(secrets.apiKey || '').trim();

    if (!apiKey) {
      throw new Error(`Provider ${providerId} is missing API key for image generation`);
    }

    const baseURL = String(secrets.baseUrl || DEFAULT_IMAGE_BASE_URLS[providerId] || '').trim();
    const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
    const response = await client.images.generate({
      model,
      prompt,
      quality,
      size
    } as any);
    const imageUrl = (response as any)?.data?.[0]?.url;

    if (!imageUrl) {
      throw new Error('图片生成失败：未返回图片 URL');
    }

    return imageUrl;
  }

  async generateImageUrlFromRequest(request: GeneratePiImageRequest): Promise<string> {
    const { model, prompt, providerId, providerInstanceId, quality, size } = request;
    const resolved = await resolvePiModelConfig({
      extras: model
        ? {
            model
          }
        : undefined,
      messages: [],
      persist: false,
      providerId,
      providerInstanceId
    });

    return this.generateImageUrl({
      model: model || resolved.model.modelId,
      prompt,
      providerId: resolved.model.providerId,
      quality,
      secrets: resolved.model.secrets,
      size
    });
  }
}

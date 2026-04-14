import OpenAI from 'openai';

import { normalizeProviderPreset } from '../../provider-preset';
import { getProviderDefinitionPiBaseUrl } from '../../providers/service';
import type { ImageGenerationRequest, ImageGenerationResponse, ProviderSecrets, TokenUsage } from '../../types';
import { resolvePiModelConfig } from './model-resolver';

export interface GeneratePiImageOptions {
  model: string;
  prompt: string;
  providerId: string;
  quality?: string;
  secrets: ProviderSecrets;
  size?: string;
}

export type GeneratePiImageRequest = ImageGenerationRequest;

export function normalizeOpenAIImageUsage(usage: any): TokenUsage | undefined {
  const inputTokens = typeof usage?.input_tokens === 'number' && Number.isFinite(usage.input_tokens) && usage.input_tokens >= 0 ? usage.input_tokens : undefined;
  const outputTokens = typeof usage?.output_tokens === 'number' && Number.isFinite(usage.output_tokens) && usage.output_tokens >= 0 ? usage.output_tokens : undefined;
  const totalTokens = typeof usage?.total_tokens === 'number' && Number.isFinite(usage.total_tokens) && usage.total_tokens >= 0 ? usage.total_tokens : undefined;

  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) {
    return undefined;
  }

  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
    ...(inputTokens !== undefined ? { billableInputTokens: inputTokens } : {}),
    ...(outputTokens !== undefined ? { billableOutputTokens: outputTokens } : {}),
    ...(totalTokens !== undefined ? { billableTotalTokens: totalTokens } : {})
  };
}

export class PiImageGenerationService {
  async generateImage(options: GeneratePiImageOptions): Promise<ImageGenerationResponse> {
    const { model, prompt, providerId, quality = 'standard', secrets, size = '1024x1024' } = options;
    const apiKey = String(secrets.apiKey || '').trim();

    if (!apiKey) {
      throw new Error(`Provider ${providerId} is missing API key for image generation`);
    }

    const baseURL = String(secrets.baseUrl || getProviderDefinitionPiBaseUrl(providerId) || '').trim();
    const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
    const response = await client.images.generate({
      model,
      prompt,
      quality,
      size
    } as any);
    const imageUrl = (response as any)?.data?.[0]?.url;
    const revisedPrompt = typeof (response as any)?.data?.[0]?.revised_prompt === 'string' ? (response as any).data[0].revised_prompt : undefined;
    const usage = normalizeOpenAIImageUsage((response as any)?.usage);

    if (!imageUrl) {
      throw new Error('图片生成失败：未返回图片 URL');
    }

    return {
      imageUrl,
      model,
      providerId,
      ...(revisedPrompt ? { revisedPrompt } : {}),
      ...((response as any)?.usage ? { rawUsage: (response as any).usage } : {}),
      ...(usage ? { usage } : {})
    };
  }

  async generateImageUrl(options: GeneratePiImageOptions): Promise<string> {
    const response = await this.generateImage(options);
    return response.imageUrl;
  }

  async generateImageFromRequest(request: GeneratePiImageRequest): Promise<ImageGenerationResponse> {
    const normalizedRequest = normalizeProviderPreset(request);
    const { model, prompt, quality, size } = normalizedRequest;
    const resolved = await resolvePiModelConfig({
      ...normalizedRequest,
      extras: {
        ...(normalizedRequest.extras || {}),
        ...(model ? { model } : {})
      },
      messages: [],
      persist: false
    });

    return this.generateImage({
      model: model || resolved.model.modelId,
      prompt,
      providerId: resolved.model.providerId,
      quality,
      secrets: resolved.model.secrets,
      size
    });
  }

  async generateImageUrlFromRequest(request: GeneratePiImageRequest): Promise<string> {
    const response = await this.generateImageFromRequest(request);
    return response.imageUrl;
  }
}

import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import OpenAI, { toFile } from 'openai';

import { normalizeProviderPreset } from '../../provider-preset';
import { getProviderDefinitionPiBaseUrl } from '../../providers/service';
import { getProvider } from '../../registry';
import { getFirstApiKey } from '../../settings-store';
import type { GeneratedImageArtifact, ImageEditRequest, ImageGenerationRequest, ImageGenerationResponse, ProviderSecrets, TokenUsage } from '../../types';
import { resolvePiModelConfig } from './model-resolver';

export interface GeneratePiImageOptions {
  model: string;
  outputCompression?: number;
  outputDir?: string;
  outputFormat?: string;
  partialImages?: number;
  prompt: string;
  providerId: string;
  quality?: string;
  responseFormat?: 'url' | 'b64_json';
  secrets: ProviderSecrets;
  sessionId?: string;
  signal?: AbortSignal;
  size?: string;
}

export type GeneratePiImageRequest = ImageGenerationRequest;
export type EditPiImageRequest = ImageEditRequest;

const DEFAULT_OUTPUT_DIR = path.join(os.tmpdir(), 'chobits-ai-images');
const MIME_BY_EXT: Record<string, string> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp'
};
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

function getImageMimeType(filePath: string): string {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function normalizeOutputFormat(value?: string): 'png' | 'jpeg' | 'webp' {
  if (value === 'jpeg' || value === 'webp') return value;
  return 'png';
}

function responseDataItems(response: unknown): any[] {
  const data = (response as any)?.data;
  return Array.isArray(data) ? data : [];
}

function getFirstImageUrl(response: unknown): string | undefined {
  return responseDataItems(response).find((item) => typeof item?.url === 'string' && item.url.trim())?.url;
}

function getFirstRevisedPrompt(response: unknown): string | undefined {
  return responseDataItems(response).find((item) => typeof item?.revised_prompt === 'string' && item.revised_prompt.trim())?.revised_prompt;
}

async function ensureOutputDir(outputDir?: string): Promise<string> {
  const resolved = path.resolve(outputDir || DEFAULT_OUTPUT_DIR);
  await fsp.mkdir(resolved, { recursive: true });
  return resolved;
}

async function writeBase64Artifact(
  base64: string,
  options: { index: number; mimeType?: string; model: string; outputDir?: string; outputFormat?: string; requestKind: 'edit' | 'generation'; total: number }
): Promise<GeneratedImageArtifact> {
  const outputDir = await ensureOutputDir(options.outputDir);
  const mimeType = options.mimeType || `image/${normalizeOutputFormat(options.outputFormat)}`;
  const ext = EXT_BY_MIME[mimeType] || normalizeOutputFormat(options.outputFormat);
  const safeModel = options.model.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-|-$/g, '') || 'image';
  const suffix = options.total > 1 ? `-${options.index + 1}` : '';
  const filePath = path.join(outputDir, `${options.requestKind}-${safeModel}-${Date.now()}${suffix}.${ext}`);
  const buffer = Buffer.from(base64, 'base64');
  await fsp.writeFile(filePath, buffer);
  return {
    filePath,
    mimeType,
    sizeBytes: buffer.byteLength
  };
}

async function materializeImageResponse(
  response: unknown,
  options: { model: string; outputDir?: string; outputFormat?: string; requestKind: 'edit' | 'generation' }
): Promise<GeneratedImageArtifact[]> {
  const artifacts: GeneratedImageArtifact[] = [];
  const items = responseDataItems(response);

  for (const [index, item] of items.entries()) {
    if (typeof item?.b64_json === 'string' && item.b64_json.trim()) {
      const artifact = await writeBase64Artifact(item.b64_json, {
        index,
        model: options.model,
        outputDir: options.outputDir,
        outputFormat: options.outputFormat,
        requestKind: options.requestKind,
        total: items.length
      });
      artifacts.push({
        ...artifact,
        ...(typeof item?.revised_prompt === 'string' ? { revisedPrompt: item.revised_prompt } : {})
      });
      continue;
    }

    if (typeof item?.url === 'string' && item.url.trim()) {
      artifacts.push({
        imageUrl: item.url,
        ...(typeof item?.revised_prompt === 'string' ? { revisedPrompt: item.revised_prompt } : {})
      });
    }
  }

  return artifacts;
}

function normalizeBaseURL(secrets: ProviderSecrets, providerId: string): string {
  return String(secrets.baseUrl || getProviderDefinitionPiBaseUrl(providerId) || '').trim();
}

function normalizeApiKey(secrets: ProviderSecrets): string {
  return String(getFirstApiKey(secrets.apiKey) || '').trim();
}

function logImageProviderRequest(kind: 'edit' | 'generation', payload: Record<string, unknown>): void {
  console.info(`[PiImageGenerationService] ${kind} request`, payload);
}

async function resolveProviderSecrets(providerId: string, secrets: ProviderSecrets): Promise<ProviderSecrets> {
  const provider = getProvider(providerId);
  const adapterSecrets = ((await Promise.resolve(provider?.getSecrets?.() || {})) as ProviderSecrets) || {};
  return {
    ...adapterSecrets,
    ...secrets
  };
}

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
    options.signal?.throwIfAborted();
    const { model, prompt, providerId, quality = 'standard', responseFormat = 'url', size = '1024x1024' } = options;
    const secrets = await resolveProviderSecrets(providerId, options.secrets);
    const apiKey = normalizeApiKey(secrets);

    if (!apiKey) {
      throw new Error(`Provider ${providerId} is missing API key for image generation`);
    }

    const baseURL = normalizeBaseURL(secrets, providerId);
    logImageProviderRequest('generation', {
      baseURL,
      model,
      outputCompression: options.outputCompression,
      outputFormat: options.outputFormat,
      partialImages: options.partialImages,
      providerId,
      quality,
      responseFormat,
      sessionId: options.sessionId,
      size,
      prompt
    });
    const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
    const response = await client.images.generate(
      {
        model,
        prompt,
        response_format: responseFormat,
        quality,
        size,
        ...(options.outputFormat ? { output_format: options.outputFormat } : {}),
        ...(typeof options.outputCompression === 'number' ? { output_compression: options.outputCompression } : {}),
        ...(typeof options.partialImages === 'number' ? { partial_images: options.partialImages } : {}),
        ...(options.sessionId ? { session_id: options.sessionId } : {})
      } as any,
      options.signal ? { signal: options.signal } : undefined
    );
    options.signal?.throwIfAborted();
    const artifacts = await materializeImageResponse(response, {
      model,
      outputDir: options.outputDir,
      outputFormat: options.outputFormat,
      requestKind: 'generation'
    });
    options.signal?.throwIfAborted();
    const imageUrl = artifacts[0]?.imageUrl || getFirstImageUrl(response);
    const filePath = artifacts[0]?.filePath;
    const revisedPrompt = artifacts[0]?.revisedPrompt || getFirstRevisedPrompt(response);
    const usage = normalizeOpenAIImageUsage((response as any)?.usage);

    if (!imageUrl && !filePath) {
      throw new Error('图片生成失败：未返回图片数据');
    }

    return {
      imageUrl: imageUrl || filePath || '',
      ...(filePath ? { filePath } : {}),
      ...(artifacts.length ? { artifacts } : {}),
      model,
      providerId,
      ...(revisedPrompt ? { revisedPrompt } : {}),
      ...((response as any)?.usage ? { rawUsage: (response as any).usage } : {}),
      ...(usage ? { usage } : {})
    };
  }

  async generateImageArtifact(options: GeneratePiImageOptions & { outputDir?: string }): Promise<ImageGenerationResponse> {
    return this.generateImage({
      ...options,
      outputFormat: normalizeOutputFormat(options.outputFormat),
      responseFormat: 'b64_json'
    });
  }

  async editImage(options: GeneratePiImageOptions & { imagePaths: string[]; maskPath?: string; outputDir?: string }): Promise<ImageGenerationResponse> {
    const secrets = await resolveProviderSecrets(options.providerId, options.secrets);
    const apiKey = normalizeApiKey(secrets);
    if (!apiKey) {
      throw new Error(`Provider ${options.providerId} is missing API key for image editing`);
    }

    const imagePaths = options.imagePaths.map((filePath) => filePath.trim()).filter(Boolean);
    if (imagePaths.length === 0) {
      throw new Error('图片编辑失败：缺少参考图片');
    }

    const baseURL = normalizeBaseURL(secrets, options.providerId);
    logImageProviderRequest('edit', {
      baseURL,
      imagePaths,
      maskPath: options.maskPath,
      model: options.model,
      outputCompression: options.outputCompression,
      outputFormat: options.outputFormat,
      partialImages: options.partialImages,
      providerId: options.providerId,
      quality: options.quality,
      responseFormat: options.responseFormat || 'b64_json',
      sessionId: options.sessionId,
      size: options.size,
      prompt: options.prompt
    });
    const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
    const imageFiles = await Promise.all(
      imagePaths.map(async (filePath) => {
        const buffer = await fsp.readFile(filePath);
        return toFile(buffer, path.basename(filePath), { type: getImageMimeType(filePath) });
      })
    );
    const mask = options.maskPath
      ? await toFile(await fsp.readFile(options.maskPath), path.basename(options.maskPath), {
          type: getImageMimeType(options.maskPath)
        })
      : undefined;
    const data = await client.images.edit({
      image: imageFiles.length === 1 ? imageFiles[0] : imageFiles,
      model: options.model,
      prompt: options.prompt,
      ...(mask ? { mask } : {}),
      ...(options.size ? { size: options.size } : {}),
      ...(options.quality ? { quality: options.quality } : {}),
      response_format: options.responseFormat || 'b64_json',
      output_format: normalizeOutputFormat(options.outputFormat),
      ...(typeof options.outputCompression === 'number' ? { output_compression: options.outputCompression } : {}),
      ...(typeof options.partialImages === 'number' ? { partial_images: options.partialImages } : {}),
      ...(options.sessionId ? { session_id: options.sessionId } : {})
    } as any);
    const artifacts = await materializeImageResponse(data, {
      model: options.model,
      outputDir: options.outputDir,
      outputFormat: options.outputFormat,
      requestKind: 'edit'
    });
    const imageUrl = artifacts[0]?.imageUrl || getFirstImageUrl(data);
    const filePath = artifacts[0]?.filePath;
    const revisedPrompt = artifacts[0]?.revisedPrompt || getFirstRevisedPrompt(data);
    const usage = normalizeOpenAIImageUsage(data?.usage);

    if (!imageUrl && !filePath) {
      throw new Error('图片编辑失败：未返回图片数据');
    }

    return {
      imageUrl: imageUrl || filePath || '',
      ...(filePath ? { filePath } : {}),
      ...(artifacts.length ? { artifacts } : {}),
      model: options.model,
      providerId: options.providerId,
      ...(revisedPrompt ? { revisedPrompt } : {}),
      ...(data?.usage ? { rawUsage: data.usage } : {}),
      ...(usage ? { usage } : {})
    };
  }

  async generateImageUrl(options: GeneratePiImageOptions): Promise<string> {
    const response = await this.generateImage(options);
    return response.imageUrl;
  }

  async generateImageFromRequest(request: GeneratePiImageRequest, signal?: AbortSignal): Promise<ImageGenerationResponse> {
    const normalizedRequest = normalizeProviderPreset(request);
    const { model, outputCompression, outputFormat, partialImages, prompt, quality, responseFormat, sessionId, size } = normalizedRequest;
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
      outputCompression,
      outputDir: typeof normalizedRequest.extras?.outputDir === 'string' ? normalizedRequest.extras.outputDir : undefined,
      outputFormat,
      partialImages,
      prompt,
      providerId: resolved.model.providerId,
      quality,
      responseFormat,
      secrets: resolved.model.secrets,
      sessionId,
      signal,
      size
    });
  }

  async generateImageUrlFromRequest(request: GeneratePiImageRequest, signal?: AbortSignal): Promise<string> {
    const response = await this.generateImageFromRequest(request, signal);
    return response.imageUrl;
  }

  async generateImageArtifactFromRequest(request: GeneratePiImageRequest, signal?: AbortSignal): Promise<ImageGenerationResponse> {
    const normalizedRequest = normalizeProviderPreset(request);
    const resolved = await resolvePiModelConfig({
      ...normalizedRequest,
      extras: {
        ...(normalizedRequest.extras || {}),
        ...(normalizedRequest.model ? { model: normalizedRequest.model } : {})
      },
      messages: [],
      persist: false
    });

    return this.generateImageArtifact({
      model: normalizedRequest.model || resolved.model.modelId,
      outputCompression: normalizedRequest.outputCompression,
      outputDir: typeof normalizedRequest.extras?.outputDir === 'string' ? normalizedRequest.extras.outputDir : undefined,
      outputFormat: normalizedRequest.outputFormat,
      partialImages: normalizedRequest.partialImages,
      prompt: normalizedRequest.prompt,
      providerId: resolved.model.providerId,
      quality: normalizedRequest.quality,
      secrets: resolved.model.secrets,
      sessionId: normalizedRequest.sessionId,
      signal,
      size: normalizedRequest.size
    });
  }

  async editImageFromRequest(request: EditPiImageRequest): Promise<ImageGenerationResponse> {
    const normalizedRequest = normalizeProviderPreset(request);
    const resolved = await resolvePiModelConfig({
      ...normalizedRequest,
      extras: {
        ...(normalizedRequest.extras || {}),
        ...(normalizedRequest.model ? { model: normalizedRequest.model } : {})
      },
      messages: [],
      persist: false
    });

    return this.editImage({
      imagePaths: normalizedRequest.imagePaths,
      maskPath: normalizedRequest.maskPath,
      model: normalizedRequest.model || resolved.model.modelId,
      outputCompression: normalizedRequest.outputCompression,
      outputDir: typeof normalizedRequest.extras?.outputDir === 'string' ? normalizedRequest.extras.outputDir : undefined,
      outputFormat: normalizedRequest.outputFormat,
      partialImages: normalizedRequest.partialImages,
      prompt: normalizedRequest.prompt,
      providerId: resolved.model.providerId,
      quality: normalizedRequest.quality,
      responseFormat: normalizedRequest.responseFormat,
      secrets: resolved.model.secrets,
      sessionId: normalizedRequest.sessionId,
      size: normalizedRequest.size
    });
  }
}

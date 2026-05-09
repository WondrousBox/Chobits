import { randomUUID } from 'node:crypto';

import { emitAiUsageObservedEvent } from '../../analytics/events';
import { AI_USAGE_CATEGORIES, AI_USAGE_FEATURES, AI_USAGE_SOURCE_TYPES, AI_USAGE_STAGES, type RecordAiUsageEventInput } from '../../analytics/types';
import { normalizeProviderPreset, resolveProviderPresetId } from '../../provider-preset';
import { getProviderDefinitionDefaultModel } from '../../providers/service';
import { supportsProviderCapability } from '../../providers/service';
import { getProvider } from '../../registry';
import type {
  ChatRequest,
  ChatResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  MusicGenerationRequest,
  MusicGenerationResponse,
  TokenUsage,
  TranscriptionRequest,
  TranscriptionResponse
} from '../../types';
import type { PiRuntimeAvailability } from './contracts';
import { PiImageGenerationService } from './image-generation-service';
import { PiMusicGenerationService } from './music-generation-service';
import { resolvePiModelConfig } from './model-resolver';
import { PiSessionService } from './session-service';

function forcePiRuntimeRequest(req: ChatRequest): ChatRequest {
  return {
    ...req,
    extras: {
      ...(req.extras || {}),
      runtime: 'pi'
    },
    persist: false
  };
}

type AnalyticsExtrasCarrier = {
  extras?: Record<string, any>;
};

type ExecutionUsageOverride = Partial<Pick<RecordAiUsageEventInput, 'operationKey' | 'sourceType' | 'sourceId' | 'sourceLabel' | 'usageCategory' | 'usageFeature' | 'usageStage'>> & {
  metadata?: Record<string, unknown>;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function safeUuid(): string {
  try {
    return randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function toAnalyticsUsage(usage?: TokenUsage): RecordAiUsageEventInput['usage'] | undefined {
  if (!usage) {
    return undefined;
  }

  return {
    billableInputTokens: usage.billableInputTokens,
    billableOutputTokens: usage.billableOutputTokens,
    billableTotalTokens: usage.billableTotalTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    estimatedCost: usage.cost,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens,
    totalTokens: usage.totalTokens
  };
}

async function recordExecutionUsageEventSafely(context: 'embed' | 'transcribe' | 'generateImage' | 'generateMusic', input: RecordAiUsageEventInput): Promise<void> {
  await emitAiUsageObservedEvent(input, { producer: `PiExecutionService:${context}` });
}

function resolveExecutionRequestId(payload: AnalyticsExtrasCarrier): string {
  const extras = payload.extras;
  const requestId = typeof extras?.requestId === 'string' && extras.requestId.trim() ? extras.requestId.trim() : undefined;
  return requestId || safeUuid();
}

function resolveExecutionUsageOverride(payload: AnalyticsExtrasCarrier): ExecutionUsageOverride | undefined {
  const rawOverride = payload.extras?.analyticsUsage;
  if (!isPlainRecord(rawOverride)) {
    return undefined;
  }

  const sourceType =
    typeof rawOverride.sourceType === 'string' && AI_USAGE_SOURCE_TYPES.includes(rawOverride.sourceType as (typeof AI_USAGE_SOURCE_TYPES)[number]) ? rawOverride.sourceType : undefined;
  const usageCategory =
    typeof rawOverride.usageCategory === 'string' && AI_USAGE_CATEGORIES.includes(rawOverride.usageCategory as (typeof AI_USAGE_CATEGORIES)[number]) ? rawOverride.usageCategory : undefined;
  const usageFeature =
    typeof rawOverride.usageFeature === 'string' && AI_USAGE_FEATURES.includes(rawOverride.usageFeature as (typeof AI_USAGE_FEATURES)[number]) ? rawOverride.usageFeature : undefined;
  const usageStage = typeof rawOverride.usageStage === 'string' && AI_USAGE_STAGES.includes(rawOverride.usageStage as (typeof AI_USAGE_STAGES)[number]) ? rawOverride.usageStage : undefined;
  const operationKey = typeof rawOverride.operationKey === 'string' && rawOverride.operationKey.trim() ? rawOverride.operationKey.trim() : undefined;
  const sourceId = typeof rawOverride.sourceId === 'string' && rawOverride.sourceId.trim() ? rawOverride.sourceId.trim() : undefined;
  const sourceLabel = typeof rawOverride.sourceLabel === 'string' && rawOverride.sourceLabel.trim() ? rawOverride.sourceLabel.trim() : undefined;
  const metadata = isPlainRecord(rawOverride.metadata) ? rawOverride.metadata : undefined;
  const hasClassificationOverride = !!sourceType || !!usageCategory || !!usageFeature || !!usageStage;
  const shouldApplyClassificationOverride = !!sourceType && !!usageCategory && !!usageFeature && !!usageStage;

  if (!hasClassificationOverride && !operationKey && !sourceId && !sourceLabel && !metadata) {
    return undefined;
  }

  const classificationOverride: Partial<ExecutionUsageOverride> = shouldApplyClassificationOverride
    ? {
        sourceType: sourceType as ExecutionUsageOverride['sourceType'],
        usageCategory: usageCategory as ExecutionUsageOverride['usageCategory'],
        usageFeature: usageFeature as ExecutionUsageOverride['usageFeature'],
        usageStage: usageStage as ExecutionUsageOverride['usageStage']
      }
    : {};

  return {
    ...(metadata ? { metadata } : {}),
    ...(operationKey ? { operationKey } : {}),
    ...(sourceId ? { sourceId } : {}),
    ...(sourceLabel ? { sourceLabel } : {}),
    ...classificationOverride
  };
}

function getBinaryInputBytes(file: File | Blob | Buffer | ArrayBuffer): number | undefined {
  if (typeof File !== 'undefined' && file instanceof File) {
    return Number.isFinite(file.size) && file.size >= 0 ? file.size : undefined;
  }

  if (typeof Blob !== 'undefined' && file instanceof Blob) {
    return Number.isFinite(file.size) && file.size >= 0 ? file.size : undefined;
  }

  if (Buffer.isBuffer(file)) {
    return file.byteLength;
  }

  if (file instanceof ArrayBuffer) {
    return file.byteLength;
  }

  return undefined;
}

function extractProviderUsageMetadata(rawUsage: unknown): Record<string, unknown> | undefined {
  if (!isPlainRecord(rawUsage)) {
    return undefined;
  }

  const metadata: Record<string, unknown> = {};
  const usageType = typeof rawUsage.type === 'string' && rawUsage.type.trim() ? rawUsage.type.trim() : undefined;
  const billedSeconds = typeof rawUsage.seconds === 'number' && Number.isFinite(rawUsage.seconds) && rawUsage.seconds >= 0 ? rawUsage.seconds : undefined;
  const inputTokenDetails = isPlainRecord(rawUsage.input_token_details) ? rawUsage.input_token_details : isPlainRecord(rawUsage.input_tokens_details) ? rawUsage.input_tokens_details : undefined;
  const outputTokenDetails = isPlainRecord(rawUsage.output_token_details) ? rawUsage.output_token_details : isPlainRecord(rawUsage.output_tokens_details) ? rawUsage.output_tokens_details : undefined;

  if (usageType) {
    metadata.providerUsageType = usageType;
  }
  if (billedSeconds !== undefined) {
    metadata.providerBilledSeconds = billedSeconds;
  }

  const inputAudioTokens =
    typeof inputTokenDetails?.audio_tokens === 'number' && Number.isFinite(inputTokenDetails.audio_tokens) && inputTokenDetails.audio_tokens >= 0 ? inputTokenDetails.audio_tokens : undefined;
  const inputImageTokens =
    typeof inputTokenDetails?.image_tokens === 'number' && Number.isFinite(inputTokenDetails.image_tokens) && inputTokenDetails.image_tokens >= 0 ? inputTokenDetails.image_tokens : undefined;
  const inputTextTokens =
    typeof inputTokenDetails?.text_tokens === 'number' && Number.isFinite(inputTokenDetails.text_tokens) && inputTokenDetails.text_tokens >= 0 ? inputTokenDetails.text_tokens : undefined;
  const outputImageTokens =
    typeof outputTokenDetails?.image_tokens === 'number' && Number.isFinite(outputTokenDetails.image_tokens) && outputTokenDetails.image_tokens >= 0 ? outputTokenDetails.image_tokens : undefined;
  const outputTextTokens =
    typeof outputTokenDetails?.text_tokens === 'number' && Number.isFinite(outputTokenDetails.text_tokens) && outputTokenDetails.text_tokens >= 0 ? outputTokenDetails.text_tokens : undefined;

  if (inputAudioTokens !== undefined) {
    metadata.providerInputAudioTokens = inputAudioTokens;
  }
  if (inputImageTokens !== undefined) {
    metadata.providerInputImageTokens = inputImageTokens;
  }
  if (inputTextTokens !== undefined) {
    metadata.providerInputTextTokens = inputTextTokens;
  }
  if (outputImageTokens !== undefined) {
    metadata.providerOutputImageTokens = outputImageTokens;
  }
  if (outputTextTokens !== undefined) {
    metadata.providerOutputTextTokens = outputTextTokens;
  }

  return Object.keys(metadata).length ? metadata : undefined;
}

export class PiExecutionService {
  private readonly sessionService = new PiSessionService();
  private readonly imageGenerationService = new PiImageGenerationService();
  private readonly musicGenerationService = new PiMusicGenerationService();

  getAvailability(req?: Pick<ChatRequest, 'extras'>): PiRuntimeAvailability {
    return this.sessionService.getAvailability(req);
  }

  async chatEphemeral(req: ChatRequest): Promise<ChatResponse> {
    return this.sessionService.chatEphemeral(forcePiRuntimeRequest(normalizeProviderPreset(req)));
  }

  async completeText(req: ChatRequest): Promise<string> {
    const response = await this.chatEphemeral(req);
    return response.message?.content || '';
  }

  async streamText(req: ChatRequest, onDelta?: (delta: string, accumulated: string) => void, signal?: AbortSignal): Promise<string> {
    const forcedRequest = forcePiRuntimeRequest(normalizeProviderPreset(req));
    const availability = this.getAvailability(forcedRequest);

    if (!availability.available) {
      throw new Error(availability.reason || 'Pi runtime packages are not installed yet.');
    }

    let accumulatedText = '';
    let completedText = '';
    let streamError: Error | undefined;

    await this.sessionService.chatStream(
      forcedRequest,
      (event) => {
        switch (event.type) {
          case 'delta':
            if (event.data.text) {
              accumulatedText += event.data.text;
              onDelta?.(event.data.text, accumulatedText);
            }
            return;
          case 'message_completed':
            completedText = event.data.message?.content || accumulatedText;
            return;
          case 'error':
            streamError = new Error(event.data.message || 'Pi runtime execution failed');
            return;
          default:
            return;
        }
      },
      signal
    );

    if (streamError) {
      throw streamError;
    }

    return completedText || accumulatedText;
  }

  async embed(payload: EmbeddingRequest): Promise<EmbeddingResponse> {
    const providerPresetId = resolveProviderPresetId(payload);
    const resolved = await this.resolveProviderCapability(payload.providerId || 'openai', providerPresetId);

    if (!supportsProviderCapability(resolved.provider.id, 'embeddings', resolved.provider) || !resolved.provider.embed) {
      throw new Error(`Provider ${resolved.provider.id} has no embeddings`);
    }

    const requestId = resolveExecutionRequestId(payload);
    const usageOverride = resolveExecutionUsageOverride(payload);
    const startedAt = Date.now();
    const textCount = Array.isArray(payload.texts) ? payload.texts.length : 0;
    const totalInputChars = Array.isArray(payload.texts) ? payload.texts.reduce((sum, text) => sum + (typeof text === 'string' ? text.length : 0), 0) : 0;
    const request = {
      ...normalizeProviderPreset(payload),
      providerId: resolved.provider.id,
      extras: {
        ...(payload.extras || {}),
        secrets: resolved.model.secrets
      }
    };

    try {
      const response = await resolved.provider.embed(request);
      await recordExecutionUsageEventSafely('embed', {
        traceId: requestId,
        requestId,
        operationKey: usageOverride?.operationKey || 'vectorize',
        sourceType: usageOverride?.sourceType || 'embedding',
        sourceId: usageOverride?.sourceId || requestId,
        sourceLabel: usageOverride?.sourceLabel || '向量化',
        usageCategory: usageOverride?.usageCategory || 'system',
        usageFeature: usageOverride?.usageFeature || 'embedding',
        usageStage: usageOverride?.usageStage || 'vectorize',
        providerId: response.providerId || resolved.provider.id,
        providerPresetId: resolved.model.presetId || providerPresetId,
        model: response.model || payload.model || getProviderDefinitionDefaultModel(resolved.provider.id, 'embeddings', resolved.provider.id) || 'unknown',
        agentId: 'pi-execution',
        status: 'completed',
        usage: toAnalyticsUsage(response.usage),
        rawUsage: response.rawUsage,
        meteringSource: 'provider_reported',
        startedAt,
        completedAt: Date.now(),
        metadata: {
          runtime: 'pi',
          textCount,
          totalInputChars,
          normalize: payload.normalize ?? null,
          vectorCount: response.vectors.length,
          vectorDim: response.dim,
          ...(usageOverride?.metadata || {})
        }
      });

      return response;
    } catch (error) {
      await recordExecutionUsageEventSafely('embed', {
        traceId: requestId,
        requestId,
        operationKey: usageOverride?.operationKey || 'vectorize',
        sourceType: usageOverride?.sourceType || 'embedding',
        sourceId: usageOverride?.sourceId || requestId,
        sourceLabel: usageOverride?.sourceLabel || '向量化',
        usageCategory: usageOverride?.usageCategory || 'system',
        usageFeature: usageOverride?.usageFeature || 'embedding',
        usageStage: usageOverride?.usageStage || 'vectorize',
        providerId: resolved.provider.id,
        providerPresetId: resolved.model.presetId || providerPresetId,
        model: payload.model || getProviderDefinitionDefaultModel(resolved.provider.id, 'embeddings', resolved.provider.id) || 'unknown',
        agentId: 'pi-execution',
        status: 'failed',
        meteringSource: 'provider_reported',
        startedAt,
        completedAt: Date.now(),
        metadata: {
          errorMessage: error instanceof Error ? error.message : String(error),
          runtime: 'pi',
          textCount,
          totalInputChars,
          normalize: payload.normalize ?? null,
          ...(usageOverride?.metadata || {})
        }
      });
      throw error;
    }
  }

  async transcribe(payload: TranscriptionRequest): Promise<TranscriptionResponse> {
    const providerPresetId = resolveProviderPresetId(payload);
    const resolved = await this.resolveProviderCapability(payload.providerId, providerPresetId);

    if (!supportsProviderCapability(resolved.provider.id, 'transcribe', resolved.provider) || !resolved.provider.transcribe) {
      throw new Error(`Provider ${resolved.provider.id} does not support transcription`);
    }

    const requestId = resolveExecutionRequestId(payload);
    const usageOverride = resolveExecutionUsageOverride(payload);
    const startedAt = Date.now();
    const audioBytes = getBinaryInputBytes(payload.file);
    const request = {
      language: payload.language,
      model: payload.model,
      prompt: payload.prompt,
      secrets: resolved.model.secrets
    };

    try {
      const response = await resolved.provider.transcribe(payload.file, request);
      const providerUsageMetadata = extractProviderUsageMetadata(response.rawUsage);

      await recordExecutionUsageEventSafely('transcribe', {
        traceId: requestId,
        requestId,
        operationKey: usageOverride?.operationKey || 'transcribe',
        sourceType: usageOverride?.sourceType || 'transcription',
        sourceId: usageOverride?.sourceId || requestId,
        sourceLabel: usageOverride?.sourceLabel || '转写',
        usageCategory: usageOverride?.usageCategory || 'media',
        usageFeature: usageOverride?.usageFeature || 'transcription',
        usageStage: usageOverride?.usageStage || 'transcribe',
        providerId: response.providerId || resolved.provider.id,
        providerPresetId: resolved.model.presetId || providerPresetId,
        model: response.model || payload.model || getProviderDefinitionDefaultModel(resolved.provider.id, 'transcribe', resolved.provider.id) || 'unknown',
        agentId: 'pi-execution',
        status: 'completed',
        usage: toAnalyticsUsage(response.usage),
        rawUsage: response.rawUsage,
        meteringSource: 'provider_reported',
        startedAt,
        completedAt: Date.now(),
        metadata: {
          runtime: 'pi',
          audioBytes: audioBytes ?? null,
          language: payload.language || null,
          promptChars: payload.prompt?.length ?? null,
          textChars: response.text.length,
          ...(providerUsageMetadata || {}),
          ...(usageOverride?.metadata || {})
        }
      });

      return response;
    } catch (error) {
      await recordExecutionUsageEventSafely('transcribe', {
        traceId: requestId,
        requestId,
        operationKey: usageOverride?.operationKey || 'transcribe',
        sourceType: usageOverride?.sourceType || 'transcription',
        sourceId: usageOverride?.sourceId || requestId,
        sourceLabel: usageOverride?.sourceLabel || '转写',
        usageCategory: usageOverride?.usageCategory || 'media',
        usageFeature: usageOverride?.usageFeature || 'transcription',
        usageStage: usageOverride?.usageStage || 'transcribe',
        providerId: resolved.provider.id,
        providerPresetId: resolved.model.presetId || providerPresetId,
        model: payload.model || getProviderDefinitionDefaultModel(resolved.provider.id, 'transcribe', resolved.provider.id) || 'unknown',
        agentId: 'pi-execution',
        status: 'failed',
        meteringSource: 'provider_reported',
        startedAt,
        completedAt: Date.now(),
        metadata: {
          errorMessage: error instanceof Error ? error.message : String(error),
          runtime: 'pi',
          audioBytes: audioBytes ?? null,
          language: payload.language || null,
          promptChars: payload.prompt?.length ?? null,
          ...(usageOverride?.metadata || {})
        }
      });
      throw error;
    }
  }

  async generateImage(payload: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const providerPresetId = resolveProviderPresetId(payload);
    const resolved = await this.resolveProviderCapability(payload.providerId, providerPresetId);

    if (!supportsProviderCapability(resolved.provider.id, 'imageGeneration', resolved.provider)) {
      throw new Error(`Provider ${resolved.provider.id} does not support image generation`);
    }

    const requestId = resolveExecutionRequestId(payload);
    const usageOverride = resolveExecutionUsageOverride(payload);
    const startedAt = Date.now();
    const request = normalizeProviderPreset({
      ...payload,
      providerId: resolved.provider.id,
      providerPresetId: resolved.model.presetId || providerPresetId
    });

    try {
      const response = await this.imageGenerationService.generateImageFromRequest(request);
      const providerUsageMetadata = extractProviderUsageMetadata(response.rawUsage);

      await recordExecutionUsageEventSafely('generateImage', {
        traceId: requestId,
        requestId,
        operationKey: usageOverride?.operationKey || 'generate',
        sourceType: usageOverride?.sourceType || 'image_generation',
        sourceId: usageOverride?.sourceId || requestId,
        sourceLabel: usageOverride?.sourceLabel || '图片生成',
        usageCategory: usageOverride?.usageCategory || 'media',
        usageFeature: usageOverride?.usageFeature || 'image_generation',
        usageStage: usageOverride?.usageStage || 'generate',
        providerId: response.providerId || resolved.provider.id,
        providerPresetId: resolved.model.presetId || providerPresetId,
        model: response.model || payload.model || getProviderDefinitionDefaultModel(resolved.provider.id, 'imageGeneration', resolved.provider.id) || 'unknown',
        agentId: 'pi-execution',
        status: 'completed',
        usage: toAnalyticsUsage(response.usage),
        rawUsage: response.rawUsage,
        meteringSource: 'provider_reported',
        startedAt,
        completedAt: Date.now(),
        metadata: {
          runtime: 'pi',
          promptChars: payload.prompt.length,
          quality: payload.quality || null,
          size: payload.size || null,
          imageCount: 1,
          revisedPromptChars: response.revisedPrompt?.length ?? null,
          ...(providerUsageMetadata || {}),
          ...(usageOverride?.metadata || {})
        }
      });

      return response;
    } catch (error) {
      await recordExecutionUsageEventSafely('generateImage', {
        traceId: requestId,
        requestId,
        operationKey: usageOverride?.operationKey || 'generate',
        sourceType: usageOverride?.sourceType || 'image_generation',
        sourceId: usageOverride?.sourceId || requestId,
        sourceLabel: usageOverride?.sourceLabel || '图片生成',
        usageCategory: usageOverride?.usageCategory || 'media',
        usageFeature: usageOverride?.usageFeature || 'image_generation',
        usageStage: usageOverride?.usageStage || 'generate',
        providerId: resolved.provider.id,
        providerPresetId: resolved.model.presetId || providerPresetId,
        model: payload.model || getProviderDefinitionDefaultModel(resolved.provider.id, 'imageGeneration', resolved.provider.id) || 'unknown',
        agentId: 'pi-execution',
        status: 'failed',
        meteringSource: 'provider_reported',
        startedAt,
        completedAt: Date.now(),
        metadata: {
          errorMessage: error instanceof Error ? error.message : String(error),
          runtime: 'pi',
          promptChars: payload.prompt.length,
          quality: payload.quality || null,
          size: payload.size || null,
          imageCount: 1,
          ...(usageOverride?.metadata || {})
        }
      });
      throw error;
    }
  }

  async generateMusic(payload: MusicGenerationRequest, signal?: AbortSignal): Promise<MusicGenerationResponse> {
    const providerPresetId = resolveProviderPresetId(payload);
    const resolved = await this.resolveProviderCapability(payload.providerId, providerPresetId);

    if (!supportsProviderCapability(resolved.provider.id, 'musicGeneration', resolved.provider) || !resolved.provider.generateMusic) {
      throw new Error(`Provider ${resolved.provider.id} does not support music generation`);
    }

    const requestId = resolveExecutionRequestId(payload);
    const usageOverride = resolveExecutionUsageOverride(payload);
    const startedAt = Date.now();
    const request = normalizeProviderPreset({
      ...payload,
      extras: {
        ...(payload.extras || {}),
        secrets: resolved.model.secrets
      },
      providerId: resolved.provider.id,
      providerPresetId: resolved.model.presetId || providerPresetId
    });

    try {
      const response = await resolved.provider.generateMusic(request, signal);
      const requestExtras = request.extras as Record<string, any> | undefined;
      const materializedResponse = await this.musicGenerationService.materializeMusicResponse(response, {
        outputDir: typeof requestExtras?.outputDir === 'string' ? requestExtras.outputDir : undefined,
        request,
        requestId,
        signal
      });
      const providerUsageMetadata = extractProviderUsageMetadata(materializedResponse.rawUsage);
      const firstArtifact = materializedResponse.artifacts[0];

      await recordExecutionUsageEventSafely('generateMusic', {
        traceId: requestId,
        requestId,
        operationKey: usageOverride?.operationKey || 'generate',
        sourceType: usageOverride?.sourceType || 'music_generation',
        sourceId: usageOverride?.sourceId || requestId,
        sourceLabel: usageOverride?.sourceLabel || '音乐生成',
        usageCategory: usageOverride?.usageCategory || 'media',
        usageFeature: usageOverride?.usageFeature || 'music_generation',
        usageStage: usageOverride?.usageStage || 'generate',
        providerId: materializedResponse.providerId || resolved.provider.id,
        providerPresetId: resolved.model.presetId || providerPresetId,
        model: materializedResponse.model || payload.model || getProviderDefinitionDefaultModel(resolved.provider.id, 'musicGeneration', resolved.provider.id) || 'unknown',
        agentId: 'pi-execution',
        status: 'completed',
        usage: toAnalyticsUsage(materializedResponse.usage),
        rawUsage: materializedResponse.rawUsage,
        meteringSource: 'provider_reported',
        startedAt,
        completedAt: Date.now(),
        metadata: {
          artifactCount: materializedResponse.artifacts.length,
          audioBase64: materializedResponse.audioBase64 ? true : null,
          audioUrl: materializedResponse.audioUrl || null,
          durationMs: firstArtifact?.durationMs ?? null,
          filePath: firstArtifact?.filePath || null,
          lyricsChars: payload.lyrics?.length ?? null,
          mode: payload.mode || null,
          outputFormat: payload.outputFormat || null,
          promptChars: payload.prompt.length,
          sizeBytes: firstArtifact?.sizeBytes ?? null,
          ...(providerUsageMetadata || {}),
          ...(usageOverride?.metadata || {})
        }
      });

      return materializedResponse;
    } catch (error) {
      await recordExecutionUsageEventSafely('generateMusic', {
        traceId: requestId,
        requestId,
        operationKey: usageOverride?.operationKey || 'generate',
        sourceType: usageOverride?.sourceType || 'music_generation',
        sourceId: usageOverride?.sourceId || requestId,
        sourceLabel: usageOverride?.sourceLabel || '音乐生成',
        usageCategory: usageOverride?.usageCategory || 'media',
        usageFeature: usageOverride?.usageFeature || 'music_generation',
        usageStage: usageOverride?.usageStage || 'generate',
        providerId: resolved.provider.id,
        providerPresetId: resolved.model.presetId || providerPresetId,
        model: payload.model || getProviderDefinitionDefaultModel(resolved.provider.id, 'musicGeneration', resolved.provider.id) || 'unknown',
        agentId: 'pi-execution',
        status: 'failed',
        meteringSource: 'provider_reported',
        startedAt,
        completedAt: Date.now(),
        metadata: {
          errorMessage: error instanceof Error ? error.message : String(error),
          promptChars: payload.prompt.length,
          lyricsChars: payload.lyrics?.length ?? null,
          mode: payload.mode || null,
          outputFormat: payload.outputFormat || null,
          ...(usageOverride?.metadata || {})
        }
      });
      throw error;
    }
  }

  private async resolveProviderCapability(
    providerId: string,
    providerPresetId?: string
  ): Promise<{ model: Awaited<ReturnType<typeof resolvePiModelConfig>>['model']; provider: NonNullable<ReturnType<typeof getProvider>> }> {
    const { model } = await resolvePiModelConfig(
      normalizeProviderPreset({
        messages: [],
        persist: false,
        providerId,
        providerPresetId
      })
    );
    const provider = getProvider(model.providerId);

    if (!provider) {
      throw new Error(`Provider ${model.providerId} not found`);
    }

    return {
      model,
      provider
    };
  }
}

export function createPiExecutionRequest(req: ChatRequest): ChatRequest {
  return forcePiRuntimeRequest(req);
}

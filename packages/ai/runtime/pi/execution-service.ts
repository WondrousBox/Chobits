import { normalizeProviderPreset, resolveProviderPresetId } from '../../provider-preset';
import { supportsProviderCapability } from '../../providers/service';
import { getProvider } from '../../registry';
import type { ChatRequest, ChatResponse, EmbeddingRequest, EmbeddingResponse, ImageGenerationRequest, TranscriptionRequest } from '../../types';
import type { PiRuntimeAvailability } from './contracts';
import { PiImageGenerationService } from './image-generation-service';
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

export class PiExecutionService {
  private readonly sessionService = new PiSessionService();
  private readonly imageGenerationService = new PiImageGenerationService();

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

    return resolved.provider.embed({
      ...normalizeProviderPreset(payload),
      providerId: resolved.provider.id,
      extras: {
        ...(payload.extras || {}),
        secrets: resolved.model.secrets
      }
    });
  }

  async transcribe(payload: TranscriptionRequest): Promise<{ text: string }> {
    const providerPresetId = resolveProviderPresetId(payload);
    const resolved = await this.resolveProviderCapability(payload.providerId, providerPresetId);

    if (!supportsProviderCapability(resolved.provider.id, 'transcribe', resolved.provider) || !resolved.provider.transcribe) {
      throw new Error(`Provider ${resolved.provider.id} does not support transcription`);
    }

    return resolved.provider.transcribe(payload.file, {
      language: payload.language,
      model: payload.model,
      prompt: payload.prompt,
      secrets: resolved.model.secrets
    });
  }

  async generateImage(payload: ImageGenerationRequest): Promise<{ imageUrl: string }> {
    const providerPresetId = resolveProviderPresetId(payload);
    const resolved = await this.resolveProviderCapability(payload.providerId, providerPresetId);

    if (!supportsProviderCapability(resolved.provider.id, 'imageGeneration', resolved.provider)) {
      throw new Error(`Provider ${resolved.provider.id} does not support image generation`);
    }

    return {
      imageUrl: await this.imageGenerationService.generateImageUrlFromRequest(
        normalizeProviderPreset({
          ...payload,
          providerId: resolved.provider.id,
          providerPresetId: resolved.model.presetId || providerPresetId
        })
      )
    };
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

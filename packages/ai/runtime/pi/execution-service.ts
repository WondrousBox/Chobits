import { randomUUID } from 'node:crypto';

import { resolveUsablePreset } from '../../preset-service';
import { normalizeProviderPreset, resolveProviderPresetId } from '../../provider-preset';
import { supportsProviderCapability } from '../../providers/service';
import { getProvider } from '../../registry';
import type {
  ChatRequest,
  ChatResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  SpeechSynthesisStreamEvent,
  SpeechSynthesisRequest,
  SpeechSynthesisResponse,
  SpeechTextInputChunk,
  TranscriptionRequest,
  TranscriptionResponse
} from '../../types';
import type { PiRuntimeAvailability } from './contracts';
import { resolvePiModelConfig } from './model-resolver';
import { PiAudioArtifactService } from './audio-artifact-service';
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

function safeUuid(): string {
  try {
    return randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function resolveExecutionRequestId(payload: { extras?: Record<string, any> }): string {
  const extras = payload.extras;
  const requestId = typeof extras?.requestId === 'string' && extras.requestId.trim() ? extras.requestId.trim() : undefined;
  return requestId || safeUuid();
}

export class PiExecutionService {
  private readonly sessionService = new PiSessionService();
  private readonly audioArtifactService = new PiAudioArtifactService();

  getAvailability(req?: Pick<ChatRequest, 'extras'>): PiRuntimeAvailability {
    return this.sessionService.getAvailability(req);
  }

  async chatEphemeral(req: ChatRequest): Promise<ChatResponse> {
    return this.sessionService.chat(forcePiRuntimeRequest(normalizeProviderPreset(req)));
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

    const request = {
      ...normalizeProviderPreset(payload),
      providerId: resolved.provider.id,
      extras: {
        ...(payload.extras || {}),
        secrets: resolved.model.secrets
      }
    };

    return resolved.provider.embed(request);
  }

  async transcribe(payload: TranscriptionRequest): Promise<TranscriptionResponse> {
    const providerPresetId = resolveProviderPresetId(payload);
    const resolved = await this.resolveProviderCapability(payload.providerId, providerPresetId);

    if (!supportsProviderCapability(resolved.provider.id, 'transcribe', resolved.provider) || !resolved.provider.transcribe) {
      throw new Error(`Provider ${resolved.provider.id} does not support transcription`);
    }

    const request = {
      language: payload.language,
      model: payload.model,
      prompt: payload.prompt,
      secrets: resolved.model.secrets
    };

    return resolved.provider.transcribe(payload.file, request);
  }

  async synthesizeSpeech(payload: SpeechSynthesisRequest, signal?: AbortSignal): Promise<SpeechSynthesisResponse> {
    const providerPresetId = resolveProviderPresetId(payload);
    const resolved = await this.resolveProviderCapability(payload.providerId, providerPresetId);

    if (!supportsProviderCapability(resolved.provider.id, 'speechSynthesis', resolved.provider) || !resolved.provider.synthesizeSpeech) {
      throw new Error(`Provider ${resolved.provider.id} does not support speech synthesis`);
    }

    const requestId = resolveExecutionRequestId(payload);
    const request = normalizeProviderPreset({
      ...payload,
      extras: {
        ...(payload.extras || {}),
        secrets: resolved.model.secrets
      },
      providerId: resolved.provider.id,
      providerPresetId: resolved.model.presetId || providerPresetId
    });

    const response = await resolved.provider.synthesizeSpeech(request, signal);
    const requestExtras = request.extras as Record<string, any> | undefined;
    return this.audioArtifactService.materializeSpeechResponse(response, {
      outputDir: typeof requestExtras?.outputDir === 'string' ? requestExtras.outputDir : undefined,
      request,
      requestId,
      signal
    });
  }

  async streamSpeechSynthesis(
    payload: SpeechSynthesisRequest,
    emit: (event: SpeechSynthesisStreamEvent) => void,
    signal?: AbortSignal,
    input?: AsyncIterable<SpeechTextInputChunk>
  ): Promise<SpeechSynthesisResponse> {
    const providerPresetId = resolveProviderPresetId(payload);
    const resolved = await this.resolveProviderCapability(payload.providerId, providerPresetId);

    if (!supportsProviderCapability(resolved.provider.id, 'speechSynthesis', resolved.provider) || !resolved.provider.streamSpeechSynthesis) {
      throw new Error(`Provider ${resolved.provider.id} does not support streaming speech synthesis`);
    }

    const requestId = resolveExecutionRequestId(payload);
    const request = normalizeProviderPreset({
      ...payload,
      mode: payload.mode || 'output-stream',
      transportPreference: payload.transportPreference || 'http-stream',
      extras: {
        ...(payload.extras || {}),
        requestId,
        secrets: resolved.model.secrets
      },
      providerId: resolved.provider.id,
      providerPresetId: resolved.model.presetId || providerPresetId
    });

    try {
      const response = await resolved.provider.streamSpeechSynthesis(
        request,
        (event) => {
          if (event.type === 'completed' || event.type === 'done') {
            return;
          }
          if (event.type === 'started') {
            emit({
              type: 'started',
              data: {
                ...event.data,
                requestId
              }
            });
            return;
          }
          emit(event);
        },
        signal,
        input
      );
      const requestExtras = request.extras as Record<string, any> | undefined;
      const materializedResponse = await this.audioArtifactService.materializeSpeechResponse(response, {
        outputDir: typeof requestExtras?.outputDir === 'string' ? requestExtras.outputDir : undefined,
        request,
        requestId,
        signal
      });
      emit({ type: 'completed', data: materializedResponse });
      emit({ type: 'done' });

      return materializedResponse;
    } catch (error) {
      emit({ type: 'error', data: { message: error instanceof Error ? error.message : String(error) } });
      emit({ type: 'done' });
      throw error;
    }
  }

  private async resolveProviderCapability(
    providerId: string,
    providerPresetId?: string
  ): Promise<{ model: Awaited<ReturnType<typeof resolvePiModelConfig>>['model']; provider: NonNullable<ReturnType<typeof getProvider>> }> {
    const effectivePresetId = providerPresetId || (await resolveUsablePreset(providerId).catch(() => undefined))?.id;
    const { model } = await resolvePiModelConfig(
      normalizeProviderPreset({
        messages: [],
        persist: false,
        providerId,
        providerPresetId: effectivePresetId
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

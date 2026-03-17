import { normalizeProviderPreset, resolveProviderPresetId } from '../../provider-preset';
import type { ChatRequest, ProviderScopedRequest } from '../../types';
import type { ResolvedPiRequest } from './contracts';
import { resolvePiRequest } from './model-resolver';
import { buildPiModel, buildPiModelHeaders } from './provider-model';

type PiAiModule = typeof import('@mariozechner/pi-ai');
type PiSimpleStreamOptions = import('@mariozechner/pi-ai').SimpleStreamOptions;
type PiThinkingLevel = import('@mariozechner/pi-ai').ThinkingLevel;

export type PiTaskChatEvent = { type: 'delta'; data: { text: string } } | { type: 'message_completed' } | { type: 'error'; data: { message: string } };

export type PiTaskChatFunction = (prompt: string, onEvent: (event: PiTaskChatEvent) => void, abortSignal?: AbortSignal) => Promise<void>;

export interface CreatePiTaskRuntimeRequest extends ProviderScopedRequest {
  agentId?: string;
  extras?: Record<string, any>;
  maxTokens?: number;
  model?: string;
  temperature?: number;
}

async function loadPiAi(): Promise<PiAiModule> {
  return import('@mariozechner/pi-ai');
}

function resolveThinkingLevel(req: ChatRequest): PiThinkingLevel | undefined {
  const raw = String(req.extras?.reasoning || req.extras?.thinking || '')
    .trim()
    .toLowerCase();
  if (!raw) return undefined;

  switch (raw) {
    case 'minimal':
    case 'low':
    case 'medium':
    case 'high':
    case 'xhigh':
      return raw;
    default:
      return undefined;
  }
}

function buildSimpleOptions(resolved: ResolvedPiRequest, signal?: AbortSignal): PiSimpleStreamOptions {
  const headers = buildPiModelHeaders(resolved.model);
  const reasoning = resolveThinkingLevel(resolved.request);

  return {
    ...(resolved.model.apiKey ? { apiKey: resolved.model.apiKey } : {}),
    ...(headers ? { headers } : {}),
    ...(resolved.request.conversationId ? { sessionId: resolved.request.conversationId } : {}),
    ...(typeof resolved.request.maxTokens === 'number' ? { maxTokens: resolved.request.maxTokens } : {}),
    ...(typeof resolved.request.temperature === 'number' ? { temperature: resolved.request.temperature } : {}),
    ...(reasoning ? { reasoning } : {}),
    ...(signal ? { signal } : {})
  };
}

function createPromptContext(prompt: string): { messages: Array<{ content: string; role: 'user'; timestamp: number }> } {
  return {
    messages: [
      {
        content: prompt,
        role: 'user',
        timestamp: Date.now()
      }
    ]
  };
}

export async function createPiTaskChatRuntime(resolved: ResolvedPiRequest): Promise<{ chatFn: PiTaskChatFunction; modelId: string }> {
  const ai = await loadPiAi();
  const model = await buildPiModel(ai, resolved);

  return {
    chatFn: async (prompt, onEvent, abortSignal) => {
      try {
        const stream = ai.streamSimple(model, createPromptContext(prompt) as any, buildSimpleOptions(resolved, abortSignal));

        for await (const event of stream) {
          switch (event.type) {
            case 'text_delta':
              onEvent({
                type: 'delta',
                data: { text: event.delta }
              });
              break;
            case 'done':
              onEvent({ type: 'message_completed' });
              return;
            case 'error':
              onEvent({
                type: 'error',
                data: { message: event.error.errorMessage || 'Pi task execution failed' }
              });
              return;
            default:
              break;
          }
        }

        onEvent({ type: 'message_completed' });
      } catch (error: any) {
        onEvent({
          type: 'error',
          data: { message: error?.message || 'Pi task execution failed' }
        });
      }
    },
    modelId: model.id
  };
}

export async function createPiTaskChatRuntimeFromRequest(request: CreatePiTaskRuntimeRequest): Promise<{ chatFn: PiTaskChatFunction; modelId: string; resolved: ResolvedPiRequest }> {
  const providerPresetId = resolveProviderPresetId(request);
  const resolved = await resolvePiRequest(
    normalizeProviderPreset({
      agentId: request.agentId || 'chat',
      extras: {
        ...(request.extras || {}),
        ...(request.model ? { model: request.model } : {}),
        runtime: 'pi'
      },
      maxTokens: request.maxTokens,
      messages: [],
      persist: false,
      providerId: request.providerId,
      providerPresetId,
      temperature: request.temperature
    })
  );
  const runtime = await createPiTaskChatRuntime(resolved);

  return {
    ...runtime,
    resolved
  };
}

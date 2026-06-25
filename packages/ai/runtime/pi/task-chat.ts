import { normalizeProviderPreset, resolveProviderPresetId } from '../../provider-preset';
import type { ChatRequest, ProviderScopedRequest, TokenUsage } from '../../types';
import type { ResolvedPiRequest } from './contracts';
import { resolvePiRequest } from './model-resolver';
import { createResolvedPromptInspectionContext, inspectAiPrompt } from './prompt-inspector';
import { buildPiModel, buildPiModelHeaders } from './provider-model';
import { extractPiProviderRequestId } from './provider-request-id';

type PiAiModule = typeof import('@earendil-works/pi-ai/compat');
type PiAssistantMessage = import('@earendil-works/pi-ai/compat').AssistantMessage;
type PiSimpleStreamOptions = import('@earendil-works/pi-ai/compat').SimpleStreamOptions;
type PiThinkingLevel = import('@earendil-works/pi-ai/compat').ThinkingLevel;

export type PiTaskChatEvent =
  | { type: 'delta'; data: { text: string } }
  | { type: 'thinking_delta'; data: { text: string } }
  | { type: 'message_completed'; data?: { text?: string; thinking?: string; usage?: TokenUsage; rawUsage?: Record<string, unknown>; providerRequestId?: string } }
  | { type: 'error'; data: { message: string } };

export type PiTaskChatFunction = (prompt: string, onEvent: (event: PiTaskChatEvent) => void, abortSignal?: AbortSignal) => Promise<void>;

export interface CreatePiTaskRuntimeRequest extends ProviderScopedRequest {
  agentId?: string;
  extras?: Record<string, any>;
  maxTokens?: number;
  model?: string;
  temperature?: number;
}

async function loadPiAi(): Promise<PiAiModule> {
  return import('@earendil-works/pi-ai/compat');
}

function extractAssistantText(message: PiAssistantMessage): string {
  return message.content
    .filter((block): block is Extract<PiAssistantMessage['content'][number], { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

function extractAssistantThinking(message: PiAssistantMessage): string {
  return message.content
    .filter((block): block is Extract<PiAssistantMessage['content'][number], { type: 'thinking' }> => block.type === 'thinking')
    .map((block) => block.thinking)
    .join('');
}

function extractPiTokenUsage(message: PiAssistantMessage): TokenUsage | undefined {
  const inputTokens = typeof message.usage?.input === 'number' && Number.isFinite(message.usage.input) && message.usage.input >= 0 ? message.usage.input : undefined;
  const outputTokens = typeof message.usage?.output === 'number' && Number.isFinite(message.usage.output) && message.usage.output >= 0 ? message.usage.output : undefined;
  const cacheReadTokens = typeof message.usage?.cacheRead === 'number' && Number.isFinite(message.usage.cacheRead) && message.usage.cacheRead >= 0 ? message.usage.cacheRead : undefined;
  const cacheWriteTokens = typeof message.usage?.cacheWrite === 'number' && Number.isFinite(message.usage.cacheWrite) && message.usage.cacheWrite >= 0 ? message.usage.cacheWrite : undefined;
  const explicitTotalTokens = typeof message.usage?.totalTokens === 'number' && Number.isFinite(message.usage.totalTokens) && message.usage.totalTokens >= 0 ? message.usage.totalTokens : undefined;
  const hasTokenComponent = inputTokens !== undefined || outputTokens !== undefined || cacheReadTokens !== undefined || cacheWriteTokens !== undefined;
  const totalTokens = explicitTotalTokens ?? (hasTokenComponent ? (inputTokens ?? 0) + (outputTokens ?? 0) + (cacheReadTokens ?? 0) + (cacheWriteTokens ?? 0) : undefined);
  const cost = typeof message.usage?.cost?.total === 'number' && Number.isFinite(message.usage.cost.total) && message.usage.cost.total >= 0 ? message.usage.cost.total : undefined;

  if (inputTokens === undefined && outputTokens === undefined && cacheReadTokens === undefined && cacheWriteTokens === undefined && totalTokens === undefined && cost === undefined) {
    return undefined;
  }

  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}),
    ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
    ...(cost !== undefined ? { cost } : {})
  };
}

function extractPiRawUsage(message: PiAssistantMessage): Record<string, unknown> | undefined {
  if (!message.usage || typeof message.usage !== 'object') {
    return undefined;
  }

  try {
    return JSON.parse(JSON.stringify(message.usage)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function resolveAbortMessage(signal: AbortSignal | undefined, fallback: string): string {
  if (!signal?.aborted) {
    return fallback;
  }

  const reason = signal.reason;
  if (reason instanceof Error && reason.message) {
    return reason.message;
  }

  if (typeof reason === 'string' && reason.trim()) {
    return reason.trim();
  }

  return fallback;
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
      const TAG = '[PiTaskChat] >';
      try {
        console.log(`${TAG} streamSimple start: ${resolved.request.providerId}/${model.id}, prompt=${prompt.length} chars, hasApiKey=${!!resolved.model.apiKey}`);
        const context = createPromptContext(prompt);
        inspectAiPrompt({
          ...createResolvedPromptInspectionContext(resolved),
          messages: context.messages,
          prompt,
          source: 'pi-task-chat',
          transport: 'pi-ai.streamSimple'
        });
        const stream = ai.streamSimple(model, context as any, buildSimpleOptions(resolved, abortSignal));

        let eventCount = 0;
        let textChars = 0;
        let thinkingChars = 0;
        for await (const event of stream) {
          eventCount++;
          switch (event.type) {
            case 'text_delta':
              textChars += event.delta.length;
              onEvent({
                type: 'delta',
                data: { text: event.delta }
              });
              break;
            case 'thinking_delta':
              thinkingChars += event.delta.length;
              onEvent({
                type: 'thinking_delta',
                data: { text: event.delta }
              });
              break;
            case 'done':
              console.log(`${TAG} Stream done: ${eventCount} events, ${textChars} text chars, ${thinkingChars} thinking chars`);
              onEvent({
                type: 'message_completed',
                data: {
                  providerRequestId: extractPiProviderRequestId(event.message),
                  text: extractAssistantText(event.message),
                  thinking: extractAssistantThinking(event.message),
                  usage: extractPiTokenUsage(event.message),
                  rawUsage: extractPiRawUsage(event.message)
                }
              });
              return;
            case 'error':
              console.error(`${TAG} Stream error event: ${resolveAbortMessage(abortSignal, event.error.errorMessage || 'unknown error')}`, event.error);
              onEvent({
                type: 'error',
                data: { message: resolveAbortMessage(abortSignal, event.error.errorMessage || 'Pi task execution failed') }
              });
              return;
            default:
              break;
          }
        }

        console.log(`${TAG} Stream ended without 'done' event: ${eventCount} events, ${textChars} text chars, ${thinkingChars} thinking chars`);
        onEvent({ type: 'message_completed' });
      } catch (error: any) {
        console.error(`${TAG} Stream threw exception:`, resolveAbortMessage(abortSignal, error?.message || 'Pi task execution failed'));
        onEvent({
          type: 'error',
          data: { message: resolveAbortMessage(abortSignal, error?.message || 'Pi task execution failed') }
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

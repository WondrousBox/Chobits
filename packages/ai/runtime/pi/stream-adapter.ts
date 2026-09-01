import { getChatMessageUsage, normalizeTokenUsage } from '../../message-usage';
import { extractToolSpeechFromResult, normalizeToolSpeech } from '../../tool-speech';
import type { ChatMessage, StreamEvent, TokenUsage, ToolCallDisplay, UserChoiceRequest } from '../../types';
import { resolveToolLabel } from './tool-labels';

type UnknownPiEvent = {
  type?: string;
  data?: Record<string, any>;
  [key: string]: any;
};

function summarizeToolResultForLog(result: any): unknown {
  if (!result || typeof result !== 'object') return result;
  const details = result.details && typeof result.details === 'object' ? result.details : result;
  return {
    autoFallback: details.autoFallback,
    error: details.error,
    fallbackReason: details.fallbackReason,
    matched: details.matched,
    mimeType: details.emoji?.mimeType,
    packId: details.emoji?.packId,
    packName: details.emoji?.packName,
    query: details.query,
    relativePath: details.emoji?.relativePath,
    selectedScore: details.selectedScore,
    selectionSource: details.selectionSource,
    success: details.success,
    title: details.emoji?.title || details.title,
    url: details.emoji?.url
  };
}

type ChatStreamEmitter = {
  connected: () => void;
  delta: (text: string) => void;
  metadata: (data: Record<string, any>) => void;
  toolCall: (name: string, args: any, callId: string, display?: ToolCallDisplay) => void;
  toolResult: (callId: string, result: any) => void;
  toolProgress: (callId: string, progress: number, message?: string) => void;
  thinkingDelta: (text: string) => void;
  userChoiceRequest: (request: UserChoiceRequest) => void;
  complete: (message: ChatMessage) => void;
  error: (error: { message: string; code?: string; cause?: any }) => void;
  done: () => void;
};

export interface ChatStreamEmitterOptions {
  /** Whether character persona is enabled — controls character-specific tool labels */
  characterPersonaEnabled?: boolean;
}

export function createChatStreamEmitter(emit: (event: StreamEvent) => void, options?: ChatStreamEmitterOptions): ChatStreamEmitter {
  const useCharacterLabels = options?.characterPersonaEnabled ?? false;
  return {
    connected() {
      emit({ type: 'connected' });
    },
    delta(text: string) {
      emit({ type: 'delta', data: { text } });
    },
    metadata(data: Record<string, any>) {
      emit({ type: 'metadata', data });
    },
    toolCall(name: string, args: any, callId: string, display?: ToolCallDisplay) {
      const parsedArgs =
        typeof args === 'string'
          ? (() => {
            try {
              return JSON.parse(args);
            } catch {
              return {};
            }
          })()
          : (args ?? {});
      const label = resolveToolLabel(name, parsedArgs, 'calling', useCharacterLabels);
      console.log(`[AI Tool] 调用工具: ${name} → ${label}`, { callId, args: typeof args === 'string' ? args.slice(0, 200) : args });
      emit({ type: 'tool_call', data: { args, callId, label, name, ...(display ? { display } : {}) } });
    },
    toolResult(callId: string, result: any) {
      const speech = extractToolSpeechFromResult(result);
      console.log(`[AI Tool] 工具返回: ${callId}`, summarizeToolResultForLog(result));
      emit({ type: 'tool_result', data: { callId, result, ...(speech ? { speech } : {}) } });
    },
    toolProgress(callId: string, progress: number, message?: string) {
      emit({ type: 'tool_progress', data: { callId, progress, message } });
    },
    thinkingDelta(text: string) {
      emit({ type: 'thinking_delta', data: { text } });
    },
    userChoiceRequest(request: UserChoiceRequest) {
      emit({ type: 'user_choice_request', data: request });
    },
    complete(message: ChatMessage) {
      const usage = getChatMessageUsage(message);
      emit({ type: 'message_completed', data: usage ? { message, usage } : { message } });
    },
    error(error: { message: string; code?: string; cause?: any }) {
      emit({ type: 'error', data: error });
    },
    done() {
      emit({ type: 'done' });
    }
  };
}

export function createLegacyAssistantMessage(content: string, metadata?: Record<string, any>, usage?: TokenUsage): ChatMessage {
  return {
    content,
    createdAt: Date.now(),
    metadata,
    ...(usage ? { usage } : {}),
    role: 'assistant'
  };
}

export function normalizePiError(error: unknown): { message: string; code?: string; cause?: any } {
  if (error instanceof Error) {
    return {
      cause: error,
      message: error.message
    };
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  return {
    cause: error,
    message: 'Pi runtime execution failed'
  };
}

export function coercePiEventToChatEvent(event: UnknownPiEvent): StreamEvent | undefined {
  const eventType = String(event.type || '').toLowerCase();
  const data = event.data || {};

  if (!eventType) return undefined;

  if (eventType === 'connected') return { type: 'connected' };
  if (eventType === 'delta' || eventType === 'text-delta' || eventType === 'message.delta') {
    return { type: 'delta', data: { text: String(data.text || event.text || '') } };
  }
  if (eventType === 'tool-call' || eventType === 'tool_call') {
    return {
      type: 'tool_call',
      data: {
        args: data.args,
        callId: String(data.callId || data.id || ''),
        ...(data.display ? { display: data.display } : {}),
        name: String(data.name || '')
      }
    };
  }
  if (eventType === 'tool-result' || eventType === 'tool_result') {
    const result = data.result;
    const speech = normalizeToolSpeech(data.speech) || extractToolSpeechFromResult(result);
    return {
      type: 'tool_result',
      data: {
        callId: String(data.callId || data.id || ''),
        result,
        ...(speech ? { speech } : {})
      }
    };
  }
  if (eventType === 'message.completed' || eventType === 'message_completed' || eventType === 'completed') {
    const usage = normalizeTokenUsage(data.usage);
    const message = createLegacyAssistantMessage(String(data.text || data.content || ''), data.metadata, usage);
    return {
      type: 'message_completed',
      data: {
        ...(usage ? { usage } : {}),
        message
      }
    };
  }
  if (eventType === 'metadata') {
    return { type: 'metadata', data };
  }
  if (eventType === 'error') {
    return {
      type: 'error',
      data: normalizePiError(data.error || event.error || data.message || event.message)
    };
  }
  if (eventType === 'thinking-delta' || eventType === 'thinking_delta') {
    return { type: 'thinking_delta', data: { text: String(data.text || data.delta || event.delta || '') } };
  }
  if (eventType === 'done') {
    return { type: 'done' };
  }

  return undefined;
}

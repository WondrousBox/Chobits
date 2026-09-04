import { getChatMessageUsage } from '../../message-usage';
import { extractToolSpeechFromResult } from '../../tool-speech';
import type { ChatMessage, StreamEvent, TokenUsage, ToolCallDisplay, UserChoiceRequest } from '../../types';
import { resolveToolLabel } from './tool-labels';

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
  /** Whether character prompt injection is enabled — controls character-specific tool labels */
  characterPromptEnabled?: boolean;
}

export function createChatStreamEmitter(emit: (event: StreamEvent) => void, options?: ChatStreamEmitterOptions): ChatStreamEmitter {
  const shouldUseCharacterLabels = options?.characterPromptEnabled ?? false;
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
      const label = resolveToolLabel(name, parsedArgs, 'calling', shouldUseCharacterLabels);
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

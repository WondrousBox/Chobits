import type { TokenUsage } from '../types';
import { bindAbortControllerToSignal, createTaskRegistry, type ManagedTask } from './task-manager';

export interface SelectedTextExplainProgressData {
  message: string;
  percentage?: number;
  displayInfo?: Record<string, unknown>;
}

export interface SelectedTextExplainCompletedData {
  text: string;
  displayInfo?: Record<string, unknown>;
}

export interface SelectedTextExplainErrorData {
  code?: string;
  message: string;
}

export type SelectedTextExplainEvent =
  | { type: 'connected' }
  | { type: 'progress'; data: SelectedTextExplainProgressData }
  | { type: 'delta'; data: { text: string } }
  | { type: 'completed'; data: SelectedTextExplainCompletedData }
  | { type: 'error'; data: SelectedTextExplainErrorData }
  | { type: 'done' };

export interface SelectedTextExplainChatStreamEvent {
  type: 'delta' | 'thinking_delta' | 'message_completed' | 'error';
  data?: {
    message?: string;
    providerRequestId?: string;
    rawUsage?: unknown;
    text?: string;
    usage?: TokenUsage;
  };
}

export type SelectedTextExplainChatFunction = (
  prompt: string,
  onEvent: (event: SelectedTextExplainChatStreamEvent) => void,
  abortSignal?: AbortSignal
) => Promise<void>;

export interface SelectedTextExplainUsageEvent {
  completedAt?: number;
  metadata?: Record<string, unknown>;
  operationKey?: string;
  providerRequestId?: string;
  rawUsage?: unknown;
  startedAt?: number;
  status: 'completed' | 'failed' | 'cancelled';
  usage?: TokenUsage;
}

export interface SelectedTextExplainOptions {
  maxChars?: number;
  mode?: 'detail' | 'quick';
  promptTemplate?: string;
}

export interface SelectedTextExplainTaskRequest {
  chatFn: SelectedTextExplainChatFunction;
  languageNames?: Record<string, string>;
  metadata?: Record<string, unknown>;
  model: string;
  onUsageEvent?: (event: SelectedTextExplainUsageEvent) => void;
  options?: SelectedTextExplainOptions;
  providerId: string;
  requestId: string;
  targetLanguage?: string;
  taskLabel?: string;
  text: string;
}

type SelectedTextExplainTaskMetadata = {
  metadata?: Record<string, unknown>;
  model: string;
  providerId: string;
};

type ActiveSelectedTextExplainSnapshot = {
  metadata?: Record<string, unknown>;
  model: string;
  providerId: string;
  requestId: string;
  startTime: number;
  taskLabel?: string;
};

const selectedTextExplainTasks = createTaskRegistry<SelectedTextExplainTaskMetadata>();

function toActiveSnapshot(task: ManagedTask<SelectedTextExplainTaskMetadata>): ActiveSelectedTextExplainSnapshot {
  return {
    metadata: task.metadata,
    model: task.model,
    providerId: task.providerId,
    requestId: task.requestId,
    startTime: task.startTime,
    taskLabel: task.taskLabel
  };
}

function buildQuickPrompt(text: string, targetLanguageName: string): string {
  return [
    'You are a fast English learning assistant.',
    `Translate and briefly explain the selected English text in ${targetLanguageName}.`,
    '',
    'Output very compact Markdown with exactly these sections:',
    '### 译文',
    '### 简释',
    '',
    'Rules:',
    '- Prioritize speed and brevity.',
    '- The translation should be direct and natural.',
    '- The brief explanation must be one sentence, no more than 35 words.',
    '- Do not include vocabulary lists, examples, or usage notes.',
    '- Do not mention the prompt or that you received selected text.',
    '',
    'Selected text:',
    '```text',
    text,
    '```'
  ].join('\n');
}

function buildPrompt(text: string, targetLanguageName: string, mode: 'detail' | 'quick', promptTemplate?: string): string {
  if (!promptTemplate && mode === 'quick') {
    return buildQuickPrompt(text, targetLanguageName);
  }

  const template =
    promptTemplate ||
    [
      'You are a fast English learning assistant.',
      `Explain the selected English text in ${targetLanguageName}.`,
      '',
      'Output compact Markdown with these sections:',
      '### 译文',
      '### 语境解释',
      '### 重点词汇',
      '### 用法提示',
      '',
      'Rules:',
      '- Be direct and concise.',
      '- Keep the explanation useful for language learning.',
      '- Do not mention the prompt or that you received selected text.',
      '- If there are idioms or fixed phrases, call them out.',
      '',
      'Selected text:',
      '```text',
      '{text}',
      '```'
    ].join('\n');

  return template.replace(/{targetLanguage}/g, targetLanguageName).replace(/{text}/g, text);
}

export class SelectedTextExplainService {
  static cancel(requestId: string): boolean {
    return selectedTextExplainTasks.cancel(requestId);
  }

  static getAllActive(): ActiveSelectedTextExplainSnapshot[] {
    return selectedTextExplainTasks.list().map(toActiveSnapshot);
  }

  static async explain(emit: (event: SelectedTextExplainEvent) => void, request: SelectedTextExplainTaskRequest, externalSignal?: AbortSignal): Promise<void> {
    const { requestId, chatFn, providerId, model, taskLabel, text, targetLanguage = 'zh-CN', languageNames = {}, metadata, onUsageEvent, options = {} } = request;
    const { maxChars = 2000, mode = 'detail', promptTemplate } = options;
    const abortController = new AbortController();

    selectedTextExplainTasks.start(requestId, {
      controller: abortController,
      taskLabel,
      extra: {
        providerId,
        model,
        metadata
      }
    });

    const cleanupExternalAbort = bindAbortControllerToSignal(abortController, externalSignal);
    let hasReportedUsage = false;
    let streamError: Error | undefined;
    let llmCallStartedAt: number | undefined;
    let fullText = '';
    let completedText = '';
    const trimmedText = text.trim().slice(0, maxChars);
    const displayInfo = {
      ...(metadata || {}),
      type: 'selected-text-explain'
    };

    try {
      emit({ type: 'connected' });
      emit({
        type: 'progress',
        data: {
          displayInfo,
          message: '正在连接 AI...',
          percentage: 5
        }
      });

      const targetLanguageName = languageNames[targetLanguage] || targetLanguage;
      const prompt = buildPrompt(trimmedText, targetLanguageName, mode, promptTemplate);
      llmCallStartedAt = Date.now();

      await chatFn(
        prompt,
        (event) => {
          if (event.type === 'delta' && event.data?.text) {
            fullText += event.data.text;
            emit({ type: 'delta', data: { text: event.data.text } });
            return;
          }

          if (event.type === 'message_completed') {
            completedText = event.data?.text || completedText;
            if (!hasReportedUsage) {
              onUsageEvent?.({
                completedAt: Date.now(),
                metadata: { inputLength: trimmedText.length, mode },
                operationKey: 'generate',
                providerRequestId: event.data?.providerRequestId,
                rawUsage: event.data?.rawUsage,
                startedAt: llmCallStartedAt,
                status: 'completed',
                usage: event.data?.usage
              });
              hasReportedUsage = true;
            }
            return;
          }

          if (event.type === 'error') {
            const message = event.data?.message || '划词解释失败';
            streamError = new Error(message);
            if (!hasReportedUsage) {
              onUsageEvent?.({
                completedAt: Date.now(),
                metadata: { inputLength: trimmedText.length, mode },
                operationKey: 'generate',
                startedAt: llmCallStartedAt,
                status: abortController.signal.aborted ? 'cancelled' : 'failed'
              });
              hasReportedUsage = true;
            }
            emit({ type: 'error', data: { message } });
          }
        },
        abortController.signal
      );

      if (streamError) throw streamError;

      if (!fullText && completedText) {
        fullText = completedText;
        emit({ type: 'delta', data: { text: completedText } });
      }

      emit({
        type: 'progress',
        data: {
          displayInfo,
          message: '解释完成',
          percentage: 100
        }
      });
      emit({
        type: 'completed',
        data: {
          displayInfo,
          text: fullText
        }
      });
      emit({ type: 'done' });
    } catch (error: any) {
      const isAborted = error?.name === 'AbortError' || error?.message === 'Aborted' || abortController.signal.aborted;
      if (!hasReportedUsage) {
        onUsageEvent?.({
          completedAt: Date.now(),
          metadata: { inputLength: trimmedText.length, mode },
          operationKey: 'generate',
          startedAt: llmCallStartedAt,
          status: isAborted ? 'cancelled' : 'failed'
        });
        hasReportedUsage = true;
      }

      if (!isAborted) {
        emit({
          type: 'error',
          data: {
            code: error?.code,
            message: error?.message || '划词解释失败'
          }
        });
      }
      emit({ type: 'done' });
    } finally {
      cleanupExternalAbort();
      selectedTextExplainTasks.complete(requestId);
    }
  }
}

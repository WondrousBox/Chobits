/**
 * 脑图服务 - 对字幕/文本内容生成思维导图（Markdown 格式）
 */

import { type AimSegments } from '@aim-packages/subtitle';

import type { TokenUsage } from '../types';
import { bindAbortControllerToSignal, createTaskRegistry, type ManagedTask } from './task-manager';

/**
 * 脑图进度数据
 */
export interface MindmapProgressData {
  /** 进度消息 */
  message: string;
  /** 进度百分比 (0-100) */
  percentage?: number;
  /** 原始 Markdown 内容（部分或完整） */
  rawContent?: string;
  /** 任务展示信息（可选） */
  displayInfo?: {
    type?: string;
    label?: string;
    subLabel?: string;
    icon?: string;
    resourceId?: string;
  };
}

/**
 * 脑图完成数据
 */
export interface MindmapCompletedData {
  /** Markdown 格式的思维导图内容 */
  markdown: string;
  /** 任务展示信息（可选） */
  displayInfo?: {
    type?: string;
    label?: string;
    subLabel?: string;
    icon?: string;
    resourceId?: string;
  };
}

/**
 * 脑图错误数据
 */
export interface MindmapErrorData {
  /** 错误消息 */
  message: string;
  /** 错误码 */
  code?: string;
}

/**
 * 脑图事件类型
 */
export type MindmapEvent =
  | { type: 'connected' } // 连接成功
  | { type: 'progress'; data: MindmapProgressData } // 进度更新
  | { type: 'completed'; data: MindmapCompletedData } // 脑图生成完成
  | { type: 'error'; data: MindmapErrorData } // 脑图生成错误
  | { type: 'done' }; // 流程结束

/**
 * 流式聊天事件类型
 */
export interface ChatStreamEvent {
  type: 'delta' | 'thinking_delta' | 'message_completed' | 'error';
  data?: {
    message?: string;
    providerRequestId?: string;
    rawUsage?: unknown;
    text?: string;
    usage?: TokenUsage;
  };
}

/**
 * 流式聊天回调函数类型
 */
export type ChatStreamCallback = (event: ChatStreamEvent) => void;

/**
 * 聊天函数类型
 */
export type ChatFunction = (
  /** 提示词内容 */
  prompt: string,
  /** 流式事件回调 */
  onEvent: ChatStreamCallback,
  /** 中止信号 */
  abortSignal?: AbortSignal
) => Promise<void>;

export interface MindmapUsageEvent {
  attemptIndex?: number;
  completedAt?: number;
  metadata?: Record<string, unknown>;
  operationKey?: string;
  providerRequestId?: string;
  rawUsage?: unknown;
  startedAt?: number;
  status: 'completed' | 'failed' | 'cancelled';
  usage?: TokenUsage;
}

/**
 * 脑图配置选项
 */
export interface MindmapOptions {
  /** 最大字符数（用于控制输入长度），默认 10000 */
  maxChars?: number;
  /** 最大层级深度，默认 4 */
  maxDepth?: number;
  /** 自定义提示词模板（可选）
   * 支持的占位符：
   * - {language}: 目标语言
   * - {content}: 待分析内容
   * - {maxDepth}: 最大层级
   */
  promptTemplate?: string;
}

/**
 * 脑图请求
 */
export interface MindmapRequest {
  /** 请求 ID（必填，用于跟踪和取消任务） */
  requestId: string;
  /** 聊天函数（必填，用于执行实际的 AI 调用） */
  chatFn: ChatFunction;
  /** Provider ID（必填，用于任务状态展示） */
  providerId: string;
  /** 实际使用的模型 ID（必填，用于任务状态展示） */
  model: string;
  /** 任务标签（可选，用于显示和任务管理，如 'openai/gpt-4'） */
  taskLabel?: string;
  /** 待分析的内容（可以是文本字符串或字幕片段数组） */
  content: string | AimSegments[];
  /** 目标语言编码（如 'zh-CN', 'en', 'ja'） */
  targetLanguage: string;
  /** 语言编码到名称的映射（可选，用于提示词中显示可读名称） */
  languageNames?: Record<string, string>;
  /** 元数据（可选，用于传递额外信息如 resourceId） */
  metadata?: Record<string, any>;
  /** Usage 事件回调（可选，用于记录 provider 级消耗） */
  onUsageEvent?: (event: MindmapUsageEvent) => void;
  /** 脑图配置选项 */
  options?: MindmapOptions;
}

/**
 * 脑图事件发射器类型
 */
export type MindmapEmitter = (event: MindmapEvent) => void;

/**
 * 默认的脑图提示词模板
 */
const DEFAULT_MINDMAP_PROMPT = `You are a [Content Analysis Master] and [Language Expert], specializing in [content outline extraction] and [multilingual translation]. You excel at creating structured content hierarchies and translating between different languages.

Please generate an outline using Markdown format. You must extract the [main content theme] as the Markdown level 1 heading. The level 1 heading should be concise and not too long. The outline should be comprehensive, well-structured, and clearly organized.

**CRITICAL LANGUAGE REQUIREMENT: You MUST output ALL content in {language} language, regardless of the input text language.**

**HIERARCHY CONTROL: Limit the outline to maximum {maxDepth} levels deep to maintain clarity and readability.**

Format Requirements:
# Main Content Theme (Level 1 Heading)
## Primary Categories (Level 2 Heading)
### Specific Points (Level 3 Heading)
#### Detailed Explanations (Level 4 Heading - if maxDepth allows)

Content: ###
{content}
###

Please ensure:
1. Main content theme as level 1 heading, keep it concise
2. Maximum {maxDepth} levels of hierarchy structure
3. Clear categorization and logical organization
4. Specific descriptions, avoid vague content
5. Strictly output in {language} language
6. Maintain content accuracy and completeness
7. Focus on key points without excessive detail
8. Output ONLY the Markdown formatted outline, no additional explanation or code blocks`;

type MindmapTaskMetadata = {
  providerId: string;
  model: string;
  metadata?: Record<string, any>;
};

type ActiveMindmapTaskSnapshot = {
  requestId: string;
  taskLabel?: string;
  startTime: number;
  providerId: string;
  model: string;
  metadata?: Record<string, any>;
};

const mindmapTasks = createTaskRegistry<MindmapTaskMetadata>();

function toMindmapTaskInfo(task: ManagedTask<MindmapTaskMetadata>): ActiveMindmapTaskSnapshot {
  return {
    requestId: task.requestId,
    taskLabel: task.taskLabel,
    startTime: task.startTime,
    providerId: task.providerId,
    model: task.model,
    metadata: task.metadata
  };
}

/**
 * 脑图服务类
 */
export class MindmapService {
  /**
   * 取消脑图任务
   */
  static cancelMindmap(requestId: string): boolean {
    return mindmapTasks.cancel(requestId);
  }

  /**
   * 获取所有活跃的脑图任务
   */
  static getAllActiveMindmaps(): ActiveMindmapTaskSnapshot[] {
    return mindmapTasks.list().map(toMindmapTaskInfo);
  }

  /**
   * 执行脑图生成
   */
  static async generateMindmap(emit: MindmapEmitter, request: MindmapRequest, externalSignal?: AbortSignal): Promise<void> {
    const { requestId, chatFn, providerId, model, taskLabel, content, targetLanguage, languageNames, metadata, onUsageEvent, options = {} } = request;

    const { maxChars = 10000, maxDepth = 4, promptTemplate } = options;

    const abortController = new AbortController();
    mindmapTasks.start(requestId, {
      controller: abortController,
      taskLabel,
      extra: {
        providerId,
        model,
        metadata
      }
    });
    const cleanupExternalAbort = bindAbortControllerToSignal(abortController, externalSignal);
    let hasEmittedError = false;
    let hasReportedUsage = false;
    let streamError: Error | undefined;
    let llmCallStartedAt: number | undefined;

    try {
      emit({ type: 'connected' });

      // 处理内容：如果是 AimSegments 数组，转换为纯文本
      let contentText: string;
      if (Array.isArray(content)) {
        contentText = content.map((seg) => seg.text).join('\n');
      } else {
        contentText = content;
      }

      // 截断内容以控制输入长度
      if (contentText.length > maxChars) {
        contentText = contentText.slice(0, maxChars);
      }

      // 获取语言名称
      const languageName = languageNames?.[targetLanguage] || targetLanguage;

      // 构建提示词
      const prompt = (promptTemplate || DEFAULT_MINDMAP_PROMPT)
        .replace(/{language}/g, languageName)
        .replace(/{content}/g, contentText)
        .replace(/{maxDepth}/g, String(maxDepth));

      emit({
        type: 'progress',
        data: {
          message: '正在分析内容...',
          percentage: 10,
          displayInfo: metadata
        }
      });

      // 执行 AI 调用
      let fullResponse = '';
      llmCallStartedAt = Date.now();

      await chatFn(
        prompt,
        (event) => {
          if (event.type === 'delta' && event.data?.text) {
            const deltaText = event.data.text;
            fullResponse += deltaText;

            emit({
              type: 'progress',
              data: {
                message: '正在生成脑图...',
                percentage: 50,
                rawContent: fullResponse,
                displayInfo: metadata
              }
            });
          } else if (event.type === 'message_completed') {
            if (!hasReportedUsage) {
              onUsageEvent?.({
                completedAt: Date.now(),
                operationKey: 'generate',
                providerRequestId: event.data?.providerRequestId,
                rawUsage: event.data?.rawUsage,
                startedAt: llmCallStartedAt,
                status: 'completed',
                usage: event.data?.usage
              });
              hasReportedUsage = true;
            }

            emit({
              type: 'progress',
              data: {
                message: '生成完成',
                percentage: 90,
                rawContent: fullResponse,
                displayInfo: metadata
              }
            });
          } else if (event.type === 'error') {
            const errorMessage = event.data?.message || '生成脑图时出错';
            hasEmittedError = true;
            if (!hasReportedUsage) {
              onUsageEvent?.({
                completedAt: Date.now(),
                operationKey: 'generate',
                startedAt: llmCallStartedAt,
                status: abortController.signal.aborted ? 'cancelled' : 'failed'
              });
              hasReportedUsage = true;
            }
            streamError = new Error(errorMessage);
            emit({
              type: 'error',
              data: { message: errorMessage }
            });
          }
        },
        abortController.signal
      );

      if (streamError) {
        throw streamError;
      }

      emit({
        type: 'progress',
        data: {
          message: '脑图完成',
          percentage: 100,
          displayInfo: metadata
        }
      });

      // 清理 Markdown（移除可能的代码块标记）
      const cleanedMarkdown = MindmapService.cleanMarkdown(fullResponse);

      emit({
        type: 'completed',
        data: {
          markdown: cleanedMarkdown,
          displayInfo: metadata
        }
      });

      mindmapTasks.complete(requestId);
      emit({ type: 'done' });
    } catch (error: any) {
      const isAborted = error.name === 'AbortError' || error.message === 'Aborted' || abortController.signal.aborted;
      if (!hasReportedUsage) {
        onUsageEvent?.({
          completedAt: Date.now(),
          operationKey: 'generate',
          startedAt: llmCallStartedAt,
          status: isAborted ? 'cancelled' : 'failed'
        });
        hasReportedUsage = true;
      }

      if (isAborted) {
        mindmapTasks.complete(requestId);
        emit({ type: 'done' });
      } else {
        const errorMessage = error?.message || '生成脑图失败';
        if (!hasEmittedError) {
          emit({
            type: 'error',
            data: {
              message: errorMessage,
              code: error?.code
            }
          });
        }
        mindmapTasks.complete(requestId);
        emit({ type: 'done' });
      }
    } finally {
      cleanupExternalAbort();
    }
  }

  /**
   * 清理 Markdown 内容
   * 移除可能的代码块标记和其他格式化内容
   */
  private static cleanMarkdown(response: string): string {
    // 移除 markdown 代码块标记
    let cleaned = response.replace(/```(?:markdown|md)?\s*/g, '').replace(/```\s*$/g, '');

    // 移除开头和结尾的空白
    cleaned = cleaned.trim();

    return cleaned;
  }
}

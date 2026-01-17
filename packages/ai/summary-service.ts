/**
 * 总结服务 - 对字幕/文本内容进行智能分析和总结
 */

import { type AimSegments } from '@aim-packages/subtitle';
import { JsonOutputParser } from '@langchain/core/output_parsers';

/**
 * 总结进度数据
 */
export interface SummaryProgressData {
  /** 进度消息 */
  message: string;
  /** 进度百分比 (0-100) */
  percentage?: number;
  /** 原始文本内容（部分或完整） */
  rawContent?: string;
  /** 解析后的部分 JSON 数据 */
  parsedData?: Partial<SummaryCompletedData>;
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
 * 总结完成数据
 */
export interface SummaryCompletedData {
  /** 关键词列表 */
  keywords: string[];
  /** 简要总结（2-3句话） */
  summary: string;
  /** 关键点列表 */
  keyPoints: Array<{
    /** 开始时间 */
    st: string;
    /** 标题 */
    title: string;
    /** 内容 */
    content: string;
  }>;
  /** 时间线 */
  timeline: Array<{
    /** 开始时间 */
    st: string;
    /** 描述 */
    description: string;
  }>;
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
 * 总结错误数据
 */
export interface SummaryErrorData {
  /** 错误消息 */
  message: string;
  /** 错误码 */
  code?: string;
}

/**
 * 总结事件类型
 */
export type SummaryEvent =
  | { type: 'connected' } // 连接成功
  | { type: 'progress'; data: SummaryProgressData } // 进度更新（包含部分解析的 JSON）
  | { type: 'parsing'; data: { rawContent: string } } // 正在解析 JSON
  | { type: 'completed'; data: SummaryCompletedData } // 总结完成
  | { type: 'error'; data: SummaryErrorData } // 总结错误
  | { type: 'done' }; // 流程结束

/**
 * 流式聊天事件类型
 */
export interface ChatStreamEvent {
  type: 'delta' | 'message_completed' | 'error';
  data?: {
    text?: string;
    message?: string;
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

/**
 * 总结配置选项
 */
export interface SummaryOptions {
  /** 最大字符数（用于控制输入长度），默认 5000 */
  maxChars?: number;
  /** 是否提取关键点，默认 true */
  extractKeyPoints?: boolean;
  /** 是否提取时间线，默认 true */
  extractTimeline?: boolean;
  /** 关键词数量，默认 3 */
  keywordCount?: number;
  /** 自定义提示词模板（可选）
   * 支持的占位符：
   * - {language}: 目标语言
   * - {content}: 待总结内容
   */
  promptTemplate?: string;
}

/**
 * 总结请求
 */
export interface SummaryRequest {
  /** 请求 ID（必填，用于跟踪和取消任务） */
  requestId: string;
  /** 聊天函数（必填，用于执行实际的 AI 调用） */
  chatFn: ChatFunction;
  /** 任务标签（可选，用于显示和任务管理，如 'openai/gpt-4'） */
  taskLabel?: string;
  /** 待总结的内容（可以是文本字符串或字幕片段数组） */
  content: string | AimSegments[];
  /** 目标语言编码（如 'zh-CN', 'en', 'ja'） */
  targetLanguage: string;
  /** 语言编码到名称的映射（可选，用于提示词中显示可读名称） */
  languageNames?: Record<string, string>;
  /** 元数据（可选，用于传递额外信息如 resourceId） */
  metadata?: Record<string, any>;
  /** 总结配置选项 */
  options?: SummaryOptions;
}

/**
 * 总结事件发射器类型
 */
export type SummaryEmitter = (event: SummaryEvent) => void;

/**
 * 默认的总结提示词模板
 */
const DEFAULT_SUMMARY_PROMPT = `You are an expert content analyst specializing in subtitle and transcript analysis. Analyze the following subtitle/transcript data and provide a comprehensive JSON response.

**CRITICAL LANGUAGE REQUIREMENT: You MUST output ALL content in {language} language, regardless of input text language. This includes keywords, summary, titles, descriptions, and all other text fields.**

Input Format: The data is structured as [start_time - end_time]text_content for each subtitle segment.

Analysis Requirements:
1. Extract {keywordCount} key topic tags (keywords) that best represent main themes - OUTPUT IN {language}
2. Generate a concise 2-3 sentence summary capturing the core message - OUTPUT IN {language}
3. Segment content into thematic sections (themes) by grouping related subtitle segments
4. **ALL OUTPUT MUST BE IN {language} LANGUAGE**

Source Subtitle Data:
###
{content}
###

Provide a valid JSON response in the following exact format:
{
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "summary": "A concise 2-3 sentence summary of the main content",
  "keyPoints": [
    {
      "st": "00:00:00.000",
      "title": "Key Point 1 Title",
      "content": "Content related to this key point"
    },
    {
      "st": "00:00:30.000",
      "title": "Key Point 2 Title",
      "content": "Content related to this key point"
    }
  ],
  "timeline": [
    {
      "st": "00:00:00.000",
      "description": "Brief description of this time period"
    },
    {
      "st": "00:00:30.000",
      "description": "Brief description of this time period"
    }
  ]
}

Instructions for analysis:
- Parse the [start_time - end_time] format to extract timing information
- Group consecutive or thematically related subtitle segments into key points
- Use the start time of the first segment in each key point group
- Create timeline segments with brief descriptions for major time periods
- Ensure key points are logically connected and chronologically ordered
- **FINAL REMINDER: ALL TEXT OUTPUT (keywords, summary, titles, content, descriptions) MUST BE TRANSLATED TO {language} LANGUAGE**
- Focus on accuracy, clarity, and maintaining the original meaning while providing structured insights.`;

/**
 * 活跃总结任务管理
 */
class SummaryServiceManager {
  private activeSummaries = new Map<string, { abortController: AbortController; taskLabel?: string }>();

  /**
   * 开始总结任务
   */
  startSummary(requestId: string, abortController: AbortController, taskLabel?: string): void {
    this.activeSummaries.set(requestId, { abortController, taskLabel });
  }

  /**
   * 取消总结任务
   */
  cancelSummary(requestId: string): boolean {
    const task = this.activeSummaries.get(requestId);
    if (task) {
      task.abortController.abort();
      this.activeSummaries.delete(requestId);
      return true;
    }
    return false;
  }

  /**
   * 获取活跃任务列表
   */
  getActiveSummaries(): Array<{ requestId: string; taskLabel?: string; startTime: number }> {
    const now = Date.now();
    return Array.from(this.activeSummaries.entries()).map(([requestId, data]) => ({
      requestId,
      taskLabel: data.taskLabel,
      startTime: now
    }));
  }

  /**
   * 根据任务标签获取活跃任务
   */
  getActiveSummariesByLabel(taskLabel: string): string[] {
    const matches: string[] = [];
    for (const [requestId, data] of this.activeSummaries.entries()) {
      if (data.taskLabel === taskLabel) {
        matches.push(requestId);
      }
    }
    return matches;
  }

  /**
   * 完成总结任务
   */
  completeSummary(requestId: string): void {
    this.activeSummaries.delete(requestId);
  }
}

const summaryManager = new SummaryServiceManager();

/**
 * 总结服务类
 */
export class SummaryService {
  /**
   * 取消总结任务
   */
  static cancelSummary(requestId: string): boolean {
    return summaryManager.cancelSummary(requestId);
  }

  /**
   * 获取所有活跃的总结任务
   */
  static getAllActiveSummaries(): Array<{ requestId: string; taskLabel?: string; startTime: number }> {
    return summaryManager.getActiveSummaries();
  }

  /**
   * 根据任务标签获取活跃任务
   */
  static getActiveSummariesByLabel(taskLabel: string): string[] {
    return summaryManager.getActiveSummariesByLabel(taskLabel);
  }

  /**
   * 执行总结
   */
  static async summarize(emit: SummaryEmitter, request: SummaryRequest): Promise<void> {
    const { requestId, chatFn, taskLabel, content, targetLanguage, languageNames, metadata, options = {} } = request;

    const { maxChars = 5000, extractKeyPoints = true, extractTimeline = true, keywordCount = 3, promptTemplate } = options;

    const abortController = new AbortController();
    summaryManager.startSummary(requestId, abortController, taskLabel);

    try {
      emit({ type: 'connected' });

      // 处理内容：如果是 AimSegments 数组，转换为带时间戳的文本
      let contentText: string;
      if (Array.isArray(content)) {
        contentText = content
          .map((seg) => {
            if (seg.st && seg.et) {
              return `[${seg.st} - ${seg.et}]${seg.text}`;
            }
            return seg.text;
          })
          .join('\n');
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
      const prompt = (promptTemplate || DEFAULT_SUMMARY_PROMPT)
        .replace(/{language}/g, languageName)
        .replace(/{content}/g, contentText)
        .replace(/{keywordCount}/g, String(keywordCount));

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

      const jsonParser = new JsonOutputParser<SummaryCompletedData>();

      await chatFn(
        prompt,
        (event) => {
          if (event.type === 'delta' && event.data?.text) {
            const deltaText = event.data.text;
            fullResponse += deltaText;

            // 尝试解析部分 JSON（不使用 await，在 Promise 链中处理）
            emit({
              type: 'parsing',
              data: { rawContent: fullResponse }
            });

            jsonParser
              .parsePartialResult([{ text: fullResponse }])
              .then((parsed) => {
                if (parsed) {
                  emit({
                    type: 'progress',
                    data: {
                      message: '正在生成总结...',
                      percentage: 50,
                      rawContent: fullResponse,
                      parsedData: parsed,
                      displayInfo: metadata
                    }
                  });
                }
              })
              .catch(() => {
                // 解析失败，继续累积文本
              });
          } else if (event.type === 'message_completed') {
            // 尝试最终解析
            jsonParser
              .parsePartialResult([{ text: fullResponse }])
              .then((finalParsed) => {
                if (finalParsed) {
                  emit({
                    type: 'progress',
                    data: {
                      message: '解析完成',
                      percentage: 90,
                      rawContent: fullResponse,
                      parsedData: finalParsed,
                      displayInfo: metadata
                    }
                  });
                } else {
                  emit({
                    type: 'progress',
                    data: {
                      message: '正在解析结果...',
                      percentage: 80,
                      displayInfo: metadata
                    }
                  });
                }
              })
              .catch(() => {
                // 解析失败，使用原始解析方法
              });
          } else if (event.type === 'error') {
            const errorMessage = event.data?.message || '生成总结时出错';
            emit({
              type: 'error',
              data: { message: errorMessage }
            });
          }
        },
        abortController.signal
      );

      // 解析 JSON 响应
      emit({
        type: 'progress',
        data: {
          message: '正在解析结果...',
          percentage: 90,
          displayInfo: metadata
        }
      });

      const result = SummaryService.parseSummaryResponse(fullResponse, extractKeyPoints, extractTimeline);

      emit({
        type: 'progress',
        data: {
          message: '总结完成',
          percentage: 100,
          displayInfo: metadata
        }
      });

      emit({
        type: 'completed',
        data: {
          ...result,
          displayInfo: metadata
        }
      });

      summaryManager.completeSummary(requestId);
      emit({ type: 'done' });
    } catch (error: any) {
      if (error.name === 'AbortError') {
        summaryManager.completeSummary(requestId);
        emit({ type: 'done' });
      } else {
        const errorMessage = error?.message || '生成总结失败';
        emit({
          type: 'error',
          data: {
            message: errorMessage,
            code: error?.code
          }
        });
        summaryManager.completeSummary(requestId);
        emit({ type: 'done' });
      }
    }
  }

  /**
   * 解析总结响应
   * 从 AI 返回的文本中提取 JSON 对象
   */
  private static parseSummaryResponse(response: string, extractKeyPoints: boolean, extractTimeline: boolean): Omit<SummaryCompletedData, 'displayInfo'> {
    try {
      // 尝试提取 JSON 代码块
      const jsonMatch = response.match(/```(?:json)?\s*({[\s\S]*})\s*```/) || response.match(/({[\s\S]*})/);
      const jsonStr = jsonMatch ? jsonMatch[1] : response;

      const parsed = JSON.parse(jsonStr);

      return {
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
        summary: parsed.summary || '',
        keyPoints:
          extractKeyPoints && Array.isArray(parsed.keyPoints)
            ? parsed.keyPoints.map((kp: any) => ({
              st: kp.st || '00:00:00.000',
              title: kp.title || '',
              content: kp.content || ''
            }))
            : [],
        timeline:
          extractTimeline && Array.isArray(parsed.timeline)
            ? parsed.timeline.map((tl: any) => ({
              st: tl.st || '00:00:00.000',
              description: tl.description || ''
            }))
            : []
      };
    } catch (error) {
      console.error('[SummaryService] Failed to parse summary response:', error);
      // 返回默认结果
      return {
        keywords: [],
        summary: '解析失败，请重试',
        keyPoints: [],
        timeline: []
      };
    }
  }
}

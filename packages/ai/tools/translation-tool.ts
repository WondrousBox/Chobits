/**
 * 翻译工具
 *
 * 将翻译服务封装成 Mastra Tool，通过上下文注入外部依赖
 */

import { type AimSegments } from '@aim-packages/subtitle';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { TranslationService as TranslationServiceType } from '../translation-service';
import { getTranslationServiceParams, translationToolContext } from './translation-tool-context';

/**
 * 翻译工具上下文接口
 * 定义需要从外部注入的依赖
 */
export interface TranslationToolContext {
  /** 翻译服务实例 */
  translationService: typeof TranslationServiceType;
  /** Chat 函数（用于实际的 AI 调用） */
  chatFn: (prompt: string, onEvent: (event: any) => void, abortSignal?: AbortSignal) => Promise<void>;
  /** 请求 ID（用于追踪） */
  requestId: string;
  /** 任务标签（用于显示，如 'openai/gpt-4'） */
  taskLabel?: string;
  /** 元数据（可选，用于传递额外信息如 resourceId） */
  metadata?: Record<string, any>;
  /** 中止信号（可选） */
  abortSignal?: AbortSignal;
}

/**
 * 翻译工具输入参数
 */
const translationInputSchema = z.object({
  segments: z.array(z.any()).describe('待翻译的字幕片段数组'),
  targetLanguage: z.string().describe('目标语言编码（如 zh-CN, en, ja）'),
  sourceLanguage: z.string().optional().describe('源语言编码（可选）'),
  languageNames: z.record(z.string(), z.string()).optional().describe('语言编码到名称的映射'),
  options: z
    .object({
      maxConcurrency: z.number().optional().describe('最大并发数，默认 3'),
      chunkSize: z.number().optional().describe('每个分块的最大字符数，默认 1000'),
      maxRetries: z.number().optional().describe('失败后最大重试次数，默认 2'),
      generateSummary: z.boolean().optional().describe('是否生成总结，默认 true'),
      glossary: z.any().optional().describe('术语表/热词词典')
    })
    .optional()
    .describe('翻译配置选项')
});

/**
 * 翻译工具输出参数
 */
const translationOutputSchema = z.object({
  success: z.boolean().describe('是否成功'),
  segments: z.array(z.any()).optional().describe('翻译后的片段数组'),
  error: z.string().optional().describe('错误信息（如果失败）')
});

/**
 * 创建翻译工具
 *
 * @param boundTranslationService - 翻译服务实例（可选，如不传入则需要在 toolContext 中提供）
 * @param boundChatFn - Chat 函数（可选）
 */
export const createTranslationTool = (boundTranslationService?: typeof TranslationServiceType): ReturnType<typeof createTool> =>
  createTool({
    id: 'translate-subtitle',
    description: '翻译字幕片段。支持分块翻译、并发处理、自动重试等功能。',
    inputSchema: translationInputSchema,
    outputSchema: translationOutputSchema,

    execute: async ({ context }) => {
      const { segments, targetLanguage, sourceLanguage, languageNames = {}, options = {} } = context;

      // 尝试从上下文管理器获取执行上下文
      const executionContext = translationToolContext.getContext();

      // 如果没有上下文，返回错误
      if (!executionContext) {
        return {
          success: false,
          error: '翻译工具需要在正确的执行上下文中调用。请确保通过 Agent 聊天调用此工具。'
        };
      }

      // 使用上下文中的依赖
      const translationService = boundTranslationService;
      if (!translationService) {
        return {
          success: false,
          error: 'TranslationService 未配置'
        };
      }

      try {
        // 构建翻译参数
        const params = getTranslationServiceParams({
          segments,
          targetLanguage,
          sourceLanguage,
          languageNames,
          options
        });

        if (!params) {
          return {
            success: false,
            error: '无法获取翻译参数'
          };
        }

        // 收集翻译结果
        let translatedSegments: AimSegments[] = [];
        const originalEmit = executionContext.emit;

        // 包装 emit 函数以捕获翻译结果
        const wrappedEmit = (event: any): void => {
          if (event.type === 'completed' && event.data?.segments) {
            translatedSegments = event.data.segments;
          }
          originalEmit(event);
        };

        // 调用翻译服务
        const result = await translationService.translateSubtitles(params, wrappedEmit, undefined);

        return {
          success: true,
          segments: result || translatedSegments
        };
      } catch (error: any) {
        return {
          success: false,
          error: error?.message || '翻译失败'
        };
      }
    }
  });

/**
 * 默认翻译工具实例
 */
export const translationTool = createTranslationTool();

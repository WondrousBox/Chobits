/**
 * 翻译工具
 *
 * 将翻译任务封装成统一工具定义，并通过显式 runtime 绑定注入 provider/model 语义
 */

import { z } from 'zod';

import { executeSubtitleTranslation } from '../ipc-handler-helpers';
import { normalizeProviderPreset, resolveProviderPresetId } from '../provider-preset';
import { createTool } from './tool-definition';

export interface TranslationToolRuntimeBinding {
  providerId: string;
  providerPresetId?: string;
  model: string;
}

/**
 * 翻译工具输入参数
 *
 * 支持两种输入方式：
 * - 提供 `segments`（从读取字幕工具获取）
 * - 或者提供 `resourceId`（工具会自行加载字幕片段）
 */
const translationInputSchema = z.object({
  resourceId: z.string().describe('字幕资源的 ID，用于保存翻译结果'),
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
  message: z.string().optional().describe('提示信息'),
  error: z.string().optional().describe('错误信息（如果失败）')
});

/**
 * 创建翻译工具
 *
 * @param bindings - 显式 runtime 绑定，指定 provider / preset / model
 */
export const createTranslationTool = (bindings?: { runtime?: TranslationToolRuntimeBinding }): ReturnType<typeof createTool> =>
  createTool({
    id: 'translate-subtitle',
    description: '翻译字幕文件。自动加载字幕内容并翻译到指定语言。',
    inputSchema: translationInputSchema,
    outputSchema: translationOutputSchema,

    execute: async ({ context }) => {
      const { resourceId, targetLanguage, sourceLanguage, languageNames = {}, options = {} } = context;

      const executionContext = bindings?.runtime;

      if (!executionContext) {
        return {
          success: false,
          error: '翻译工具缺少 runtime 绑定。请使用 createTranslationTool({ runtime: { providerId, model, providerPresetId? } }) 创建工具。'
        };
      }

      try {
        const providerPresetId = resolveProviderPresetId(executionContext);

        const params = normalizeProviderPreset({
          resourceId,
          targetLanguage,
          segments: undefined,
          sourceLanguage,
          languageNames,
          options,
          metadata: { resourceId },
          providerId: executionContext.providerId,
          providerPresetId,
          model: executionContext.model
        });

        // 调用翻译任务（不等待结果）
        executeSubtitleTranslation(params).catch((error) => {
          console.error('[translation-tool] 翻译任务启动失败:', error);
        });

        return {
          success: true,
          message: '翻译任务已启动，正在后台处理中...'
        };
      } catch (error: any) {
        return {
          success: false,
          error: error?.message || '启动翻译任务失败'
        };
      }
    }
  });

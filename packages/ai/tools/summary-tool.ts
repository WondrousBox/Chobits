/**
 * 总结工具
 *
 * 将总结服务封装成 Mastra Tool，使用全局上下文管理器获取动态依赖
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { SummaryService as SummaryServiceType } from '../services/summary-service';
import { summaryToolContext } from './summary-tool-context';

/**
 * 总结工具输入参数
 */
const summaryInputSchema = z.object({
  content: z.union([z.string(), z.array(z.any())]).describe('待总结的内容（文本或字幕片段数组）'),
  targetLanguage: z.string().describe('目标语言编码（如 zh-CN, en）'),
  languageNames: z.record(z.string(), z.string()).optional().describe('语言编码到名称的映射'),
  options: z
    .object({
      maxChars: z.number().optional().describe('最大字符数限制'),
      extractKeyPoints: z.boolean().optional().describe('是否提取关键点'),
      extractTimeline: z.boolean().optional().describe('是否提取时间线'),
      keywordCount: z.number().optional().describe('关键词数量'),
      promptTemplate: z.string().optional().describe('自定义提示词模板')
    })
    .optional()
    .describe('总结配置选项')
});

/**
 * 总结工具输出参数
 */
const summaryOutputSchema = z.object({
  success: z.boolean().describe('是否成功'),
  message: z.string().optional().describe('提示信息'),
  summary: z.string().optional().describe('总结内容'),
  keyPoints: z.array(z.string()).optional().describe('关键点列表'),
  timeline: z.array(z.any()).optional().describe('时间线事件'),
  keywords: z.array(z.string()).optional().describe('关键词列表'),
  error: z.string().optional().describe('错误信息（如果失败）')
});

/**
 * 创建总结工具
 *
 * @param boundSummaryService - 总结服务实例（在创建时绑定）
 *
 * 使用示例：
 * ```typescript
 * import { SummaryService } from '../summary-service';
 *
 * // 创建绑定了 SummaryService 的工具
 * const summaryTool = createSummaryTool(SummaryService);
 *
 * // 在 Agent 中使用
 * const agent = new Agent({
 *   name: 'summarizer',
 *   tools: { summaryTool }
 * });
 * ```
 */
export const createSummaryTool = (boundSummaryService?: typeof SummaryServiceType): ReturnType<typeof createTool> =>
  createTool({
    id: 'summarize-content',
    description: `对文本或字幕内容进行总结。这个工具会调用 AI 生成详细的总结报告。

使用场景：
- 总结字幕内容的主要信息
- 提取关键点和时间线
- 生成关键词标签

注意：此工具会通过后台服务进行总结，可能需要一些时间。总结完成后会自动通知用户。

返回值说明：
- 如果成功，会返回包含总结信息的对象
- 如果失败，会返回错误信息
- 总结过程是异步的，结果会通过事件发送到 UI`,
    inputSchema: summaryInputSchema,
    outputSchema: summaryOutputSchema,

    execute: async ({ context }) => {
      const { content, targetLanguage, languageNames = {}, options = {} } = context;

      // 尝试从上下文管理器获取执行上下文
      const executionContext = summaryToolContext.getContext();

      // 如果没有上下文，返回错误
      if (!executionContext) {
        return {
          success: false,
          error: '总结工具需要在正确的执行上下文中调用。请确保通过 Agent 聊天调用此工具。'
        };
      }

      try {
        // 构建总结参数
        const payload = {
          providerId: executionContext.providerId,
          model: executionContext.model,
          content: typeof content === 'string' ? content : undefined,
          segments: Array.isArray(content) ? content : undefined,
          targetLanguage,
          languageNames,
          options
        };

        // 导入并调用 executeSummarize
        const { executeSummarize } = await import('../ipc-handler-helpers');

        // 调用总结任务（不等待结果）
        executeSummarize(payload).catch((error) => {
          console.error('[summary-tool] 总结任务启动失败:', error);
        });

        // 立即返回，告诉 Agent 总结已开始
        return {
          success: true,
          message: '总结任务已启动，正在后台处理中...'
        };
      } catch (error: any) {
        return {
          success: false,
          error: error?.message || '启动总结任务失败'
        };
      }
    }
  });

/**
 * 默认总结工具实例（未绑定，需要在使用时绑定 SummaryService）
 */
export const summaryTool = createSummaryTool();

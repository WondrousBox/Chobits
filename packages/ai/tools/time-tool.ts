/**
 * 时间查询工具
 *
 * 获取当前时间和日期，支持多种格式
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * 时间查询工具
 *
 * @example
 * ```typescript
 * // ISO 格式
 * const iso = await timeTool.execute({ context: { format: 'iso' } });
 * // => { time: "2024-01-17T10:30:00.000Z" }
 *
 * // Unix 时间戳
 * const unix = await timeTool.execute({ context: { format: 'unix' } });
 * // => { time: 1705488600 }
 *
 * // 可读格式
 * const readable = await timeTool.execute({ context: { format: 'readable' } });
 * // => { time: "2024/1/17 18:30:00" }
 *
 * // 仅日期
 * const date = await timeTool.execute({ context: { format: 'date' } });
 * // => { time: "2024/1/17" }
 *
 * // 仅时间
 * const time = await timeTool.execute({ context: { format: 'time' } });
 * // => { time: "18:30:00" }
 * ```
 */
export const timeTool = createTool({
  id: 'get-time',
  description: '获取当前时间和日期',
  inputSchema: z.object({
    format: z.enum(['iso', 'unix', 'readable', 'date', 'time']).optional().describe('返回格式：iso=ISO8601, unix=Unix时间戳, readable=可读格式, date=仅日期, time=仅时间')
  }),
  outputSchema: z.object({
    time: z.union([z.string(), z.number()]).describe('根据格式返回的时间值')
  }),
  execute: async ({ context }) => {
    const now = new Date();
    const format = context?.format || 'readable';

    switch (format) {
      case 'iso':
        return { time: now.toISOString() };
      case 'unix':
        return { time: Math.floor(now.getTime() / 1000) };
      case 'date':
        return { time: now.toLocaleDateString('zh-CN') };
      case 'time':
        return { time: now.toLocaleTimeString('zh-CN') };
      case 'readable':
      default:
        return { time: now.toLocaleString('zh-CN') };
    }
  }
});

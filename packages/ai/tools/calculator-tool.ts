/**
 * 计算器工具
 *
 * 安全地执行数学表达式计算
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * 计算器工具
 *
 * 支持基本的数学运算：加、减、乘、除、取模、括号
 *
 * @example
 * ```typescript
 * // 基本运算
 * const result1 = await calculatorTool.execute({
 *   context: { expression: '2 + 3' }
 * });
 * // => { result: 5, expression: '2 + 3' }
 *
 * // 复杂表达式
 * const result2 = await calculatorTool.execute({
 *   context: { expression: '(10 + 5) * 2 - 8 / 4' }
 * });
 * // => { result: 28, expression: '(10 + 5) * 2 - 8 / 4' }
 *
 * // 取模运算
 * const result3 = await calculatorTool.execute({
 *   context: { expression: '17 % 5' }
 * });
 * // => { result: 2, expression: '17 % 5' }
 * ```
 */
export const calculatorTool = createTool({
  id: 'calculator',
  description: '执行数学计算。支持：加(+)、减(-)、乘(*)、除(/)、取模(%)、括号()',
  inputSchema: z.object({
    expression: z.string().describe('数学表达式，如 "2 + 3 * 4" 或 "(10 + 5) * 2"')
  }),
  outputSchema: z.object({
    result: z.number().describe('计算结果'),
    expression: z.string().describe('原始表达式')
  }),
  execute: async ({ context }) => {
    const { expression } = context;

    try {
      // 只允许数字和基本运算符（安全性检查）
      const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '');

      // 检查是否有非法字符被移除
      const originalClean = expression.replace(/\s/g, '');
      const sanitizedClean = sanitized.replace(/\s/g, '');
      if (sanitizedClean !== originalClean) {
        throw new Error('表达式包含不允许的字符，仅支持：数字、+、-、*、/、%、( )');
      }

      // 执行计算
      const result = Function(`"use strict"; return (${sanitized})`)();

      // 验证结果
      if (typeof result !== 'number' || !isFinite(result)) {
        throw new Error('计算结果无效');
      }

      return { result, expression };
    } catch (error) {
      throw new Error(`计算错误: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
});

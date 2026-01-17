/**
 * Tool 接口定义
 *
 * 工具的基础接口和类型
 */

import type { JSONSchema, ToolDefinition, ToolResult } from '../types';

/**
 * 工具接口
 *
 * @description
 * 定义单个工具的完整接口。
 * 工具实现者需要实现此接口。
 *
 * @example
 * ```typescript
 * const myTool: Tool = {
 *   name: 'get_time',
 *   description: '获取当前时间',
 *   parameters: { type: 'object', properties: {} },
 *   async execute(params) {
 *     return { time: new Date().toISOString() };
 *   }
 * };
 * ```
 */
export interface Tool {
  /** 工具名称（唯一标识） */
  name: string;

  /** 工具描述（LLM 用于决策） */
  description: string;

  /** 参数 JSON Schema */
  parameters: JSONSchema;

  /**
   * 执行工具
   *
   * @param params - 工具参数
   * @returns 执行结果（任意类型）
   */
  execute(params: unknown): Promise<unknown>;

  /**
   * 参数验证（可选）
   *
   * @param params - 待验证参数
   * @returns 是否有效
   */
  validate?(params: unknown): boolean | { valid: boolean; error?: string };
}

/**
 * 工具构建器选项
 */
export interface ToolBuilderOptions<TParams = unknown, TResult = unknown> {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 参数 JSON Schema */
  parameters: JSONSchema;
  /** 执行函数 */
  execute: (params: TParams) => Promise<TResult>;
  /** 验证函数（可选） */
  validate?: (params: unknown) => boolean | { valid: boolean; error?: string };
}

/**
 * 创建工具
 *
 * @description
 * 工厂函数，用于创建工具实例。
 * 提供类型安全的方式定义工具。
 *
 * @example
 * ```typescript
 * const timeTool = createTool({
 *   name: 'get_time',
 *   description: '获取当前时间',
 *   parameters: {
 *     type: 'object',
 *     properties: {
 *       format: { type: 'string', enum: ['iso', 'unix'] }
 *     }
 *   },
 *   async execute({ format }) {
 *     return format === 'unix'
 *       ? { time: Date.now() }
 *       : { time: new Date().toISOString() };
 *   }
 * });
 * ```
 */
export function createTool<TParams = unknown, TResult = unknown>(options: ToolBuilderOptions<TParams, TResult>): Tool {
  return {
    name: options.name,
    description: options.description,
    parameters: options.parameters,
    execute: options.execute as (params: unknown) => Promise<unknown>,
    validate: options.validate
  };
}

/**
 * 从工具获取工具定义
 */
export function toToolDefinition(tool: Tool): ToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  };
}

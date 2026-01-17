/**
 * Tool Provider 接口
 *
 * 定义工具提供者的标准接口
 * 负责工具的注册、列表和执行
 */

import type { ToolDefinition, ToolResult, ValidationResult } from '../types';

/**
 * 工具提供者接口
 *
 * @description
 * 定义工具管理和执行的标准接口。
 * Agent 运行时通过此接口获取可用工具并执行工具调用。
 *
 * @example
 * ```typescript
 * class MyToolProvider implements ToolProvider {
 *   list(): ToolDefinition[] {
 *     return [{ name: 'calculator', ... }];
 *   }
 *
 *   async execute(name: string, params: unknown): Promise<ToolResult> {
 *     // 执行工具逻辑
 *   }
 * }
 * ```
 */
export interface ToolProvider {
  /**
   * 列出所有可用工具
   *
   * @returns 工具定义数组
   *
   * @description
   * 返回当前可用的所有工具定义。
   * Agent 运行时会将这些定义发送给 LLM，
   * 以便 LLM 决定是否需要调用工具。
   */
  list(): ToolDefinition[];

  /**
   * 执行工具
   *
   * @param name - 工具名称
   * @param params - 工具参数
   * @returns 执行结果
   *
   * @description
   * 根据工具名称和参数执行具体的工具逻辑。
   * 实现者需要处理：
   * - 工具查找
   * - 参数验证（可选）
   * - 执行并返回结果
   * - 错误处理
   */
  execute(name: string, params: unknown): Promise<ToolResult>;

  /**
   * 验证工具参数（可选）
   *
   * @param name - 工具名称
   * @param params - 待验证参数
   * @returns 验证结果
   *
   * @description
   * 在执行工具前验证参数是否符合工具的 JSON Schema。
   * 这可以提前发现参数错误，避免不必要的执行。
   */
  validate?(name: string, params: unknown): ValidationResult;

  /**
   * 获取单个工具定义（可选）
   *
   * @param name - 工具名称
   * @returns 工具定义或 undefined
   */
  get?(name: string): ToolDefinition | undefined;
}

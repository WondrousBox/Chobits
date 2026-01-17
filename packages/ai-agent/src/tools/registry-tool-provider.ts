/**
 * Registry Tool Provider
 *
 * 基于注册表的工具提供者实现
 * 支持动态注册和管理工具
 */

import type { ToolProvider } from '../interfaces/tool-provider';
import type { ToolDefinition, ToolResult, ValidationResult } from '../types';
import type { Tool } from './tool';
import { toToolDefinition } from './tool';

/**
 * 基于注册表的工具提供者
 *
 * @description
 * 提供工具的注册、列表、执行和验证功能。
 * 支持动态添加和删除工具。
 *
 * @example
 * ```typescript
 * const toolProvider = new RegistryToolProvider();
 *
 * // 注册工具
 * toolProvider.register(timeTool);
 * toolProvider.register(calculatorTool);
 *
 * // 列出工具
 * const tools = toolProvider.list();
 *
 * // 执行工具
 * const result = await toolProvider.execute('get_time', { format: 'iso' });
 * ```
 */
export class RegistryToolProvider implements ToolProvider {
  private tools: Map<string, Tool> = new Map();

  /**
   * 注册工具
   *
   * @param tool - 工具实例
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      console.warn(`Tool "${tool.name}" is being overwritten`);
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * 批量注册工具
   *
   * @param tools - 工具数组
   */
  registerMany(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * 取消注册工具
   *
   * @param name - 工具名称
   * @returns 是否成功删除
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * 列出所有工具定义
   *
   * @returns 工具定义数组
   */
  list(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(toToolDefinition);
  }

  /**
   * 获取单个工具定义
   *
   * @param name - 工具名称
   * @returns 工具定义或 undefined
   */
  get(name: string): ToolDefinition | undefined {
    const tool = this.tools.get(name);
    return tool ? toToolDefinition(tool) : undefined;
  }

  /**
   * 检查工具是否存在
   *
   * @param name - 工具名称
   * @returns 是否存在
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 获取工具数量
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * 执行工具
   *
   * @param name - 工具名称
   * @param params - 工具参数
   * @returns 执行结果
   */
  async execute(name: string, params: unknown): Promise<ToolResult> {
    const tool = this.tools.get(name);

    if (!tool) {
      return {
        success: false,
        error: `Tool '${name}' not found`
      };
    }

    try {
      // 可选：执行验证
      if (tool.validate) {
        const validation = tool.validate(params);
        const isValid = typeof validation === 'boolean' ? validation : validation.valid;
        if (!isValid) {
          const error = typeof validation === 'object' ? validation.error : 'Invalid parameters';
          return {
            success: false,
            error: `Parameter validation failed: ${error}`
          };
        }
      }

      // 执行工具
      const result = await tool.execute(params);

      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 验证工具参数
   *
   * @param name - 工具名称
   * @param params - 待验证参数
   * @returns 验证结果
   */
  validate(name: string, params: unknown): ValidationResult {
    const tool = this.tools.get(name);

    if (!tool) {
      return { valid: false, error: `Tool '${name}' not found` };
    }

    if (!tool.validate) {
      // 如果工具没有验证函数，默认通过
      return { valid: true };
    }

    try {
      const result = tool.validate(params);
      if (typeof result === 'boolean') {
        return { valid: result, error: result ? undefined : 'Validation failed' };
      }
      return result;
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 清空所有工具
   */
  clear(): void {
    this.tools.clear();
  }

  /**
   * 获取所有工具名称
   */
  names(): string[] {
    return Array.from(this.tools.keys());
  }
}

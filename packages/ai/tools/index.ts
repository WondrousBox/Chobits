/* eslint-disable @typescript-eslint/explicit-function-return-type */
/**
 * AI 工具集中管理
 *
 * 这里统一导出所有可供 profile / session 使用的工具
 * 每个工具都定义在独立的文件中
 */

// ============================================================================
// 导入所有工具
// ============================================================================

// AI 工具（需要绑定依赖）
export type { PushCardToolContext } from './push-card-tool';
export { createPushCardTool } from './push-card-tool';

// 导入用于类型和工具列表
import type { PushCardToolContext } from './push-card-tool';
import { createPushCardTool } from './push-card-tool';

// ============================================================================
// 工具集合
// ============================================================================

/**
 * 所有工具的集合（Map 结构）
 *
 * AI 工具（需要绑定依赖）：
 * - pushCardTool: 推送资源卡片
 */
export interface LegacyToolBindings {
  pushCard?: PushCardToolContext;
}

/**
 * 获取 AI 工具列表（需要显式 binding）
 *
 * 这些工具在创建时需要通过 bindings 传入 runtime / 上下文依赖
 */
export function getAITools(bindings: LegacyToolBindings = {}) {
  return {
    pushCardTool: createPushCardTool(bindings.pushCard)
  };
}

/**
 * 获取所有工具列表
 *
 * 注意：AI 工具需要在创建时显式传入 bindings
 */
export function getAllTools(bindings: LegacyToolBindings = {}) {
  return {
    pushCardTool: createPushCardTool(bindings.pushCard)
  };
}

/**
 * 根据名称获取工具
 *
 * @param name - 工具名称（如 'pushCardTool'）
 * @returns 对应的工具实例，如果不存在则返回 undefined
 */
export function getTool(name: string, bindings: LegacyToolBindings = {}) {
  return (getAllTools(bindings) as Record<string, any>)[name];
}

/**
 * 根据工具 ID 获取工具
 *
 * @param id - 工具 ID（如 'push-card'）
 * @returns 对应的工具实例，如果不存在则返回 undefined
 */
export function getToolById(id: string, bindings: LegacyToolBindings = {}) {
  const allTools = getAllTools(bindings);
  const toolMap: Record<string, any> = {
    'push-card': allTools.pushCardTool
  };
  return toolMap[id];
}

/**
 * 工具类型定义
 */
export type ToolName = keyof ReturnType<typeof getAllTools>;

/**
 * 工具 ID 类型定义
 */
export type ToolId = 'push-card';

/**
 * 工具信息类型
 */
export type ToolInfo = {
  id: string;
  name: string;
  description: string;
};

/**
 * 列出所有可用工具的信息
 *
 * @returns 工具信息数组
 */
export function listToolInfos(): ToolInfo[] {
  return [
    {
      id: 'push-card',
      name: 'pushCardTool',
      description: '在聊天中推送资源卡片'
    },
    {
      id: 'web-search',
      name: 'webSearchTool',
      description: '搜索互联网获取最新信息'
    },
    {
      id: 'web-read',
      name: 'webReadTool',
      description: '读取指定网页的内容'
    }
  ];
}

// 向后兼容（保留原有的导出名称）
export const getTools = getAllTools;

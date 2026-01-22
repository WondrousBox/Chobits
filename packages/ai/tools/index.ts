/* eslint-disable @typescript-eslint/explicit-function-return-type */
/**
 * Mastra 工具集中管理
 *
 * 这里统一导出所有可供 Agent 使用的工具
 * 每个工具都定义在独立的文件中
 */

// ============================================================================
// 导入所有工具
// ============================================================================

// 通用工具
export { weatherTool } from './weather-tool';

// AI 工具（需要绑定依赖）
export { createReadSubtitleTool, readSubtitleTool } from './read-subtitle-tool';
export { createResourceQueryTool, resourceQueryTool } from './resource-query-tool';
export { createSummaryTool, summaryTool } from './summary-tool';
export { createTranslationTool, translationTool } from './translation-tool';

// YouTube 工具
export { createYoutubeDownloadTool, youtubeDownloadTool } from './youtube-download-tool';
export { createYoutubeSubscribeTool, youtubeSubscribeTool } from './youtube-subscribe-tool';

// 导入用于类型和工具列表
import { readSubtitleTool } from './read-subtitle-tool';
import { resourceQueryTool } from './resource-query-tool';
import { summaryTool } from './summary-tool';
import { translationTool } from './translation-tool';
import { weatherTool } from './weather-tool';
import { youtubeDownloadTool } from './youtube-download-tool';
import { youtubeSubscribeTool } from './youtube-subscribe-tool';

// ============================================================================
// 工具集合
// ============================================================================

/**
 * 所有工具的集合（Map 结构）
 *
 * 通用工具：
 * - weatherTool: 查询城市天气
 *
 * AI 工具（需要绑定依赖）：
 * - readSubtitleTool: 读取字幕文件内容
 * - translationTool: 字幕翻译
 * - summaryTool: 内容总结
 * - resourceQueryTool: 资源智能查询
 *
 * YouTube 工具：
 * - youtubeDownloadTool: 下载 YouTube 视频
 * - youtubeSubscribeTool: 订阅 YouTube 频道
 */
export const allTools = {
  // 通用工具
  weatherTool,

  // AI 工具
  readSubtitleTool,
  translationTool,
  summaryTool,
  resourceQueryTool,

  // YouTube 工具
  youtubeDownloadTool,
  youtubeSubscribeTool
};

/**
 * 获取通用工具列表（无需 toolContext）
 *
 * 这些工具可以直接传给 Agent 使用
 */
export function getBasicTools() {
  return {
    weatherTool
  };
}

/**
 * 获取 AI 工具列表（需要 toolContext）
 *
 * 这些工具需要外部依赖，使用时需要通过 toolContext 传入
 */
export function getAITools() {
  return {
    translationTool,
    summaryTool,
    resourceQueryTool
  };
}

/**
 * 获取所有工具列表
 *
 * 注意：AI 工具需要在使用时通过 toolContext 传入依赖
 */
export function getAllTools() {
  return allTools;
}

/**
 * 根据名称获取工具
 *
 * @param name - 工具名称（如 'weatherTool', 'translationTool'）
 * @returns 对应的工具实例，如果不存在则返回 undefined
 */
export function getTool(name: string) {
  return (allTools as Record<string, any>)[name];
}

/**
 * 根据工具 ID 获取工具
 *
 * @param id - 工具 ID（如 'get-weather', 'translate-subtitles'）
 * @returns 对应的工具实例，如果不存在则返回 undefined
 */
export function getToolById(id: string) {
  const toolMap: Record<string, any> = {
    'get-weather': weatherTool,
    'translate-subtitles': translationTool,
    'summarize-content': summaryTool,
    'query-resources': resourceQueryTool,
    'youtube-download': youtubeDownloadTool,
    'youtube-subscribe': youtubeSubscribeTool
  };
  return toolMap[id];
}

/**
 * 工具类型定义
 */
export type ToolName = keyof typeof allTools;

/**
 * 工具 ID 类型定义
 */
export type ToolId = 'get-weather' | 'translate-subtitles' | 'summarize-content' | 'query-resources';

// 向后兼容（保留原有的导出名称）
export const getTools = getAllTools;

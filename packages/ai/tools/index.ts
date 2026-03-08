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

// AI 工具（需要绑定依赖）
export { createPushCardTool, pushCardTool } from './push-card-tool';
export { createReadSubtitleTool, readSubtitleTool } from './read-subtitle-tool';
export { createResourceQueryTool, resourceQueryTool } from './resource-query-tool';
export { createSummaryTool, summaryTool } from './summary-tool';
export { createTranslationTool, translationTool } from './translation-tool';

// YouTube 工具
export { createYoutubeDownloadTool, youtubeDownloadTool } from './youtube-download-tool';
export { createYoutubeSubscribeTool, youtubeSubscribeTool } from './youtube-subscribe-tool';

// 导入用于类型和工具列表
import { pushCardTool } from './push-card-tool';
import { readSubtitleTool } from './read-subtitle-tool';
import { resourceQueryTool } from './resource-query-tool';
import { summaryTool } from './summary-tool';
import { translationTool } from './translation-tool';
import { youtubeDownloadTool } from './youtube-download-tool';
import { youtubeSubscribeTool } from './youtube-subscribe-tool';

// ============================================================================
// 工具集合
// ============================================================================

/**
 * 所有工具的集合（Map 结构）
 *
 * AI 工具（需要绑定依赖）：
 * - readSubtitleTool: 读取字幕文件内容
 * - translationTool: 字幕翻译
 * - summaryTool: 内容总结
 * - resourceQueryTool: 资源智能查询
 * - pushCardTool: 推送资源卡片
 *
 * YouTube 工具：
 * - youtubeDownloadTool: 下载 YouTube 视频
 * - youtubeSubscribeTool: 订阅 YouTube 频道
 */
export const allTools = {
  // AI 工具
  readSubtitleTool,
  translationTool,
  summaryTool,
  resourceQueryTool,
  pushCardTool,

  // YouTube 工具
  youtubeDownloadTool,
  youtubeSubscribeTool
};

/**
 * 获取 AI 工具列表（需要 toolContext）
 *
 * 这些工具需要外部依赖，使用时需要通过 toolContext 传入
 */
export function getAITools() {
  return {
    translationTool,
    summaryTool,
    resourceQueryTool,
    pushCardTool
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
 * @param name - 工具名称（如 'translationTool', 'resourceQueryTool'）
 * @returns 对应的工具实例，如果不存在则返回 undefined
 */
export function getTool(name: string) {
  return (allTools as Record<string, any>)[name];
}

/**
 * 根据工具 ID 获取工具
 *
 * @param id - 工具 ID（如 'translate-subtitles', 'query-resources'）
 * @returns 对应的工具实例，如果不存在则返回 undefined
 */
export function getToolById(id: string) {
  const toolMap: Record<string, any> = {
    'translate-subtitles': translationTool,
    'summarize-content': summaryTool,
    'query-resources': resourceQueryTool,
    'push-card': pushCardTool,
    'youtube-download': youtubeDownloadTool,
    'youtube-subscribe': youtubeSubscribeTool,
    'read-subtitle': readSubtitleTool
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
export type ToolId = 'translate-subtitles' | 'summarize-content' | 'query-resources' | 'push-card' | 'youtube-download' | 'youtube-subscribe' | 'read-subtitle';

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
      id: 'query-resources',
      name: 'resourceQueryTool',
      description: resourceQueryTool.description || '智能查询资源库中的内容'
    },
    {
      id: 'push-card',
      name: 'pushCardTool',
      description: pushCardTool.description || '在聊天中推送资源卡片'
    },
    {
      id: 'read-subtitle',
      name: 'readSubtitleTool',
      description: readSubtitleTool.description || '读取字幕文件内容'
    },
    {
      id: 'translate-subtitles',
      name: 'translationTool',
      description: translationTool.description || '翻译字幕内容'
    },
    {
      id: 'summarize-content',
      name: 'summaryTool',
      description: summaryTool.description || '总结字幕和文本内容'
    },
    {
      id: 'youtube-download',
      name: 'youtubeDownloadTool',
      description: youtubeDownloadTool.description || '下载 YouTube 视频'
    },
    {
      id: 'youtube-subscribe',
      name: 'youtubeSubscribeTool',
      description: youtubeSubscribeTool.description || '订阅 YouTube 频道'
    }
  ];
}

// 向后兼容（保留原有的导出名称）
export const getTools = getAllTools;

/**
 * Mastra Agents 定义
 * 这里定义了所有 Agent，使用 Mastra 的 Agent 类
 * Agent 会自主决策何时使用工具
 */

import { Agent } from '@mastra/core/agent';

import { ResourcesRepo } from '../../common/db';
import { SummaryService } from '../services/summary-service';
import { TranslationService } from '../services/translation-service';
import { createPushCardTool } from '../tools/push-card-tool';
import { createReadSubtitleTool } from '../tools/read-subtitle-tool';
import { createResourceQueryTool } from '../tools/resource-query-tool';
import { createSummaryTool } from '../tools/summary-tool';
import { createTranslationTool } from '../tools/translation-tool';
import { youtubeDownloadTool } from '../tools/youtube-download-tool';
import { youtubeSubscribeTool } from '../tools/youtube-subscribe-tool';

// ============================================================================
// 创建绑定了依赖的工具
// ============================================================================

// 创建绑定了 ResourcesRepo 的资源查询工具
const boundResourceQueryTool = createResourceQueryTool(ResourcesRepo);

// 创建绑定了 ResourcesRepo 的读取字幕工具
const boundReadSubtitleTool = createReadSubtitleTool(ResourcesRepo);

// 创建绑定了 TranslationService 的翻译工具
const boundTranslationTool = createTranslationTool(TranslationService);

// 创建绑定了 SummaryService 的总结工具
const boundSummaryTool = createSummaryTool(SummaryService);

// 创建推送卡片工具
const boundPushCardTool = createPushCardTool();

// 所有可用工具（包括绑定版本）
const allBoundTools = {
  resourceQueryTool: boundResourceQueryTool,
  readSubtitleTool: boundReadSubtitleTool,
  translationTool: boundTranslationTool,
  summaryTool: boundSummaryTool,
  pushCardTool: boundPushCardTool,
  youtubeDownloadTool,
  youtubeSubscribeTool
};

// 工具名称到 ID 的映射
const toolNameToId: Record<string, string> = {
  resourceQueryTool: 'query-resources',
  readSubtitleTool: 'read-subtitle',
  translationTool: 'translate-subtitles',
  summaryTool: 'summarize-content',
  pushCardTool: 'push-card',
  youtubeDownloadTool: 'youtube-download',
  youtubeSubscribeTool: 'youtube-subscribe'
};

// 工具 ID 到名称的映射
const toolIdToName: Record<string, string> = Object.entries(toolNameToId).reduce((acc, [name, id]) => ({ ...acc, [id]: name }), {} as Record<string, string>);

/**
 * 根据 enabledTools ID 列表过滤工具
 * @param enabledToolIds - 启用的工具 ID 列表，如果为空或 undefined 则返回所有工具
 */
export function getFilteredTools(enabledToolIds?: string[]): Record<string, any> {
  if (!enabledToolIds || enabledToolIds.length === 0) {
    return allBoundTools;
  }
  const filtered: Record<string, any> = {};
  for (const toolId of enabledToolIds) {
    const toolName = toolIdToName[toolId];
    if (toolName && allBoundTools[toolName as keyof typeof allBoundTools]) {
      filtered[toolName] = allBoundTools[toolName as keyof typeof allBoundTools];
    }
  }
  return filtered;
}

// ============================================================================
// 基础助手 Agent
// ============================================================================

export const chatAgent = new Agent({
  name: 'chat',
  instructions: ``,
  model: 'openai/gpt-4',
  tools: {}
});

// ============================================================================
// 基础助手 Agent
// ============================================================================

export const assistantAgent = new Agent({
  name: 'assistant',
  instructions: `你是一个智能助手，可以帮助用户完成各种任务。

你的能力包括：
- 回答问题和提供信息
- 查询和管理资源（视频、音频、字幕、文档等）
- 读取字幕文件内容
- 翻译字幕文件
- 总结字幕和文本内容
- **在聊天中推送资源卡片，让用户可以直接点击查看**
- **下载 YouTube 视频到本地资源库**
- **订阅 YouTube 频道获取最新视频**

你可以理解并响应各种查询，例如：
- "我最新的字幕文件是什么？"
- "找今天的视频"
- "查找收藏的音频"
- "有没有关于xxx的资源？给我看看"
- "帮我翻译最新的字幕文件"
- "帮我总结最新的字幕内容"
- "下载这个 YouTube 视频：https://www.youtube.com/watch?v=xxx"
- "订阅这个 YouTube 频道"

**关于推送资源卡片的工作流程**：
当用户想要查看资源、询问有没有某个资源、或者你找到了用户需要的资源时：
1. 先使用 resourceQueryTool 查询资源（获取 resourceId 和资源信息）
2. 使用 pushCardTool 推送资源卡片到聊天窗口，让用户可以直接点击查看
3. 推送卡片时，可以附带简短的文字说明（text 参数）

pushCardTool 使用示例：
- 推送数据库中的资源：pushCardTool({ type: 'video', resourceId: 'xxx', text: '这是你想要找的视频' })
- 推送临时内容：pushCardTool({ type: 'link', data: { id: 'temp', title: '示例', url: 'https://...' }, text: '推荐链接' })

**关于翻译功能的工作流程**：
当用户需要翻译字幕时，请按照以下步骤操作：
1. 使用 resourceQueryTool 查找要翻译的字幕文件（获取 resourceId）
2. 直接使用 translationTool 执行翻译（只需传入 resourceId 和 targetLanguage）
3. 翻译会在后台异步进行，完成后会通知用户

**关于总结功能的工作流程**：
当用户需要总结字幕或文本内容时，请按照以下步骤操作：
1. 使用 resourceQueryTool 查找要总结的字幕文件（获取 resourceId）
2. 直接使用 summaryTool 执行总结（只需传入 resourceId 和 targetLanguage）
3. 总结会在后台异步进行，完成后会通知用户

**关于 YouTube 下载功能的工作流程**：
当用户提供 YouTube 链接并要求下载时，请按照以下步骤操作：
1. 识别用户消息中的 YouTube 链接（youtube.com 或 youtu.be）
2. 使用 youtubeDownloadTool 下载视频（传入 url 和可选的 quality、filename 等）
3. 下载任务启动后，告知用户下载已开始，并说明可以在下载管理器中查看进度
4. **友情提示**：如果返回了 channelInfo，建议用户订阅该频道："如果你喜欢这个频道，我可以帮你订阅它，这样就能自动获取最新视频了。想要订阅吗？"

**关于 YouTube 订阅功能的工作流程**：
当用户要求订阅 YouTube 频道时，请按照以下步骤操作：
1. 使用 youtubeSubscribeTool 订阅频道（传入 channelIdOrUrl）
2. 可选询问用户是否需要自动下载新视频（autoDownload 参数）
3. 订阅成功后，告知用户订阅信息（频道名称、视频数量等）
4. 如果有 latestVideos，可以向用户展示最新的几个视频

**重要提示**：
- 当用户询问资源或想要查看资源时，务必使用 pushCardTool 推送资源卡片
- 翻译和总结工具只需要 resourceId，会自动加载字幕内容，无需先调用 readSubtitleTool
- readSubtitleTool 主要用于预览字幕内容，翻译/总结前不是必须调用的
- YouTube 下载和订阅工具可以直接调用，不需要先查询资源
- 下载任务是异步的，立即返回不代表下载完成
- 订阅后的视频可以在资源库的"订阅"标签中查看
- 如果用户没有指定目标语言，可以询问用户想要翻译/总结成什么语言

请根据用户的需求自主选择合适的工具来完成任务。
如果不需要使用工具，直接回答用户的问题即可。
回答时请使用中文，保持友好和专业。`,
  model: 'openai/gpt-4',
  tools: allBoundTools
});

// ============================================================================
// RAG Agent（检索增强生成）
// ============================================================================

export const ragAgent = new Agent({
  name: 'rag',
  instructions: `你是一个严谨的知识助手，专门基于检索到的上下文信息回答问题。

工作原则：
1. 优先使用提供的"检索上下文"信息回答问题
2. 如果上下文信息不足以回答问题，请明确说明
3. 不要编造或猜测未在上下文中提及的信息
4. 引用信息时，尽量指明来源

回答时请使用中文，保持准确和客观。`,
  model: 'openai/gpt-4',
  tools: allBoundTools
});

// ============================================================================
// 标签/总结 Agent
// ============================================================================

export const taggerAgent = new Agent({
  name: 'tagger',
  instructions: `你是一个资深文本归纳与主题提取助手。

目标：从给定文本中提炼出主题/话题标签。

要求：
- 标签应尽量短小、泛化，避免冗长描述
- 控制在一个单词或短语内
- 最多返回 5 个中文标签
- 按相关性降序排列
- 仅返回 JSON 数组格式，例如：["标签1","标签2","标签3"]
- 不要包含任何解释性文字`,
  model: 'openai/gpt-4',
  tools: {}
});

// ============================================================================
// 翻译 Agent
// ============================================================================

export const translatorAgent = new Agent({
  name: 'translator',
  instructions: `你是一个专业的翻译助手，专门负责字幕和文本的翻译工作。

翻译原则：
1. 保持原文的语气和风格
2. 确保翻译流畅自然，符合目标语言的表达习惯
3. 专有名词和术语保持一致性
4. 如有术语表，严格按照术语表翻译
5. 注意上下文的连贯性

输出格式：
- 按照要求的格式输出翻译结果
- 不要添加额外的解释或注释`,
  model: 'openai/gpt-4',
  tools: {}
});

// ============================================================================
// 导出所有 Agent
// ============================================================================

export const agents = {
  chat: chatAgent,
  assistant: assistantAgent,
  rag: ragAgent,
  tagger: taggerAgent,
  translator: translatorAgent
};

/**
 * 获取 Agent
 */
export function getAgent(id: string): Agent | undefined {
  return (agents as Record<string, Agent>)[id];
}

/**
 * 列出所有 Agent
 */
export function listAgents(): Array<{ id: string; name: string; description?: string }> {
  return Object.entries(agents).map(([id, agent]) => ({
    id,
    name: agent.name,
    description: (agent as any).instructions?.slice(0, 100)
  }));
}

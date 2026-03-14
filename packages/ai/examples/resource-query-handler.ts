/**
 * 资源查询工具使用示例
 *
 * 展示如何在 IPC Handler 中使用资源查询工具，让 Pi-first ChatService 智能查询数据库资源
 */

import { randomUUID } from 'node:crypto';

import { ipcMain } from 'electron';

import { ResourcesRepo } from '../../../electron/main/db/repositories';
import { createResourceQueryTool } from '../tools/resource-query-tool';
import type { ChatRequest, ChatResponse } from '../types';

type ExampleChatService = {
  chatEphemeral(win: undefined, req: ChatRequest): Promise<ChatResponse>;
  getProviderConfig(providerId: string): { defaultModel?: string } | undefined;
};

type ResourceQueryInput = {
  type?: 'image' | 'video' | 'audio' | 'recording' | 'subtitle' | 'text' | 'link' | 'file' | 'document' | 'rss' | 'other';
  status?: 'new' | 'processing' | 'ready' | 'archived' | 'error';
  timeRange?: 'today' | 'yesterday' | 'this-week' | 'this-month' | 'last-7-days' | 'last-30-days' | 'custom';
  startTime?: number;
  endTime?: number;
  favorite?: boolean;
  tags?: string[];
  minRating?: number;
  searchText?: string;
  sortBy?: 'newest' | 'oldest' | 'rating' | 'title' | 'size' | 'duration';
  limit?: number;
  offset?: number;
};

let chatServicePromise: Promise<ExampleChatService> | undefined;

function getExampleChatService(): Promise<ExampleChatService> {
  chatServicePromise ||= import('../chat-service').then(({ ChatService }) => new ChatService());
  return chatServicePromise;
}

async function assertProviderConfig(providerId: string): Promise<{ defaultModel?: string }> {
  const chatService = await getExampleChatService();
  const providerConfig = chatService.getProviderConfig(providerId);
  if (!providerConfig) {
    throw new Error(`Provider ${providerId} not found`);
  }

  return providerConfig;
}

async function runExampleChatCompletion(payload: { providerId: string; model?: string; agentId?: string; enabledTools?: string[]; messages: ChatRequest['messages'] }): Promise<string> {
  const chatService = await getExampleChatService();
  const response = await chatService.chatEphemeral(undefined, {
    agentId: payload.agentId || 'chat',
    extras: {
      ...(payload.model ? { model: payload.model } : {}),
      ...(payload.enabledTools?.length ? { enabledTools: payload.enabledTools } : {})
    },
    messages: payload.messages,
    persist: false,
    providerId: payload.providerId
  });

  return response.message?.content || '';
}

function parseJsonObjectFromText(text: string): Record<string, any> {
  try {
    const direct = JSON.parse(text);
    if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
      return direct;
    }
  } catch {
    // fall through
  }

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (error) {
    console.error('Failed to parse query parameters:', error);
  }

  return { limit: 10 };
}

/**
 * 注册智能资源查询 Handler
 *
 * 这个 handler 允许用户用自然语言描述需求，由 ChatService 自动执行资源查询工具
 */
export function registerSmartResourceQueryHandler(): void {
  ipcMain.handle(
    'ai:smartResourceQuery',
    async (
      _e,
      payload: {
        providerId: string;
        model: string;
        query: string; // 用户的自然语言查询
      }
    ) => {
      const { providerId, model, query } = payload;
      const requestId = randomUUID();
      await assertProviderConfig(providerId);

      const response = await runExampleChatCompletion({
        agentId: 'assistant',
        enabledTools: ['query-resources'],
        messages: [{ role: 'user', content: query }],
        model,
        providerId
      });

      return {
        requestId,
        query,
        response
      };
    }
  );
}

/**
 * 方案二：直接在 IPC Handler 中使用工具（推荐）
 *
 * 如果不需要 Agent 解析，可以直接手动调用已绑定依赖的工具
 */
export function registerResourceQueryHandler(): void {
  ipcMain.handle('ai:queryResources', async (_e, payload: ResourceQueryInput) => {
    // 直接调用工具的 execute 函数
    const queryTool = createResourceQueryTool(ResourcesRepo);
    const result = await queryTool.execute({
      context: payload
    } as any);

    return result;
  });
}

/**
 * 方案三：使用 Agent 理解自然语言，然后调用工具
 *
 * 这是最灵活的方案：先让 ChatService 解析用户意图，再手动调用工具和生成总结
 */
export function registerNaturalLanguageResourceQueryHandler(): void {
  ipcMain.handle(
    'ai:naturalResourceQuery',
    async (
      _e,
      payload: {
        providerId: string;
        model: string;
        query: string;
      }
    ) => {
      const { providerId, model, query } = payload;
      const requestId = randomUUID();
      const providerConfig = await assertProviderConfig(providerId);

      // 1. 让 ChatService 理解用户意图并返回结构化参数
      const parsePrompt = `用户想查询资源数据库，请理解用户意图并返回 JSON 格式的查询参数。

可用参数：
- type: 资源类型（video、audio、subtitle、image、recording、text、link、file、document、rss、other）
- timeRange: 时间范围（today、yesterday、this-week、this-month、last-7-days、last-30-days）
- favorite: 是否只查收藏（true/false）
- tags: 标签数组
- minRating: 最低评分（0-5）
- searchText: 搜索关键词
- sortBy: 排序方式（newest、oldest、rating、title、size、duration）
- limit: 返回数量

用户查询：${query}

只返回 JSON，不要其他解释：`;

      const rawQueryParams = await runExampleChatCompletion({
        messages: [
          {
            role: 'system',
            content: '你是一个资源查询参数解析器。你只返回 JSON 对象，不要返回 Markdown 代码块、解释或额外文本。'
          },
          {
            role: 'user',
            content: parsePrompt
          }
        ],
        model: model || providerConfig.defaultModel,
        providerId
      });

      const queryParams = parseJsonObjectFromText(rawQueryParams);

      // 2. 调用资源查询工具
      const queryTool = createResourceQueryTool(ResourcesRepo);
      const queryResult = await queryTool.execute({
        context: queryParams
      } as any);

      if (!queryResult.success) {
        return {
          requestId,
          success: false,
          error: queryResult.error
        };
      }

      // 3. 让 ChatService 生成友好的总结
      const summaryPrompt = `用户查询：${query}

查询到 ${queryResult.resources?.length || 0} 个资源：
${JSON.stringify(queryResult.resources, null, 2)}

请用友好的语言总结查询结果，告诉用户找到了什么资源。`;
      const summary = await runExampleChatCompletion({
        messages: [
          {
            role: 'system',
            content: '你是一个资源查询结果总结助手。请使用中文，简洁说明查到了什么资源、数量以及最值得注意的结果。'
          },
          {
            role: 'user',
            content: summaryPrompt
          }
        ],
        model: model || providerConfig.defaultModel,
        providerId
      });

      return {
        requestId,
        success: true,
        query,
        queryParams,
        resources: queryResult.resources,
        total: queryResult.total,
        summary
      };
    }
  );
}

/**
 * 使用说明
 *
 * 在 ipc-main.ts 中注册：
 *
 * ```typescript
 * import {
 *   registerResourceQueryHandler,
 *   registerNaturalLanguageResourceQueryHandler
 * } from './examples/resource-query-handler';
 *
 * export function registerAI() {
 *   // ... 其他注册
 *
 *   // 方案二：直接查询（推荐）
 *   registerResourceQueryHandler();
 *
 *   // 方案三：自然语言查询（高级）
 *   registerNaturalLanguageResourceQueryHandler();
 * }
 * ```
 *
 * 渲染进程调用：
 *
 * ```typescript
 * // 方案二：直接查询
 * const result = await window.api.ai.queryResources({
 *   type: 'video',
 *   timeRange: 'today',
 *   limit: 10
 * });
 *
 * // 方案三：自然语言查询
 * const result = await window.api.ai.naturalResourceQuery({
 *   providerId: 'openai',
 *   model: 'gpt-4',
 *   query: '找今天的视频文件'
 * });
 * ```
 */

/**
 * 常见查询场景示例
 */
export const QUERY_EXAMPLES = {
  // 1. 查找今天创建的视频
  todayVideos: {
    type: 'video' as const,
    timeRange: 'today' as const
  },

  // 2. 查找最新的字幕文件
  latestSubtitles: {
    type: 'subtitle' as const,
    sortBy: 'newest' as const,
    limit: 10
  },

  // 3. 查找特定标签的收藏资源
  favoriteWithTag: {
    favorite: true,
    tags: ['教程']
  },

  // 4. 查找最近7天的录音
  recentRecordings: {
    type: 'recording' as const,
    timeRange: 'last-7-days' as const
  },

  // 5. 查找评分最高的文档
  topRatedDocuments: {
    type: 'document' as const,
    sortBy: 'rating' as const,
    minRating: 4
  },

  // 6. 搜索包含关键词的资源
  searchByKeyword: {
    searchText: '教程'
  },

  // 7. 查找最大的视频文件
  largestVideos: {
    type: 'video' as const,
    sortBy: 'size' as const,
    limit: 5
  },

  // 8. 查找最新的 srt 字幕文件
  latestSrtFiles: {
    type: 'subtitle' as const,
    searchText: '.srt',
    sortBy: 'newest' as const
  }
};

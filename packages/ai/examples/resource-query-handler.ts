/**
 * 资源查询工具使用示例
 *
 * 展示如何在 IPC Handler 中使用资源查询工具，让 Agent 智能查询数据库资源
 */

import { Agent } from '@mastra/core/agent';
import { randomUUID } from 'crypto';
import { ipcMain } from 'electron';

import { ResourcesRepo } from '../../../electron/main/db/repositories';
import { getAgent } from '../agents';
import { createModel } from '../models/index';
import { getAllSecrets, getFirstApiKey } from '../settings-store';
import { resourceQueryTool } from '../tools/resource-query-tool';

/**
 * 注册智能资源查询 Handler
 *
 * 这个 handler 允许用户用自然语言描述需求，Agent 自动解析并查询数据库
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

      // 1. 准备 Agent 和模型
      const chatService = new (await import('../chat-service')).ChatService();
      const providerConfig = chatService.getProviderConfig(providerId);

      if (!providerConfig) {
        throw new Error(`Provider ${providerId} not found`);
      }

      const fields = providerConfig.fields as Array<{ key: string; required?: boolean }>;
      const keys = fields.map((f: any) => f.key);
      const secrets = await getAllSecrets(providerId, keys);
      const apiKey = getFirstApiKey(secrets.apiKey);

      if (!apiKey && fields.some((f: any) => f.key === 'apiKey' && f.required)) {
        throw new Error(`Provider ${providerId} 未配置 API Key`);
      }

      const modelConfig = {
        apiKey: apiKey || '',
        baseUrl: secrets.baseUrl as string,
        model: model || providerConfig.defaultModel
      };
      const modelInstance = createModel(providerId, modelConfig);

      // 2. 创建带资源查询工具的 Agent
      const queryAgent = new Agent({
        name: 'resource-query-assistant',
        instructions: `你是一个资源查询助手，帮助用户从数据库中查找资源。

你有一个强大的资源查询工具，可以：
- 按类型筛选（video、audio、subtitle、image、recording、text、link、file、document等）
- 按时间范围查询（today、yesterday、this-week、this-month、last-7-days、last-30-days）
- 按标签、收藏、评分筛选
- 全文搜索标题和描述
- 灵活的排序（newest、oldest、rating、title、size、duration）

理解用户意图并调用工具：
- "今天的视频" → type=video, timeRange=today
- "最新的字幕" → type=subtitle, sortBy=newest, limit=1
- "找收藏的音频" → type=audio, favorite=true
- "搜索教程" → searchText="教程"
- "评分最高的文档" → type=document, sortBy=rating
- "最近7天的录音" → type=recording, timeRange=last-7-days
- "最大的视频文件" → type=video, sortBy=size
- "最新的srt文件" → type=subtitle, sortBy=newest, searchText=".srt"

调用工具后，用友好的方式总结结果，告诉用户找到了什么。`,
        model: modelInstance,
        tools: {
          queryResources: resourceQueryTool
        }
      });

      // 3. 调用 Agent 时注入 toolContext
      const stream = await queryAgent.stream(query, {
        maxSteps: 5
        // 注意：Mastra 的 stream 方法可能不直接支持 toolContext
        // 如果不支持，需要使用其他方式（见后续方案）
      });

      let fullResponse = '';
      for await (const chunk of stream.textStream) {
        fullResponse += chunk;
      }

      return {
        requestId,
        query,
        response: fullResponse
      };
    }
  );
}

/**
 * 方案二：直接在 IPC Handler 中使用工具（推荐）
 *
 * 如果 Mastra Agent 不支持 toolContext，可以直接手动调用工具
 */
export function registerResourceQueryHandler(): void {
  ipcMain.handle(
    'ai:queryResources',
    async (
      _e,
      payload: {
        // 查询参数（对应工具的输入）
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
      }
    ) => {
      // 直接调用工具的 execute 函数
      const result = await resourceQueryTool.execute({
        context: payload,
        toolContext: {
          resourcesRepo: ResourcesRepo
        }
      } as any);

      return result;
    }
  );
}

/**
 * 方案三：使用 Agent 理解自然语言，然后调用工具
 *
 * 这是最灵活的方案：让 Agent 解析用户意图，然后手动调用工具
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

      // 1. 准备 Agent
      const chatService = new (await import('../chat-service')).ChatService();
      const providerConfig = chatService.getProviderConfig(providerId);

      if (!providerConfig) {
        throw new Error(`Provider ${providerId} not found`);
      }

      const fields = providerConfig.fields as Array<{ key: string; required?: boolean }>;
      const keys = fields.map((f: any) => f.key);
      const secrets = await getAllSecrets(providerId, keys);
      const apiKey = getFirstApiKey(secrets.apiKey);

      if (!apiKey && fields.some((f: any) => f.key === 'apiKey' && f.required)) {
        throw new Error(`Provider ${providerId} 未配置 API Key`);
      }

      const modelConfig = {
        apiKey: apiKey || '',
        baseUrl: secrets.baseUrl as string,
        model: model || providerConfig.defaultModel
      };
      const modelInstance = createModel(providerId, modelConfig);

      const agent = getAgent('assistant');
      if (!agent) {
        throw new Error('Agent not found');
      }
      agent.model = modelInstance;

      // 2. 让 Agent 理解用户意图并返回结构化参数
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

      const stream = await agent.stream(parsePrompt, { maxSteps: 3 });

      let fullResponse = '';
      for await (const chunk of stream.textStream) {
        fullResponse += chunk;
      }

      // 3. 解析 Agent 返回的 JSON
      let queryParams: any = {};
      try {
        // 尝试从响应中提取 JSON
        const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          queryParams = JSON.parse(jsonMatch[0]);
        }
      } catch (error) {
        console.error('Failed to parse Agent response:', error);
        // 使用默认参数
        queryParams = { limit: 10 };
      }

      // 4. 调用资源查询工具
      const queryResult = await resourceQueryTool.execute({
        context: queryParams,
        toolContext: {
          resourcesRepo: ResourcesRepo
        }
      } as any);

      if (!queryResult.success) {
        return {
          requestId,
          success: false,
          error: queryResult.error
        };
      }

      // 5. 让 Agent 生成友好的总结
      const summaryPrompt = `用户查询：${query}

查询到 ${queryResult.resources?.length || 0} 个资源：
${JSON.stringify(queryResult.resources, null, 2)}

请用友好的语言总结查询结果，告诉用户找到了什么资源。`;

      const summaryStream = await agent.stream(summaryPrompt, { maxSteps: 3 });

      let summary = '';
      for await (const chunk of summaryStream.textStream) {
        summary += chunk;
      }

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

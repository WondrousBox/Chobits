import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import fetch from 'node-fetch';

import { getHttpProxy } from '../../../../../electron/main/handlers/proxy/proxy';
import type { PiSessionToolContext } from '../tool-context';
import { createJsonToolResult } from './result';
import { getWebSearchApiKey } from './web-search-config';

const webSearchParameters = Type.Object({
  query: Type.String({ description: '搜索查询关键词，尽量使用英文以获取更好的搜索结果' }),
  maxResults: Type.Optional(Type.Number({ minimum: 1, maximum: 10, description: '最大返回结果数，默认 5' })),
  searchDepth: Type.Optional(
    Type.Union([Type.Literal('basic'), Type.Literal('advanced')], {
      description: '搜索深度：basic（快速）或 advanced（更全面），默认 basic'
    })
  ),
  topic: Type.Optional(
    Type.Union([Type.Literal('general'), Type.Literal('news')], {
      description: '搜索主题：general（通用）或 news（新闻），默认 general'
    })
  ),
  includeAnswer: Type.Optional(Type.Boolean({ description: '是否返回 AI 生成的搜索摘要，默认 true' }))
});

interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}

interface TavilyResponse {
  query: string;
  answer?: string;
  results: TavilySearchResult[];
  response_time: number;
}

export function createPiWebSearchTool(toolContext: PiSessionToolContext): ToolDefinition<typeof webSearchParameters> {
  void toolContext;

  return {
    name: 'webSearchTool',
    label: 'webSearchTool',
    description:
      '搜索互联网获取最新信息。适用于：查询实时新闻、最新技术文档、当前事件、价格和产品信息、学术论文、人物信息等需要联网才能回答的问题。不要用于已知信息或本地资源查询。',
    parameters: webSearchParameters,
    async execute(_toolCallId, input, signal) {
      const { includeAnswer = true, maxResults = 5, query, searchDepth = 'basic', topic = 'general' } = input;

      if (signal?.aborted) {
        throw new Error('Operation aborted');
      }

      const apiKey = await getWebSearchApiKey();
      if (!apiKey) {
        return createJsonToolResult({
          success: false,
          error: '未配置搜索 API Key。请在设置中配置 Tavily API Key（提供商 ID: tavily，字段: apiKey）。可从 https://tavily.com 免费获取。'
        });
      }

      try {
        const agent = getHttpProxy();
        const response = await fetch('https://api.tavily.com/search', {
          agent,
          body: JSON.stringify({
            api_key: apiKey,
            include_answer: includeAnswer,
            max_results: maxResults,
            query,
            search_depth: searchDepth,
            topic
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
          signal: signal as any
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          return createJsonToolResult({
            success: false,
            error: `搜索请求失败 (HTTP ${response.status}): ${errorText || response.statusText}`
          });
        }

        const data = (await response.json()) as TavilyResponse;

        const results = data.results.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.content,
          score: r.score,
          publishedDate: r.published_date || undefined
        }));

        return createJsonToolResult({
          success: true,
          query: data.query,
          answer: data.answer || undefined,
          results,
          resultCount: results.length,
          responseTime: data.response_time
        });
      } catch (error: any) {
        if (error?.name === 'AbortError') {
          throw error;
        }
        return createJsonToolResult({
          success: false,
          error: `搜索失败: ${error?.message || '未知错误'}`
        });
      }
    }
  };
}

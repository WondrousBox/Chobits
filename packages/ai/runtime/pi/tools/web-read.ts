import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { getHttpProxy } from '@packages/common/net/proxy-agent';
import fetch from 'node-fetch';
import { Type } from 'typebox';

import type { PiSessionToolContext } from '../tool-context';
import { createJsonToolResult } from './result';

const webReadParameters = Type.Object({
  url: Type.String({ description: '要读取的网页 URL' }),
  maxLength: Type.Optional(Type.Number({ minimum: 100, maximum: 50000, description: '返回内容的最大字符数，默认 10000' }))
});

const JINA_READER_PREFIX = 'https://r.jina.ai/';
const REQUEST_TIMEOUT_MS = 30_000;

export function createPiWebReadTool(toolContext: PiSessionToolContext): ToolDefinition<typeof webReadParameters> {
  void toolContext;

  return {
    name: 'webReadTool',
    label: 'webReadTool',
    description: '读取指定网页的内容，返回 Markdown 格式的正文。适用于：深入阅读搜索结果中的某个页面、获取文章或文档的详细内容。通常在 webSearchTool 之后使用，对感兴趣的搜索结果进行深度阅读。',
    parameters: webReadParameters,
    async execute(_toolCallId, input, signal) {
      const { maxLength = 10000, url } = input;

      if (signal?.aborted) {
        throw new Error('Operation aborted');
      }

      if (!url || !url.startsWith('http')) {
        return createJsonToolResult({
          success: false,
          error: '请提供有效的 HTTP/HTTPS URL'
        });
      }

      try {
        const agent = getHttpProxy();
        const jinaUrl = `${JINA_READER_PREFIX}${url}`;

        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
        if (signal) {
          signal.addEventListener('abort', () => timeoutController.abort(), { once: true });
        }

        let response;
        try {
          response = await fetch(jinaUrl, {
            agent,
            headers: {
              Accept: 'text/markdown',
              'X-Return-Format': 'markdown'
            },
            method: 'GET',
            signal: timeoutController.signal as any
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (!response.ok) {
          return createJsonToolResult({
            success: false,
            error: `读取网页失败 (HTTP ${response.status}): ${response.statusText}`,
            url
          });
        }

        let content = await response.text();

        if (content.length > maxLength) {
          content = content.slice(0, maxLength) + '\n\n... [内容已截断]';
        }

        return createJsonToolResult({
          success: true,
          url,
          content,
          contentLength: content.length,
          wasTruncated: content.length >= maxLength
        });
      } catch (error: any) {
        if (error?.name === 'AbortError') {
          throw error;
        }
        return createJsonToolResult({
          success: false,
          error: `读取网页失败: ${error?.message || '未知错误'}`,
          url
        });
      }
    }
  };
}

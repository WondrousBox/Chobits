import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { getHttpProxy } from '@packages/common/net/proxy-agent';
import fetch from 'node-fetch';
import { Type } from 'typebox';

import type { PiSessionToolContext } from '../tool-context';
import { createJsonToolResult } from './result';

const webSearchParameters = Type.Object({
  query: Type.String({ description: '搜索查询关键词，尽量使用英文以获取更好的搜索结果' }),
  maxResults: Type.Optional(Type.Number({ minimum: 1, maximum: 10, description: '最大返回结果数，默认 5' }))
});

const DDG_SEARCH_URL = 'https://html.duckduckgo.com/html/';
const REQUEST_TIMEOUT_MS = 15_000;
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// html.duckduckgo.com 结果结构：<a class="result__a" href="//duckduckgo.com/l/?uddg=<encoded>">标题</a> + <a class="result__snippet">摘要</a>
const TITLE_ANCHOR_RE = /<a\b[^>]*\bclass="[^"]*\bresult__a\b[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
const SNIPPET_ANCHOR_RE = /<a\b[^>]*\bclass="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/a>/;
const HREF_RE = /href="([^"]+)"/;

interface DdgSearchResult {
  title: string;
  url: string;
  snippet: string;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveResultUrl(href: string): string {
  // DDG 结果链接是跳转形式 //duckduckgo.com/l/?uddg=<url-encoded>&rut=...，需取出真实地址
  const redirectMatch = href.match(/[?&]uddg=([^&]+)/);
  if (redirectMatch) {
    try {
      return decodeURIComponent(redirectMatch[1]);
    } catch {
      /* 保留原始链接 */
    }
  }
  return href.startsWith('//') ? `https:${href}` : href;
}

function parseResults(html: string, maxResults: number): DdgSearchResult[] {
  const results: DdgSearchResult[] = [];
  const titleMatches = [...html.matchAll(TITLE_ANCHOR_RE)];

  for (let i = 0; i < titleMatches.length && results.length < maxResults; i += 1) {
    const match = titleMatches[i];
    const href = match[0].match(HREF_RE)?.[1];
    if (!href) continue;

    const url = resolveResultUrl(decodeEntities(href));
    if (!url.startsWith('http')) continue;

    const blockStart = (match.index ?? 0) + match[0].length;
    const blockEnd = i + 1 < titleMatches.length ? (titleMatches[i + 1].index ?? html.length) : html.length;
    const snippetMatch = html.slice(blockStart, blockEnd).match(SNIPPET_ANCHOR_RE);

    results.push({
      title: stripTags(match[1]),
      url,
      snippet: snippetMatch ? stripTags(snippetMatch[1]) : ''
    });
  }

  return results;
}

export function createPiWebSearchTool(toolContext: PiSessionToolContext): ToolDefinition<typeof webSearchParameters> {
  void toolContext;

  return {
    name: 'webSearchTool',
    label: 'webSearchTool',
    description: '搜索互联网获取最新信息。适用于：查询实时新闻、最新技术文档、当前事件、价格和产品信息、学术论文、人物信息等需要联网才能回答的问题。不要用于已知信息或本地资源查询。',
    parameters: webSearchParameters,
    async execute(_toolCallId, input, signal) {
      const { maxResults = 5, query } = input;

      if (signal?.aborted) {
        throw new Error('Operation aborted');
      }

      try {
        const agent = getHttpProxy();
        const searchUrl = `${DDG_SEARCH_URL}?q=${encodeURIComponent(query)}`;

        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
        if (signal) {
          signal.addEventListener('abort', () => timeoutController.abort(), { once: true });
        }

        let response;
        try {
          response = await fetch(searchUrl, {
            agent,
            headers: {
              Accept: 'text/html',
              'User-Agent': USER_AGENT
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
            error: `搜索请求失败 (HTTP ${response.status}): ${response.statusText}`
          });
        }

        const html = await response.text();
        const results = parseResults(html, maxResults);

        if (results.length === 0) {
          return createJsonToolResult({
            success: true,
            query,
            results: [],
            resultCount: 0,
            note: '未找到搜索结果，可以尝试更换关键词或改用英文搜索'
          });
        }

        return createJsonToolResult({
          success: true,
          query,
          results,
          resultCount: results.length
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

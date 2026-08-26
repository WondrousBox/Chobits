import http from 'node:http';
import https from 'node:https';

import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { resolveGuardedToolExecution } from '../skills';
import type { PiSessionToolContext } from '../tool-context';
import { createJsonToolResult } from './result';
import * as dbRepositories from '../../../../../electron/main/db/repositories';
import { getVideoInfo } from '../../../../../electron/main/handlers/downloader';
import { getHttpProxy } from '../../../../../electron/main/handlers/proxy/proxy';
import { resolveRssResourceDestination } from '../../../../../electron/main/handlers/rss/rss-resource-destination';
import { rssSourceRegistry } from '../../../../../electron/main/handlers/rss/rss-source-registry';

const youtubeSubscribeParameters = Type.Object({
  channelIdOrUrl: Type.String({ description: 'YouTube 频道 ID、频道 URL、或带频道上下文的输入' }),
  channelName: Type.Optional(Type.String({ description: '频道名称（如果已知）' })),
  autoDownload: Type.Optional(Type.Boolean({ description: '是否自动下载新视频。默认 false' })),
  downloadQuality: Type.Optional(Type.String({ description: '下载质量设置（如：best、1080p、720p）。默认 best' })),
  folderId: Type.Optional(Type.String({ description: '自动下载保存到的文件夹 ID' }))
});

type YoutubeFeedPreviewItem = {
  author?: string;
  id: string;
  link: string;
  publishedAt: number;
  thumbnail?: string;
  title: string;
};

type YoutubeVideoInfo = {
  channel?: string;
  channel_id?: string;
  channel_url?: string;
  uploader?: string;
  uploader_id?: string;
  uploader_url?: string;
};

type RssServices = typeof import('../../../../../electron/main/db/repositories') & {
  WorkspacesRepo: typeof import('../../../../../electron/main/db/repositories').WorkspacesRepo;
};

async function loadRssServices(): Promise<{
  repos: RssServices;
  resolveRssResourceDestination: typeof import('../../../../../electron/main/handlers/rss/rss-resource-destination').resolveRssResourceDestination;
  rssSourceRegistry: typeof import('../../../../../electron/main/handlers/rss/rss-source-registry').rssSourceRegistry;
}> {
  return {
    repos: dbRepositories as RssServices,
    resolveRssResourceDestination,
    rssSourceRegistry
  };
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractHost(value?: string): string | undefined {
  if (!value) return undefined;

  try {
    return new URL(value).hostname;
  } catch {
    return undefined;
  }
}

function getWorkspaceIdFromRequest(toolContext: PiSessionToolContext): string | undefined {
  const rawWorkspaceId = toolContext.resolved.request.extras?.workspaceId;
  return typeof rawWorkspaceId === 'string' && rawWorkspaceId.trim() ? rawWorkspaceId.trim() : undefined;
}

function resolveNonEmptyText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isYouTubeVideoUrl(value: string): boolean {
  return /youtu\.be\/|youtube\.com\/watch\?|youtube\.com\/shorts\/|youtube\.com\/embed\//i.test(value);
}

async function normalizeYoutubeChannelTarget(input: string): Promise<{ channelName?: string; target: string }> {
  if (!isYouTubeVideoUrl(input)) {
    return { target: input };
  }

  const videoInfo = (await getVideoInfo(input, 30000)) as YoutubeVideoInfo;

  return {
    target:
      resolveNonEmptyText(videoInfo.channel_id) || resolveNonEmptyText(videoInfo.channel_url) || resolveNonEmptyText(videoInfo.uploader_id) || resolveNonEmptyText(videoInfo.uploader_url) || input,
    channelName: resolveNonEmptyText(videoInfo.channel) || resolveNonEmptyText(videoInfo.uploader)
  };
}

function parseYouTubeFeed(xml: string, limit: number): YoutubeFeedPreviewItem[] {
  const entries = Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g));

  return entries.slice(0, limit).map((entryMatch) => {
    const entry = entryMatch[1];
    const titleMatch = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    const linkMatch = entry.match(/<link[^>]*href=["']([^"']+)["']/);
    const publishedMatch = entry.match(/<published[^>]*>([\s\S]*?)<\/published>/) || entry.match(/<updated[^>]*>([\s\S]*?)<\/updated>/);
    const authorMatch = entry.match(/<author>\s*<name[^>]*>([\s\S]*?)<\/name>/);
    const thumbnailMatch = entry.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/);
    const videoIdMatch = entry.match(/<yt:videoId>([\s\S]*?)<\/yt:videoId>/);
    const link = linkMatch?.[1]?.trim() || '';
    const id = videoIdMatch?.[1]?.trim() || link;

    return {
      id,
      title: decodeXmlEntities(titleMatch?.[1]?.trim() || 'Untitled'),
      link,
      publishedAt: publishedMatch?.[1] ? new Date(publishedMatch[1].trim()).getTime() : Date.now(),
      author: authorMatch?.[1] ? decodeXmlEntities(authorMatch[1].trim()) : undefined,
      thumbnail: thumbnailMatch?.[1]
    };
  });
}

async function fetchFeedXml(feedUrl: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Operation aborted'));
      return;
    }

    const client = feedUrl.startsWith('https:') ? https : http;
    const request = client.get(
      feedUrl,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        },
        agent: getHttpProxy() as any
      },
      (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage || 'Request failed'}`));
          return;
        }

        let body = '';
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => resolve(body));
      }
    );

    const abortHandler = (): void => {
      request.destroy(new Error('Operation aborted'));
    };

    signal?.addEventListener('abort', abortHandler, { once: true });
    request.on('error', (error) => {
      signal?.removeEventListener('abort', abortHandler);
      reject(error);
    });
    request.on('close', () => {
      signal?.removeEventListener('abort', abortHandler);
    });
    request.setTimeout(30000, () => {
      request.destroy(new Error('RSS feed 请求超时'));
    });
  });
}

export function createPiYoutubeSubscribeTool(toolContext: PiSessionToolContext): ToolDefinition<typeof youtubeSubscribeParameters> {
  return {
    name: 'youtubeSubscribeTool',
    label: 'youtubeSubscribeTool',
    description: '订阅 YouTube 频道并抓取最近的视频列表。会创建 RSS 资源，支持自动下载配置，并把最新视频缓存进本地数据库。',
    parameters: youtubeSubscribeParameters,
    async execute(toolCallId, input, signal) {
      const { autoDownload = false, channelIdOrUrl, channelName, downloadQuality = 'best', folderId } = input;

      if (signal?.aborted) {
        throw new Error('Operation aborted');
      }

      if (!channelIdOrUrl?.trim()) {
        return createJsonToolResult({
          success: false,
          message: '缺少频道信息',
          error: '请提供频道 ID、频道 URL 或视频 URL'
        });
      }

      try {
        const guardResolution = await resolveGuardedToolExecution(toolContext, toolCallId, 'youtube-subscribe');
        if (guardResolution?.kind === 'blocked' || guardResolution?.kind === 'cancel') {
          return createJsonToolResult(guardResolution.details);
        }

        const normalizedTarget = await normalizeYoutubeChannelTarget(channelIdOrUrl.trim());
        const { repos, resolveRssResourceDestination, rssSourceRegistry } = await loadRssServices();
        const result = await rssSourceRegistry.extractChannelInfo(normalizedTarget.target);

        if (!result || result.handler.sourceType !== 'youtube') {
          return createJsonToolResult({
            success: false,
            message: '创建订阅失败',
            error: '无法解析 YouTube 频道信息，请检查链接或频道 ID 是否正确'
          });
        }

        const { channelInfo, handler } = result;
        const requestedWorkspaceId = getWorkspaceIdFromRequest(toolContext);
        const destination = await resolveRssResourceDestination({ workspaceId: requestedWorkspaceId, folderId });
        const workspaceId = destination.workspaceId;
        const targetFolderId = destination.folderId;
        const metadata = handler.createMetadata(channelInfo, {
          autoDownload,
          downloadQuality,
          downloadFolderId: targetFolderId
        });

        const now = Date.now();
        const resource = await repos.ResourcesRepo.upsert({
          type: 'rss',
          title: channelName || normalizedTarget.channelName || channelInfo.title || channelInfo.channelId || '未命名订阅',
          description: channelInfo.description,
          url: metadata.channelUrl || metadata.feedUrl,
          domain: extractHost(metadata.feedUrl),
          sourceName: 'YouTube',
          previewUrl: channelInfo.thumbnail,
          metadata: JSON.stringify(metadata),
          workspaceId,
          folderId: targetFolderId,
          status: 'ready',
          collectedAt: now,
          createdAt: now,
          updatedAt: now
        } as any);

        if (!resource?.id) {
          return createJsonToolResult({
            success: false,
            message: '创建订阅失败',
            error: 'RSS 订阅资源创建失败'
          });
        }

        let latestVideos: Array<{ title: string; link: string }> = [];
        let warning: string | undefined;

        if (metadata.feedUrl) {
          try {
            const feedXml = await fetchFeedXml(metadata.feedUrl, signal);
            const parsedItems = parseYouTubeFeed(feedXml, 5);

            if (parsedItems.length) {
              await repos.RssFeedItemsRepo.bulkUpsert(
                parsedItems.map((item) => ({
                  rssResourceId: resource.id,
                  itemId: item.id,
                  title: item.title,
                  link: item.link,
                  publishedAt: item.publishedAt,
                  author: item.author,
                  thumbnail: item.thumbnail,
                  mediaType: 'video',
                  metadata: item
                })) as any
              );

              latestVideos = parsedItems.map((item) => ({
                title: item.title,
                link: item.link
              }));
            }
          } catch (error: any) {
            warning = error?.message || '订阅已创建，但获取最新视频失败';
          }
        }

        const channelId = typeof metadata.channelId === 'string' ? metadata.channelId : '';

        return createJsonToolResult({
          success: true,
          subscription: {
            id: resource.id,
            title: resource.title || channelName || normalizedTarget.channelName || channelInfo.title || '未命名订阅',
            channelId,
            autoDownload,
            itemCount: latestVideos.length
          },
          latestVideos: latestVideos.length ? latestVideos : undefined,
          warning,
          message: `成功订阅频道：${resource?.title || channelInfo.title || channelIdOrUrl}${autoDownload ? '（已启用自动下载）' : ''}`
        });
      } catch (error: any) {
        return createJsonToolResult({
          success: false,
          message: '订阅工具执行失败',
          error: error?.message || '创建 YouTube 订阅失败'
        });
      }
    }
  };
}

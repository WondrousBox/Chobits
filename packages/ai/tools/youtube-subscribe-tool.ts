import { createTool } from '@mastra/core';
import { z } from 'zod';

/**
 * YouTube 频道订阅工具
 *
 * 功能：
 * 1. 订阅 YouTube 频道（通过频道 ID 或 URL）
 * 2. 自动创建 RSS 订阅源
 * 3. 配置自动下载设置
 * 4. 获取频道的最新视频列表
 *
 * 使用场景：
 * - 用户要求订阅某个 YouTube 频道
 * - 下载视频后友情提示订阅
 * - 用户询问某个频道的最新视频
 *
 * 注意：此工具同时支持主进程和渲染进程环境
 */

/**
 * 创建 RSS 订阅的适配器
 */
async function createRssAdapter(params: any): Promise<any> {
  // 主进程：需要手动调用 IPC handler 的逻辑
  // 由于 ipcMain.handle 只能在 IPC 上下文中工作，我们需要直接使用底层服务
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ResourcesRepo } = require('../../../electron/main/db/repositories');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { rssSourceRegistry } = require('../../../electron/main/handlers/rss/rss-source-registry');

    const handler = rssSourceRegistry.getHandler(params.sourceType);
    if (!handler) {
      return { success: false, error: `不支持的 RSS 来源类型: ${params.sourceType}` };
    }

    // 解析频道信息
    const channelInfo = await handler.parseChannelInfo(params.channelIdOrUrl);
    if (!channelInfo) {
      return { success: false, error: '无法解析频道信息' };
    }

    // 创建资源记录
    const resource = await ResourcesRepo.upsert({
      type: 'rss',
      title: params.title || channelInfo.title,
      description: channelInfo.description,
      url: channelInfo.channelUrl,
      thumbnailPath: channelInfo.avatarUrl,
      metadata: {
        sourceType: params.sourceType,
        feedUrl: channelInfo.feedUrl,
        channelId: channelInfo.channelId,
        channelUrl: channelInfo.channelUrl,
        subscriberCount: channelInfo.subscriberCount,
        totalVideoCount: channelInfo.totalVideoCount,
        avatarUrl: channelInfo.avatarUrl,
        autoDownload: params.autoDownload || false,
        downloadQuality: params.downloadQuality || 'best',
        downloadFolderId: params.folderId,
        enabled: true,
        lastFetchedAt: Date.now()
      },
      workspaceId: params.workspaceId,
      folderId: params.folderId,
      collectedAt: Date.now()
    } as any);

    return { success: true, data: resource };
  } catch (error: any) {
    return { success: false, error: error?.message || String(error) };
  }
}

/**
 * 获取 RSS Feed 的适配器
 */
async function fetchRssFeedAdapter(params: any): Promise<any> {
  if (isMainProcess) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ResourcesRepo, RssFeedItemsRepo } = require('../../../electron/main/db/repositories');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { rssSourceRegistry } = require('../../../electron/main/handlers/rss/rss-source-registry');

      const resource = await ResourcesRepo.getById(params.resourceId);
      if (!resource) {
        return { success: false, error: '订阅资源不存在' };
      }

      const metadata = resource.metadata as any;
      const handler = rssSourceRegistry.getHandler(metadata.sourceType);
      if (!handler) {
        return { success: false, error: '不支持的 RSS 来源类型' };
      }

      // 获取 Feed
      const feed = await handler.fetchFeed(metadata.feedUrl || metadata.channelId);

      // 保存到数据库
      if (feed.items && feed.items.length > 0) {
        const itemsToInsert = feed.items.slice(0, params.pageSize || 15).map((item: any) => ({
          rssResourceId: resource.id,
          itemId: item.id,
          title: item.title,
          link: item.link,
          description: item.description,
          publishedAt: item.publishedAt,
          author: item.author,
          thumbnail: item.thumbnail,
          durationMs: item.durationMs,
          viewCount: item.viewCount,
          metadata: item
        }));

        await RssFeedItemsRepo.batchUpsert(itemsToInsert);
      }

      return {
        success: true,
        data: {
          items: feed.items?.slice(0, params.pageSize || 15) || []
        }
      };
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) };
    }
  } else {
    // 渲染进程：通过 IPC 调用
    return await (window as any).YUA.rss.fetchFeed(params);
  }
}

// 输入参数 schema
const youtubeSubscribeInputSchema = z.object({
  channelIdOrUrl: z.string().describe('YouTube 频道 ID、频道 URL、或包含频道信息的视频 URL'),
  channelName: z.string().optional().describe('频道名称（如果已知）'),
  autoDownload: z.boolean().optional().describe('是否自动下载新视频。默认 false'),
  downloadQuality: z.string().optional().describe('下载质量设置（如：best、1080p、720p）。默认 best'),
  folderId: z.string().optional().describe('下载保存到的文件夹 ID')
});

// 输出结果 schema
const youtubeSubscribeOutputSchema = z.object({
  success: z.boolean().describe('订阅是否成功'),
  subscription: z
    .object({
      id: z.string().describe('订阅资源 ID'),
      title: z.string().describe('频道标题'),
      channelId: z.string().describe('频道 ID'),
      channelUrl: z.string().describe('频道主页 URL'),
      feedUrl: z.string().describe('RSS Feed URL'),
      subscriberCount: z.number().optional().describe('订阅者数量'),
      totalVideoCount: z.number().optional().describe('视频总数'),
      thumbnailUrl: z.string().optional().describe('频道缩略图'),
      autoDownload: z.boolean().describe('是否自动下载新视频'),
      itemCount: z.number().optional().describe('当前 Feed 中的视频数量')
    })
    .optional()
    .describe('订阅信息'),
  latestVideos: z
    .array(
      z.object({
        title: z.string().describe('视频标题'),
        link: z.string().describe('视频链接'),
        publishedAt: z.number().describe('发布时间（时间戳）'),
        thumbnail: z.string().optional().describe('缩略图 URL'),
        duration: z.number().optional().describe('时长（毫秒）'),
        viewCount: z.number().optional().describe('观看次数')
      })
    )
    .optional()
    .describe('最新视频列表（最多 5 个）'),
  message: z.string().describe('返回消息'),
  error: z.string().optional().describe('错误信息')
});

type YoutubeSubscribeInput = z.infer<typeof youtubeSubscribeInputSchema>;
type YoutubeSubscribeOutput = z.infer<typeof youtubeSubscribeOutputSchema>;

/**
 * 创建 YouTube 订阅工具
 */
export const createYoutubeSubscribeTool = (): ReturnType<typeof createTool> =>
  createTool({
    id: 'youtube-subscribe',
    description: `订阅 YouTube 频道并获取最新视频。

**使用场景**：
- 用户要求订阅某个频道："订阅这个频道"、"关注他的 YouTube"
- 下载视频后友情提示："如果你喜欢这个频道，我可以帮你订阅它"
- 用户询问："这个频道有哪些新视频？"

**功能特性**：
- 自动解析频道 ID（支持频道 URL、视频 URL、频道 ID）
- 创建 RSS 订阅源，定期获取最新视频
- 可选自动下载新视频
- 返回频道信息和最新视频列表
- 订阅后可以在资源库的"订阅"标签中管理

**自动下载功能**：
如果设置 autoDownload=true，系统会自动下载该频道发布的新视频。
建议只对用户特别喜欢的频道开启此功能。

**订阅后的使用**：
- 查看最新视频：在资源库的"订阅"页面
- 手动刷新：点击刷新按钮
- 下载视频：点击视频卡片的下载按钮
- 取消订阅：在订阅列表中删除`,

    inputSchema: youtubeSubscribeInputSchema,
    outputSchema: youtubeSubscribeOutputSchema,

    execute: async ({ context }): Promise<YoutubeSubscribeOutput> => {
      const { channelIdOrUrl, channelName, autoDownload = false, downloadQuality = 'best', folderId } = context as YoutubeSubscribeInput;

      try {
        // 1. 验证输入
        if (!channelIdOrUrl) {
          return {
            success: false,
            message: '缺少频道信息',
            error: '请提供频道 ID、频道 URL 或视频 URL'
          };
        }

        // 2. 创建 RSS 订阅
        const createResult = await createRssAdapter({
          sourceType: 'youtube',
          channelIdOrUrl,
          title: channelName,
          autoDownload,
          downloadQuality,
          folderId
        });

        if (!createResult.success) {
          return {
            success: false,
            message: '创建订阅失败',
            error: createResult.error || '无法创建 RSS 订阅，请检查频道信息是否正确'
          };
        }

        const resource = createResult.data;
        const metadata = resource.metadata as any;

        // 3. 获取最新视频列表
        let latestVideos: any[] = [];
        try {
          const feedResult = await fetchRssFeedAdapter({
            resourceId: resource.id,
            pageSize: 5
          });

          if (feedResult.success && feedResult.data?.items) {
            latestVideos = feedResult.data.items.slice(0, 5).map((item: any) => ({
              title: item.title,
              link: item.link,
              publishedAt: item.publishedAt,
              thumbnail: item.thumbnail,
              duration: item.durationMs,
              viewCount: item.viewCount
            }));
          }
        } catch (error) {
          console.warn('[youtube-subscribe-tool] Failed to fetch latest videos:', error);
          // 不影响订阅创建，只是没有最新视频列表
        }

        // 4. 构建返回结果
        return {
          success: true,
          subscription: {
            id: resource.id,
            title: resource.title,
            channelId: metadata.channelId || '',
            channelUrl: metadata.channelUrl || resource.url || '',
            feedUrl: metadata.feedUrl || '',
            subscriberCount: metadata.subscriberCount,
            totalVideoCount: metadata.totalVideoCount,
            thumbnailUrl: resource.thumbnailPath || metadata.avatarUrl,
            autoDownload,
            itemCount: metadata.itemCount || latestVideos.length
          },
          latestVideos: latestVideos.length > 0 ? latestVideos : undefined,
          message: `成功订阅频道：${resource.title}${autoDownload ? '（已启用自动下载）' : ''}`
        };
      } catch (error: any) {
        console.error('[youtube-subscribe-tool] Error:', error);
        return {
          success: false,
          message: '订阅工具执行失败',
          error: error?.message || String(error)
        };
      }
    }
  });

export const youtubeSubscribeTool = createYoutubeSubscribeTool();

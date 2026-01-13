import http from 'node:http';
import https from 'node:https';

import { ipcMain } from 'electron';

import { ResourcesRepo, RssFeedItemsRepo, WorkspacesRepo } from '../../db/repositories';
import type { NewRssFeedItem, RssFeedItemRow } from '../../db/schema';
import { getHttpProxy as getSystemHttpProxy } from '../proxy/proxy';
import { rssSourceRegistry } from './rss-source-registry';
import type { CreateRssResourceParams, DownloadRssItemParams, FetchRssFeedParams, RssFeed, RssFeedItem, RssMetadata, RssSourceType, UpdateRssResourceParams } from './types';

/**
 * 解析 RSS/Atom Feed
 */
async function parseRssFeed(feedUrl: string, sourceType?: RssSourceType): Promise<RssFeed> {
  return new Promise((resolve, reject) => {
    const client = feedUrl.startsWith('https:') ? https : http;
    const agent = getSystemHttpProxy();

    const options: https.RequestOptions | http.RequestOptions = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };

    if (agent) {
      options.agent = agent as any;
    }

    const req = client.get(feedUrl, options, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        return;
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const feed = parseXmlFeed(data, feedUrl, sourceType);
          resolve(feed);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('RSS feed 请求超时'));
    });
  });
}

/**
 * 解析 XML Feed（支持 RSS 2.0 和 Atom）
 */
function parseXmlFeed(xml: string, feedUrl: string, sourceType?: RssSourceType): RssFeed {
  const items: RssFeedItem[] = [];
  const handler = sourceType ? rssSourceRegistry.getHandler(sourceType) : null;

  // 检测是 Atom 还是 RSS
  const isAtom = xml.includes('<feed') && xml.includes('xmlns="http://www.w3.org/2005/Atom"');

  if (isAtom) {
    // 解析 Atom feed
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;

    while ((match = entryRegex.exec(xml)) !== null) {
      const entry = match[1];

      const titleMatch = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/);
      const title = titleMatch ? decodeXmlEntities(titleMatch[1].trim()) : '';

      const linkMatch = entry.match(/<link[^>]*href=["']([^"']+)["']/);
      const link = linkMatch ? linkMatch[1] : '';

      const publishedMatch = entry.match(/<published[^>]*>([\s\S]*?)<\/published>/);
      const published = publishedMatch ? new Date(publishedMatch[1].trim()).getTime() : Date.now();

      const updatedMatch = entry.match(/<updated[^>]*>([\s\S]*?)<\/updated>/);
      const updated = updatedMatch ? new Date(updatedMatch[1].trim()).getTime() : undefined;

      // 提取描述
      const descMatch = entry.match(/<media:description[^>]*>([\s\S]*?)<\/media:description>/);
      const description = descMatch ? decodeXmlEntities(descMatch[1].trim()) : undefined;

      // 提取作者
      const authorMatch = entry.match(/<author>\s*<name[^>]*>([\s\S]*?)<\/name>/);
      const author = authorMatch ? decodeXmlEntities(authorMatch[1].trim()) : undefined;

      // 基础条目
      let item: RssFeedItem = {
        id: link,
        title,
        description,
        link,
        publishedAt: published,
        updatedAt: updated,
        author,
        mediaType: 'article'
      };

      // 使用处理器增强条目（如果可用）
      if (handler?.enhanceFeedItem) {
        item = handler.enhanceFeedItem(item, entry);
      } else {
        // 默认处理：提取缩略图和观看次数
        const thumbnailMatch = entry.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/);
        if (thumbnailMatch) {
          item.thumbnail = thumbnailMatch[1];
        }

        const viewsMatch = entry.match(/<media:statistics[^>]*views=["'](\d+)["']/);
        if (viewsMatch) {
          item.viewCount = parseInt(viewsMatch[1], 10);
        }
      }

      items.push(item);
    }

    // 提取 feed 元信息
    const feedTitleMatch = xml.match(/<feed[^>]*>[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/);
    const feedTitle = feedTitleMatch ? decodeXmlEntities(feedTitleMatch[1].trim()) : '';

    const feedAuthorMatch = xml.match(/<feed[^>]*>[\s\S]*?<author>\s*<name[^>]*>([\s\S]*?)<\/name>/);
    const feedAuthor = feedAuthorMatch ? decodeXmlEntities(feedAuthorMatch[1].trim()) : undefined;

    let feed: RssFeed = {
      title: feedTitle,
      author: feedAuthor,
      feedUrl,
      items,
      totalItems: items.length
    };

    // 使用处理器增强 Feed（如果可用）
    if (handler?.enhanceFeed) {
      feed = handler.enhanceFeed(feed, xml);
    }

    return feed;
  } else {
    // 解析 RSS 2.0 feed
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const item = match[1];

      const titleMatch = item.match(/<title[^>]*>([\s\S]*?)<\/title>/);
      const title = titleMatch ? decodeXmlEntities(titleMatch[1].trim()) : '';

      const linkMatch = item.match(/<link[^>]*>([\s\S]*?)<\/link>/);
      const link = linkMatch ? linkMatch[1].trim() : '';

      const pubDateMatch = item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/);
      const published = pubDateMatch ? new Date(pubDateMatch[1].trim()).getTime() : Date.now();

      const descMatch = item.match(/<description[^>]*>([\s\S]*?)<\/description>/);
      const description = descMatch ? decodeXmlEntities(descMatch[1].trim()) : undefined;

      const authorMatch = item.match(/<author[^>]*>([\s\S]*?)<\/author>/) || item.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/);
      const author = authorMatch ? decodeXmlEntities(authorMatch[1].trim()) : undefined;

      // 提取 enclosure（音频/视频）
      const enclosureMatch = item.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*type=["']([^"']+)["'][^>]*length=["'](\d+)["']/);
      let mediaUrl: string | undefined;
      let mediaFormat: string | undefined;
      let sizeBytes: number | undefined;
      let mediaType: RssFeedItem['mediaType'] = 'article';

      if (enclosureMatch) {
        mediaUrl = enclosureMatch[1];
        mediaFormat = enclosureMatch[2];
        sizeBytes = parseInt(enclosureMatch[3], 10);
        if (mediaFormat.startsWith('audio/')) mediaType = 'audio';
        else if (mediaFormat.startsWith('video/')) mediaType = 'video';
        else if (mediaFormat.startsWith('image/')) mediaType = 'image';
      }

      // 提取 itunes:duration（播客时长）
      const durationMatch = item.match(/<itunes:duration[^>]*>([\s\S]*?)<\/itunes:duration>/);
      let durationMs: number | undefined;
      if (durationMatch) {
        const durStr = durationMatch[1].trim();
        const parts = durStr.split(':').map(Number);
        if (parts.length === 3) {
          durationMs = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
        } else if (parts.length === 2) {
          durationMs = (parts[0] * 60 + parts[1]) * 1000;
        } else if (parts.length === 1) {
          durationMs = parts[0] * 1000;
        }
      }

      // 提取缩略图
      const imageMatch = item.match(/<itunes:image[^>]*href=["']([^"']+)["']/) || item.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/);
      const thumbnail = imageMatch ? imageMatch[1] : undefined;

      // 生成唯一 ID
      const guidMatch = item.match(/<guid[^>]*>([\s\S]*?)<\/guid>/);
      const id = guidMatch ? guidMatch[1].trim() : link;

      items.push({
        id,
        title,
        description,
        link,
        publishedAt: published,
        author,
        thumbnail,
        mediaType,
        mediaUrl,
        mediaFormat,
        sizeBytes,
        durationMs
      });
    }

    // 提取 channel 元信息
    const channelTitleMatch = xml.match(/<channel>[\s\S]*?<title[^>]*>([\s\S]*?)<\/title>/);
    const feedTitle = channelTitleMatch ? decodeXmlEntities(channelTitleMatch[1].trim()) : '';

    const channelDescMatch = xml.match(/<channel>[\s\S]*?<description[^>]*>([\s\S]*?)<\/description>/);
    const feedDesc = channelDescMatch ? decodeXmlEntities(channelDescMatch[1].trim()) : undefined;

    const channelImageMatch = xml.match(/<channel>[\s\S]*?<image>[\s\S]*?<url[^>]*>([\s\S]*?)<\/url>/);
    const feedImage = channelImageMatch ? channelImageMatch[1].trim() : undefined;

    return {
      title: feedTitle,
      description: feedDesc,
      image: feedImage,
      feedUrl,
      items,
      totalItems: items.length
    };
  }
}

/**
 * 解码 XML 实体
 */
function decodeXmlEntities(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

/**
 * 将 RssFeedItem 转换为数据库行格式
 */
function feedItemToDbRow(rssResourceId: string, item: RssFeedItem): NewRssFeedItem {
  return {
    rssResourceId,
    itemId: item.id,
    title: item.title,
    description: item.description,
    link: item.link,
    publishedAt: item.publishedAt,
    updatedAt: item.updatedAt,
    author: item.author,
    thumbnail: item.thumbnail,
    durationMs: item.durationMs,
    viewCount: item.viewCount,
    likeCount: item.likeCount,
    commentCount: item.commentCount,
    mediaType: item.mediaType,
    mediaUrl: item.mediaUrl,
    mediaFormat: item.mediaFormat,
    sizeBytes: item.sizeBytes,
    categories: item.categories ? JSON.stringify(item.categories) : undefined,
    downloaded: item.downloaded ?? false,
    localResourceId: item.localResourceId,
    downloadStatus: item.downloadStatus,
    downloadProgress: item.downloadProgress,
    metadata: item.metadata ? JSON.stringify(item.metadata) : undefined
  };
}

/**
 * 将数据库行转换为 RssFeedItem
 */
function dbRowToFeedItem(row: RssFeedItemRow): RssFeedItem {
  return {
    id: row.itemId,
    title: row.title,
    description: row.description ?? undefined,
    link: row.link,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt ?? undefined,
    author: row.author ?? undefined,
    thumbnail: row.thumbnail ?? undefined,
    durationMs: row.durationMs ?? undefined,
    viewCount: row.viewCount ?? undefined,
    likeCount: row.likeCount ?? undefined,
    commentCount: row.commentCount ?? undefined,
    mediaType: row.mediaType as RssFeedItem['mediaType'],
    mediaUrl: row.mediaUrl ?? undefined,
    mediaFormat: row.mediaFormat ?? undefined,
    sizeBytes: row.sizeBytes ?? undefined,
    categories: row.categories ? JSON.parse(row.categories) : undefined,
    downloaded: row.downloaded ?? false,
    localResourceId: row.localResourceId ?? undefined,
    downloadStatus: row.downloadStatus as RssFeedItem['downloadStatus'],
    downloadProgress: row.downloadProgress ?? undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined
  };
}

/**
 * 检测 RSS 来源类型
 */
function detectSourceType(url: string): RssSourceType {
  const handler = rssSourceRegistry.detectHandler(url);
  if (handler) {
    return handler.sourceType;
  }

  // 回退到基于 URL 的检测
  if (url.includes('bilibili.com')) {
    return 'bilibili';
  }
  if (url.includes('twitter.com') || url.includes('x.com')) {
    return 'twitter';
  }
  // 检测是否是播客
  if (url.includes('podcast') || url.includes('anchor.fm') || url.includes('spotify.com')) {
    return 'podcast';
  }
  return 'custom';
}

export function initRssHandlers(): void {
  /**
   * 创建 RSS 资源
   */
  ipcMain.handle('rss:create', async (_event, params: CreateRssResourceParams) => {
    try {
      const { channelIdOrUrl, title, autoDownload, downloadQuality, folderId, workspaceId } = params;

      let metadata: RssMetadata;
      let resourceTitle = title;
      let resourceDescription: string | undefined;
      let thumbnailUrl: string | undefined;

      // 尝试使用处理器提取频道信息
      const result = await rssSourceRegistry.extractChannelInfo(channelIdOrUrl);

      if (result) {
        // 使用处理器提取的信息
        const { handler, channelInfo } = result;

        metadata = handler.createMetadata(channelInfo, {
          autoDownload,
          downloadQuality,
          downloadFolderId: folderId
        });

        resourceTitle = title || channelInfo.title || channelInfo.channelId || '未命名订阅';
        resourceDescription = channelInfo.description;
        thumbnailUrl = channelInfo.thumbnail;
      } else {
        // 通用 RSS（没有匹配的处理器）
        const detectedType = detectSourceType(channelIdOrUrl);

        metadata = {
          sourceType: detectedType,
          feedUrl: channelIdOrUrl,
          autoDownload: autoDownload ?? false,
          downloadQuality: downloadQuality ?? 'best',
          downloadFolderId: folderId,
          enabled: true
        };

        // 尝试获取 feed 信息
        try {
          const feed = await parseRssFeed(channelIdOrUrl, detectedType);
          resourceTitle = title || feed.title || '未命名订阅';
          resourceDescription = feed.description;
          thumbnailUrl = feed.image;
          metadata.itemCount = feed.totalItems;
          if (feed.items.length > 0) {
            metadata.latestItemId = feed.items[0].id;
            metadata.latestItemPublishedAt = feed.items[0].publishedAt;
          }
        } catch (e) {
          console.warn('[rss:create] 无法获取 feed 信息:', e);
          resourceTitle = title || '未命名订阅';
        }
      }

      // 获取工作空间
      let wsId = workspaceId;
      if (!wsId) {
        const ws = await WorkspacesRepo.getDefault();
        wsId = ws?.id;
      }

      const now = Date.now();
      const resource = await ResourcesRepo.upsert({
        type: 'rss',
        title: resourceTitle,
        description: resourceDescription,
        url: metadata.channelUrl || metadata.feedUrl,
        domain: metadata.feedUrl ? new URL(metadata.feedUrl).hostname : undefined,
        sourceName: metadata.sourceType === 'youtube' ? 'YouTube' : metadata.sourceType || 'RSS',
        previewUrl: thumbnailUrl,
        metadata: JSON.stringify(metadata),
        workspaceId: wsId,
        folderId,
        status: 'ready',
        collectedAt: now,
        createdAt: now,
        updatedAt: now
      } as any);

      return { success: true, data: resource };
    } catch (error: any) {
      console.error('[rss:create] 创建失败:', error);
      return { success: false, error: error?.message || '创建失败' };
    }
  });

  /**
   * 更新 RSS 资源
   */
  ipcMain.handle('rss:update', async (_event, params: UpdateRssResourceParams) => {
    try {
      const { id, ...updates } = params;
      const resource = await ResourcesRepo.getById(id);
      if (!resource) {
        return { success: false, error: '资源不存在' };
      }

      let currentMetadata: Partial<RssMetadata> = {};
      try {
        currentMetadata = JSON.parse((resource as any).metadata || '{}');
      } catch {
        // ignore parse error
      }

      // 更新 metadata
      const newMetadata: RssMetadata = {
        ...currentMetadata,
        ...(updates.enabled !== undefined && { enabled: updates.enabled }),
        ...(updates.autoDownload !== undefined && { autoDownload: updates.autoDownload }),
        ...(updates.downloadQuality !== undefined && { downloadQuality: updates.downloadQuality }),
        ...(updates.fetchInterval !== undefined && { fetchInterval: updates.fetchInterval }),
        ...(updates.downloadFolderId !== undefined && { downloadFolderId: updates.downloadFolderId })
      };

      const updated = await ResourcesRepo.update(id, {
        ...(updates.title !== undefined && { title: updates.title }),
        ...(updates.description !== undefined && { description: updates.description }),
        metadata: JSON.stringify(newMetadata),
        updatedAt: Date.now()
      } as any);

      return { success: true, data: updated };
    } catch (error: any) {
      console.error('[rss:update] 更新失败:', error);
      return { success: false, error: error?.message || '更新失败' };
    }
  });

  /**
   * 获取缓存的 RSS Feed 内容（从数据库读取）
   * 用于快速展示已缓存的条目，无需等待网络请求
   */
  ipcMain.handle('rss:getCachedFeed', async (_event, params: { resourceId: string; limit?: number; offset?: number }) => {
    try {
      const { resourceId, limit = 100, offset = 0 } = params;
      const resource = await ResourcesRepo.getById(resourceId);
      if (!resource || (resource as any).type !== 'rss') {
        return { success: false, error: '资源不存在或不是 RSS 类型' };
      }

      let metadata: RssMetadata;
      try {
        metadata = JSON.parse((resource as any).metadata || '{}');
      } catch {
        return { success: false, error: '无法解析资源元数据' };
      }

      // 从数据库获取缓存的条目
      const cachedRows = await RssFeedItemsRepo.listByResourceId(resourceId, limit, offset);
      const totalItems = await RssFeedItemsRepo.countByResourceId(resourceId);

      // 转换为 RssFeedItem 格式
      const items = cachedRows.map(dbRowToFeedItem);

      const feed: RssFeed = {
        title: (resource as any).title || '',
        description: (resource as any).description,
        feedUrl: metadata.feedUrl || '',
        image: (resource as any).previewUrl,
        author: (resource as any).authorName,
        items,
        totalItems,
        hasMore: offset + items.length < totalItems
      };

      return {
        success: true,
        data: feed,
        cached: true,
        lastFetchedAt: metadata.lastFetchedAt
      };
    } catch (error: any) {
      console.error('[rss:getCachedFeed] 获取缓存失败:', error);
      return { success: false, error: error?.message || '获取缓存失败' };
    }
  });

  /**
   * 获取 RSS Feed 内容（从网络获取最新数据并更新缓存）
   */
  ipcMain.handle('rss:fetchFeed', async (_event, params: FetchRssFeedParams) => {
    try {
      const { resourceId, forceRefresh } = params;
      const resource = await ResourcesRepo.getById(resourceId);
      if (!resource || (resource as any).type !== 'rss') {
        return { success: false, error: '资源不存在或不是 RSS 类型' };
      }

      let metadata: RssMetadata;
      try {
        metadata = JSON.parse((resource as any).metadata || '{}');
      } catch {
        return { success: false, error: '无法解析资源元数据' };
      }

      if (!metadata.feedUrl) {
        return { success: false, error: '缺少 Feed URL' };
      }

      // 检查是否需要刷新
      const now = Date.now();
      const fetchInterval = (metadata.fetchInterval || 60) * 60 * 1000; // 默认 60 分钟
      if (!forceRefresh && metadata.lastFetchedAt && now - metadata.lastFetchedAt < fetchInterval) {
        // 如果在刷新间隔内，返回缓存数据
        const cachedRows = await RssFeedItemsRepo.listByResourceId(resourceId, 100, 0);
        if (cachedRows.length > 0) {
          const items = cachedRows.map(dbRowToFeedItem);
          const feed: RssFeed = {
            title: (resource as any).title || '',
            description: (resource as any).description,
            feedUrl: metadata.feedUrl,
            image: (resource as any).previewUrl,
            author: (resource as any).authorName,
            items,
            totalItems: items.length
          };
          return { success: true, data: feed, cached: true };
        }
      }

      // 获取 feed
      const feed = await parseRssFeed(metadata.feedUrl, metadata.sourceType);

      // 检查已下载的资源
      const downloadedResources = await ResourcesRepo.listChildren(resourceId, 1000, 0);
      const downloadedMap = new Map<string, string>();
      const downloadedIds = new Set<string>();

      downloadedResources.forEach((r: any) => {
        try {
          const m = JSON.parse(r.metadata || '{}');
          if (m.itemId) {
            downloadedIds.add(m.itemId);
            downloadedMap.set(m.itemId, r.id);
          }
        } catch {
          // ignore parse error
        }
      });

      // 标记已下载状态
      feed.items = feed.items.map((item) => ({
        ...item,
        downloaded: downloadedIds.has(item.id),
        localResourceId: downloadedMap.get(item.id)
      }));

      // 将条目保存到数据库缓存
      if (feed.items.length > 0) {
        const dbRows = feed.items.map((item) => feedItemToDbRow(resourceId, item));
        await RssFeedItemsRepo.bulkUpsert(dbRows);

        // 批量更新已下载状态
        if (downloadedIds.size > 0) {
          await RssFeedItemsRepo.batchUpdateDownloadStatus(resourceId, Array.from(downloadedIds), downloadedMap);
        }
      }

      // 更新资源元数据
      const updatedMetadata: RssMetadata = {
        ...metadata,
        lastFetchedAt: now,
        itemCount: feed.totalItems,
        lastError: undefined,
        lastErrorAt: undefined
      };

      if (feed.items.length > 0) {
        updatedMetadata.latestItemId = feed.items[0].id;
        updatedMetadata.latestItemPublishedAt = feed.items[0].publishedAt;
      }

      await ResourcesRepo.update(resourceId, {
        metadata: JSON.stringify(updatedMetadata),
        updatedAt: now
      } as any);

      return { success: true, data: feed, cached: false };
    } catch (error: any) {
      console.error('[rss:fetchFeed] 获取失败:', error);

      // 记录错误
      try {
        const resource = await ResourcesRepo.getById(params.resourceId);
        if (resource) {
          let metadata: Partial<RssMetadata> = {};
          try {
            metadata = JSON.parse((resource as any).metadata || '{}');
          } catch {
            // ignore parse error
          }

          metadata.lastError = error?.message || '获取失败';
          metadata.lastErrorAt = Date.now();

          await ResourcesRepo.update(params.resourceId, {
            metadata: JSON.stringify(metadata)
          } as any);
        }
      } catch {
        // ignore error logging failure
      }

      // 如果网络获取失败，尝试返回缓存数据
      try {
        const cachedRows = await RssFeedItemsRepo.listByResourceId(params.resourceId, 100, 0);
        if (cachedRows.length > 0) {
          const items = cachedRows.map(dbRowToFeedItem);
          const resource = await ResourcesRepo.getById(params.resourceId);
          let metadata: RssMetadata = {};
          try {
            metadata = JSON.parse((resource as any)?.metadata || '{}');
          } catch {
            // ignore
          }
          const feed: RssFeed = {
            title: (resource as any)?.title || '',
            description: (resource as any)?.description,
            feedUrl: metadata.feedUrl || '',
            image: (resource as any)?.previewUrl,
            author: (resource as any)?.authorName,
            items,
            totalItems: items.length
          };
          return {
            success: true,
            data: feed,
            cached: true,
            error: error?.message || '网络获取失败，返回缓存数据'
          };
        }
      } catch {
        // ignore cache fallback error
      }

      return { success: false, error: error?.message || '获取失败' };
    }
  });

  /**
   * 下载 RSS 条目
   */
  ipcMain.handle('rss:downloadItem', async (_event, params: DownloadRssItemParams) => {
    try {
      const { rssResourceId, itemId, itemUrl, quality, folderId } = params;

      // 获取 RSS 资源
      const rssResource = await ResourcesRepo.getById(rssResourceId);
      if (!rssResource || (rssResource as any).type !== 'rss') {
        return { success: false, error: 'RSS 资源不存在' };
      }

      let metadata: RssMetadata;
      try {
        metadata = JSON.parse((rssResource as any).metadata || '{}');
      } catch {
        return { success: false, error: '无法解析资源元数据' };
      }

      // 确定下载质量和目标文件夹
      const downloadQuality = quality || metadata.downloadQuality || 'best';
      const targetFolderId = folderId || metadata.downloadFolderId || (rssResource as any).folderId;

      // 调用下载器（这里需要调用 video-downloader 的接口）
      // 由于这是一个独立的模块，我们通过事件或直接调用来实现
      // 这里返回下载任务信息，让前端通过 videoDownloader 接口来下载

      return {
        success: true,
        data: {
          url: itemUrl,
          quality: downloadQuality,
          folderId: targetFolderId,
          parentResourceId: rssResourceId,
          metadata: {
            itemId,
            rssResourceId
          }
        }
      };
    } catch (error: any) {
      console.error('[rss:downloadItem] 下载失败:', error);
      return { success: false, error: error?.message || '下载失败' };
    }
  });

  /**
   * 列出所有 RSS 资源
   */
  ipcMain.handle('rss:list', async (_event, params?: { workspaceId?: string }) => {
    try {
      let wsId = params?.workspaceId;
      if (!wsId) {
        const ws = await WorkspacesRepo.getDefault();
        wsId = ws?.id;
      }

      const resources = await ResourcesRepo.list({
        type: 'rss',
        workspaceId: wsId,
        deletedAt: 0
      } as any);

      return { success: true, data: resources };
    } catch (error: any) {
      console.error('[rss:list] 列出失败:', error);
      return { success: false, error: error?.message || '列出失败' };
    }
  });

  /**
   * 删除 RSS 资源
   */
  ipcMain.handle('rss:delete', async (_event, params: { id: string }) => {
    try {
      const { id } = params;
      const updated = await ResourcesRepo.update(id, { deletedAt: Date.now() } as any);
      return { success: true, data: updated };
    } catch (error: any) {
      console.error('[rss:delete] 删除失败:', error);
      return { success: false, error: error?.message || '删除失败' };
    }
  });

  /**
   * 检查所有 RSS 订阅的更新
   */
  ipcMain.handle('rss:checkAllUpdates', async () => {
    try {
      const ws = await WorkspacesRepo.getDefault();
      const resources = await ResourcesRepo.list({
        type: 'rss',
        workspaceId: ws?.id,
        deletedAt: 0
      } as any);

      const results: Array<{ id: string; hasUpdate: boolean; newItems: number; error?: string }> = [];

      for (const resource of resources) {
        try {
          let metadata: RssMetadata;
          try {
            metadata = JSON.parse((resource as any).metadata || '{}');
          } catch {
            continue;
          }

          if (!metadata.enabled || !metadata.feedUrl) {
            continue;
          }

          const feed = await parseRssFeed(metadata.feedUrl, metadata.sourceType);
          const hasUpdate = feed.items.length > 0 && feed.items[0].id !== metadata.latestItemId;

          let newItems = 0;
          if (hasUpdate && metadata.latestItemId) {
            const latestIdx = feed.items.findIndex((item) => item.id === metadata.latestItemId);
            newItems = latestIdx === -1 ? feed.items.length : latestIdx;
          }

          results.push({ id: resource.id, hasUpdate, newItems });

          // 更新元数据
          if (hasUpdate) {
            const updatedMetadata: RssMetadata = {
              ...metadata,
              lastFetchedAt: Date.now(),
              itemCount: feed.totalItems,
              latestItemId: feed.items[0].id,
              latestItemPublishedAt: feed.items[0].publishedAt
            };

            await ResourcesRepo.update(resource.id, {
              metadata: JSON.stringify(updatedMetadata),
              updatedAt: Date.now()
            } as any);
          }
        } catch (error: any) {
          results.push({ id: resource.id, hasUpdate: false, newItems: 0, error: error?.message });
        }
      }

      return { success: true, data: results };
    } catch (error: any) {
      console.error('[rss:checkAllUpdates] 检查失败:', error);
      return { success: false, error: error?.message || '检查失败' };
    }
  });
}

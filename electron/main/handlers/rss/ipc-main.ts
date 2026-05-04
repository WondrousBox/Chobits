import { AppEvent, eventManager } from '@packages/event';
import { ipcMain } from 'electron';

import { ResourcesRepo, RssFeedItemsRepo, WorkspacesRepo } from '../../db/repositories';
import { deleteRssResource } from './rss-delete-service';
import { prepareDownloadTarget } from './rss-download-bridge';
import { detectSourceType, parseRssFeed } from './rss-feed-parser';
import { resolveRssResourceDestination } from './rss-resource-destination';
import { rssSourceRegistry } from './rss-source-registry';
import {
  applyRssSyncSuccessMetadata,
  buildCachedRssFeed,
  dbRowToFeedItem,
  feedItemToDbRow,
  markDownloadedRssItemsInSameFolder,
  parseResourceMetadata,
  recordRssSyncError,
  startRssAutoCheck,
  syncRssResource
} from './rss-sync-service';
import type { CreateRssResourceParams, DownloadRssItemParams, FetchRssFeedParams, RssFeed, RssFeedItem, RssMetadata, UpdateRssResourceParams } from './types';

/**
 * RSS IPC adapter layer.
 * Only: parameter validation, service delegation, unified response structure.
 */

const RSS_FEED_VIEW_LIMIT = 200;

function parseFeedPageParams(params: FetchRssFeedParams): { limit: number; offset: number } {
  const limit = Math.max(1, Math.min(params.pageSize || RSS_FEED_VIEW_LIMIT, RSS_FEED_VIEW_LIMIT));
  const offset = Math.max(0, Number.parseInt(params.pageToken || '0', 10) || 0);
  return { limit, offset };
}

function buildFeedResponseFromItems(resource: any, metadata: RssMetadata, items: RssFeedItem[], totalItems: number, hasMore: boolean): RssFeed {
  return {
    title: resource.title || '',
    description: resource.description,
    feedUrl: metadata.feedUrl || '',
    image: resource.previewUrl,
    author: resource.authorName,
    items,
    totalItems,
    hasMore
  };
}

function resetRssFeedCacheMetadata(metadata: RssMetadata): RssMetadata {
  const next: RssMetadata = {
    ...metadata,
    lastSyncStatus: 'idle'
  };

  delete next.lastFetchedAt;
  delete next.lastCheckedAt;
  delete next.lastSucceededAt;
  delete next.lastFailedAt;
  delete next.latestItemId;
  delete next.latestItemPublishedAt;
  delete next.itemCount;
  delete next.historyLoadedCount;
  delete next.historyFullyLoaded;
  delete next.oldestHistoryPublishedAt;
  delete next.lastError;
  delete next.lastErrorAt;

  return next;
}

async function getYouTubeHistoryCoverage(resourceId: string, metadata: RssMetadata): Promise<number> {
  const cachedItemCount = await RssFeedItemsRepo.countByResourceId(resourceId);
  return Math.max(metadata.historyLoadedCount || 0, cachedItemCount);
}

function getDownloadedItemResourceMap(items: RssFeedItem[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of items) {
    if (item.downloaded && item.localResourceId) {
      map.set(item.id, item.localResourceId);
    }
  }
  return map;
}

function isPublishedAtEstimated(item: RssFeedItem): boolean {
  return item.metadata?.publishedAtEstimated === true;
}

function withPrecisePublishedAt(item: RssFeedItem, cachedItem: RssFeedItem): RssFeedItem {
  const metadata = { ...(item.metadata || {}) };
  delete metadata.publishedAtEstimated;

  return {
    ...item,
    publishedAt: cachedItem.publishedAt,
    updatedAt: cachedItem.updatedAt ?? item.updatedAt,
    metadata
  };
}

function getPlaylistIndex(item: RssFeedItem): number | undefined {
  const value = item.metadata?.playlistIndex;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

async function preserveOfficialPublishedTimes(resourceId: string, items: RssFeedItem[]): Promise<RssFeedItem[]> {
  const merged: RssFeedItem[] = [];
  let lastPreciseAnchor: { playlistIndex: number; publishedAt: number } | undefined;

  for (const item of items) {
    let nextItem = item;

    if (isPublishedAtEstimated(item)) {
      const cachedRow = await RssFeedItemsRepo.getByResourceAndItemId(resourceId, item.id);
      if (cachedRow) {
        const cachedItem = dbRowToFeedItem(cachedRow);
        if (!isPublishedAtEstimated(cachedItem)) {
          nextItem = withPrecisePublishedAt(item, cachedItem);
        }
      }
    }

    const playlistIndex = getPlaylistIndex(nextItem);
    if (!isPublishedAtEstimated(nextItem) && playlistIndex !== undefined) {
      lastPreciseAnchor = { playlistIndex, publishedAt: nextItem.publishedAt };
    } else if (isPublishedAtEstimated(nextItem) && playlistIndex !== undefined && lastPreciseAnchor && playlistIndex > lastPreciseAnchor.playlistIndex) {
      nextItem = {
        ...nextItem,
        publishedAt: lastPreciseAnchor.publishedAt - (playlistIndex - lastPreciseAnchor.playlistIndex) * 1000
      };
    }

    merged.push(nextItem);
  }

  return merged;
}

async function cacheYouTubeHistoryPage(
  resource: any,
  metadata: RssMetadata,
  offset: number,
  limit: number,
  detailed = false
): Promise<{ items: RssFeedItem[]; hasMore: boolean; nextOffset: number; totalLoaded: number; metadata: RssMetadata }> {
  const channelUrl = metadata.channelUrl || metadata.channelId;
  if (!channelUrl) throw new Error('无法获取频道信息');

  const handler = rssSourceRegistry.getHandler('youtube');
  if (!handler) throw new Error('YouTube 处理器未注册');

  const youtubeHandler = handler as any;
  const safeOffset = Math.max(0, offset);
  const safeLimit = Math.max(1, Math.min(limit, RSS_FEED_VIEW_LIMIT));
  const playlistEnd = safeOffset + safeLimit;

  let items: RssFeedItem[];
  if (detailed) {
    items = await youtubeHandler.fetchChannelVideosDetailed(channelUrl, { playlistStart: safeOffset + 1, playlistEnd });
  } else {
    items = await youtubeHandler.fetchChannelHistory(channelUrl, { playlistEnd, playlistStart: safeOffset + 1 });
  }

  if (items.length > 0) {
    items = await preserveOfficialPublishedTimes(resource.id, items);
    items = await markDownloadedRssItemsInSameFolder(resource, items);
    await RssFeedItemsRepo.bulkUpsert(items.map((item) => feedItemToDbRow(resource.id, item)));

    const downloadedMap = getDownloadedItemResourceMap(items);
    if (downloadedMap.size > 0) {
      await RssFeedItemsRepo.batchUpdateDownloadStatus(resource.id, Array.from(downloadedMap.keys()), downloadedMap);
    }
  }

  const now = Date.now();
  const totalLoaded = safeOffset + items.length;
  const cachedItemCount = await RssFeedItemsRepo.countByResourceId(resource.id);
  const oldestItem = items.length > 0 ? items.reduce((oldest, item) => (item.publishedAt < oldest.publishedAt ? item : oldest), items[0]) : undefined;
  const latestItem = safeOffset === 0 ? items[0] : undefined;
  const updatedMetadata: RssMetadata = {
    ...applyRssSyncSuccessMetadata(metadata, now),
    historyLoadedCount: Math.max(metadata.historyLoadedCount || 0, totalLoaded, cachedItemCount),
    historyFullyLoaded: items.length < safeLimit,
    itemCount: Math.max(metadata.itemCount || 0, cachedItemCount),
    ...(latestItem && {
      latestItemId: latestItem.id,
      latestItemPublishedAt: latestItem.publishedAt
    }),
    ...(oldestItem && {
      oldestHistoryPublishedAt: metadata.oldestHistoryPublishedAt ? Math.min(metadata.oldestHistoryPublishedAt, oldestItem.publishedAt) : oldestItem.publishedAt
    })
  };

  await ResourcesRepo.update(resource.id, { metadata: JSON.stringify(updatedMetadata), updatedAt: Date.now() } as any);

  const nextOffset = Math.max(totalLoaded, cachedItemCount);
  return {
    items,
    hasMore: items.length >= safeLimit,
    nextOffset,
    totalLoaded: nextOffset,
    metadata: updatedMetadata
  };
}

async function ensureYouTubeHistoryCachedForPage(resource: any, metadata: RssMetadata, offset: number, limit: number): Promise<{ resource: any; metadata: RssMetadata }> {
  if (metadata.sourceType !== 'youtube' || metadata.historyFullyLoaded || (!metadata.channelUrl && !metadata.channelId)) {
    return { resource, metadata };
  }

  const requiredCount = offset + limit;
  const coveredCount = await getYouTubeHistoryCoverage(resource.id, metadata);
  if (coveredCount >= requiredCount) {
    return { resource, metadata };
  }

  await cacheYouTubeHistoryPage(resource, metadata, coveredCount, requiredCount - coveredCount);
  const refreshedResource = (await ResourcesRepo.getById(resource.id)) || resource;
  return { resource: refreshedResource, metadata: parseResourceMetadata(refreshedResource) };
}

export function initRssHandlers(): void {
  startRssAutoCheck();

  ipcMain.handle('rss:create', async (_event, params: CreateRssResourceParams) => {
    try {
      const { channelIdOrUrl, title, autoDownload, downloadQuality, folderId, workspaceId } = params;

      let metadata: RssMetadata;
      let resourceTitle = title;
      let resourceDescription: string | undefined;
      let thumbnailUrl: string | undefined;

      const result = await rssSourceRegistry.extractChannelInfo(channelIdOrUrl);

      if (result) {
        const { handler, channelInfo } = result;
        metadata = handler.createMetadata(channelInfo, { autoDownload, downloadQuality, downloadFolderId: folderId });
        metadata.lastSyncStatus = metadata.lastSyncStatus || 'idle';
        resourceTitle = title || channelInfo.title || channelInfo.channelId || '未命名订阅';
        resourceDescription = channelInfo.description;
        thumbnailUrl = channelInfo.thumbnail;
      } else {
        const detectedType = detectSourceType(channelIdOrUrl);
        metadata = {
          sourceType: detectedType,
          feedUrl: channelIdOrUrl,
          autoDownload: autoDownload ?? false,
          downloadQuality: downloadQuality ?? 'best',
          downloadFolderId: folderId,
          enabled: true,
          lastSyncStatus: 'idle'
        };
        try {
          const feed = await parseRssFeed(channelIdOrUrl, detectedType);
          resourceTitle = title || feed.title || '未命名订阅';
          resourceDescription = feed.description;
          thumbnailUrl = feed.image;
          metadata = applyRssSyncSuccessMetadata(metadata, Date.now());
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

      const destination = await resolveRssResourceDestination({ workspaceId, folderId });
      const wsId = destination.workspaceId;
      const targetFolderId = destination.folderId;
      metadata.downloadFolderId = targetFolderId;

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
        folderId: targetFolderId,
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

  ipcMain.handle('rss:update', async (_event, params: UpdateRssResourceParams) => {
    try {
      const { id, ...updates } = params;
      const resource = await ResourcesRepo.getById(id);
      if (!resource) return { success: false, error: '资源不存在' };

      const currentMetadata = parseResourceMetadata(resource);
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

  ipcMain.handle('rss:getCachedFeed', async (_event, params: { resourceId: string; limit?: number; offset?: number }) => {
    try {
      const { resourceId, limit = RSS_FEED_VIEW_LIMIT, offset = 0 } = params;
      const resource = await ResourcesRepo.getById(resourceId);
      if (!resource || (resource as any).type !== 'rss') return { success: false, error: '资源不存在或不是 RSS 类型' };

      const metadata = parseResourceMetadata(resource);
      const feed = await buildCachedRssFeed(resource, metadata, limit, offset);
      return { success: true, data: feed, cached: true, lastFetchedAt: metadata.lastFetchedAt };
    } catch (error: any) {
      console.error('[rss:getCachedFeed] 获取缓存失败:', error);
      return { success: false, error: error?.message || '获取缓存失败' };
    }
  });

  ipcMain.handle('rss:fetchFeed', async (_event, params: FetchRssFeedParams) => {
    eventManager.emit(AppEvent.SPRITE_RSS_REFRESH);
    const { limit, offset } = parseFeedPageParams(params);
    try {
      const { resourceId, forceRefresh } = params;
      const resource = await ResourcesRepo.getById(resourceId);
      if (!resource || (resource as any).type !== 'rss') return { success: false, error: '资源不存在或不是 RSS 类型' };

      const metadata = parseResourceMetadata(resource);
      if (!metadata.feedUrl) return { success: false, error: '缺少 Feed URL' };

      const now = Date.now();
      const fetchInterval = (metadata.fetchInterval || 60) * 60 * 1000;
      if (!forceRefresh && metadata.lastFetchedAt && now - metadata.lastFetchedAt < fetchInterval) {
        const pageContext = await ensureYouTubeHistoryCachedForPage(resource, metadata, offset, limit);
        const cachedFeed = await buildCachedRssFeed(pageContext.resource, pageContext.metadata, limit, offset);
        if (cachedFeed.items.length > 0) return { success: true, data: cachedFeed, cached: true };
      }

      await syncRssResource(resource, { ignoreEnabled: true, ignoreFetchInterval: true, queueAutoDownload: false });

      let refreshedResource = (await ResourcesRepo.getById(resourceId)) || resource;
      let refreshedMetadata = parseResourceMetadata(refreshedResource);
      if (forceRefresh && refreshedMetadata.sourceType === 'youtube') {
        const latestResult = await cacheYouTubeHistoryPage(refreshedResource, refreshedMetadata, 0, limit);
        refreshedResource = (await ResourcesRepo.getById(resourceId)) || refreshedResource;
        refreshedMetadata = parseResourceMetadata(refreshedResource);
        const totalItems = await RssFeedItemsRepo.countByResourceId(resourceId);
        const latestFeed = buildFeedResponseFromItems(refreshedResource, refreshedMetadata, latestResult.items, totalItems, latestResult.hasMore || totalItems > latestResult.items.length);
        return { success: true, data: latestFeed, cached: false };
      }

      const pageContext = await ensureYouTubeHistoryCachedForPage(refreshedResource, refreshedMetadata, offset, limit);
      refreshedResource = pageContext.resource;
      refreshedMetadata = pageContext.metadata;
      const completeFeed = await buildCachedRssFeed(refreshedResource, refreshedMetadata, limit, offset);
      return { success: true, data: completeFeed, cached: false };
    } catch (error: any) {
      console.error('[rss:fetchFeed] 获取失败:', error);
      await recordRssSyncError(params.resourceId, error);
      try {
        const resource = await ResourcesRepo.getById(params.resourceId);
        if (resource) {
          const metadata = parseResourceMetadata(resource);
          const feed = await buildCachedRssFeed(resource, metadata, limit, offset);
          if (feed.items.length === 0) return { success: false, error: error?.message || '获取失败' };
          return { success: true, data: feed, cached: true, error: error?.message || '网络获取失败，返回缓存数据' };
        }
      } catch {
        /* ignore cache fallback error */
      }
      return { success: false, error: error?.message || '获取失败' };
    }
  });

  ipcMain.handle('rss:reload', async (_event, params: { resourceId: string; pageSize?: number }) => {
    eventManager.emit(AppEvent.SPRITE_RSS_REFRESH);
    const limit = Math.max(1, Math.min(params.pageSize || RSS_FEED_VIEW_LIMIT, RSS_FEED_VIEW_LIMIT));

    try {
      const { resourceId } = params;
      const resource = await ResourcesRepo.getById(resourceId);
      if (!resource || (resource as any).type !== 'rss') return { success: false, error: '资源不存在或不是 RSS 类型' };

      const metadata = parseResourceMetadata(resource);
      if (!metadata.feedUrl) return { success: false, error: '缺少 Feed URL' };

      const deletedFeedCount = await RssFeedItemsRepo.deleteByResourceId(resourceId);
      const resetMetadata = resetRssFeedCacheMetadata(metadata);
      await ResourcesRepo.update(resourceId, {
        metadata: JSON.stringify(resetMetadata),
        updatedAt: Date.now()
      } as any);

      const resetResource = {
        ...resource,
        metadata: JSON.stringify(resetMetadata)
      };

      if (resetMetadata.sourceType === 'youtube') {
        await syncRssResource(resetResource, { ignoreEnabled: true, ignoreFetchInterval: true, queueAutoDownload: false });
        const syncedResource = (await ResourcesRepo.getById(resourceId)) || resetResource;
        const syncedMetadata = parseResourceMetadata(syncedResource);
        const latestResult = await cacheYouTubeHistoryPage(syncedResource, syncedMetadata, 0, limit);
        const refreshedResource = (await ResourcesRepo.getById(resourceId)) || syncedResource;
        const refreshedMetadata = parseResourceMetadata(refreshedResource);
        const totalItems = await RssFeedItemsRepo.countByResourceId(resourceId);
        const feed = buildFeedResponseFromItems(refreshedResource, refreshedMetadata, latestResult.items, totalItems, latestResult.hasMore || totalItems > latestResult.items.length);
        return { success: true, data: feed, cached: false, deletedFeedCount };
      }

      await syncRssResource(resetResource, { ignoreEnabled: true, ignoreFetchInterval: true, queueAutoDownload: false });

      let refreshedResource = (await ResourcesRepo.getById(resourceId)) || resetResource;
      let refreshedMetadata = parseResourceMetadata(refreshedResource);
      const pageContext = await ensureYouTubeHistoryCachedForPage(refreshedResource, refreshedMetadata, 0, limit);
      refreshedResource = pageContext.resource;
      refreshedMetadata = pageContext.metadata;

      const feed = await buildCachedRssFeed(refreshedResource, refreshedMetadata, limit, 0);
      return { success: true, data: feed, cached: false, deletedFeedCount };
    } catch (error: any) {
      console.error('[rss:reload] 重载失败:', error);
      await recordRssSyncError(params.resourceId, error);
      return { success: false, error: error?.message || '重载失败' };
    }
  });

  ipcMain.handle('rss:downloadItem', async (_event, params: DownloadRssItemParams) => {
    try {
      return await prepareDownloadTarget(params);
    } catch (error: any) {
      console.error('[rss:downloadItem] 下载失败:', error);
      return { success: false, error: error?.message || '下载失败' };
    }
  });

  ipcMain.handle('rss:ignoreItem', async (_event, params: { rssResourceId: string; itemId: string }) => {
    try {
      const { rssResourceId, itemId } = params;
      const rssResource = await ResourcesRepo.getById(rssResourceId);
      if (!rssResource || (rssResource as any).type !== 'rss') return { success: false, error: 'RSS 资源不存在' };

      const rssItemRow = await RssFeedItemsRepo.softDeleteByResourceAndItemId(rssResourceId, itemId);
      if (!rssItemRow) return { success: false, error: 'RSS 条目不存在' };

      return { success: true, data: dbRowToFeedItem(rssItemRow) };
    } catch (error: any) {
      console.error('[rss:ignoreItem] 忽略失败:', error);
      return { success: false, error: error?.message || '忽略失败' };
    }
  });

  ipcMain.handle('rss:batchIgnoreItems', async (_event, params: { rssResourceId: string; itemIds: string[] }) => {
    try {
      const { rssResourceId, itemIds } = params;
      if (!itemIds.length) return { success: true, data: { count: 0 } };

      const rssResource = await ResourcesRepo.getById(rssResourceId);
      if (!rssResource || (rssResource as any).type !== 'rss') return { success: false, error: 'RSS 资源不存在' };

      const count = await RssFeedItemsRepo.batchSoftDelete(rssResourceId, itemIds);
      return { success: true, data: { count } };
    } catch (error: any) {
      console.error('[rss:batchIgnoreItems] 批量忽略失败:', error);
      return { success: false, error: error?.message || '批量忽略失败' };
    }
  });

  ipcMain.handle('rss:unignoreItem', async (_event, params: { rssResourceId: string; itemId: string }) => {
    try {
      const { rssResourceId, itemId } = params;
      const rssResource = await ResourcesRepo.getById(rssResourceId);
      if (!rssResource || (rssResource as any).type !== 'rss') return { success: false, error: 'RSS 资源不存在' };

      const rssItemRow = await RssFeedItemsRepo.restoreByResourceAndItemId(rssResourceId, itemId);
      if (!rssItemRow) return { success: false, error: 'RSS 条目不存在' };

      return { success: true, data: dbRowToFeedItem(rssItemRow) };
    } catch (error: any) {
      console.error('[rss:unignoreItem] 恢复失败:', error);
      return { success: false, error: error?.message || '恢复失败' };
    }
  });

  ipcMain.handle('rss:restoreAllIgnored', async (_event, params: { rssResourceId: string }) => {
    try {
      const { rssResourceId } = params;
      const rssResource = await ResourcesRepo.getById(rssResourceId);
      if (!rssResource || (rssResource as any).type !== 'rss') return { success: false, error: 'RSS 资源不存在' };

      const count = await RssFeedItemsRepo.restoreAllByResourceId(rssResourceId);
      return { success: true, data: { count } };
    } catch (error: any) {
      console.error('[rss:restoreAllIgnored] 恢复失败:', error);
      return { success: false, error: error?.message || '恢复失败' };
    }
  });

  ipcMain.handle('rss:getIgnoredItems', async (_event, params: { rssResourceId: string; limit?: number; offset?: number }) => {
    try {
      const { rssResourceId, limit = RSS_FEED_VIEW_LIMIT, offset = 0 } = params;
      const rssResource = await ResourcesRepo.getById(rssResourceId);
      if (!rssResource || (rssResource as any).type !== 'rss') return { success: false, error: 'RSS 资源不存在' };

      const rows = await RssFeedItemsRepo.listIgnoredByResourceId(rssResourceId, limit, offset);
      const totalCount = await RssFeedItemsRepo.countIgnoredByResourceId(rssResourceId);
      const items = rows.map(dbRowToFeedItem);
      return { success: true, data: { items, totalCount } };
    } catch (error: any) {
      console.error('[rss:getIgnoredItems] 获取已忽略条目失败:', error);
      return { success: false, error: error?.message || '获取已忽略条目失败' };
    }
  });

  ipcMain.handle('rss:list', async (_event, params?: { workspaceId?: string }) => {
    try {
      let wsId = params?.workspaceId;
      if (!wsId) {
        const ws = await WorkspacesRepo.getDefault();
        wsId = ws?.id;
      }
      const resources = await ResourcesRepo.list({ type: 'rss', workspaceId: wsId, deletedAt: 0 } as any);
      return { success: true, data: resources };
    } catch (error: any) {
      console.error('[rss:list] 列出失败:', error);
      return { success: false, error: error?.message || '列出失败' };
    }
  });

  ipcMain.handle('rss:delete', async (_event, params: { id: string; hardDelete?: boolean; deleteDownloadedResources?: boolean }) => {
    try {
      const { id, hardDelete = false, deleteDownloadedResources = false } = params;
      const result = await deleteRssResource(id, hardDelete, deleteDownloadedResources);
      return { success: true, data: result };
    } catch (error: any) {
      console.error('[rss:delete] 删除失败:', error);
      return { success: false, error: error?.message || '删除失败' };
    }
  });

  ipcMain.handle('rss:checkAllUpdates', async () => {
    try {
      const ws = await WorkspacesRepo.getDefault();
      const resources = await ResourcesRepo.list({ type: 'rss', workspaceId: ws?.id, deletedAt: 0 } as any);
      const results: Array<{ id: string; hasUpdate: boolean; newItems: number; error?: string }> = [];
      for (const resource of resources) {
        try {
          const result = await syncRssResource(resource, { ignoreFetchInterval: true, queueAutoDownload: true });
          results.push({ id: resource.id, hasUpdate: result.hasUpdate, newItems: result.newItems });
        } catch (error: any) {
          await recordRssSyncError(resource.id, error);
          results.push({ id: resource.id, hasUpdate: false, newItems: 0, error: error?.message });
        }
      }
      return { success: true, data: results };
    } catch (error: any) {
      console.error('[rss:checkAllUpdates] 检查失败:', error);
      return { success: false, error: error?.message || '检查失败' };
    }
  });

  ipcMain.handle('rss:fetchYouTubeHistory', async (_event, params: { resourceId: string; limit?: number; offset?: number; detailed?: boolean }) => {
    try {
      const { resourceId, limit = RSS_FEED_VIEW_LIMIT, offset = 0, detailed = false } = params;
      const resource = await ResourcesRepo.getById(resourceId);
      if (!resource) throw new Error('资源不存在');

      const metadata = parseResourceMetadata(resource);
      if (metadata.sourceType !== 'youtube') throw new Error('仅支持 YouTube 订阅');

      const coveredCount = await getYouTubeHistoryCoverage(resourceId, metadata);
      const effectiveOffset = Math.max(offset, coveredCount);
      if (metadata.historyFullyLoaded) {
        return { success: true, data: { items: [], hasMore: false, nextOffset: effectiveOffset, totalLoaded: effectiveOffset } };
      }

      const result = await cacheYouTubeHistoryPage(resource, metadata, effectiveOffset, limit, detailed);
      return {
        success: true,
        data: {
          items: result.items,
          hasMore: result.hasMore,
          nextOffset: result.nextOffset,
          totalLoaded: result.totalLoaded
        }
      };
    } catch (error: any) {
      console.error('[rss:fetchYouTubeHistory] 获取历史失败:', error);
      return { success: false, error: error?.message || '获取 YouTube 频道历史视频失败' };
    }
  });
}

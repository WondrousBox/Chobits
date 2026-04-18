import { AppEvent, eventManager } from '@packages/event';

import { ResourcesRepo, RssFeedItemsRepo } from '../../db/repositories';
import type { NewRssFeedItem, RssFeedItemRow } from '../../db/schema';
import { downloadManager } from '../downloader';
import { getErrorMessage } from './rss-errors';
import { parseRssFeed } from './rss-feed-parser';
import type {
    RssDownloadErrorCode,
    RssDownloadStatus,
    RssFeed,
    RssFeedItem,
    RssMetadata
} from './types';

/**
 * RSS 同步服务
 *
 * 只做：
 * - 调用解析器获取 feed
 * - 增量去重
 * - 写入条目
 * - 更新订阅同步状态
 * - 触发自动下载判定
 *
 * 不做：
 * - 下载器内部实现
 * - 视图层状态维护
 */

// ── Constants ────────────────────────────────────────────────

const RSS_DOWNLOADED_CHILD_LIMIT = 1000;

// ── Status Patch Helpers ─────────────────────────────────────

export type RssDownloadStatusPatch = {
    downloaded?: boolean;
    localResourceId?: string | null;
    downloadStatus?: RssDownloadStatus;
    downloadProgress?: number | null;
    downloadErrorCode?: RssDownloadErrorCode | null;
    downloadError?: string | null;
    downloadErrorAt?: number | null;
    lastDownloadAt?: number | null;
};

export function createRssDownloadPendingPatch(): RssDownloadStatusPatch {
    return {
        downloaded: false,
        localResourceId: null,
        downloadStatus: 'pending',
        downloadProgress: 0,
        downloadErrorCode: null,
        downloadError: null,
        downloadErrorAt: null
    };
}

export function createRssDownloadFailurePatch(code: RssDownloadErrorCode, message: string): RssDownloadStatusPatch {
    return {
        downloaded: false,
        localResourceId: null,
        downloadStatus: 'error',
        downloadProgress: null,
        downloadErrorCode: code,
        downloadError: message,
        downloadErrorAt: Date.now()
    };
}

// ── Metadata Helpers ─────────────────────────────────────────

export function parseResourceMetadata(resource: any): RssMetadata {
    try {
        return JSON.parse(resource?.metadata || '{}');
    } catch {
        return {};
    }
}

export function applyRssSyncSuccessMetadata(metadata: RssMetadata, now: number): RssMetadata {
    return {
        ...metadata,
        lastCheckedAt: now,
        lastFetchedAt: now,
        lastSucceededAt: now,
        lastSyncStatus: 'success',
        lastError: undefined,
        lastErrorAt: undefined
    };
}

export function applyRssSyncFailureMetadata(metadata: Partial<RssMetadata>, error: unknown, now = Date.now()): Partial<RssMetadata> {
    return {
        ...metadata,
        lastCheckedAt: now,
        lastFailedAt: now,
        lastSyncStatus: 'error',
        lastError: getErrorMessage(error, '获取失败'),
        lastErrorAt: now
    };
}

// ── Download URL Resolution ──────────────────────────────────

export function resolveRssItemDownloadUrl(item: Pick<RssFeedItem, 'mediaUrl' | 'link'>): string | undefined {
    const mediaUrl = typeof item.mediaUrl === 'string' ? item.mediaUrl.trim() : '';
    if (mediaUrl) {
        return mediaUrl;
    }

    const link = typeof item.link === 'string' ? item.link.trim() : '';
    return link || undefined;
}

// ── Row Conversion ───────────────────────────────────────────

export function feedItemToDbRow(rssResourceId: string, item: RssFeedItem): NewRssFeedItem {
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
        downloadErrorCode: item.downloadErrorCode,
        downloadError: item.downloadError,
        downloadErrorAt: item.downloadErrorAt,
        lastDownloadAt: item.lastDownloadAt,
        metadata: item.metadata ? JSON.stringify(item.metadata) : undefined
    };
}

export function dbRowToFeedItem(row: RssFeedItemRow): RssFeedItem {
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
        downloadErrorCode: (row as any).downloadErrorCode ?? undefined,
        downloadError: (row as any).downloadError ?? undefined,
        downloadErrorAt: (row as any).downloadErrorAt ?? undefined,
        lastDownloadAt: (row as any).lastDownloadAt ?? undefined,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
}

// ── Feed Query Helpers ───────────────────────────────────────

export async function buildCachedRssFeed(resource: any, metadata: RssMetadata, limit: number, offset: number): Promise<RssFeed> {
    const cachedRows = await RssFeedItemsRepo.listByResourceId(resource.id, limit, offset);
    const totalItems = await RssFeedItemsRepo.countByResourceId(resource.id);
    const items = cachedRows.map(dbRowToFeedItem);

    return {
        title: resource.title || '',
        description: resource.description,
        feedUrl: metadata.feedUrl || '',
        image: resource.previewUrl,
        author: resource.authorName,
        items,
        totalItems,
        hasMore: offset + items.length < totalItems
    };
}

export async function getDownloadedRssItemMap(rssResourceId: string): Promise<{ downloadedIds: Set<string>; downloadedMap: Map<string, string> }> {
    const downloadedResources = await ResourcesRepo.listChildren(rssResourceId, RSS_DOWNLOADED_CHILD_LIMIT, 0);
    const downloadedMap = new Map<string, string>();
    const downloadedIds = new Set<string>();

    downloadedResources.forEach((child: any) => {
        try {
            const childMetadata = JSON.parse(child.metadata || '{}');
            if (childMetadata.itemId) {
                downloadedIds.add(childMetadata.itemId);
                downloadedMap.set(childMetadata.itemId, child.id);
            }
        } catch {
            // ignore parse error
        }
    });

    return { downloadedIds, downloadedMap };
}

function getNewFeedItems(feed: RssFeed, latestItemId?: string): RssFeedItem[] {
    if (!feed.items.length || !latestItemId) {
        return [];
    }

    const latestIdx = feed.items.findIndex((item) => item.id === latestItemId);
    return latestIdx === -1 ? feed.items : feed.items.slice(0, latestIdx);
}

// ── Core Sync ────────────────────────────────────────────────

export async function recordRssSyncError(resourceId: string, error: unknown): Promise<void> {
    try {
        const resource = await ResourcesRepo.getById(resourceId);
        if (!resource) {
            return;
        }

        const metadata = applyRssSyncFailureMetadata(parseResourceMetadata(resource), error);

        await ResourcesRepo.update(resourceId, {
            metadata: JSON.stringify(metadata)
        } as any);
    } catch {
        // ignore error logging failure
    }
}

export async function syncRssResource(
    resource: any,
    options: {
        ignoreFetchInterval?: boolean;
        ignoreEnabled?: boolean;
        queueAutoDownload?: boolean;
    } = {}
): Promise<{ hasUpdate: boolean; newItems: number; skipped?: boolean }> {
    const metadata = parseResourceMetadata(resource);

    if ((!options.ignoreEnabled && metadata.enabled === false) || !metadata.feedUrl) {
        return { hasUpdate: false, newItems: 0, skipped: true };
    }

    const now = Date.now();
    const fetchIntervalMs = (metadata.fetchInterval || 60) * 60 * 1000;
    if (!options.ignoreFetchInterval && metadata.lastFetchedAt && now - metadata.lastFetchedAt < fetchIntervalMs) {
        return { hasUpdate: false, newItems: 0, skipped: true };
    }

    const feed = await parseRssFeed(metadata.feedUrl, metadata.sourceType);
    const hasUpdate = feed.items.length > 0 && feed.items[0].id !== metadata.latestItemId;
    const newFeedItems = hasUpdate ? getNewFeedItems(feed, metadata.latestItemId) : [];

    const { downloadedIds, downloadedMap } = await getDownloadedRssItemMap(resource.id);

    feed.items = feed.items.map((item) => ({
        ...item,
        downloaded: downloadedIds.has(item.id),
        localResourceId: downloadedMap.get(item.id)
    }));

    if (feed.items.length > 0) {
        const dbRows = feed.items.map((item) => feedItemToDbRow(resource.id, item));
        await RssFeedItemsRepo.bulkUpsert(dbRows);

        if (downloadedIds.size > 0) {
            await RssFeedItemsRepo.batchUpdateDownloadStatus(resource.id, Array.from(downloadedIds), downloadedMap);
        }
    }

    const updatedMetadata: RssMetadata = {
        ...applyRssSyncSuccessMetadata(metadata, now),
        itemCount: feed.totalItems
    };

    if (feed.items.length > 0) {
        updatedMetadata.latestItemId = feed.items[0].id;
        updatedMetadata.latestItemPublishedAt = feed.items[0].publishedAt;
    }

    await ResourcesRepo.update(resource.id, {
        metadata: JSON.stringify(updatedMetadata),
        updatedAt: now
    } as any);

    if (options.queueAutoDownload && metadata.autoDownload && newFeedItems.length > 0) {
        const targetFolderId = metadata.downloadFolderId || resource.folderId;

        for (const item of [...newFeedItems].reverse()) {
            if (downloadedIds.has(item.id)) {
                continue;
            }

            const downloadUrl = resolveRssItemDownloadUrl(item);
            if (!downloadUrl) {
                await RssFeedItemsRepo.updateDownloadStatus(resource.id, item.id, createRssDownloadFailurePatch('download_no_url', '该 RSS 条目缺少可下载地址'));
                console.warn('[rss:autoDownload] Missing download URL for RSS item:', resource.id, item.id);
                continue;
            }

            await RssFeedItemsRepo.updateDownloadStatus(resource.id, item.id, createRssDownloadPendingPatch());

            try {
                await downloadManager.addTask({
                    url: downloadUrl,
                    qualityMode: metadata.downloadQuality || 'best',
                    folderId: targetFolderId,
                    parentResourceId: resource.id,
                    metadata: {
                        itemId: item.id,
                        rssResourceId: resource.id
                    }
                });
            } catch (error) {
                await RssFeedItemsRepo.updateDownloadStatus(resource.id, item.id, createRssDownloadFailurePatch('download_queue_failed', getErrorMessage(error, '加入下载队列失败')));
                console.error('[rss:autoDownload] Failed to queue RSS item:', resource.id, item.id, error);
            }
        }
    }

    if (newFeedItems.length > 0) {
        eventManager.emit(AppEvent.SPRITE_RSS_NEW_CONTENT, { message: `RSS 更新了 ${newFeedItems.length} 条内容` });
    }

    return {
        hasUpdate,
        newItems: newFeedItems.length
    };
}

// ── Background Auto-Check ────────────────────────────────────

const RSS_BACKGROUND_CHECK_INTERVAL_MS = 60 * 1000;

let rssAutoCheckTimer: NodeJS.Timeout | null = null;
let rssAutoCheckRunning = false;

async function runRssAutoCheck(): Promise<void> {
    if (rssAutoCheckRunning) {
        return;
    }

    rssAutoCheckRunning = true;
    try {
        const resources = await ResourcesRepo.list({
            type: 'rss',
            deletedAt: 0
        } as any);

        for (const resource of resources) {
            try {
                await syncRssResource(resource, { queueAutoDownload: true });
            } catch (error) {
                console.error('[rss:autoCheck] Failed to sync resource:', resource.id, error);
                await recordRssSyncError(resource.id, error);
            }
        }
    } finally {
        rssAutoCheckRunning = false;
    }
}

export function startRssAutoCheck(): void {
    if (!rssAutoCheckTimer) {
        rssAutoCheckTimer = setInterval(() => {
            void runRssAutoCheck();
        }, RSS_BACKGROUND_CHECK_INTERVAL_MS);
        rssAutoCheckTimer.unref?.();
        void runRssAutoCheck();
    }
}

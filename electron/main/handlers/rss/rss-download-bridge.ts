import { ResourcesRepo, RssFeedItemsRepo } from '../../db/repositories';
import { createRssDownloadFailurePatch, dbRowToFeedItem, findDownloadedResourceForRssItem, resolveRssItemDownloadUrl } from './rss-sync-service';
import type { DownloadRssItemParams, RssMetadata } from './types';

/**
 * RSS 下载桥接模块
 *
 * 只做：
 * - 根据条目和订阅设置决定下载地址和下载模式
 * - 组装下载任务 metadata
 * - 接收下载器结果并回写 RSS 条目终态
 *
 * 不做：
 * - 下载器内部实现
 * - 条目同步逻辑
 */

export interface RssDownloadTarget {
  url: string;
  filename?: string;
  quality: string;
  folderId?: string;
  thumbnailUrl?: string;
  parentResourceId: string;
  metadata: {
    itemId: string;
    rssResourceId: string;
    mediaType?: string;
    mediaFormat?: string;
    thumbnailUrl?: string;
  };
}

/**
 * 为手动下载准备下载目标信息。
 * 如果条目缺少下载地址，会回写错误状态并返回错误。
 */
export async function prepareDownloadTarget(params: DownloadRssItemParams): Promise<{ success: boolean; data?: RssDownloadTarget; error?: string }> {
  const { rssResourceId, itemId, quality, folderId } = params;

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

  const downloadQuality = quality || metadata.downloadQuality || 'best';
  const targetFolderId = folderId || (rssResource as any).folderId || metadata.downloadFolderId;

  const rssItemRow = await RssFeedItemsRepo.getByResourceAndItemId(rssResourceId, itemId);
  if (!rssItemRow) {
    return { success: false, error: 'RSS 条目不存在' };
  }

  const rssItem = dbRowToFeedItem(rssItemRow);
  const existingResourceId = await findDownloadedResourceForRssItem(rssResource, rssItem);
  if (existingResourceId) {
    await RssFeedItemsRepo.updateDownloadStatus(rssResourceId, itemId, {
      downloaded: true,
      localResourceId: existingResourceId,
      downloadStatus: 'completed',
      downloadProgress: 100,
      downloadErrorCode: null,
      downloadError: null,
      downloadErrorAt: null,
      lastDownloadAt: Date.now()
    });
    return { success: false, error: '该条目已在当前订阅所在文件夹下载' };
  }

  const downloadUrl = resolveRssItemDownloadUrl(rssItem);
  if (!downloadUrl) {
    await RssFeedItemsRepo.updateDownloadStatus(rssResourceId, itemId, createRssDownloadFailurePatch('download_no_url', '该 RSS 条目缺少可下载地址'));
    return { success: false, error: '该 RSS 条目缺少可下载地址' };
  }

  return {
    success: true,
    data: {
      url: downloadUrl,
      filename: rssItem.title,
      quality: downloadQuality,
      folderId: targetFolderId,
      thumbnailUrl: rssItem.thumbnail,
      parentResourceId: rssResourceId,
      metadata: {
        itemId,
        rssResourceId,
        mediaType: rssItem.mediaType || 'other',
        mediaFormat: rssItem.mediaFormat || '',
        thumbnailUrl: rssItem.thumbnail
      }
    }
  };
}

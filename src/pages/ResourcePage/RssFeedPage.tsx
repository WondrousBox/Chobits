import type { RssFeed, RssFeedItem, RssMetadata } from '@main/handlers/rss/types';
import type { RssFeedResponse } from '@main/handlers/rss/types';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  TbArrowLeft,
  TbCheck,
  TbClock,
  TbDownload,
  TbExternalLink,
  TbEye,
  TbEyeOff,
  TbHistory,
  TbLoader2,
  TbPlayerPlay,
  TbRefresh,
  TbReload,
  TbRestore,
  TbRss,
  TbSearch,
  TbSettings,
  TbUsers
} from 'react-icons/tb';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { makeResSrc } from './utils/resourceProtocol';

interface RssResourceInfo {
  id: string;
  title?: string;
  description?: string;
  previewUrl?: string;
  thumbnailPath?: string;
  metadata?: string;
  url?: string;
  favorite?: number;
}

interface DownloadTaskEvent {
  id: string;
  status: 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';
  parentResourceId?: string;
  error?: string;
  progress?: {
    percent?: number;
    [key: string]: unknown;
  };
  result?: {
    resourceId?: string;
    resource?: {
      id?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  metadata?: {
    itemId?: string;
    parentResourceId?: string;
    rssResourceId?: string;
    [key: string]: unknown;
  };
}

const RSS_FEED_PAGE_SIZE = 200;

type RssItemFilter = 'all' | 'undownloaded' | 'downloading' | 'downloaded' | 'failed' | 'cancelled' | 'ignored';
type RssMediaTypeFilter = 'all' | NonNullable<RssFeedItem['mediaType']>;
type RssItemSort = 'published_desc' | 'published_asc' | 'updated_desc' | 'updated_asc';

interface DownloadItemStartOptions {
  silentStartToast?: boolean;
  suppressErrorToast?: boolean;
}

interface DownloadItemStartResult {
  success: boolean;
  error?: string;
}

function getRssDownloadFailureMessage(task: Pick<DownloadTaskEvent, 'status' | 'error'>): string {
  if (task.status === 'cancelled') {
    return '下载已取消';
  }

  const raw = task.error?.trim();
  if (!raw) {
    return '下载失败';
  }

  if (raw.includes('could not be added to the library')) {
    return '文件已下载，但加入资源库失败';
  }

  return raw;
}

function getFeedItemDownloadFailureMessage(item: Pick<RssFeedItem, 'downloadStatus' | 'downloadError'>, messageOverride?: string): string | undefined {
  const override = messageOverride?.trim();
  if (override) {
    return override;
  }

  if (item.downloadStatus === 'cancelled') {
    return '下载已取消';
  }

  const raw = item.downloadError?.trim();
  if (!raw) {
    return item.downloadStatus === 'error' ? '下载失败' : undefined;
  }

  if (raw.includes('could not be added to the library')) {
    return '文件已下载，但加入资源库失败';
  }

  return raw;
}

function getRssDownloadFailureBadgeText(status?: RssFeedItem['downloadStatus'], message?: string): string {
  if (status === 'cancelled') {
    return '已取消';
  }

  if (!message) {
    return '下载失败';
  }

  if (message.includes('加入资源库失败')) {
    return '入库失败';
  }
  if (message.includes('已取消')) {
    return '已取消';
  }

  return '下载失败';
}

function getRssSyncStatusPresentation(
  metadata: RssMetadata,
  refreshing: boolean
): {
  label: string;
  className: string;
} {
  if (refreshing) {
    return { label: '同步中', className: 'bg-blue-500/10 text-blue-600 border border-blue-500/20' };
  }

  if (metadata.enabled === false) {
    return { label: '已停用', className: 'bg-muted text-muted-foreground border border-border' };
  }

  if (metadata.lastSyncStatus === 'error') {
    return { label: '同步失败', className: 'bg-red-500/10 text-red-600 border border-red-500/20' };
  }

  if (metadata.lastSyncStatus === 'success') {
    return { label: '正常', className: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' };
  }

  return { label: '未同步', className: 'bg-amber-500/10 text-amber-700 border border-amber-500/20' };
}

function isRssItemRetryable(item: Pick<RssFeedItem, 'downloadStatus' | 'downloaded'>): boolean {
  if (item.downloaded) {
    return false;
  }

  return item.downloadStatus === 'error' || item.downloadStatus === 'cancelled';
}

function matchesRssItemFilter(item: RssFeedItem, filter: RssItemFilter): boolean {
  switch (filter) {
    case 'undownloaded':
      return !item.downloaded && !item.downloadStatus;
    case 'downloading':
      return item.downloadStatus === 'pending' || item.downloadStatus === 'downloading';
    case 'downloaded':
      return !!item.downloaded || item.downloadStatus === 'completed';
    case 'failed':
      return item.downloadStatus === 'error';
    case 'cancelled':
      return item.downloadStatus === 'cancelled';
    case 'all':
    default:
      return true;
  }
}

function matchesRssMediaTypeFilter(item: RssFeedItem, filter: RssMediaTypeFilter): boolean {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'other') {
    return !item.mediaType || item.mediaType === 'other';
  }

  return item.mediaType === filter;
}

function getRssMediaTypeFilterLabel(filter: RssMediaTypeFilter): string {
  switch (filter) {
    case 'video':
      return '视频';
    case 'audio':
      return '音频';
    case 'article':
      return '文章';
    case 'image':
      return '图片';
    case 'other':
      return '其他';
    case 'all':
    default:
      return '全部类型';
  }
}

function getRssItemFilterEmptyText(filter: RssItemFilter, mediaTypeFilter: RssMediaTypeFilter, hasSearchQuery: boolean): string {
  if (hasSearchQuery) {
    return '没有找到匹配的内容';
  }

  if (mediaTypeFilter !== 'all' && filter === 'all') {
    return `暂无${getRssMediaTypeFilterLabel(mediaTypeFilter)}内容`;
  }

  if (mediaTypeFilter !== 'all') {
    return `当前筛选条件下暂无${getRssMediaTypeFilterLabel(mediaTypeFilter)}内容`;
  }

  switch (filter) {
    case 'undownloaded':
      return '暂无未下载内容';
    case 'downloading':
      return '暂无下载中的内容';
    case 'downloaded':
      return '暂无已下载内容';
    case 'failed':
      return '暂无下载失败内容';
    case 'cancelled':
      return '暂无已取消内容';
    case 'ignored':
      return '暂无已忽略内容';
    case 'all':
    default:
      return '暂无内容';
  }
}

function getRssItemSortTimestamp(item: Pick<RssFeedItem, 'publishedAt' | 'updatedAt'>, sort: RssItemSort): number {
  if (sort === 'updated_desc' || sort === 'updated_asc') {
    return item.updatedAt ?? item.publishedAt ?? 0;
  }

  return item.publishedAt ?? item.updatedAt ?? 0;
}

function sortRssItems(items: RssFeedItem[], sort: RssItemSort): RssFeedItem[] {
  const direction = sort === 'published_asc' || sort === 'updated_asc' ? 1 : -1;

  return [...items].sort((left, right) => {
    const primaryDiff = getRssItemSortTimestamp(left, sort) - getRssItemSortTimestamp(right, sort);
    if (primaryDiff !== 0) {
      return primaryDiff * direction;
    }

    const publishedDiff = (right.publishedAt ?? 0) - (left.publishedAt ?? 0);
    if (publishedDiff !== 0) {
      return publishedDiff;
    }

    return left.title.localeCompare(right.title, 'zh-CN');
  });
}

function openExternalUrl(url?: string | null): void {
  const target = url?.trim();
  if (!target) return;

  void window.YUA.system['app:openExternalUrl'](target)
    .then((result) => {
      if (!result.ok) {
        toast.error('打开失败', { description: result.error });
      }
    })
    .catch((error: unknown) => {
      toast.error('打开失败', { description: error instanceof Error ? error.message : String(error) });
    });
}

const RssFeedPage: React.FC = () => {
  const { resourceId } = useParams<{ resourceId: string }>();
  const navigate = useNavigate();

  const [resource, setResource] = useState<RssResourceInfo | null>(null);
  const [feed, setFeed] = useState<RssFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<RssItemFilter>('all');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<RssMediaTypeFilter>('all');
  const [sortBy, setSortBy] = useState<RssItemSort>('published_desc');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [downloadingItems, setDownloadingItems] = useState<Set<string>>(new Set());
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});
  const [retryingFailedItems, setRetryingFailedItems] = useState(false);
  const [loadingMoreFeed, setLoadingMoreFeed] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [ignoredItems, setIgnoredItems] = useState<RssFeedItem[]>([]);
  const [ignoredCount, setIgnoredCount] = useState(0);
  const [loadingIgnored, setLoadingIgnored] = useState(false);
  const [restoringAll, setRestoringAll] = useState(false);
  const downloadTaskItemMapRef = useRef<Map<string, string>>(new Map());

  // 解析 metadata
  const metadata: RssMetadata = useMemo(() => {
    try {
      return JSON.parse(resource?.metadata || '{}');
    } catch {
      return {} as RssMetadata;
    }
  }, [resource?.metadata]);

  const handleOpenSourcePage = useCallback(() => {
    openExternalUrl(metadata.channelUrl || resource?.url);
  }, [metadata.channelUrl, resource?.url]);

  const [settingsForm, setSettingsForm] = useState({
    enabled: true,
    autoDownload: false,
    downloadQuality: '1080p',
    downloadIntervalSeconds: 30,
    fetchInterval: 60
  });

  // 加载资源信息
  const loadResource = useCallback(async () => {
    if (!resourceId) return;
    try {
      const res = await window.YUA.resource['getResource']({ id: resourceId });
      if (res) {
        setResource(res as RssResourceInfo);
        try {
          const meta = JSON.parse(res.metadata || '{}');
          setSettingsForm({
            enabled: meta.enabled !== false,
            autoDownload: meta.autoDownload || false,
            downloadQuality: meta.downloadQuality || '1080p',
            downloadIntervalSeconds: meta.downloadIntervalSeconds || 30,
            fetchInterval: meta.fetchInterval || 60
          });
        } catch {
          // ignore parse error
        }
      }
    } catch (error) {
      console.error('加载资源失败:', error);
    }
  }, [resourceId]);

  // 加载 Feed 内容
  const loadFeed = useCallback(
    async (forceRefresh = false): Promise<RssFeedResponse | undefined> => {
      if (!resourceId) return undefined;
      setLoading(true);
      try {
        const result = await window.YUA.rss.fetchFeed({
          resourceId,
          forceRefresh,
          pageSize: RSS_FEED_PAGE_SIZE,
          pageToken: '0'
        });
        if (result.success && result.data) {
          if (forceRefresh) {
            setFeed((prev) => {
              if (!prev) return result.data!;

              const incomingIds = new Set(result.data!.items.map((item) => item.id));
              const preservedItems = prev.items.filter((item) => !incomingIds.has(item.id));

              return {
                ...result.data!,
                hasMore: result.data!.hasMore || prev.hasMore,
                totalItems: Math.max(result.data!.totalItems || 0, prev.totalItems || 0),
                items: [...result.data!.items, ...preservedItems]
              };
            });
          } else {
            setFeed(result.data);
          }
        } else {
          toast.error('加载失败', { description: result.error });
        }
        return result;
      } catch (error: any) {
        const message = error?.message || '加载失败';
        toast.error('加载失败', { description: message });
        return { success: false, error: message };
      } finally {
        await loadResource();
        setLoading(false);
      }
    },
    [resourceId, loadResource]
  );

  const loadCachedFeed = useCallback(
    async (options: { keepLoading?: boolean } = {}): Promise<boolean> => {
      if (!resourceId) return false;

      try {
        const result = await window.YUA.rss.getCachedFeed({
          resourceId,
          limit: RSS_FEED_PAGE_SIZE,
          offset: 0
        });

        if (result.success && result.data) {
          const hasMeaningfulCache = (result.data.items?.length || 0) > 0 || !!result.lastFetchedAt;
          if (hasMeaningfulCache) {
            setFeed(result.data);
            if (!options.keepLoading) {
              setLoading(false);
            }
            return true;
          }
        }
      } catch (error) {
        console.warn('Failed to load cached RSS feed:', error);
      }

      return false;
    },
    [resourceId]
  );

  const refreshFeedInBackground = useCallback(async () => {
    if (!resourceId) return;
    try {
      const result = await window.YUA.rss.fetchFeed({
        resourceId,
        pageSize: RSS_FEED_PAGE_SIZE,
        pageToken: '0'
      });
      if (result.success && result.data) {
        setFeed(result.data);
      }
    } catch (error) {
      console.warn('Failed to refresh RSS feed in background:', error);
    } finally {
      await loadResource();
      setLoading(false);
    }
  }, [resourceId, loadResource]);

  const applyDownloadStateToFeed = useCallback((itemId: string, patch: Partial<RssFeedItem>) => {
    setFeed((prev) => {
      if (!prev) return prev;

      let changed = false;
      const items = prev.items.map((item) => {
        if (item.id !== itemId) return item;
        changed = true;
        return { ...item, ...patch };
      });

      return changed ? { ...prev, items } : prev;
    });
  }, []);

  const handleLoadMoreFeed = useCallback(async () => {
    if (!resourceId || !feed || !feed.hasMore || loadingMoreFeed) return;

    setLoadingMoreFeed(true);
    try {
      const result = await window.YUA.rss.getCachedFeed({
        resourceId,
        limit: RSS_FEED_PAGE_SIZE,
        offset: feed.items.length
      });

      if (result.success && result.data) {
        setFeed((prev) => {
          if (!prev) return result.data!;

          const existingIds = new Set(prev.items.map((item) => item.id));
          const nextItems = result.data!.items.filter((item) => !existingIds.has(item.id));

          return {
            ...result.data!,
            items: [...prev.items, ...nextItems]
          };
        });
      } else {
        toast.error('加载失败', { description: result.error });
      }
    } catch (error: any) {
      toast.error('加载失败', { description: error?.message });
    } finally {
      setLoadingMoreFeed(false);
    }
  }, [resourceId, feed, loadingMoreFeed]);

  // 刷新 Feed
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    const result = await loadFeed(true);
    setRefreshing(false);
    if (!result?.success) {
      return;
    }
    if (result.error) {
      toast.error('刷新失败，已显示缓存', { description: result.error });
      return;
    }
    toast.success('刷新成功');
  }, [loadFeed]);

  const handleReloadSubscription = useCallback(async () => {
    if (!resourceId || reloading) return;
    const confirmed = window.confirm('重载订阅会清空这个订阅的条目缓存并重新拉取列表，不会删除已下载的视频资源。继续吗？');
    if (!confirmed) return;

    setReloading(true);
    setLoading(true);
    try {
      const result = await window.YUA.rss.reload({
        resourceId,
        pageSize: RSS_FEED_PAGE_SIZE
      });

      if (result.success && result.data) {
        setFeed(result.data);
        setIgnoredItems([]);
        setIgnoredCount(0);
        setStatusFilter('all');
        setHistoryOffset(result.data.totalItems || result.data.items.length || 0);
        setHasMoreHistory(result.data.hasMore !== false);
        toast.success('重载完成', {
          description: `已移除 ${result.deletedFeedCount || 0} 条订阅缓存并重新拉取列表`
        });
      } else {
        toast.error('重载失败', { description: result.error });
      }
    } catch (error: any) {
      toast.error('重载失败', { description: error?.message });
    } finally {
      await loadResource();
      setLoading(false);
      setReloading(false);
    }
  }, [resourceId, reloading, loadResource]);

  // 加载历史视频（仅 YouTube）
  // 获取到的数据会自动存入数据库，下次进入页面时会从缓存加载
  const handleLoadHistory = useCallback(
    async (limit: number = 50) => {
      if (!resourceId || metadata.sourceType !== 'youtube') return;

      if (!hasMoreHistory) {
        toast.info('没有更多历史视频了');
        return;
      }

      setLoadingHistory(true);
      try {
        const nextHistoryOffset = Math.max(historyOffset, metadata.historyLoadedCount || 0, feed?.totalItems || 0, feed?.items.length || 0);
        const result = await window.YUA.rss.fetchYouTubeHistory({
          resourceId,
          limit,
          offset: nextHistoryOffset
        });

        if (result.success && result.data) {
          const { items, hasMore, nextOffset, totalLoaded } = result.data;

          if (items.length > 0) {
            await loadCachedFeed();
            await loadResource();
            setHistoryOffset(nextOffset);
            setHasMoreHistory(hasMore);
            toast.success(`已加载 ${items.length} 个历史视频，共 ${totalLoaded} 条`);
          } else {
            await loadResource();
            setHasMoreHistory(false);
            toast.info('没有更多历史视频了');
          }
        } else {
          toast.error('加载失败', { description: result.error });
        }
      } catch (error: any) {
        toast.error('加载历史失败', { description: error?.message });
      } finally {
        setLoadingHistory(false);
      }
    },
    [resourceId, metadata.sourceType, metadata.historyLoadedCount, feed?.totalItems, feed?.items.length, historyOffset, hasMoreHistory, loadCachedFeed, loadResource]
  );

  const startDownloadForItem = useCallback(
    async (item: RssFeedItem, options: DownloadItemStartOptions = {}): Promise<DownloadItemStartResult> => {
      if (!resourceId) {
        return { success: false, error: 'RSS 资源不存在' };
      }

      let response: DownloadItemStartResult = { success: false, error: '下载失败' };
      setDownloadingItems((prev) => new Set(prev).add(item.id));
      setDownloadErrors((prev) => {
        if (!(item.id in prev)) return prev;
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      let taskStarted = false;

      try {
        const result = await window.YUA.rss.downloadItem({
          rssResourceId: resourceId,
          itemId: item.id
        });

        if (result.success && result.data) {
          const downloadResult = await window.YUA.videoDownloader.downloadVideo({
            url: result.data.url,
            filename: result.data.filename || item.title,
            thumbnailUrl: result.data.thumbnailUrl,
            quality: Number.isFinite(parseInt(result.data.quality, 10)) ? parseInt(result.data.quality, 10) : undefined,
            qualityMode: result.data.quality,
            folderId: result.data.folderId,
            parentResourceId: result.data.parentResourceId,
            metadata: {
              ...result.data.metadata,
              parentResourceId: result.data.parentResourceId
            }
          });

          if (downloadResult?.success && downloadResult.data?.taskId) {
            taskStarted = true;
            downloadTaskItemMapRef.current.set(downloadResult.data.taskId, item.id);
            if (!options.silentStartToast) {
              toast.success('开始下载', { description: item.title });
            }
            response = { success: true };
          } else {
            const errorMessage = downloadResult?.error || '下载失败';
            if (!options.suppressErrorToast) {
              toast.error('下载失败', { description: errorMessage });
            }
            response = { success: false, error: errorMessage };
          }
        } else {
          const errorMessage = result.error || '下载失败';
          if (!options.suppressErrorToast) {
            toast.error('下载失败', { description: errorMessage });
          }
          response = { success: false, error: errorMessage };
        }
      } catch (error: any) {
        const errorMessage = error?.message || '下载失败';
        if (!options.suppressErrorToast) {
          toast.error('下载失败', { description: errorMessage });
        }
        response = { success: false, error: errorMessage };
      } finally {
        if (!taskStarted) {
          setDownloadingItems((prev) => {
            const next = new Set(prev);
            next.delete(item.id);
            return next;
          });
        }
      }

      return response;
    },
    [resourceId]
  );

  // 下载单个条目
  const handleDownloadItem = useCallback(
    async (item: RssFeedItem) => {
      await startDownloadForItem(item);
    },
    [startDownloadForItem]
  );

  const handleIgnoreItem = useCallback(
    async (item: RssFeedItem) => {
      if (!resourceId) return;

      try {
        const result = await window.YUA.rss.ignoreItem({
          rssResourceId: resourceId,
          itemId: item.id
        });

        if (result.success) {
          setFeed((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              items: prev.items.filter((feedItem) => feedItem.id !== item.id)
            };
          });
          setIgnoredCount((prev) => prev + 1);
          toast.success('已忽略条目', { description: item.title });
        } else {
          toast.error('忽略失败', { description: result.error });
        }
      } catch (error: any) {
        toast.error('忽略失败', { description: error?.message });
      }
    },
    [resourceId]
  );

  const loadIgnoredItems = useCallback(async () => {
    if (!resourceId) return;
    setLoadingIgnored(true);
    try {
      const result = await window.YUA.rss.getIgnoredItems({ rssResourceId: resourceId });
      if (result.success && result.data) {
        setIgnoredItems(result.data.items);
        setIgnoredCount(result.data.totalCount);
      }
    } catch (error) {
      console.warn('Failed to load ignored items:', error);
    } finally {
      setLoadingIgnored(false);
    }
  }, [resourceId]);

  const handleUnignoreItem = useCallback(
    async (item: RssFeedItem) => {
      if (!resourceId) return;
      try {
        const result = await window.YUA.rss.unignoreItem({ rssResourceId: resourceId, itemId: item.id });
        if (result.success) {
          setIgnoredItems((prev) => prev.filter((i) => i.id !== item.id));
          setIgnoredCount((prev) => Math.max(0, prev - 1));
          if (result.data) {
            setFeed((prev) => {
              if (!prev) return prev;
              return { ...prev, items: [...prev.items, result.data!] };
            });
          }
          toast.success('已恢复条目', { description: item.title });
        } else {
          toast.error('恢复失败', { description: result.error });
        }
      } catch (error: any) {
        toast.error('恢复失败', { description: error?.message });
      }
    },
    [resourceId]
  );

  const handleRestoreAllIgnored = useCallback(async () => {
    if (!resourceId || restoringAll) return;
    setRestoringAll(true);
    try {
      const result = await window.YUA.rss.restoreAllIgnored({ rssResourceId: resourceId });
      if (result.success && result.data) {
        toast.success(`已恢复 ${result.data.count} 个条目`);
        setIgnoredItems([]);
        setIgnoredCount(0);
        setStatusFilter('all');
        await loadCachedFeed();
      } else {
        toast.error('恢复全部失败', { description: result.error });
      }
    } catch (error: any) {
      toast.error('恢复全部失败', { description: error?.message });
    } finally {
      setRestoringAll(false);
    }
  }, [resourceId, restoringAll, loadCachedFeed]);

  const filteredItems = useMemo(() => {
    if (statusFilter === 'ignored') {
      const query = searchQuery.trim().toLowerCase();
      if (!query) return ignoredItems;
      return ignoredItems.filter((item) => item.title.toLowerCase().includes(query) || item.description?.toLowerCase().includes(query) || item.author?.toLowerCase().includes(query));
    }

    const items = feed?.items || [];
    if (items.length === 0) return [];
    const query = searchQuery.trim().toLowerCase();
    const visibleItems = items.filter((item) => {
      if (!matchesRssItemFilter(item, statusFilter)) {
        return false;
      }

      if (!matchesRssMediaTypeFilter(item, mediaTypeFilter)) {
        return false;
      }

      if (!query) {
        return true;
      }

      return item.title.toLowerCase().includes(query) || item.description?.toLowerCase().includes(query) || item.author?.toLowerCase().includes(query);
    });

    return sortRssItems(visibleItems, sortBy);
  }, [feed?.items, ignoredItems, mediaTypeFilter, searchQuery, sortBy, statusFilter]);

  const handleBatchIgnore = useCallback(async () => {
    if (!resourceId) return;
    const ignorableItems = filteredItems.filter((item) => !item.downloaded && !downloadingItems.has(item.id));
    if (ignorableItems.length === 0) {
      toast.info('当前筛选结果中没有可忽略的条目');
      return;
    }

    const itemIds = ignorableItems.map((item) => item.id);
    try {
      const result = await window.YUA.rss.batchIgnoreItems({ rssResourceId: resourceId, itemIds });
      if (result.success && result.data) {
        const ignoredSet = new Set(itemIds);
        setFeed((prev) => {
          if (!prev) return prev;
          return { ...prev, items: prev.items.filter((item) => !ignoredSet.has(item.id)) };
        });
        setIgnoredCount((prev) => prev + result.data!.count);
        toast.success(`已忽略 ${result.data.count} 个条目`);
      } else {
        toast.error('批量忽略失败', { description: result.error });
      }
    } catch (error: any) {
      toast.error('批量忽略失败', { description: error?.message });
    }
  }, [resourceId, filteredItems, downloadingItems]);

  // 保存设置
  const handleSaveSettings = useCallback(async () => {
    if (!resourceId) return;
    try {
      const result = await window.YUA.rss.update({
        id: resourceId,
        enabled: settingsForm.enabled,
        autoDownload: settingsForm.autoDownload,
        downloadQuality: settingsForm.downloadQuality,
        downloadIntervalSeconds: settingsForm.downloadIntervalSeconds,
        fetchInterval: settingsForm.fetchInterval
      });

      if (result.success) {
        toast.success('设置已保存');
        setSettingsOpen(false);
        loadResource();
      } else {
        toast.error('保存失败', { description: result.error });
      }
    } catch (error: any) {
      toast.error('保存失败', { description: error?.message });
    }
  }, [resourceId, settingsForm, loadResource]);

  const handleOpenLocalResource = useCallback(
    (localResourceId: string) => {
      navigate(`/resources/preview/${encodeURIComponent(localResourceId)}`);
    },
    [navigate]
  );

  const hasActiveItemFilters = searchQuery.trim().length > 0 || statusFilter !== 'all' || mediaTypeFilter !== 'all';

  const handleResetItemFilters = useCallback(() => {
    setSearchQuery('');
    setStatusFilter('all');
    setMediaTypeFilter('all');
  }, []);

  const retryableFilteredItems = useMemo(
    () =>
      filteredItems.filter((item) => {
        if (!isRssItemRetryable(item)) {
          return false;
        }

        return !downloadingItems.has(item.id);
      }),
    [filteredItems, downloadingItems]
  );

  const handleRetryFilteredItems = useCallback(async () => {
    if (retryingFailedItems) {
      return;
    }

    if (retryableFilteredItems.length === 0) {
      toast.info('当前筛选结果中没有可重试的条目');
      return;
    }

    setRetryingFailedItems(true);

    let queuedCount = 0;
    let failedCount = 0;

    try {
      for (const item of retryableFilteredItems) {
        const result = await startDownloadForItem(item, {
          silentStartToast: true,
          suppressErrorToast: true
        });

        if (result.success) {
          queuedCount += 1;
        } else {
          failedCount += 1;
        }
      }
    } finally {
      setRetryingFailedItems(false);
    }

    if (queuedCount > 0) {
      toast.success(`已开始重试 ${queuedCount} 条内容`, {
        description: failedCount > 0 ? `${failedCount} 条未能加入下载队列` : undefined
      });
      return;
    }

    toast.error('批量重试失败', {
      description: failedCount > 0 ? '当前筛选结果中的条目未能重新加入下载队列' : undefined
    });
  }, [retryableFilteredItems, retryingFailedItems, startDownloadForItem]);

  // 是否为 YouTube 订阅
  const isYouTube = metadata.sourceType === 'youtube';

  const formatTime = useCallback((timestamp?: number): string => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - timestamp;

    if (diff < 60 * 1000) return '刚刚';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))} 分钟前`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))} 小时前`;
    if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / (24 * 60 * 60 * 1000))} 天前`;

    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }, []);

  const formatDuration = useCallback((ms?: number): string => {
    if (!ms) return '';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  }, []);

  const formatNumber = useCallback((num?: number): string => {
    if (!num) return '';
    if (num >= 100000000) return `${(num / 100000000).toFixed(1)}亿`;
    if (num >= 10000) return `${(num / 10000).toFixed(1)}万`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  }, []);

  const syncStatusPresentation = useMemo(() => getRssSyncStatusPresentation(metadata, refreshing), [metadata, refreshing]);

  const syncSummary = useMemo(() => {
    const items = [
      metadata.lastCheckedAt ? `最后检查 ${formatTime(metadata.lastCheckedAt)}` : '',
      metadata.lastSucceededAt || metadata.lastFetchedAt ? `最后成功 ${formatTime(metadata.lastSucceededAt || metadata.lastFetchedAt)}` : '',
      metadata.lastFailedAt ? `最后失败 ${formatTime(metadata.lastFailedAt)}` : ''
    ].filter(Boolean);

    return items.join(' · ');
  }, [formatTime, metadata.lastCheckedAt, metadata.lastFailedAt, metadata.lastFetchedAt, metadata.lastSucceededAt]);

  const syncErrorText = useMemo(() => {
    if (metadata.lastSyncStatus !== 'error') {
      return '';
    }
    return metadata.lastError || '同步失败';
  }, [metadata.lastError, metadata.lastSyncStatus]);

  const coverUrl = useMemo(() => {
    if (resource?.thumbnailPath) return makeResSrc(resource.thumbnailPath);
    if (resource?.previewUrl) return resource.previewUrl;
    if (metadata.avatarUrl) return metadata.avatarUrl;
    return null;
  }, [resource, metadata]);

  useEffect(() => {
    void loadResource();
    void (async () => {
      await loadCachedFeed({ keepLoading: true });
      await refreshFeedInBackground();
    })();
    // Load ignored count so we can show the badge
    void loadIgnoredItems();
  }, [loadResource, loadCachedFeed, refreshFeedInBackground, loadIgnoredItems]);

  // 当 metadata 变化时，同步历史分页位置
  useEffect(() => {
    const loadedCount = Math.max(metadata.historyLoadedCount || 0, feed?.totalItems || 0, feed?.items.length || 0);
    if (loadedCount > 0) {
      setHistoryOffset(loadedCount);
    }
    setHasMoreHistory(metadata.historyFullyLoaded !== true);
  }, [metadata.historyFullyLoaded, metadata.historyLoadedCount, feed?.totalItems, feed?.items.length]);

  useEffect(() => {
    if (!resourceId) return;

    const getTaskContext = (task: DownloadTaskEvent): { itemId: string; relatedResourceId: string } | null => {
      if (!task) return null;

      const taskMetadata = task.metadata || {};
      const relatedResourceId = (taskMetadata.parentResourceId || taskMetadata.rssResourceId || task.parentResourceId) as string | undefined;
      if (relatedResourceId !== resourceId) return null;

      const mappedItemId = downloadTaskItemMapRef.current.get(task.id);
      const itemId = mappedItemId || (taskMetadata.itemId as string | undefined);
      if (!itemId) return null;

      return { itemId, relatedResourceId };
    };

    const handleTaskStarted = (_: unknown, task: DownloadTaskEvent): void => {
      const context = getTaskContext(task);
      if (!context) return;

      setDownloadingItems((prev) => new Set(prev).add(context.itemId));
      setDownloadErrors((prev) => {
        if (!(context.itemId in prev)) return prev;
        const next = { ...prev };
        delete next[context.itemId];
        return next;
      });
      applyDownloadStateToFeed(context.itemId, {
        downloaded: false,
        downloadStatus: 'downloading',
        downloadProgress: 0,
        downloadErrorCode: undefined,
        downloadError: undefined,
        downloadErrorAt: undefined
      });
    };

    const handleTaskProgress = (_: unknown, task: DownloadTaskEvent): void => {
      const context = getTaskContext(task);
      if (!context) return;

      const progress = typeof task.progress?.percent === 'number' ? Math.max(0, Math.min(100, Math.round(task.progress.percent))) : undefined;
      applyDownloadStateToFeed(context.itemId, {
        downloadStatus: 'downloading',
        ...(progress !== undefined && { downloadProgress: progress })
      });
    };

    const handleTaskTerminal = (_: unknown, task: DownloadTaskEvent): void => {
      const context = getTaskContext(task);
      if (!context) return;

      downloadTaskItemMapRef.current.delete(task.id);
      setDownloadingItems((prev) => {
        if (!prev.has(context.itemId)) return prev;
        const next = new Set(prev);
        next.delete(context.itemId);
        return next;
      });

      if (task.status === 'completed') {
        const localResourceId = task.result?.resourceId || task.result?.resource?.id;
        setDownloadErrors((prev) => {
          if (!(context.itemId in prev)) return prev;
          const next = { ...prev };
          delete next[context.itemId];
          return next;
        });
        applyDownloadStateToFeed(context.itemId, {
          ...(localResourceId && { downloaded: true, localResourceId }),
          downloadStatus: 'completed',
          downloadProgress: 100,
          downloadErrorCode: undefined,
          downloadError: undefined,
          downloadErrorAt: undefined,
          lastDownloadAt: Date.now()
        });
        loadResource();
        refreshFeedInBackground();
      } else {
        const isCancelled = task.status === 'cancelled';
        const failureMessage = getRssDownloadFailureMessage(task);
        setDownloadErrors((prev) => ({ ...prev, [context.itemId]: failureMessage }));
        applyDownloadStateToFeed(context.itemId, {
          downloadStatus: isCancelled ? 'cancelled' : 'error',
          downloadProgress: undefined,
          downloadError: isCancelled ? undefined : failureMessage,
          downloadErrorCode: undefined,
          downloadErrorAt: isCancelled ? undefined : Date.now()
        });
        toast.error(task.status === 'cancelled' ? '下载已取消' : '下载失败', {
          description: failureMessage === '下载失败' ? undefined : failureMessage
        });
      }
    };

    window.ipcRenderer?.on('video-downloader:task-started', handleTaskStarted);
    window.ipcRenderer?.on('video-downloader:task-progress', handleTaskProgress);
    window.ipcRenderer?.on('video-downloader:task-completed', handleTaskTerminal);
    window.ipcRenderer?.on('video-downloader:task-failed', handleTaskTerminal);
    window.ipcRenderer?.on('video-downloader:task-cancelled', handleTaskTerminal);

    return () => {
      window.ipcRenderer?.off('video-downloader:task-started', handleTaskStarted);
      window.ipcRenderer?.off('video-downloader:task-progress', handleTaskProgress);
      window.ipcRenderer?.off('video-downloader:task-completed', handleTaskTerminal);
      window.ipcRenderer?.off('video-downloader:task-failed', handleTaskTerminal);
      window.ipcRenderer?.off('video-downloader:task-cancelled', handleTaskTerminal);
    };
  }, [resourceId, applyDownloadStateToFeed, loadResource, refreshFeedInBackground]);

  return (
    <div className="h-full w-full flex flex-col bg-background">
      {/* 顶部导航栏 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-card/50 backdrop-blur-sm">
        <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => navigate(-1)}>
          <TbArrowLeft className="w-4 h-4" />
        </Button>

        {/* 订阅信息 */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
              <TbRss className="w-5 h-5 text-orange-500" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="font-medium text-sm truncate">{resource?.title || '加载中...'}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 ${syncStatusPresentation.className}`}>{syncStatusPresentation.label}</span>
              {metadata.subscriberCount && (
                <span className="flex items-center gap-1">
                  <TbUsers className="w-3 h-3" />
                  {formatNumber(metadata.subscriberCount)}
                </span>
              )}
              {feed?.totalItems && (
                <span className="flex items-center gap-1">
                  <TbRss className="w-3 h-3" />
                  {feed.totalItems} 条{metadata.historyLoadedCount ? ' (含历史)' : ''}
                </span>
              )}
            </div>
            {syncSummary && <p className="mt-1 truncate text-xs text-muted-foreground">{syncSummary}</p>}
            {syncErrorText && <p className="mt-1 truncate text-xs text-destructive">{syncErrorText}</p>}
            {!syncSummary && !syncErrorText && metadata.channelUrl && <p className="mt-1 truncate text-xs text-muted-foreground">{metadata.channelUrl}</p>}
            {!syncSummary && !syncErrorText && !metadata.channelUrl && resource?.url && <p className="mt-1 truncate text-xs text-muted-foreground">{resource.url}</p>}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="w-8 h-8" onClick={handleRefresh} disabled={refreshing || reloading}>
                {refreshing ? <TbLoader2 className="w-4 h-4 animate-spin" /> : <TbRefresh className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>刷新</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="w-8 h-8" onClick={handleReloadSubscription} disabled={refreshing || reloading}>
                {reloading ? <TbLoader2 className="w-4 h-4 animate-spin" /> : <TbReload className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>重载订阅</TooltipContent>
          </Tooltip>

          {isYouTube && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="w-8 h-8" onClick={() => handleLoadHistory(RSS_FEED_PAGE_SIZE)} disabled={loadingHistory || reloading}>
                  {loadingHistory ? <TbLoader2 className="w-4 h-4 animate-spin" /> : <TbHistory className="w-4 h-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>加载历史视频</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="w-8 h-8" onClick={() => setSettingsOpen(true)}>
                <TbSettings className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>订阅设置</TooltipContent>
          </Tooltip>

          {(metadata.channelUrl || resource?.url) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="w-8 h-8" onClick={handleOpenSourcePage}>
                  <TbExternalLink className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>打开原始页面</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="px-4 py-2 border-b">
        <div className="flex flex-col gap-2 md:flex-row">
          <div className="relative flex-1">
            <TbSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="搜索内容..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9" />
          </div>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as RssItemFilter)}>
            <SelectTrigger className="h-9 w-full md:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="undownloaded">未下载</SelectItem>
              <SelectItem value="downloading">下载中</SelectItem>
              <SelectItem value="downloaded">已下载</SelectItem>
              <SelectItem value="failed">下载失败</SelectItem>
              <SelectItem value="cancelled">已取消</SelectItem>
              {ignoredCount > 0 && <SelectItem value="ignored">已忽略 ({ignoredCount})</SelectItem>}
            </SelectContent>
          </Select>
          <Select value={mediaTypeFilter} onValueChange={(value) => setMediaTypeFilter(value as RssMediaTypeFilter)}>
            <SelectTrigger className="h-9 w-full md:w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              <SelectItem value="video">视频</SelectItem>
              <SelectItem value="audio">音频</SelectItem>
              <SelectItem value="article">文章</SelectItem>
              <SelectItem value="image">图片</SelectItem>
              <SelectItem value="other">其他</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as RssItemSort)}>
            <SelectTrigger className="h-9 w-full md:w-[210px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="published_desc">发布时间: 最新优先</SelectItem>
              <SelectItem value="published_asc">发布时间: 最早优先</SelectItem>
              <SelectItem value="updated_desc">更新时间: 最新优先</SelectItem>
              <SelectItem value="updated_asc">更新时间: 最早优先</SelectItem>
            </SelectContent>
          </Select>
          {retryableFilteredItems.length > 0 && statusFilter !== 'ignored' && (
            <Button variant="outline" className="h-9 w-full gap-2 md:w-auto" onClick={handleRetryFilteredItems} disabled={retryingFailedItems}>
              {retryingFailedItems ? <TbLoader2 className="h-4 w-4 animate-spin" /> : <TbRefresh className="h-4 w-4" />}
              批量重试 ({retryableFilteredItems.length})
            </Button>
          )}
          {statusFilter !== 'ignored' && filteredItems.some((item) => !item.downloaded && !downloadingItems.has(item.id)) && (
            <Button variant="outline" className="h-9 w-full gap-2 md:w-auto" onClick={handleBatchIgnore}>
              <TbEyeOff className="h-4 w-4" />
              批量忽略 ({filteredItems.filter((item) => !item.downloaded && !downloadingItems.has(item.id)).length})
            </Button>
          )}
          {statusFilter === 'ignored' && ignoredItems.length > 0 && (
            <Button variant="outline" className="h-9 w-full gap-2 md:w-auto" onClick={handleRestoreAllIgnored} disabled={restoringAll}>
              {restoringAll ? <TbLoader2 className="h-4 w-4 animate-spin" /> : <TbRestore className="h-4 w-4" />}
              全部恢复 ({ignoredItems.length})
            </Button>
          )}
        </div>
      </div>

      {/* 内容列表 */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <TbLoader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : statusFilter === 'ignored' && loadingIgnored ? (
          <div className="flex items-center justify-center h-64">
            <TbLoader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : metadata.enabled === false && !hasActiveItemFilters && (feed?.items?.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 h-64 text-muted-foreground">
            <TbRss className="w-12 h-12 mb-2 opacity-40" />
            <p className="font-medium">订阅已停用</p>
            <p className="text-sm">启用订阅后将自动检查更新</p>
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
              打开设置
            </Button>
          </div>
        ) : !feed && !loading && metadata.lastSyncStatus === 'error' ? (
          <div className="flex flex-col items-center justify-center gap-3 h-64 text-muted-foreground">
            <TbRss className="w-12 h-12 mb-2 text-destructive opacity-60" />
            <p className="font-medium">无法获取订阅内容</p>
            <p className="text-sm">{metadata.lastError || '同步失败，请检查订阅地址或网络连接'}</p>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? <TbLoader2 className="w-4 h-4 animate-spin" /> : <TbRefresh className="w-4 h-4" />}
              <span className="ml-1">重试</span>
            </Button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 h-64 text-muted-foreground">
            {statusFilter === 'ignored' ? <TbEyeOff className="w-12 h-12 mb-2 opacity-40" /> : <TbRss className="w-12 h-12 mb-2" />}
            <p>{getRssItemFilterEmptyText(statusFilter, mediaTypeFilter, !!searchQuery.trim())}</p>
            {statusFilter === 'ignored' && <p className="text-sm">忽略的条目会出现在这里</p>}
            {hasActiveItemFilters && (
              <Button variant="outline" size="sm" onClick={handleResetItemFilters}>
                清空筛选
              </Button>
            )}
          </div>
        ) : (
          <div className="p-4 grid gap-3">
            {filteredItems.map((item) => (
              <FeedItemCard
                key={item.id}
                item={item}
                downloading={downloadingItems.has(item.id) || item.downloadStatus === 'pending' || item.downloadStatus === 'downloading'}
                downloadError={downloadErrors[item.id]}
                isIgnoredView={statusFilter === 'ignored'}
                onOpenLocalResource={handleOpenLocalResource}
                onDownload={() => handleDownloadItem(item)}
                onIgnore={() => handleIgnoreItem(item)}
                onRestore={() => handleUnignoreItem(item)}
                formatTime={formatTime}
                formatDuration={formatDuration}
                formatNumber={formatNumber}
              />
            ))}

            {!searchQuery && feed?.hasMore && (
              <div className="flex flex-col items-center gap-2 py-4">
                <Button variant="outline" size="sm" onClick={handleLoadMoreFeed} disabled={loadingMoreFeed} className="gap-2">
                  {loadingMoreFeed ? (
                    <>
                      <TbLoader2 className="w-4 h-4 animate-spin" />
                      加载中...
                    </>
                  ) : (
                    <>
                      <TbRss className="w-4 h-4" />
                      加载更多已缓存内容
                    </>
                  )}
                </Button>
                {feed.totalItems !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    已显示 {feed.items.length} / {feed.totalItems} 条
                  </p>
                )}
              </div>
            )}

            {/* 加载历史按钮（仅 YouTube） */}
            {isYouTube && !searchQuery && !feed?.hasMore && (
              <div className="flex flex-col items-center gap-2 py-4">
                {hasMoreHistory ? (
                  <Button variant="outline" size="sm" onClick={() => handleLoadHistory(RSS_FEED_PAGE_SIZE)} disabled={loadingHistory} className="gap-2">
                    {loadingHistory ? (
                      <>
                        <TbLoader2 className="w-4 h-4 animate-spin" />
                        加载中...
                      </>
                    ) : (
                      <>
                        <TbHistory className="w-4 h-4" />
                        加载更多历史视频
                      </>
                    )}
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">已加载全部历史视频</p>
                )}
                {historyOffset > 0 && <p className="text-xs text-muted-foreground">已加载 {historyOffset} 条历史记录</p>}
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* 设置对话框 */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>订阅设置</DialogTitle>
            <DialogDescription>配置此订阅的更新和下载选项</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>启用订阅</Label>
                <p className="text-xs text-muted-foreground">关闭后将不再自动检查更新</p>
              </div>
              <Switch checked={settingsForm.enabled} onCheckedChange={(checked) => setSettingsForm((prev) => ({ ...prev, enabled: checked }))} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>自动下载</Label>
                <p className="text-xs text-muted-foreground">自动下载新发布的内容</p>
              </div>
              <Switch checked={settingsForm.autoDownload} onCheckedChange={(checked) => setSettingsForm((prev) => ({ ...prev, autoDownload: checked }))} />
            </div>

            <div className="space-y-2">
              <Label>下载质量</Label>
              <Select value={settingsForm.downloadQuality} onValueChange={(value) => setSettingsForm((prev) => ({ ...prev, downloadQuality: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="best">最佳质量</SelectItem>
                  <SelectItem value="1080p">1080p</SelectItem>
                  <SelectItem value="720p">720p</SelectItem>
                  <SelectItem value="480p">480p</SelectItem>
                  <SelectItem value="audio">仅音频</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>下载间隔（秒）</Label>
              <Input
                type="number"
                min={5}
                max={3600}
                value={settingsForm.downloadIntervalSeconds}
                onChange={(e) => setSettingsForm((prev) => ({ ...prev, downloadIntervalSeconds: parseInt(e.target.value, 10) || 30 }))}
              />
              <p className="text-xs text-muted-foreground">一个 RSS 自动下载任务完成后，等待这个时间再启动下一个。</p>
            </div>

            <div className="space-y-2">
              <Label>检查间隔（分钟）</Label>
              <Input type="number" min={5} max={1440} value={settingsForm.fetchInterval} onChange={(e) => setSettingsForm((prev) => ({ ...prev, fetchInterval: parseInt(e.target.value) || 60 }))} />
              <p className="text-xs text-muted-foreground">设置自动检查更新的时间间隔</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveSettings}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Feed 条目卡片组件
interface FeedItemCardProps {
  item: RssFeedItem;
  downloading: boolean;
  downloadError?: string;
  isIgnoredView?: boolean;
  onOpenLocalResource: (resourceId: string) => void;
  onDownload: () => void;
  onIgnore: () => void;
  onRestore?: () => void;
  formatTime: (ts?: number) => string;
  formatDuration: (ms?: number) => string;
  formatNumber: (num?: number) => string;
}

const FeedItemCard: React.FC<FeedItemCardProps> = ({
  item,
  downloading,
  downloadError,
  isIgnoredView,
  onOpenLocalResource,
  onDownload,
  onIgnore,
  onRestore,
  formatTime,
  formatDuration,
  formatNumber
}) => {
  const handleOpenExternal = useCallback(() => {
    openExternalUrl(item.link);
  }, [item.link]);
  const handleOpenItem = useCallback(() => {
    if (item.downloaded && item.localResourceId) {
      onOpenLocalResource(item.localResourceId);
      return;
    }

    handleOpenExternal();
  }, [handleOpenExternal, item.downloaded, item.localResourceId, onOpenLocalResource]);
  const isDownloading = downloading || item.downloadStatus === 'pending' || item.downloadStatus === 'downloading';
  const isRetryable = isRssItemRetryable(item);
  const progress = typeof item.downloadProgress === 'number' ? Math.max(0, Math.min(100, Math.round(item.downloadProgress))) : undefined;
  const publishedTimeText = item.publishedAt ? formatTime(item.publishedAt) : item.metadata?.publishedAtEstimated ? String(item.metadata.publishedAtEstimated) : '未发布';
  const mediaTypeLabel = getRssMediaTypeFilterLabel(item.mediaType ?? 'other');
  const failureMessage = getFeedItemDownloadFailureMessage(item, downloadError);
  const errorBadgeText = getRssDownloadFailureBadgeText(item.downloadStatus, failureMessage);
  const downloadActionLabel = isRetryable ? '重试下载' : '下载';

  return (
    <div className="group flex gap-3 p-3 rounded-lg bg-card hover:bg-accent/50 transition-colors cursor-pointer" onClick={handleOpenItem}>
      {/* 缩略图 */}
      <div className="relative w-40 h-24 rounded-md overflow-hidden bg-muted flex-shrink-0">
        {item.thumbnail ? (
          <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <TbPlayerPlay className="w-8 h-8 text-muted-foreground" />
          </div>
        )}

        {/* 时长 */}
        {item.durationMs && <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 rounded">{formatDuration(item.durationMs)}</div>}

        {/* 已下载标识 */}
        {item.downloaded && (
          <div className="absolute top-1 left-1 bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5">
            <TbCheck className="w-3 h-3" />
            已下载
          </div>
        )}

        {!item.downloaded && isDownloading && (
          <div className="absolute top-1 left-1 bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5">
            <TbLoader2 className="w-3 h-3 animate-spin" />
            {progress !== undefined ? `${progress}%` : '下载中'}
          </div>
        )}

        {!item.downloaded && (item.downloadStatus === 'error' || item.downloadStatus === 'cancelled') && (
          <div className="absolute top-1 left-1 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded">{errorBadgeText}</div>
        )}
      </div>

      {/* 内容信息 */}
      <div className="flex-1 min-w-0 flex flex-col">
        <h3 className="font-medium text-sm line-clamp-2 mb-1">{item.title}</h3>

        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{mediaTypeLabel}</span>
          {item.author && <span className="text-xs text-muted-foreground">{item.author}</span>}
        </div>
        {!item.downloaded && (item.downloadStatus === 'error' || item.downloadStatus === 'cancelled') && failureMessage && (
          <p className="mb-1 line-clamp-2 text-xs text-destructive">{failureMessage}</p>
        )}

        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-auto">
          {/* 观看次数 */}
          {item.viewCount && (
            <span className="flex items-center gap-1">
              <TbEye className="w-3 h-3" />
              {formatNumber(item.viewCount)}
            </span>
          )}

          {/* 发布时间 */}
          <span className="flex items-center gap-1">
            <TbClock className="w-3 h-3" />
            {publishedTimeText}
          </span>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {isIgnoredView && onRestore && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="w-8 h-8"
                onClick={(e) => {
                  e.stopPropagation();
                  onRestore();
                }}
              >
                <TbRestore className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>恢复条目</TooltipContent>
          </Tooltip>
        )}

        {!isIgnoredView && !item.downloaded && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="w-8 h-8"
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload();
                }}
                disabled={isDownloading}
              >
                {isDownloading ? <TbLoader2 className="w-4 h-4 animate-spin" /> : isRetryable ? <TbRefresh className="w-4 h-4" /> : <TbDownload className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{downloadActionLabel}</TooltipContent>
          </Tooltip>
        )}

        {!isIgnoredView && !item.downloaded && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="w-8 h-8"
                onClick={(e) => {
                  e.stopPropagation();
                  onIgnore();
                }}
                disabled={isDownloading}
              >
                <TbEyeOff className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>忽略条目</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="w-8 h-8"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenExternal();
              }}
            >
              <TbExternalLink className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>打开原始链接</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};

export default RssFeedPage;

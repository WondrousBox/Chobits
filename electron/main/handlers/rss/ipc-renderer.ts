import type { ResourceRow } from '../../db/schema';
import type { CreateRssResourceParams, DownloadRssItemParams, FetchRssFeedParams, GetCachedFeedParams, RssFeedItem, RssFeedResponse, UpdateRssResourceParams } from './types';

export interface RssApi {
  /**
   * 创建 RSS 资源
   */
  create: (params: CreateRssResourceParams) => Promise<{ success: boolean; data?: ResourceRow; error?: string }>;

  /**
   * 更新 RSS 资源
   */
  update: (params: UpdateRssResourceParams) => Promise<{ success: boolean; data?: ResourceRow; error?: string }>;

  /**
   * 获取缓存的 RSS Feed 内容（从数据库读取，快速返回）
   * 推荐在进入界面时首先调用此方法快速展示缓存数据
   */
  getCachedFeed: (params: GetCachedFeedParams) => Promise<RssFeedResponse>;

  /**
   * 获取 RSS Feed 内容（从网络获取最新数据并更新缓存）
   * 推荐在 getCachedFeed 之后异步调用此方法获取最新数据
   */
  fetchFeed: (params: FetchRssFeedParams) => Promise<RssFeedResponse>;

  /**
   * 下载 RSS 条目
   * 返回下载任务信息，需要通过 videoDownloader 接口来执行下载
   */
  downloadItem: (params: DownloadRssItemParams) => Promise<{
    success: boolean;
    data?: {
      url: string;
      quality: string;
      folderId?: string;
      parentResourceId: string;
      metadata: {
        itemId: string;
        rssResourceId: string;
      };
    };
    error?: string;
  }>;

  /**
   * 列出所有 RSS 资源
   */
  list: (params?: { workspaceId?: string }) => Promise<{ success: boolean; data?: ResourceRow[]; error?: string }>;

  /**
   * 删除 RSS 资源（取消订阅）
   * 同时删除关联的所有 feed 记录
   * @param params.id - 资源 ID
   * @param params.hardDelete - 是否硬删除（彻底删除，默认 false 为软删除）
   */
  delete: (params: { id: string; hardDelete?: boolean }) => Promise<{
    success: boolean;
    data?: { id: string; deletedFeedCount: number } | ResourceRow;
    error?: string;
  }>;

  /**
   * 检查所有 RSS 订阅的更新
   */
  checkAllUpdates: () => Promise<{
    success: boolean;
    data?: Array<{ id: string; hasUpdate: boolean; newItems: number; error?: string }>;
    error?: string;
  }>;

  /**
   * 获取 YouTube 频道的历史视频列表
   * 使用 yt-dlp 绕过 RSS 只返回 15 个视频的限制
   * 获取到的数据会自动存入数据库，并支持分页继续加载
   *
   * @param params.resourceId - RSS 资源 ID
   * @param params.limit - 每次获取数量（默认 50）
   * @param params.offset - 偏移量（用于分页，默认 0）
   * @param params.detailed - 是否获取详细信息（较慢，默认 false）
   */
  fetchYouTubeHistory: (params: { resourceId: string; limit?: number; offset?: number; detailed?: boolean }) => Promise<{
    success: boolean;
    data?: {
      items: RssFeedItem[];
      hasMore: boolean;
      nextOffset: number;
      totalLoaded: number;
    };
    error?: string;
  }>;
}

export function createRssApi(ipcRenderer: Electron.IpcRenderer): RssApi {
  return {
    create: (params) => ipcRenderer.invoke('rss:create', params),
    update: (params) => ipcRenderer.invoke('rss:update', params),
    getCachedFeed: (params) => ipcRenderer.invoke('rss:getCachedFeed', params),
    fetchFeed: (params) => ipcRenderer.invoke('rss:fetchFeed', params),
    downloadItem: (params) => ipcRenderer.invoke('rss:downloadItem', params),
    list: (params) => ipcRenderer.invoke('rss:list', params),
    delete: (params) => ipcRenderer.invoke('rss:delete', params),
    checkAllUpdates: () => ipcRenderer.invoke('rss:checkAllUpdates'),
    fetchYouTubeHistory: (params) => ipcRenderer.invoke('rss:fetchYouTubeHistory', params)
  };
}

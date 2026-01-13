import type { CreateRssResourceParams, DownloadRssItemParams, FetchRssFeedParams, RssFeed, UpdateRssResourceParams } from './types';
import type { ResourceRow } from '../../db/schema';

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
   * 获取 RSS Feed 内容
   */
  fetchFeed: (params: FetchRssFeedParams) => Promise<{ success: boolean; data?: RssFeed; error?: string }>;

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
   * 删除 RSS 资源
   */
  delete: (params: { id: string }) => Promise<{ success: boolean; data?: ResourceRow; error?: string }>;

  /**
   * 检查所有 RSS 订阅的更新
   */
  checkAllUpdates: () => Promise<{
    success: boolean;
    data?: Array<{ id: string; hasUpdate: boolean; newItems: number; error?: string }>;
    error?: string;
  }>;
}

export function createRssApi(ipcRenderer: Electron.IpcRenderer): RssApi {
  return {
    create: (params) => ipcRenderer.invoke('rss:create', params),
    update: (params) => ipcRenderer.invoke('rss:update', params),
    fetchFeed: (params) => ipcRenderer.invoke('rss:fetchFeed', params),
    downloadItem: (params) => ipcRenderer.invoke('rss:downloadItem', params),
    list: (params) => ipcRenderer.invoke('rss:list', params),
    delete: (params) => ipcRenderer.invoke('rss:delete', params),
    checkAllUpdates: () => ipcRenderer.invoke('rss:checkAllUpdates')
  };
}

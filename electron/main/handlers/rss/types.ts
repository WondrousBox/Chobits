/**
 * RSS 资源相关类型定义
 *
 * RSS 资源是一种特殊的资源类型，用于订阅和管理各种 Feed 源
 * 支持 YouTube 频道、Podcast、博客 RSS 等多种来源
 */

/**
 * RSS 来源类型
 */
export type RssSourceType = 'youtube' | 'podcast' | 'blog' | 'bilibili' | 'twitter' | 'custom';

/**
 * RSS 资源的 metadata 结构
 * 存储在 resources.metadata 字段中（JSON 格式）
 */
export interface RssMetadata {
  /** RSS 来源类型 */
  sourceType?: RssSourceType;
  /** Feed URL（实际的 RSS/Atom 地址） */
  feedUrl?: string;
  /** 频道/来源 ID（如 YouTube 频道 ID） */
  channelId?: string;
  /** 频道/来源主页 URL */
  channelUrl?: string;
  /** 最后一次拉取 Feed 的时间（毫秒时间戳） */
  lastFetchedAt?: number;
  /** 拉取间隔（分钟），默认 60 */
  fetchInterval?: number;
  /** Feed 中的条目数量 */
  itemCount?: number;
  /** 最新条目的 ID（用于判断是否有新内容） */
  latestItemId?: string;
  /** 最新条目的发布时间 */
  latestItemPublishedAt?: number;
  /** 是否自动下载新内容 */
  autoDownload?: boolean;
  /** 自动下载的质量设置 */
  downloadQuality?: string;
  /** 下载保存的文件夹 ID */
  downloadFolderId?: string;
  /** 是否启用订阅 */
  enabled?: boolean;
  /** 订阅者数量（如果有） */
  subscriberCount?: number;
  /** 视频/内容总数（如果有） */
  totalVideoCount?: number;
  /** 封面图 URL */
  coverUrl?: string;
  /** 头像 URL */
  avatarUrl?: string;
  /** 横幅图 URL */
  bannerUrl?: string;
  /** 上次同步错误信息 */
  lastError?: string;
  /** 上次同步错误时间 */
  lastErrorAt?: number;
}

/**
 * RSS Feed 条目（统一的列表项结构）
 * 用于展示任何来源的 RSS 内容
 */
export interface RssFeedItem {
  /** 条目唯一 ID（来源平台的 ID） */
  id: string;
  /** 条目标题 */
  title: string;
  /** 条目描述/摘要 */
  description?: string;
  /** 条目链接 */
  link: string;
  /** 发布时间（毫秒时间戳） */
  publishedAt: number;
  /** 更新时间（毫秒时间戳） */
  updatedAt?: number;
  /** 作者名称 */
  author?: string;
  /** 缩略图 URL */
  thumbnail?: string;
  /** 时长（毫秒，音视频） */
  durationMs?: number;
  /** 观看/播放次数 */
  viewCount?: number;
  /** 点赞数 */
  likeCount?: number;
  /** 评论数 */
  commentCount?: number;
  /** 媒体类型 */
  mediaType?: 'video' | 'audio' | 'article' | 'image' | 'other';
  /** 媒体 URL（直接播放/下载地址） */
  mediaUrl?: string;
  /** 媒体格式 */
  mediaFormat?: string;
  /** 文件大小（字节） */
  sizeBytes?: number;
  /** 分类/标签 */
  categories?: string[];
  /** 是否已下载 */
  downloaded?: boolean;
  /** 对应的本地资源 ID（如果已下载） */
  localResourceId?: string;
  /** 下载状态 */
  downloadStatus?: 'pending' | 'downloading' | 'completed' | 'error';
  /** 下载进度（0-100） */
  downloadProgress?: number;
  /** 额外元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * RSS Feed 解析结果
 */
export interface RssFeed {
  /** Feed 标题 */
  title: string;
  /** Feed 描述 */
  description?: string;
  /** Feed 链接 */
  link?: string;
  /** Feed URL */
  feedUrl: string;
  /** 语言 */
  language?: string;
  /** 封面图 */
  image?: string;
  /** 作者 */
  author?: string;
  /** 最后更新时间 */
  lastBuildDate?: number;
  /** 条目列表 */
  items: RssFeedItem[];
  /** 条目总数 */
  totalItems?: number;
  /** 是否还有更多 */
  hasMore?: boolean;
  /** 下一页 token/cursor */
  nextPageToken?: string;
}

/**
 * 创建 RSS 资源的参数
 */
export interface CreateRssResourceParams {
  /** RSS 来源类型 */
  sourceType: RssSourceType;
  /** 频道 ID 或 URL（用于自动解析） */
  channelIdOrUrl: string;
  /** 自定义标题（可选，否则自动获取） */
  title?: string;
  /** 是否自动下载 */
  autoDownload?: boolean;
  /** 下载质量 */
  downloadQuality?: string;
  /** 保存到的文件夹 ID */
  folderId?: string;
  /** 工作空间 ID */
  workspaceId?: string;
}

/**
 * 更新 RSS 资源的参数
 */
export interface UpdateRssResourceParams {
  /** 资源 ID */
  id: string;
  /** 标题 */
  title?: string;
  /** 描述 */
  description?: string;
  /** 是否启用 */
  enabled?: boolean;
  /** 是否自动下载 */
  autoDownload?: boolean;
  /** 下载质量 */
  downloadQuality?: string;
  /** 拉取间隔（分钟） */
  fetchInterval?: number;
  /** 下载保存的文件夹 ID */
  downloadFolderId?: string;
}

/**
 * 获取 RSS Feed 的参数
 */
export interface FetchRssFeedParams {
  /** 资源 ID */
  resourceId: string;
  /** 分页 token */
  pageToken?: string;
  /** 每页数量 */
  pageSize?: number;
  /** 是否强制刷新（忽略缓存） */
  forceRefresh?: boolean;
}

/**
 * 获取缓存 RSS Feed 的参数
 */
export interface GetCachedFeedParams {
  /** 资源 ID */
  resourceId: string;
  /** 限制数量 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

/**
 * RSS Feed 响应结果
 */
export interface RssFeedResponse {
  /** 是否成功 */
  success: boolean;
  /** Feed 数据 */
  data?: RssFeed;
  /** 错误信息 */
  error?: string;
  /** 是否来自缓存 */
  cached?: boolean;
  /** 上次获取时间（毫秒时间戳） */
  lastFetchedAt?: number;
}

/**
 * 下载 RSS 条目的参数
 */
export interface DownloadRssItemParams {
  /** RSS 资源 ID */
  rssResourceId: string;
  /** 条目 ID */
  itemId: string;
  /** 条目 URL */
  itemUrl: string;
  /** 下载质量（可选，否则使用 RSS 资源的默认设置） */
  quality?: string;
  /** 保存到的文件夹 ID（可选） */
  folderId?: string;
}

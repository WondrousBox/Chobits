import type { RssFeed, RssFeedItem, RssMetadata, RssSourceType } from './types';

/**
 * 频道信息提取结果
 */
export interface ChannelInfo {
  /** 频道/来源 ID */
  channelId?: string;
  /** Feed URL */
  feedUrl: string;
  /** 频道/来源主页 URL */
  channelUrl?: string;
  /** 标题 */
  title?: string;
  /** 描述 */
  description?: string;
  /** 缩略图/头像 URL */
  thumbnail?: string;
  /** 订阅者数量 */
  subscriberCount?: number;
  /** 其他元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * RSS 源处理器接口
 * 每个 RSS 源（YouTube、Bilibili 等）都需要实现此接口
 */
export interface RssSourceHandler {
  /** 源类型 */
  readonly sourceType: RssSourceType;

  /**
   * 检测输入是否匹配此源
   * @param input 用户输入的 URL 或 ID
   * @returns 是否匹配
   */
  detect(input: string): boolean;

  /**
   * 从输入中提取频道信息
   * @param input 用户输入的 URL 或 ID
   * @returns 频道信息，如果无法解析则返回 null
   */
  extractChannelInfo(input: string): Promise<ChannelInfo | null>;

  /**
   * 增强解析 Feed 条目（可选）
   * 用于提取特定平台的额外信息
   * @param item 原始 Feed 条目
   * @param rawXml 原始 XML 内容（可选）
   * @returns 增强后的条目，如果不支持则返回原条目
   */
  enhanceFeedItem?(item: RssFeedItem, rawXml?: string): RssFeedItem;

  /**
   * 增强解析 Feed 元信息（可选）
   * @param feed 原始 Feed
   * @param rawXml 原始 XML 内容（可选）
   * @returns 增强后的 Feed
   */
  enhanceFeed?(feed: RssFeed, rawXml?: string): RssFeed;

  /**
   * 创建 RSS Metadata
   * @param channelInfo 频道信息
   * @param options 额外选项
   * @returns RSS Metadata
   */
  createMetadata(
    channelInfo: ChannelInfo,
    options?: {
      autoDownload?: boolean;
      downloadQuality?: string;
      downloadIntervalSeconds?: number;
      downloadFolderId?: string;
      fetchInterval?: number;
    }
  ): RssMetadata;
}

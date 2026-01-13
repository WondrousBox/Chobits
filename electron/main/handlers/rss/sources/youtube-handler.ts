import http from 'node:http';
import https from 'node:https';

import { getHttpProxy as getSystemHttpProxy } from '../../proxy/proxy';
import type { ChannelInfo, RssSourceHandler } from '../rss-source-handler';
import type { RssFeed, RssFeedItem, RssMetadata, RssSourceType } from '../types';

/**
 * YouTube RSS 源处理器
 */
export class YouTubeHandler implements RssSourceHandler {
  readonly sourceType: RssSourceType = 'youtube';

  detect(input: string): boolean {
    const trimmed = input.trim();
    return trimmed.includes('youtube.com') || trimmed.includes('youtu.be') || trimmed.startsWith('@') || (trimmed.startsWith('UC') && trimmed.length === 24);
  }

  async extractChannelInfo(input: string): Promise<ChannelInfo | null> {
    const channelIdInput = input.trim();

    // 如果是完整的 URL
    if (channelIdInput.startsWith('http')) {
      const urlMatch = channelIdInput.match(/youtube\.com\/(channel|c|user|@)\/([^/?]+)/);
      if (urlMatch) {
        const type = urlMatch[1];
        const id = urlMatch[2];

        if (type === 'channel') {
          // 直接是频道 ID
          return {
            channelId: id,
            feedUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`,
            channelUrl: `https://www.youtube.com/channel/${id}`
          };
        } else {
          // 需要从页面中提取
          return await this.fetchYouTubeChannelFromPage(channelIdInput);
        }
      }
    }

    // 如果是 @username 格式
    if (channelIdInput.startsWith('@')) {
      const channelUrl = `https://www.youtube.com/${channelIdInput}`;
      return await this.fetchYouTubeChannelFromPage(channelUrl);
    }

    // 假设是频道 ID（以 UC 开头）
    if (channelIdInput.startsWith('UC') && channelIdInput.length === 24) {
      return {
        channelId: channelIdInput,
        feedUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=${channelIdInput}`,
        channelUrl: `https://www.youtube.com/channel/${channelIdInput}`
      };
    }

    // 尝试作为频道 ID
    return {
      channelId: channelIdInput,
      feedUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=${channelIdInput}`,
      channelUrl: `https://www.youtube.com/channel/${channelIdInput}`
    };
  }

  enhanceFeedItem(item: RssFeedItem, rawXml?: string): RssFeedItem {
    // YouTube 特定：提取视频 ID
    if (rawXml) {
      const videoIdMatch = rawXml.match(/<yt:videoId>([\s\S]*?)<\/yt:videoId>/);
      if (videoIdMatch) {
        item.id = videoIdMatch[1].trim();
      } else {
        // 从链接中提取视频 ID
        const videoId = this.extractVideoIdFromUrl(item.link);
        if (videoId) {
          item.id = videoId;
        }
      }

      // 提取缩略图
      if (!item.thumbnail) {
        const thumbnailMatch = rawXml.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/);
        if (thumbnailMatch) {
          item.thumbnail = thumbnailMatch[1];
        } else if (item.id && item.id.length === 11) {
          // YouTube 视频 ID 格式
          item.thumbnail = `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`;
        }
      }

      // 提取观看次数
      const viewsMatch = rawXml.match(/<media:statistics[^>]*views=["'](\d+)["']/);
      if (viewsMatch) {
        item.viewCount = parseInt(viewsMatch[1], 10);
      }
    }

    // 确保媒体类型为 video
    item.mediaType = 'video';

    return item;
  }

  enhanceFeed(feed: RssFeed): RssFeed {
    // YouTube 特定的 Feed 增强逻辑可以在这里实现
    return feed;
  }

  createMetadata(
    channelInfo: ChannelInfo,
    options?: {
      autoDownload?: boolean;
      downloadQuality?: string;
      downloadFolderId?: string;
      fetchInterval?: number;
    }
  ): RssMetadata {
    return {
      sourceType: 'youtube',
      feedUrl: channelInfo.feedUrl,
      channelId: channelInfo.channelId,
      channelUrl: channelInfo.channelUrl,
      autoDownload: options?.autoDownload ?? false,
      downloadQuality: options?.downloadQuality ?? '1080p',
      downloadFolderId: options?.downloadFolderId,
      enabled: true,
      fetchInterval: options?.fetchInterval,
      subscriberCount: channelInfo.subscriberCount,
      avatarUrl: channelInfo.thumbnail
    };
  }

  /**
   * 从 YouTube 频道页面提取信息
   */
  private async fetchYouTubeChannelFromPage(channelUrl: string): Promise<ChannelInfo | null> {
    return new Promise((resolve, reject) => {
      const client = channelUrl.startsWith('https:') ? https : http;
      const agent = getSystemHttpProxy();

      const options: https.RequestOptions | http.RequestOptions = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        }
      };

      if (agent) {
        options.agent = agent as any;
      }

      const req = client.get(channelUrl, options, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }

        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
          if (data.length > 10 * 1024 * 1024) {
            res.destroy();
            reject(new Error('Response too large'));
          }
        });

        res.on('end', () => {
          try {
            // 尝试从 rssUrl 中提取
            const rssUrlMatch = data.match(/"rssUrl"\s*:\s*"([^"]+)"/);
            let channelId: string | undefined;
            let feedUrl: string | undefined;

            if (rssUrlMatch && rssUrlMatch[1]) {
              feedUrl = rssUrlMatch[1];
              const channelIdMatch = feedUrl.match(/channel_id=([^&]+)/);
              if (channelIdMatch) {
                channelId = channelIdMatch[1];
              }
            }

            // 尝试从 browseId 中提取
            if (!channelId) {
              const browseIdPatterns = [/"browseId"\s*:\s*"([^"]+)"/, /"browse_id"\s*:\s*"([^"]+)"/];

              for (const pattern of browseIdPatterns) {
                const match = data.match(pattern);
                if (match && match[1] && match[1].startsWith('UC') && match[1].length === 24) {
                  channelId = match[1];
                  feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
                  break;
                }
              }
            }

            if (!channelId || !feedUrl) {
              reject(new Error('无法从页面中提取频道 ID'));
              return;
            }

            // 提取频道标题
            const titleMatch = data.match(/<title>([^<]+)<\/title>/);
            const title = titleMatch ? titleMatch[1].replace(/ - YouTube$/, '').trim() : undefined;

            // 提取频道头像
            const thumbnailMatch = data.match(/"avatar"\s*:\s*\{\s*"thumbnails"\s*:\s*\[\s*\{\s*"url"\s*:\s*"([^"]+)"/);
            const thumbnail = thumbnailMatch ? thumbnailMatch[1] : undefined;

            // 提取订阅者数量
            const subscriberMatch = data.match(/"subscriberCountText"\s*:\s*\{\s*"simpleText"\s*:\s*"([^"]+)"/);
            let subscriberCount: number | undefined;
            if (subscriberMatch) {
              const countStr = subscriberMatch[1];
              const numMatch = countStr.match(/([\d.]+)\s*(万|亿|K|M|B)?/i);
              if (numMatch) {
                let num = parseFloat(numMatch[1]);
                const unit = numMatch[2]?.toLowerCase();
                if (unit === '万' || unit === 'k') num *= 10000;
                else if (unit === '亿' || unit === 'm') num *= 100000000;
                else if (unit === 'b') num *= 1000000000;
                subscriberCount = Math.round(num);
              }
            }

            resolve({
              channelId,
              feedUrl,
              channelUrl,
              title,
              thumbnail,
              subscriberCount
            });
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('请求超时'));
      });
    });
  }

  /**
   * 从 URL 中提取视频 ID
   */
  private extractVideoIdFromUrl(url: string): string {
    const patterns = [/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/, /\/watch\?v=([a-zA-Z0-9_-]{11})/];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return url.split('/').pop() || url;
  }
}

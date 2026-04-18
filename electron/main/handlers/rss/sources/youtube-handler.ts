import http from 'node:http';
import https from 'node:https';

import { ytdlpService } from '../../../../../packages/ytdlp';
import ytdlpStatic from '../../../../../packages/common/libs/ytdlp-static';
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

  /**
   * 使用 yt-dlp 获取频道的历史视频列表
   * 这个方法可以绕过 YouTube RSS 只返回 15 个视频的限制
   *
   * @param channelUrl 频道 URL 或频道 ID
   * @param options.limit 最大获取数量（默认 50），作为 playlist-end
   * @param options.playlistStart 从第几个视频开始（1-based，用于分页）
   * @param options.dateAfter 只获取该日期之后的视频 (YYYYMMDD 格式)
   * @param options.dateBefore 只获取该日期之前的视频 (YYYYMMDD 格式)
   * @returns 视频列表
   */
  async fetchChannelHistory(
    channelUrl: string,
    options?: {
      limit?: number;
      playlistStart?: number;
      playlistEnd?: number;
      dateAfter?: string;
      dateBefore?: string;
    }
  ): Promise<RssFeedItem[]> {
    const playlistStart = Math.max(1, options?.playlistStart ?? 1);
    const playlistEnd = Math.max(playlistStart, options?.playlistEnd ?? options?.limit ?? playlistStart + 49);

    // Build the channel videos page URL
    const targetUrl = this.resolveChannelVideosUrl(channelUrl);

    const baseArgs: string[] = [targetUrl, '--flat-playlist', '--dump-json', '--playlist-start', String(playlistStart), '--playlist-end', String(playlistEnd)];

    // 添加日期过滤
    if (options?.dateAfter) {
      baseArgs.push('--dateafter', options.dateAfter);
    }
    if (options?.dateBefore) {
      baseArgs.push('--datebefore', options.dateBefore);
    }

    try {
      // 使用 ytdlpService 构建完整参数
      const args = ytdlpService.buildArgs(baseArgs);
      const output = await ytdlpService.getExecutor().execPromise(args);
      const items: RssFeedItem[] = [];

      // yt-dlp 在 flat-playlist 模式下每行输出一个 JSON 对象
      const lines = output.trim().split('\n').filter(Boolean);

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        try {
          const video = JSON.parse(line);
          const playlistIndex = playlistStart + lineIndex;
          const published = this.resolveYtdlpPublishedAt(video, playlistIndex);

          const item: RssFeedItem = {
            id: video.id,
            title: video.title || 'Untitled',
            link: `https://www.youtube.com/watch?v=${video.id}`,
            publishedAt: published.value,
            thumbnail: video.thumbnail || `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
            mediaType: 'video',
            durationMs: video.duration ? video.duration * 1000 : undefined,
            viewCount: video.view_count,
            metadata: {
              playlistIndex,
              ...(published.estimated && { publishedAtEstimated: true })
            }
          };

          items.push(item);
        } catch (parseError) {
          console.warn('[YouTubeHandler] Failed to parse video entry:', parseError);
        }
      }

      return items;
    } catch (error) {
      console.error('[YouTubeHandler] Failed to fetch channel history:', error);
      throw error;
    }
  }

  /**
   * 使用 yt-dlp 获取频道的完整视频列表（包含详细信息）
   * 注意：这个方法较慢，因为需要获取每个视频的详细信息
   *
   * @param channelUrl 频道 URL 或频道 ID
   * @param limit 最大获取数量（默认 50）
   */
  async fetchChannelVideosDetailed(
    channelUrl: string,
    options: number | { playlistStart?: number; playlistEnd?: number } = 50
  ): Promise<RssFeedItem[]> {
    const playlistStart = Math.max(1, typeof options === 'number' ? 1 : options.playlistStart ?? 1);
    const playlistEnd = Math.max(playlistStart, typeof options === 'number' ? options : options.playlistEnd ?? playlistStart + 49);
    // 构建频道视频页面 URL
    const targetUrl = this.resolveChannelVideosUrl(channelUrl);

    try {
      const baseArgs = [targetUrl, '--playlist-start', String(playlistStart), '--playlist-end', String(playlistEnd)];
      const args = ytdlpService.buildArgs(baseArgs);
      const playlistInfo = await ytdlpService.getExecutor().getPlaylistInfo(targetUrl, args.filter((a) => a !== targetUrl));

      if (!playlistInfo?.entries) {
        return [];
      }

      const items: RssFeedItem[] = playlistInfo.entries.map((video: any, index: number) => {
        const playlistIndex = playlistStart + index;
        const published = this.resolveYtdlpPublishedAt(video, playlistIndex);

        return {
          id: video.id,
          title: video.title || 'Untitled',
          description: video.description,
          link: `https://www.youtube.com/watch?v=${video.id}`,
          publishedAt: published.value,
          thumbnail: video.thumbnail || `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
          author: video.uploader || video.channel,
          mediaType: 'video' as const,
          durationMs: video.duration ? video.duration * 1000 : undefined,
          viewCount: video.view_count,
          metadata: {
            playlistIndex,
            ...(published.estimated && { publishedAtEstimated: true })
          }
        };
      });

      return items;
    } catch (error) {
      console.error('[YouTubeHandler] Failed to fetch channel videos (detailed):', error);
      throw error;
    }
  }

  /**
   * 解析 yt-dlp 的日期格式 (YYYYMMDD)
   */
  private resolveChannelVideosUrl(channelUrl: string): string {
    if (channelUrl.startsWith('UC') && channelUrl.length === 24) {
      return `https://www.youtube.com/channel/${channelUrl}/videos`;
    }
    if (channelUrl.startsWith('@')) {
      return `https://www.youtube.com/${channelUrl}/videos`;
    }
    if (channelUrl.includes('youtube.com') && !channelUrl.includes('/videos')) {
      return channelUrl.replace(/\/?$/, '/videos');
    }

    return channelUrl;
  }

  private parseYtdlpDate(dateStr?: string): number | undefined {
    if (!dateStr || !/^\d{8}$/.test(dateStr)) {
      return undefined;
    }

    const year = Number(dateStr.slice(0, 4));
    const month = Number(dateStr.slice(4, 6));
    const day = Number(dateStr.slice(6, 8));
    const timestamp = Date.UTC(year, month - 1, day);

    return Number.isFinite(timestamp) ? timestamp : undefined;
  }

  private parseYtdlpTimestamp(value: unknown): number | undefined {
    const seconds = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return undefined;
    }

    return seconds * 1000;
  }

  private resolveYtdlpPublishedAt(video: any, playlistIndex?: number): { value: number; estimated: boolean } {
    const timestamp =
      this.parseYtdlpTimestamp(video.timestamp) ??
      this.parseYtdlpTimestamp(video.release_timestamp) ??
      this.parseYtdlpTimestamp(video.modified_timestamp);

    if (timestamp !== undefined) {
      return { value: timestamp, estimated: false };
    }

    const date = this.parseYtdlpDate(video.upload_date) ?? this.parseYtdlpDate(video.release_date) ?? this.parseYtdlpDate(video.modified_date);
    if (date !== undefined) {
      return { value: date, estimated: false };
    }

    const stableOffset = Math.max(0, (playlistIndex || 1) - 1) * 1000;
    return { value: Date.now() - stableOffset, estimated: true };
  }
}

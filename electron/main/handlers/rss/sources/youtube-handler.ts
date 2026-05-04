import { execFile } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';

import { ytdlpService } from '../../../../../packages/ytdlp';
import { getHttpProxy as getSystemHttpProxy } from '../../proxy/proxy';
import type { ChannelInfo, RssSourceHandler } from '../rss-source-handler';
import type { RssFeed, RssFeedItem, RssMetadata, RssSourceType } from '../types';

const YTDLP_HISTORY_LOG_SAMPLE_SIZE = 3;
const YTDLP_DETAIL_HYDRATE_TIMEOUT_MS = 15000;
const YTDLP_DETAIL_PRINT_TEMPLATE = [
  '%(playlist_index)s',
  '%(id)s',
  '%(upload_date)s',
  '%(timestamp)s',
  '%(release_timestamp)s',
  '%(modified_timestamp)s',
  '%(release_date)s',
  '%(modified_date)s',
  '%(duration)s',
  '%(view_count)s',
  '%(webpage_url)s',
  '%(thumbnail)s'
].join('\t');

type YtdlpPublishedAt = {
  value: number;
  estimated: boolean;
  source: string;
};

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
      downloadIntervalSeconds?: number;
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
      downloadIntervalSeconds: options?.downloadIntervalSeconds,
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
      hydrateDetails?: boolean | number;
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
      const flatVideos: any[] = [];

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        try {
          const video = JSON.parse(line);
          const playlistIndex = playlistStart + lineIndex;
          flatVideos.push({ ...video, playlist_index: playlistIndex });
          items.push(this.createFeedItemFromYtdlpVideo(video, playlistIndex));
        } catch (parseError) {
          console.warn('[YouTubeHandler] Failed to parse video entry:', parseError);
        }
      }

      this.logYtdlpHistorySample('flat', flatVideos);

      const detailLimit = this.resolveHydrateDetailsLimit(options?.hydrateDetails, items.length);
      if (detailLimit <= 0) {
        return items;
      }

      return await this.hydrateChannelHistoryDetails(channelUrl, items, {
        playlistStart,
        playlistEnd: Math.min(playlistEnd, playlistStart + detailLimit - 1),
        dateAfter: options?.dateAfter,
        dateBefore: options?.dateBefore
      });
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
  async fetchChannelVideosDetailed(channelUrl: string, options: number | { playlistStart?: number; playlistEnd?: number } = 50): Promise<RssFeedItem[]> {
    const playlistStart = Math.max(1, typeof options === 'number' ? 1 : (options.playlistStart ?? 1));
    const playlistEnd = Math.max(playlistStart, typeof options === 'number' ? options : (options.playlistEnd ?? playlistStart + 49));
    // 构建频道视频页面 URL
    const targetUrl = this.resolveChannelVideosUrl(channelUrl);

    try {
      const baseArgs = [targetUrl, '--playlist-start', String(playlistStart), '--playlist-end', String(playlistEnd)];
      const args = await ytdlpService.buildArgsAsync(baseArgs);
      const playlistInfo = await ytdlpService.getExecutor().getPlaylistInfo(
        targetUrl,
        args.filter((a) => a !== targetUrl)
      );

      if (!playlistInfo?.entries) {
        return [];
      }

      const items: RssFeedItem[] = playlistInfo.entries.map((video: any, index: number) => {
        const playlistIndex = playlistStart + index;
        return this.createFeedItemFromYtdlpVideo(video, playlistIndex);
      });

      this.logYtdlpHistorySample('detailed-playlist', playlistInfo.entries.slice(0, YTDLP_HISTORY_LOG_SAMPLE_SIZE));
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

  private resolveYtdlpPublishedAt(video: any, playlistIndex?: number): YtdlpPublishedAt {
    const timestampFields: Array<[string, unknown]> = [
      ['timestamp', video.timestamp],
      ['release_timestamp', video.release_timestamp],
      ['modified_timestamp', video.modified_timestamp]
    ];

    for (const [source, rawValue] of timestampFields) {
      const timestamp = this.parseYtdlpTimestamp(rawValue);
      if (timestamp !== undefined) {
        return { value: timestamp, estimated: false, source };
      }
    }

    const dateFields: Array<[string, unknown]> = [
      ['upload_date', video.upload_date],
      ['release_date', video.release_date],
      ['modified_date', video.modified_date]
    ];

    for (const [source, rawValue] of dateFields) {
      const date = typeof rawValue === 'string' ? this.parseYtdlpDate(rawValue) : undefined;
      if (date !== undefined) {
        return { value: date, estimated: false, source };
      }
    }

    const stableOffset = Math.max(0, (playlistIndex || 1) - 1) * 1000;
    return { value: Date.now() - stableOffset, estimated: true, source: 'estimated_playlist_index' };
  }

  private createFeedItemFromYtdlpVideo(video: any, playlistIndex: number): RssFeedItem {
    const videoId = String(video.id || this.extractVideoIdFromUrl(String(video.webpage_url || video.url || '')));
    const published = this.resolveYtdlpPublishedAt(video, playlistIndex);
    const metadata = this.compactMetadata({
      playlistIndex,
      ytdlpTimeSource: published.source,
      ytdlpUploadDate: video.upload_date,
      ytdlpReleaseDate: video.release_date,
      ytdlpModifiedDate: video.modified_date,
      ytdlpTimestamp: video.timestamp,
      ytdlpReleaseTimestamp: video.release_timestamp,
      ytdlpModifiedTimestamp: video.modified_timestamp,
      ytdlpDurationString: video.duration_string,
      ytdlpWebpageUrl: video.webpage_url,
      ...(published.estimated && { publishedAtEstimated: true })
    });

    return {
      id: videoId,
      title: video.title || 'Untitled',
      description: video.description,
      link: this.resolveYtdlpWatchUrl(video, videoId),
      publishedAt: published.value,
      thumbnail: this.resolveYtdlpThumbnail(video, videoId),
      author: video.uploader || video.channel,
      mediaType: 'video',
      durationMs: video.duration ? video.duration * 1000 : undefined,
      viewCount: video.view_count,
      metadata
    };
  }

  private resolveYtdlpWatchUrl(video: any, videoId: string): string {
    const candidates = [video.webpage_url, video.original_url, video.url];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) {
        return candidate;
      }
    }

    return `https://www.youtube.com/watch?v=${videoId}`;
  }

  private resolveYtdlpThumbnail(video: any, videoId: string): string | undefined {
    if (typeof video.thumbnail === 'string' && video.thumbnail.trim()) {
      return video.thumbnail;
    }

    if (Array.isArray(video.thumbnails)) {
      const thumbnails = video.thumbnails
        .filter((thumbnail: any) => typeof thumbnail?.url === 'string' && thumbnail.url.trim())
        .sort((a: any, b: any) => {
          const aSize = (Number(a.width) || 0) * (Number(a.height) || 0);
          const bSize = (Number(b.width) || 0) * (Number(b.height) || 0);
          return bSize - aSize;
        });

      if (thumbnails[0]?.url) {
        return thumbnails[0].url;
      }
    }

    return videoId && videoId.length === 11 ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : undefined;
  }

  private resolveHydrateDetailsLimit(hydrateDetails: boolean | number | undefined, itemCount: number): number {
    if (hydrateDetails === true) {
      return itemCount;
    }
    if (typeof hydrateDetails === 'number') {
      return Math.max(0, Math.min(itemCount, Math.floor(hydrateDetails)));
    }
    return 0;
  }

  private async hydrateChannelHistoryDetails(
    channelUrl: string,
    items: RssFeedItem[],
    options: { playlistStart: number; playlistEnd: number; dateAfter?: string; dateBefore?: string }
  ): Promise<RssFeedItem[]> {
    const targetUrl = this.resolveChannelVideosUrl(channelUrl);
    const baseArgs: string[] = [targetUrl, '--ignore-errors', '--print', YTDLP_DETAIL_PRINT_TEMPLATE, '--playlist-start', String(options.playlistStart), '--playlist-end', String(options.playlistEnd)];

    if (options.dateAfter) {
      baseArgs.push('--dateafter', options.dateAfter);
    }
    if (options.dateBefore) {
      baseArgs.push('--datebefore', options.dateBefore);
    }

    try {
      const args = await ytdlpService.buildArgsAsync(baseArgs);
      const result = await this.execYtdlpAllowPartialStdout(args);
      if (result.failed) {
        console.warn('[YouTubeHandler] yt-dlp detail list exited with errors, keeping partial stdout:', this.summarizeYtdlpStderr(result.stderr));
      }

      const lines = result.stdout.trim().split('\n').filter(Boolean);
      const detailMap = new Map<string, any>();

      for (const line of lines) {
        const video = this.parseYtdlpPrintedDetailLine(line);
        if (video?.id) {
          detailMap.set(String(video.id), video);
        }
      }

      const detailVideos = Array.from(detailMap.values());
      this.logYtdlpHistorySample('detail', detailVideos);
      console.info('[YouTubeHandler] yt-dlp detail hydration result:', {
        requested: Math.max(0, options.playlistEnd - options.playlistStart + 1),
        hydrated: detailMap.size
      });

      return items.map((item) => {
        const detail = detailMap.get(item.id);
        if (!detail) {
          return item;
        }

        const playlistIndex = typeof item.metadata?.playlistIndex === 'number' ? item.metadata.playlistIndex : options.playlistStart;
        return this.mergeYtdlpDetailItem(item, detail, playlistIndex);
      });
    } catch (error) {
      console.warn('[YouTubeHandler] Failed to hydrate channel history details, falling back to flat list:', error);
      return items;
    }
  }

  private mergeYtdlpDetailItem(item: RssFeedItem, detail: any, playlistIndex: number): RssFeedItem {
    const detailedItem = this.createFeedItemFromYtdlpVideo(detail, playlistIndex);
    const detailEstimated = detailedItem.metadata?.publishedAtEstimated === true;
    const metadata: Record<string, unknown> = {
      ...(item.metadata || {}),
      ...(detailedItem.metadata || {}),
      playlistIndex,
      ytdlpDetailHydrated: true
    };

    if (!detailEstimated) {
      delete metadata.publishedAtEstimated;
    }

    return {
      ...item,
      title: detailedItem.title && detailedItem.title !== 'Untitled' ? detailedItem.title : item.title,
      description: detailedItem.description || item.description,
      link: detailedItem.link || item.link,
      publishedAt: detailEstimated ? item.publishedAt : detailedItem.publishedAt,
      updatedAt: item.updatedAt,
      author: detailedItem.author || item.author,
      thumbnail: detailedItem.thumbnail || item.thumbnail,
      durationMs: detailedItem.durationMs ?? item.durationMs,
      viewCount: detailedItem.viewCount ?? item.viewCount,
      metadata
    };
  }

  private async execYtdlpAllowPartialStdout(args: string[]): Promise<{ stdout: string; stderr: string; failed: boolean }> {
    const binaryPath = ytdlpService.getExecutor().getWrap().getBinaryPath();

    return await new Promise((resolve, reject) => {
      execFile(binaryPath, args, { maxBuffer: 32 * 1024 * 1024, timeout: YTDLP_DETAIL_HYDRATE_TIMEOUT_MS, windowsHide: true }, (error, stdout, stderr) => {
        const normalizedStdout = String(stdout || '');
        const normalizedStderr = String(stderr || '');
        if (error && !normalizedStdout.trim()) {
          reject(new Error(normalizedStderr || error.message));
          return;
        }

        resolve({
          stdout: normalizedStdout,
          stderr: normalizedStderr,
          failed: Boolean(error)
        });
      });
    });
  }

  private parseYtdlpPrintedDetailLine(line: string): Record<string, unknown> | null {
    const [playlistIndexRaw, id, uploadDate, timestamp, releaseTimestamp, modifiedTimestamp, releaseDate, modifiedDate, duration, viewCount, webpageUrl, thumbnail] = line.split('\t');
    if (!id || this.normalizeYtdlpPrintedValue(id) === undefined) {
      return null;
    }

    return this.compactMetadata({
      playlist_index: this.parseYtdlpPrintedNumber(playlistIndexRaw),
      id: this.normalizeYtdlpPrintedValue(id),
      upload_date: this.normalizeYtdlpPrintedValue(uploadDate),
      timestamp: this.normalizeYtdlpPrintedValue(timestamp),
      release_timestamp: this.normalizeYtdlpPrintedValue(releaseTimestamp),
      modified_timestamp: this.normalizeYtdlpPrintedValue(modifiedTimestamp),
      release_date: this.normalizeYtdlpPrintedValue(releaseDate),
      modified_date: this.normalizeYtdlpPrintedValue(modifiedDate),
      duration: this.parseYtdlpPrintedNumber(duration),
      view_count: this.parseYtdlpPrintedNumber(viewCount),
      webpage_url: this.normalizeYtdlpPrintedValue(webpageUrl),
      thumbnail: this.normalizeYtdlpPrintedValue(thumbnail)
    });
  }

  private normalizeYtdlpPrintedValue(value: string | undefined): string | undefined {
    const normalized = value?.trim();
    return !normalized || normalized === 'NA' ? undefined : normalized;
  }

  private parseYtdlpPrintedNumber(value: string | undefined): number | undefined {
    const normalized = this.normalizeYtdlpPrintedValue(value);
    if (!normalized) {
      return undefined;
    }

    const numberValue = Number(normalized);
    return Number.isFinite(numberValue) ? numberValue : undefined;
  }

  private summarizeYtdlpStderr(stderr: string): string {
    return stderr
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join('\n');
  }

  private compactMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null && value !== ''));
  }

  private summarizeYtdlpVideoFields(video: any): Record<string, unknown> {
    const playlistIndex = typeof video.playlist_index === 'number' ? video.playlist_index : undefined;
    const published = this.resolveYtdlpPublishedAt(video, playlistIndex);
    return this.compactMetadata({
      id: video.id,
      title: video.title,
      playlistIndex,
      upload_date: video.upload_date,
      release_date: video.release_date,
      modified_date: video.modified_date,
      timestamp: video.timestamp,
      release_timestamp: video.release_timestamp,
      modified_timestamp: video.modified_timestamp,
      duration: video.duration,
      duration_string: video.duration_string,
      view_count: video.view_count,
      webpage_url: video.webpage_url,
      timeSource: published.source,
      resolvedPublishedAt: published.estimated ? 'estimated' : new Date(published.value).toISOString()
    });
  }

  private logYtdlpHistorySample(mode: string, videos: any[]): void {
    if (!videos.length) {
      return;
    }

    console.info('[YouTubeHandler] yt-dlp history fields:', {
      mode,
      sample: videos.slice(0, YTDLP_HISTORY_LOG_SAMPLE_SIZE).map((video) => this.summarizeYtdlpVideoFields(video))
    });
  }
}

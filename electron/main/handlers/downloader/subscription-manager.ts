import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';

import { app } from 'electron';

import { getHttpProxy as getSystemHttpProxy } from '../proxy/proxy';

// 设置目录和文件路径
const SETTINGS_DIR = path.join(app.getPath('userData'), 'data');
const SUBSCRIPTIONS_FILE = path.join(SETTINGS_DIR, 'youtube-subscriptions.json');

function ensureSettingsDir(): void {
  if (!fs.existsSync(SETTINGS_DIR)) {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  }
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// YouTube 订阅相关类型和接口
export interface YouTubeSubscription {
  id: string; // 订阅 ID
  channelId: string; // YouTube 频道 ID
  channelName: string; // 频道名称
  rssUrl: string; // RSS feed URL
  enabled: boolean; // 是否启用
  autoDownload: boolean; // 是否自动下载
  lastChecked?: number; // 最后检查时间（时间戳）
  lastVideoId?: string; // 最后下载的视频 ID
  createdAt: number; // 创建时间
  updatedAt: number; // 更新时间
}

interface SubscriptionData {
  subscriptions: YouTubeSubscription[];
  downloadedVideos: Record<string, string[]>; // channelId -> videoId[]
}

// 订阅管理器
export class SubscriptionManager {
  private data: SubscriptionData = {
    subscriptions: [],
    downloadedVideos: {}
  };
  private checkInterval?: NodeJS.Timeout;

  constructor() {
    this.loadData();
  }

  // 加载订阅数据
  private loadData(): void {
    ensureSettingsDir();
    try {
      if (fs.existsSync(SUBSCRIPTIONS_FILE)) {
        const content = fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8');
        this.data = { ...this.data, ...JSON.parse(content) };
      }
    } catch (error) {
      console.warn('[SubscriptionManager] Failed to load subscriptions:', error);
    }
  }

  // 保存订阅数据
  private saveData(): void {
    ensureSettingsDir();
    try {
      fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (error) {
      console.error('[SubscriptionManager] Failed to save subscriptions:', error);
    }
  }

  // 获取所有订阅
  getAllSubscriptions(): YouTubeSubscription[] {
    return [...this.data.subscriptions];
  }

  // 根据 ID 获取订阅
  getSubscription(id: string): YouTubeSubscription | undefined {
    return this.data.subscriptions.find((s) => s.id === id);
  }

  // 添加订阅
  addSubscription(subscription: Omit<YouTubeSubscription, 'id' | 'createdAt' | 'updatedAt'>): YouTubeSubscription {
    const newSubscription: YouTubeSubscription = {
      ...subscription,
      id: generateUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.data.subscriptions.push(newSubscription);
    this.saveData();
    return newSubscription;
  }

  // 更新订阅
  updateSubscription(id: string, updates: Partial<YouTubeSubscription>): YouTubeSubscription | null {
    const index = this.data.subscriptions.findIndex((s) => s.id === id);
    if (index === -1) return null;

    this.data.subscriptions[index] = {
      ...this.data.subscriptions[index],
      ...updates,
      updatedAt: Date.now()
    };
    this.saveData();
    return this.data.subscriptions[index];
  }

  // 删除订阅
  deleteSubscription(id: string): boolean {
    const index = this.data.subscriptions.findIndex((s) => s.id === id);
    if (index === -1) return false;

    const subscription = this.data.subscriptions[index];
    this.data.subscriptions.splice(index, 1);
    // 删除该频道的下载记录
    delete this.data.downloadedVideos[subscription.channelId];
    this.saveData();
    return true;
  }

  // 标记视频已下载
  markVideoDownloaded(channelId: string, videoId: string): void {
    if (!this.data.downloadedVideos[channelId]) {
      this.data.downloadedVideos[channelId] = [];
    }
    if (!this.data.downloadedVideos[channelId].includes(videoId)) {
      this.data.downloadedVideos[channelId].push(videoId);
      this.saveData();
    }
  }

  // 检查视频是否已下载
  isVideoDownloaded(channelId: string, videoId: string): boolean {
    return this.data.downloadedVideos[channelId]?.includes(videoId) || false;
  }

  // 获取频道的已下载视频列表
  getDownloadedVideos(channelId: string): string[] {
    return this.data.downloadedVideos[channelId] || [];
  }

  // 开始定期检查订阅
  startPeriodicCheck(intervalMinutes: number = 60, onNewVideo?: (subscription: YouTubeSubscription, videoId: string, videoUrl: string) => void): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(
      async () => {
        await this.checkAllSubscriptions(onNewVideo);
      },
      intervalMinutes * 60 * 1000
    );

    // 立即执行一次检查
    this.checkAllSubscriptions(onNewVideo).catch((error) => {
      console.error('[SubscriptionManager] Error in initial subscription check:', error);
    });
  }

  // 停止定期检查
  stopPeriodicCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
  }

  // 检查所有启用的订阅
  async checkAllSubscriptions(onNewVideo?: (subscription: YouTubeSubscription, videoId: string, videoUrl: string) => void): Promise<void> {
    const enabledSubscriptions = this.data.subscriptions.filter((s) => s.enabled);
    console.log(`[SubscriptionManager] Checking ${enabledSubscriptions.length} subscriptions...`);

    for (const subscription of enabledSubscriptions) {
      try {
        await this.checkSubscription(subscription, onNewVideo);
      } catch (error) {
        console.error(`[SubscriptionManager] Error checking subscription ${subscription.id}:`, error);
      }
    }
  }

  // 检查单个订阅
  async checkSubscription(subscription: YouTubeSubscription, onNewVideo?: (subscription: YouTubeSubscription, videoId: string, videoUrl: string) => void): Promise<void> {
    try {
      const videos = await this.fetchRSSFeed(subscription.rssUrl);
      if (videos.length === 0) return;

      // 获取最新的视频
      const latestVideo = videos[0];
      const videoId = this.extractVideoId(latestVideo.link);

      // 如果这是第一个检查，只更新最后检查时间和最后视频 ID，不下载
      if (!subscription.lastVideoId) {
        this.updateSubscription(subscription.id, {
          lastChecked: Date.now(),
          lastVideoId: videoId
        });
        return;
      }

      // 检查是否有新视频
      if (videoId !== subscription.lastVideoId && !this.isVideoDownloaded(subscription.channelId, videoId)) {
        console.log(`[SubscriptionManager] New video found for ${subscription.channelName}: ${latestVideo.title}`);

        // 更新订阅信息
        this.updateSubscription(subscription.id, {
          lastChecked: Date.now(),
          lastVideoId: videoId
        });

        // 如果启用了自动下载，触发下载
        if (subscription.autoDownload && onNewVideo) {
          onNewVideo(subscription, videoId, latestVideo.link);
        }
      }
    } catch (error) {
      console.error(`[SubscriptionManager] Error checking subscription ${subscription.channelName}:`, error);
    }
  }

  // 从 RSS URL 获取视频列表
  private async fetchRSSFeed(rssUrl: string): Promise<Array<{ title: string; link: string; published: string }>> {
    return new Promise((resolve, reject) => {
      const client = rssUrl.startsWith('https:') ? https : http;
      const agent = getSystemHttpProxy();

      const options: https.RequestOptions | http.RequestOptions = {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
      };

      // 如果配置了代理，使用代理 agent
      if (agent) {
        options.agent = agent as any;
        console.log('[SubscriptionManager] Using proxy for RSS feed fetch');
      }

      const req = client.get(rssUrl, options, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }

        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const videos = this.parseRSSFeed(data);
            resolve(videos);
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('RSS feed 请求超时'));
      });
    });
  }

  // 解析 RSS feed XML
  private parseRSSFeed(xml: string): Array<{ title: string; link: string; published: string }> {
    const videos: Array<{ title: string; link: string; published: string }> = [];

    // 简单的 XML 解析（使用正则表达式）
    // 匹配 <entry> 标签
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;

    while ((match = entryRegex.exec(xml)) !== null) {
      const entry = match[1];

      // 提取标题
      const titleMatch = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/);
      const title = titleMatch ? titleMatch[1].trim() : '';

      // 提取链接
      const linkMatch = entry.match(/<link[^>]*href=["']([^"']+)["']/);
      const link = linkMatch ? linkMatch[1] : '';

      // 提取发布时间
      const publishedMatch = entry.match(/<published[^>]*>([\s\S]*?)<\/published>/);
      const published = publishedMatch ? publishedMatch[1].trim() : '';

      if (title && link) {
        videos.push({ title, link, published });
      }
    }

    return videos;
  }

  // 从 YouTube URL 提取视频 ID
  private extractVideoId(url: string): string {
    // 支持多种 YouTube URL 格式
    const patterns = [/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/, /\/watch\?v=([a-zA-Z0-9_-]{11})/];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    // 如果无法提取，返回 URL 的哈希值作为 ID
    return url.split('/').pop() || url;
  }

  // 从频道 ID 生成 RSS URL
  static generateRSSUrl(channelId: string): string {
    // 移除可能的 @ 符号和 URL 前缀
    const cleanId = channelId.replace(/^@/, '').replace(/^https?:\/\/(www\.)?youtube\.com\/(channel|c|user|@)\//, '');
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${cleanId}`;
  }

  // 从频道页面 HTML 中提取频道 ID
  private static async fetchChannelIdFromPage(channelUrl: string): Promise<{ channelId: string; rssUrl: string } | null> {
    return new Promise((resolve, reject) => {
      const client = channelUrl.startsWith('https:') ? https : http;
      const agent = getSystemHttpProxy();

      const options: https.RequestOptions | http.RequestOptions = {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
      };

      // 如果配置了代理，使用代理 agent
      if (agent) {
        options.agent = agent as any;
        console.log('[SubscriptionManager] Using proxy for channel page fetch');
      }

      const req = client.get(channelUrl, options, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }

        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
          // 限制数据大小，避免内存问题（最多 10MB）
          if (data.length > 10 * 1024 * 1024) {
            res.destroy();
            reject(new Error('Response too large'));
          }
        });

        res.on('end', () => {
          try {
            // 方法1: 搜索 rssUrl
            const rssUrlMatch = data.match(/"rssUrl"\s*:\s*"([^"]+)"/);
            if (rssUrlMatch && rssUrlMatch[1]) {
              const rssUrl = rssUrlMatch[1];
              // 从 RSS URL 中提取 channel_id
              const channelIdMatch = rssUrl.match(/channel_id=([^&]+)/);
              if (channelIdMatch && channelIdMatch[1]) {
                resolve({
                  channelId: channelIdMatch[1],
                  rssUrl
                });
                return;
              }
            }

            // 方法2: 搜索 browse_id 得到 channel_id
            // browse_id 通常在 JSON 数据中，格式可能是 "browseId":"UCxxxxx" 或 "browse_id":"UCxxxxx"
            const browseIdPatterns = [/"browseId"\s*:\s*"([^"]+)"/, /"browse_id"\s*:\s*"([^"]+)"/, /browseId["\s]*:["\s]*([^",\s}]+)/, /browse_id["\s]*:["\s]*([^",\s}]+)/];

            for (const pattern of browseIdPatterns) {
              const match = data.match(pattern);
              if (match && match[1]) {
                const browseId = match[1].trim();
                // 验证是否是有效的频道 ID 格式（通常以 UC 开头，24 个字符）
                if (browseId.startsWith('UC') && browseId.length === 24) {
                  resolve({
                    channelId: browseId,
                    rssUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=${browseId}`
                  });
                  return;
                }
              }
            }

            // 方法3: 在 var ytInitialData 中查找
            const ytInitialDataMatch = data.match(/var ytInitialData\s*=\s*({.+?});/s);
            if (ytInitialDataMatch) {
              try {
                const ytInitialData = JSON.parse(ytInitialDataMatch[1]);
                // 尝试从 metadata 中获取频道 ID
                const channelId = ytInitialData?.metadata?.channelMetadataRenderer?.externalId || ytInitialData?.header?.c4TabbedHeaderRenderer?.channelId;
                if (channelId && channelId.startsWith('UC') && channelId.length === 24) {
                  resolve({
                    channelId,
                    rssUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
                  });
                  return;
                }
              } catch {
                // JSON 解析失败，继续尝试其他方法
              }
            }

            reject(new Error('无法从页面中提取频道 ID'));
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

  // 从频道 URL 或 ID 提取频道 ID
  static async extractChannelId(input: string): Promise<{ channelId: string; rssUrl: string } | null> {
    // 支持多种格式：
    // - 频道 ID: UCxxxxx
    // - 频道 URL: https://www.youtube.com/channel/UCxxxxx
    // - 自定义 URL: https://www.youtube.com/@channelname
    // - @channelname

    const channelId = input.trim();

    // 如果是完整的 URL
    if (channelId.startsWith('http')) {
      const urlMatch = channelId.match(/youtube\.com\/(channel|c|user|@)\/([^/?]+)/);
      if (urlMatch) {
        const type = urlMatch[1];
        const id = urlMatch[2];

        if (type === 'channel') {
          // 直接是频道 ID
          return {
            channelId: id,
            rssUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`
          };
        } else if (type === '@') {
          // 自定义 URL (@username)，需要从页面中提取频道 ID
          try {
            const result = await this.fetchChannelIdFromPage(channelId);
            return result;
          } catch (error) {
            console.error('[SubscriptionManager] Failed to fetch channel ID from page:', error);
            throw new Error(`无法获取频道 ID: ${error instanceof Error ? error.message : String(error)}`);
          }
        } else if (type === 'c' || type === 'user') {
          // 旧的用户 URL 格式，也需要从页面中提取
          try {
            const result = await this.fetchChannelIdFromPage(channelId);
            return result;
          } catch (error) {
            console.error('[SubscriptionManager] Failed to fetch channel ID from page:', error);
            throw new Error(`无法获取频道 ID: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    }

    // 如果是 @username 格式（不带完整 URL）
    if (channelId.startsWith('@')) {
      const username = channelId.substring(1);
      const channelUrl = `https://www.youtube.com/@${username}`;
      try {
        const result = await this.fetchChannelIdFromPage(channelUrl);
        return result;
      } catch (error) {
        console.error('[SubscriptionManager] Failed to fetch channel ID from page:', error);
        throw new Error(`无法获取频道 ID: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // 假设是频道 ID（以 UC 开头，24 个字符）
    if (channelId.length > 0) {
      // 验证格式
      if (channelId.startsWith('UC') && channelId.length === 24) {
        return {
          channelId,
          rssUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
        };
      } else {
        // 如果不是标准格式，尝试作为频道 ID 使用（向后兼容）
        console.warn('[SubscriptionManager] Channel ID format may be invalid:', channelId);
        return {
          channelId,
          rssUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
        };
      }
    }

    return null;
  }
}

// 创建全局订阅管理器实例
export const subscriptionManager = new SubscriptionManager();

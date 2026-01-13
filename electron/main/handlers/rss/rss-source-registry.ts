import type { ChannelInfo, RssSourceHandler } from './rss-source-handler';
import { YouTubeHandler } from './sources/youtube-handler';
import type { RssSourceType } from './types';

/**
 * RSS 源处理器注册表
 * 管理所有 RSS 源的处理器
 */
class RssSourceRegistry {
  private handlers: Map<RssSourceType, RssSourceHandler> = new Map();

  constructor() {
    // 注册默认处理器
    this.register(new YouTubeHandler());
  }

  /**
   * 注册处理器
   */
  register(handler: RssSourceHandler): void {
    this.handlers.set(handler.sourceType, handler);
  }

  /**
   * 获取处理器
   */
  getHandler(sourceType: RssSourceType): RssSourceHandler | undefined {
    return this.handlers.get(sourceType);
  }

  /**
   * 根据输入自动检测并获取处理器
   */
  detectHandler(input: string): RssSourceHandler | null {
    for (const handler of this.handlers.values()) {
      if (handler.detect(input)) {
        return handler;
      }
    }
    return null;
  }

  /**
   * 获取所有已注册的处理器
   */
  getAllHandlers(): RssSourceHandler[] {
    return Array.from(this.handlers.values());
  }

  /**
   * 从输入提取频道信息（自动检测源类型）
   */
  async extractChannelInfo(input: string): Promise<{
    handler: RssSourceHandler;
    channelInfo: ChannelInfo;
  } | null> {
    const handler = this.detectHandler(input);
    if (!handler) {
      return null;
    }

    const channelInfo = await handler.extractChannelInfo(input);
    if (!channelInfo) {
      return null;
    }

    return { handler, channelInfo };
  }
}

// 单例实例
export const rssSourceRegistry = new RssSourceRegistry();
